require('dotenv').config();

const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;

const session = require('express-session');

// optional deps
let bcrypt = null;
try { bcrypt = require('bcrypt'); } catch (e) { console.warn('bcrypt not installed. Run: npm i bcrypt'); }

let MongoStore = null;
try { MongoStore = require('connect-mongo'); } catch (e) {
  console.warn('connect-mongo not installed. Sessions will use MemoryStore. (ok for local dev)');
}

const app = express();

// ---------------- CONFIG ----------------
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;           // REQUIRED for Atlas
const DB_NAME = process.env.DB_NAME || 'fittrack';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';

// ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { console.error('Failed to create data dir', e); }

// ---------------- MIDDLEWARE ----------------
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); // for HTML forms
app.use(express.json()); // for JSON API

// session store
// session store (connect-mongo v5+)
let store = undefined;
if (MongoStore && MONGO_URI) {
  try {
    store = new MongoStore({
      mongoUrl: MONGO_URI,
      dbName: DB_NAME,
      collectionName: 'sessions'
    });
  } catch (e) {
    console.warn('Failed to create MongoStore, using MemoryStore', e);
    store = undefined;
  }
}


app.use(session({
  name: 'sessionId',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store,
  cookie: {
    httpOnly: true,
    secure: false, // true only with HTTPS
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ---------------- HELPERS ----------------
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ---------------- PAGES ----------------
app.get('/', (req, res) => {
  res.type('html').sendFile(path.join(__dirname, 'views', 'index.html'));
});

// (optional) keep these if you still have separate html files
app.get('/contact', (req, res) => res.type('html').sendFile(path.join(__dirname, 'views', 'contact.html')));
app.get('/search', (req, res) => res.type('html').sendFile(path.join(__dirname, 'views', 'search.html')));
app.get('/dashboard', (req, res) => res.type('html').sendFile(path.join(__dirname, 'views', 'dashboard.html')));

// ---------------- AUTH ----------------
// who is logged in?
app.get('/auth/me', (req, res) => {
  const user = req.session?.user || null;
  res.json({ user });
});

// register (creates user in MongoDB)
app.post('/auth/register', async (req, res) => {
  if (!bcrypt) return res.status(500).json({ error: 'bcrypt not installed on server' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing fields: username, password' });

  try {
    const usersCol = app.locals.usersCol;
    const existing = await usersCol.findOne({ username });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await usersCol.insertOne({ username, passwordHash, role: 'user', createdAt: new Date() });

    // session
    req.session.user = { id: String(result.insertedId), username, role: 'user' };
    res.json({ success: true });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// login
app.post('/auth/login', async (req, res) => {
  if (!bcrypt) return res.status(500).json({ error: 'bcrypt not installed on server' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing fields: username, password' });

  try {
    const usersCol = app.locals.usersCol;
    const user = await usersCol.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    req.session.user = { id: String(user._id), username: user.username, role: user.role || 'user' };
    res.json({ success: true });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ---------------- CONTACT (SAVE TO JSON) ----------------
app.post('/contact', async (req, res) => {
  const { name, email, phone, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).type('html').send('Missing fields: name, email, message');
  }

  const filePath = path.join(DATA_DIR, 'contacts.json');

  try {
    let existing = '[]';
    try { existing = await fsp.readFile(filePath, 'utf8'); } catch (e) { existing = '[]'; }
    const arr = JSON.parse(existing || '[]');

    arr.push({
      name,
      email,
      phone: phone || '',
      message,
      date: new Date().toISOString()
    });

    await fsp.writeFile(filePath, JSON.stringify(arr, null, 2), 'utf8');
    res.type('html').send('OK');
  } catch (err) {
    console.error('contact save error', err);
    res.status(500).type('html').send('Server error');
  }
});

// ---------------- API INFO / STATS ----------------
app.get('/api/info', async (req, res) => {
  try {
    const exercisesCount = await app.locals.exercisesCol.countDocuments();
    let contactsCount = 0;

    try {
      const txt = await fsp.readFile(path.join(DATA_DIR, 'contacts.json'), 'utf8');
      contactsCount = JSON.parse(txt || '[]').length;
    } catch (e) {
      contactsCount = 0;
    }

    res.json({
      project: 'FitTrack',
      database: { type: 'mongodb', db: DB_NAME },
      routes: [
        'GET /api/items (or /api/exercises)',
        'GET /api/items/:id',
        'POST /api/items (login required)',
        'PUT /api/items/:id (login required)',
        'DELETE /api/items/:id (login required)',
        'POST /auth/register',
        'POST /auth/login',
        'POST /auth/logout',
        'GET /auth/me'
      ],
      exercisesCount,
      contactsCount,
      uptimeSeconds: Math.floor(process.uptime())
    });
  } catch (err) {
    console.error('api/info error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const exercisesCount = await app.locals.exercisesCol.countDocuments();
    let contactsCount = 0;

    try {
      const txt = await fsp.readFile(path.join(DATA_DIR, 'contacts.json'), 'utf8');
      contactsCount = JSON.parse(txt || '[]').length;
    } catch (e) {
      contactsCount = 0;
    }

    res.json({ exercisesCount, contactsCount, uptimeSeconds: Math.floor(process.uptime()) });
  } catch (err) {
    console.error('api/stats error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------- API ROUTES ----------------
// Your router expects: req.app.locals.exercisesCol and session checks inside router
const itemsRouter = require('./routes/items');

// mount BOTH to avoid confusion in frontend
app.use('/api/items', itemsRouter);
app.use('/api/exercises', itemsRouter);

// ---------------- 404 ----------------
app.use((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/auth/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).type('html').send('404 Not Found');
});

// ---------------- START + DB ----------------
let mongoClient;

async function start() {
  try {
    if (!MONGO_URI) {
      console.error('❌ MONGO_URI is not set in .env');
      process.exit(1);
    }

    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();

    const db = mongoClient.db(DB_NAME);

    // collections
    app.locals.exercisesCol = db.collection('exercises');
    app.locals.usersCol = db.collection('users');

    console.log('✅ Connected to MongoDB Atlas. DB:', DB_NAME);

    // seed exercises if empty
    const cnt = await app.locals.exercisesCol.countDocuments();
    if (cnt === 0) {
      await app.locals.exercisesCol.insertMany([
        { title: 'Push Up', description: 'Basic upper-body pushing exercise.', muscle: 'chest', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Squat', description: 'Compound lower-body exercise.', muscle: 'legs', difficulty: 'beginner', durationMinutes: 8, createdAt: new Date() },
        { title: 'Plank', description: 'Core stability exercise.', muscle: 'core', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() }
      ]);
      console.log('✅ Seeded exercises');
    }

    // seed admin user
    if (bcrypt) {
      const usersCol = app.locals.usersCol;
      const adminExists = await usersCol.findOne({ username: 'admin' });
      if (!adminExists) {
        const passwordHash = await bcrypt.hash('adminpass', 10);
        await usersCol.insertOne({
          username: 'admin',
          passwordHash,
          role: 'admin',
          createdAt: new Date()
        });
        console.log('✅ Seeded admin user: admin/adminpass');
      }
    } else {
      console.warn('⚠️ bcrypt missing -> cannot seed admin user.');
    }

    app.listen(PORT, () => {
      console.log(`✅ Server running: http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('❌ Startup error', err);
    process.exit(1);
  }
}

async function shutdown() {
  console.log('Shutting down...');
  try { if (mongoClient) await mongoClient.close(); } catch (e) {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();

