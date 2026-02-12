const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

// ✅ require login (sessions-based)
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ✅ require admin role
function requireAdmin(req, res, next) {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ✅ owner OR admin
async function requireOwnerOrAdmin(req, res, next) {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (user.role === 'admin') return next();

  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const oid = new ObjectId(id);
    const existing = await req.app.locals.exercisesCol.findOne({ _id: oid });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    // owner check (you store createdBy=username)
    if (existing.createdBy !== user.username) {
      return res.status(403).json({ error: 'Forbidden (owner only)' });
    }

    // pass existing forward to avoid double query
    req._existingItem = existing;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
}

// helper: parse durationMinutes safely
function parseDuration(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return '__INVALID__';
  return n;
}

// GET /api/exercises - list with optional filtering, sorting, projection
router.get('/', async (req, res) => {
  try {
    const { q, sortBy, fields } = req.query;

    const filter = {};
    if (q) {
      const re = new RegExp(q, 'i');
      filter.$or = [{ title: re }, { description: re }, { muscle: re }];
    }

    const projection = {};
    if (fields) {
      fields.split(',').forEach(f => { projection[f.trim()] = 1; });
    }

    const sort = {};
    if (sortBy) {
      const [k, dir] = String(sortBy).split(':');
      sort[k] = dir === 'desc' ? -1 : 1;
    }

    const cursor = req.app.locals.exercisesCol.find(
      filter,
      { projection: Object.keys(projection).length ? projection : undefined }
    );

    if (Object.keys(sort).length) cursor.sort(sort);

    const items = await cursor.toArray();
    const out = items.map(i => ({
      id: String(i._id),
      title: i.title,
      description: i.description,
      muscle: i.muscle ?? null,
      difficulty: i.difficulty ?? null,
      durationMinutes: i.durationMinutes ?? null,
      createdBy: i.createdBy ?? null
    }));

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/exercises/:id
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const row = await req.app.locals.exercisesCol.findOne({ _id: new ObjectId(id) });
    if (!row) return res.status(404).json({ error: 'Not found' });

    res.json({
      id: String(row._id),
      title: row.title,
      description: row.description,
      muscle: row.muscle ?? null,
      difficulty: row.difficulty ?? null,
      durationMinutes: row.durationMinutes ?? null,
      createdBy: row.createdBy ?? null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/exercises (login required)
router.post('/', requireAuth, async (req, res) => {
  const { title, description, muscle, difficulty } = req.body || {};
  const durationMinutes = parseDuration(req.body?.durationMinutes);

  if (!title || !description) return res.status(400).json({ error: 'Missing fields: title, description' });
  if (durationMinutes === '__INVALID__') return res.status(400).json({ error: 'durationMinutes must be a number' });

  try {
    const result = await req.app.locals.exercisesCol.insertOne({
      title,
      description,
      muscle: muscle || null,
      difficulty: difficulty || null,
      durationMinutes,
      createdAt: new Date(),
      createdBy: req.session.user.username
    });

    const item = await req.app.locals.exercisesCol.findOne({ _id: result.insertedId });
    res.status(201).json({
      id: String(item._id),
      title: item.title,
      description: item.description,
      muscle: item.muscle ?? null,
      difficulty: item.difficulty ?? null,
      durationMinutes: item.durationMinutes ?? null,
      createdBy: item.createdBy ?? null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/exercises/:id (owner OR admin)
router.put('/:id', requireAuth, requireOwnerOrAdmin, async (req, res) => {
  const id = req.params.id;
  const { title, description, muscle, difficulty } = req.body || {};
  const durationMinutes = parseDuration(req.body?.durationMinutes);

  if (!title || !description) return res.status(400).json({ error: 'Missing fields: title, description' });
  if (durationMinutes === '__INVALID__') return res.status(400).json({ error: 'durationMinutes must be a number' });

  try {
    const oid = new ObjectId(id);

    await req.app.locals.exercisesCol.updateOne(
      { _id: oid },
      {
        $set: {
          title,
          description,
          muscle: muscle || null,
          difficulty: difficulty || null,
          durationMinutes,
          updatedAt: new Date()
        }
      }
    );

    const updated = await req.app.locals.exercisesCol.findOne({ _id: oid });
    res.json({
      id: String(updated._id),
      title: updated.title,
      description: updated.description,
      muscle: updated.muscle ?? null,
      difficulty: updated.difficulty ?? null,
      durationMinutes: updated.durationMinutes ?? null,
      createdBy: updated.createdBy ?? null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/exercises/:id (owner OR admin)
// If your rubric wants admin-only delete, change middleware to: requireAuth, requireAdmin
router.delete('/:id', requireAuth, requireOwnerOrAdmin, async (req, res) => {
  const id = req.params.id;

  try {
    const oid = new ObjectId(id);
    await req.app.locals.exercisesCol.deleteOne({ _id: oid });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
