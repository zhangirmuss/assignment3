require('dotenv').config();

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// safe requires for optional packages
let bcrypt = null;
try { bcrypt = require('bcrypt'); } catch (e) { console.warn('bcrypt not installed. Auth/register/login will be disabled until you run npm install'); }

const session = require('express-session');
let MongoStore = null;
try { MongoStore = require('connect-mongo'); } catch (e) { console.warn('connect-mongo not installed. Sessions will use default MemoryStore. Run npm install to enable persistent sessions'); }

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'fittrack';

// ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
try { fsSync.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { console.error('Failed to create data dir', e); }

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session middleware (must come after body parsers)
let store = undefined;
if (MongoStore) {
  try {
    store = MongoStore.create({ mongoUrl: MONGO_URI, dbName: DB_NAME, collectionName: 'sessions' });
  } catch (e) { console.warn('Failed to create MongoStore, sessions will use MemoryStore', e); store = undefined; }
}
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 }
}));

// Custom logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

let mongoClient;
let db;
let itemsCol;

// helper middleware
function requireAuth(req, res, next){
  if(req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Serve pages
app.get('/', (req, res) => {
  res.type('html').sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/contact', (req, res) => {
  res.type('html').sendFile(path.join(__dirname, 'views', 'contact.html'));
});

app.get('/search', (req, res) => {
  res.type('html').sendFile(path.join(__dirname, 'views', 'search.html'));
});

// Serve dashboard page explicitly
app.get('/dashboard', (req, res) => {
  res.type('html').sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// API: CRUD for items using MongoDB
app.get('/api/items', async (req, res) => {
  try {
    const items = await itemsCol.find({}).sort({ _id: 1 }).toArray();
    // convert _id to string
    const out = items.map(i => ({ id: String(i._id), title: i.title, description: i.description, muscle: i.muscle, difficulty: i.difficulty, durationMinutes: i.durationMinutes }));
    res.json(out);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

app.get('/api/items/:id', async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const row = await itemsCol.findOne({ _id: new ObjectId(id) });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ id: String(row._id), title: row.title, description: row.description, muscle: row.muscle, difficulty: row.difficulty, durationMinutes: row.durationMinutes });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

app.post('/api/items', async (req, res) => {
  const { title, description, muscle, difficulty, durationMinutes } = req.body;
  if (!title || !description || !muscle || !difficulty || durationMinutes == null) return res.status(400).json({ error: 'Missing fields: title, description, muscle, difficulty, durationMinutes' });
  try {
    const result = await itemsCol.insertOne({ title, description, muscle, difficulty, durationMinutes, createdAt: new Date() });
    const item = await itemsCol.findOne({ _id: result.insertedId });
    res.status(201).json({ id: String(item._id), title: item.title, description: item.description, muscle: item.muscle, difficulty: item.difficulty, durationMinutes: item.durationMinutes });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

app.put('/api/items/:id', async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const { title, description, muscle, difficulty, durationMinutes } = req.body;
  if (!title || !description || !muscle || !difficulty || durationMinutes == null) return res.status(400).json({ error: 'Missing fields: title, description, muscle, difficulty, durationMinutes' });
  try {
    const oid = new ObjectId(id);
    const existing = await itemsCol.findOne({ _id: oid });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await itemsCol.updateOne({ _id: oid }, { $set: { title, description, muscle, difficulty, durationMinutes, updatedAt: new Date() } });
    const updated = await itemsCol.findOne({ _id: oid });
    res.json({ id: String(updated._id), title: updated.title, description: updated.description, muscle: updated.muscle, difficulty: updated.difficulty, durationMinutes: updated.durationMinutes });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

app.delete('/api/items/:id', async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const oid = new ObjectId(id);
    const existing = await itemsCol.findOne({ _id: oid });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await itemsCol.deleteOne({ _id: oid });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

// Contact POST saves to data/contacts.json
app.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).type('html').send('<!doctype html><html><head><meta charset="utf-8"><title>400</title></head><body><h1>400 - Missing required fields</h1><p>Required: name, email, message</p><p><a href="/contact">Back</a></p></body></html>');
  const filePath = path.join(DATA_DIR, 'contacts.json');
  try {
    let existing = '[]';
    try { existing = await fs.readFile(filePath, 'utf8'); } catch (e) { existing = '[]'; }
    const arr = JSON.parse(existing || '[]');
    arr.push({ name, email, message, date: new Date().toISOString() });
    await fs.writeFile(filePath, JSON.stringify(arr, null, 2), 'utf8');
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Thanks</title><link rel="stylesheet" href="/style.css"></head><body><header class="container"><h1>Thank you, ${name}.</h1><nav class="nav"><a href="/">Home</a><a href="/contact">Contact</a></nav></header><main class="container content"><p>Your message was saved.</p></main></body></html>`);
  } catch (err) { console.error(err); res.status(500).type('html').send('Server error'); }
});

// API info and stats (Mongo version)
app.get('/api/info', async (req, res) => {
  try {
    const itemsCount = await itemsCol.countDocuments();
    let contactsCount = 0;
    try { const contactsText = await fs.readFile(path.join(DATA_DIR, 'contacts.json'), 'utf8'); contactsCount = JSON.parse(contactsText || '[]').length; } catch (e) { contactsCount = 0; }
    res.json({ project: 'FitTrack', description: 'Fitness tracking prototype', team: [ 'Mussilimov Zhangir - Group SE-2422' ], database: { type: 'mongodb', uri: MONGO_URI, db: DB_NAME }, routes: [ 'GET /api/items', 'GET /api/items/:id', 'POST /api/items', 'PUT /api/items/:id', 'DELETE /api/items/:id', 'GET /api/info', 'GET /api/stats' ], itemsCount, contactsCount, uptimeSeconds: Math.floor(process.uptime()) });
  } catch (err) { console.error('API info error', err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const itemsCount = await itemsCol.countDocuments();
    let contactsCount = 0;
    try { const contactsText = await fs.readFile(path.join(DATA_DIR, 'contacts.json'), 'utf8'); contactsCount = JSON.parse(contactsText || '[]').length; } catch (e) { contactsCount = 0; }
    res.json({ itemsCount, contactsCount, uptimeSeconds: Math.floor(process.uptime()) });
  } catch (err) { console.error('API stats error', err); res.status(500).json({ error: 'Server error' }); }
});

// GET item page (HTML)
app.get('/item/:id', (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).type('html').send('<!doctype html><html><head><meta charset="utf-8"><title>400</title></head><body><h1>400 - Invalid id</h1><p><a href="/">Home</a></p></body></html>');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Item ${id}</title><link rel="stylesheet" href="/style.css"></head><body><header class="container"><h1>Item ${id}</h1><nav class="nav"><a href="/">Home</a><a href="/contact">Contact</a></nav></header><div class="container hero"><div class="hero-img-wrapper"><img class="hero-img" src="https://picsum.photos/seed/gym-dumbbell/1200/800" alt="workout"></div></div><main class="container content"><h2>Item ${id}</h2><p>Placeholder item page for id ${id}.</p></main></body></html>`);
});

// Auth routes (check bcrypt availability)
app.post('/auth/register', async (req, res) => {
  if (!bcrypt) return res.status(500).json({ error: 'Server misconfiguration: missing bcrypt. Run npm install' });
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try{
    const users = app.locals.usersCol;
    const existing = await users.findOne({ username });
    if(existing) return res.status(400).json({ error: 'User exists' });
    const hash = await bcrypt.hash(password, 10);
    const result = await users.insertOne({ username, passwordHash: hash, role: 'user', createdAt: new Date() });
    req.session.userId = String(result.insertedId);
    req.session.username = username;
    res.json({ success: true });
  } catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/auth/login', async (req, res) => {
  if (!bcrypt) return res.status(500).json({ error: 'Server misconfiguration: missing bcrypt. Run npm install' });
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try{
    const users = app.locals.usersCol;
    const user = await users.findOne({ username });
    if(!user) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if(!ok) return res.status(400).json({ error: 'Invalid credentials' });
    req.session.userId = String(user._id);
    req.session.username = user.username;
    res.json({ success: true });
  } catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(()=> res.json({ success: true }));
});

// graceful shutdown
async function shutdown() {
  console.log('Shutting down, closing MongoDB');
  try { if (mongoClient) await mongoClient.close(); } catch (e) { console.error('Error closing mongo', e); }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server and connect to MongoDB
async function start() {
  try {
    mongoClient = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
    await mongoClient.connect();
    db = mongoClient.db(DB_NAME);
    const exercisesCol = db.collection('exercises');
    app.locals.exercisesCol = exercisesCol;
    app.locals.usersCol = db.collection('users'); // expose users collection
    console.log('Connected to MongoDB', MONGO_URI, 'db:', DB_NAME);

    // Seed if empty
    const cnt = await exercisesCol.countDocuments();
    if (cnt === 0) {
      await exercisesCol.insertMany([
        { title: 'Barbell Squat', description: 'Compound lower-body exercise.', muscle: 'legs', difficulty: 'intermediate', durationMinutes: 10, createdAt: new Date() },
        { title: 'Deadlift', description: 'Posterior chain strength lift.', muscle: 'back', difficulty: 'advanced', durationMinutes: 12, createdAt: new Date() },
        { title: 'Bench Press', description: 'Upper-body pushing movement.', muscle: 'chest', difficulty: 'intermediate', durationMinutes: 8, createdAt: new Date() },
        { title: 'Pull Up', description: 'Upper-body compound pulling exercise.', muscle: 'back', difficulty: 'advanced', durationMinutes: 10, createdAt: new Date() },
        { title: 'Push Up', description: 'Basic upper-body pushing exercise.', muscle: 'chest', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Plank', description: 'Core stability exercise.', muscle: 'core', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Lunges', description: 'Lower-body exercise targeting quads and glutes.', muscle: 'legs', difficulty: 'beginner', durationMinutes: 10, createdAt: new Date() },
        { title: 'Leg Press', description: 'Machine-based lower-body exercise.', muscle: 'legs', difficulty: 'intermediate', durationMinutes: 10, createdAt: new Date() },
        { title: 'Dumbbell Row', description: 'Single-arm back exercise.', muscle: 'back', difficulty: 'intermediate', durationMinutes: 8, createdAt: new Date() },
        { title: 'Tricep Dip', description: 'Upper-body exercise targeting triceps.', muscle: 'arms', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Bicep Curl', description: 'Basic arm exercise.', muscle: 'arms', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Shoulder Press', description: 'Upper-body exercise targeting shoulders.', muscle: 'shoulders', difficulty: 'intermediate', durationMinutes: 8, createdAt: new Date() },
        { title: 'Chest Fly', description: 'Isolation exercise for chest.', muscle: 'chest', difficulty: 'intermediate', durationMinutes: 8, createdAt: new Date() },
        { title: 'Lat Pulldown', description: 'Back exercise targeting lats.', muscle: 'back', difficulty: 'intermediate', durationMinutes: 10, createdAt: new Date() },
        { title: 'Seated Row', description: 'Machine-based back exercise.', muscle: 'back', difficulty: 'intermediate', durationMinutes: 10, createdAt: new Date() },
        { title: 'Leg Curl', description: 'Hamstring isolation exercise.', muscle: 'legs', difficulty: 'intermediate', durationMinutes: 8, createdAt: new Date() },
        { title: 'Leg Extension', description: 'Quad isolation exercise.', muscle: 'legs', difficulty: 'intermediate', durationMinutes: 8, createdAt: new Date() },
        { title: 'Calf Raise', description: 'Exercise for calf muscles.', muscle: 'legs', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Glute Bridge', description: 'Lower-body exercise targeting glutes.', muscle: 'legs', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Russian Twist', description: 'Core exercise with rotation.', muscle: 'core', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Mountain Climber', description: 'Cardio exercise with climbing motion.', muscle: 'legs', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Burpee', description: 'Full-body exercise with jump and push-up.', muscle: 'full body', difficulty: 'advanced', durationMinutes: 10, createdAt: new Date() },
        { title: 'Jumping Jack', description: 'Cardio exercise with jumping motion.', muscle: 'full body', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'High Knees', description: 'Cardio exercise bringing knees to chest.', muscle: 'legs', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Butt Kick', description: 'Cardio exercise bringing heels to glutes.', muscle: 'legs', difficulty: 'beginner', durationMinutes: 5, createdAt: new Date() },
        { title: 'Side Plank', description: 'Core exercise with side rotation.', muscle: 'core', difficulty: 'intermediate', durationMinutes: 8, createdAt: new Date() },
        { title: 'Reverse Crunch', description: 'Core exercise targeting lower abs.', muscle: 'core', difficulty: 'intermediate', durationMinutes: 8, createdAt: new Date() },
        { title: 'Hanging Leg Raise', description: 'Advanced core exercise hanging from bar.', muscle: 'core', difficulty: 'advanced', durationMinutes: 10, createdAt: new Date() },
        { title: 'Cable Woodchopper', description: 'Core exercise with cable machine.', muscle: 'core', difficulty: 'advanced', durationMinutes: 10, createdAt: new Date() }
      ]);
      console.log('Seeded items collection');
    }

    const adminUser = { username: 'admin', password: 'adminpass', role: 'admin', createdAt: new Date() };
    const users = app.locals.usersCol;
    const adminExists = await users.findOne({ username: adminUser.username });
    if(!adminExists){
      const hash = await bcrypt.hash(adminUser.password, 10);
      await users.insertOne({ ...adminUser, passwordHash: hash });
      console.log('Seeded admin user');
    }

    const exercisesRouter = require('./routes/items');
    app.use('/api/exercises', exercisesRouter);
    const pagesRouter = require('./routes/pages');
    app.use('/', pagesRouter);

    // Global 404 handler (must be after all routers)
    app.use((req, res) => {
      if (req.url.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
      res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
    });

    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Startup error', err);
    process.exit(1);
  }
}

start();
