const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

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
      const [k, dir] = sortBy.split(':');
      sort[k] = dir === 'desc' ? -1 : 1;
    }
    const cursor = req.app.locals.exercisesCol.find(filter, { projection: Object.keys(projection).length ? projection : undefined });
    if (Object.keys(sort).length) cursor.sort(sort);
    const items = await cursor.toArray();
    const out = items.map(i => ({ id: String(i._id), title: i.title, description: i.description, muscle: i.muscle || null, difficulty: i.difficulty || null, durationMinutes: i.durationMinutes || null }));
    res.json(out);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

// GET /api/exercises/:id
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const row = await req.app.locals.exercisesCol.findOne({ _id: new ObjectId(id) });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ id: String(row._id), title: row.title, description: row.description, muscle: row.muscle || null, difficulty: row.difficulty || null, durationMinutes: row.durationMinutes || null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

// POST /api/exercises (protected)
router.post('/', async (req, res) => {
  if(!req.session || !req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { title, description, muscle, difficulty, durationMinutes } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Missing fields: title, description' });
  if (durationMinutes && typeof durationMinutes !== 'number') return res.status(400).json({ error: 'durationMinutes must be a number' });
  try {
    const result = await req.app.locals.exercisesCol.insertOne({ title, description, muscle: muscle || null, difficulty: difficulty || null, durationMinutes: durationMinutes || null, createdAt: new Date() });
    const item = await req.app.locals.exercisesCol.findOne({ _id: result.insertedId });
    res.status(201).json({ id: String(item._id), title: item.title, description: item.description, muscle: item.muscle || null, difficulty: item.difficulty || null, durationMinutes: item.durationMinutes || null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

// PUT /api/exercises/:id (protected)
router.put('/:id', async (req, res) => {
  if(!req.session || !req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const { title, description, muscle, difficulty, durationMinutes } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Missing fields: title, description' });
  if (durationMinutes && typeof durationMinutes !== 'number') return res.status(400).json({ error: 'durationMinutes must be a number' });
  try {
    const oid = new ObjectId(id);
    const existing = await req.app.locals.exercisesCol.findOne({ _id: oid });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await req.app.locals.exercisesCol.updateOne({ _id: oid }, { $set: { title, description, muscle: muscle || null, difficulty: difficulty || null, durationMinutes: durationMinutes || null, updatedAt: new Date() } });
    const updated = await req.app.locals.exercisesCol.findOne({ _id: oid });
    res.json({ id: String(updated._id), title: updated.title, description: updated.description, muscle: updated.muscle || null, difficulty: updated.difficulty || null, durationMinutes: updated.durationMinutes || null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

// DELETE /api/exercises/:id (protected)
router.delete('/:id', async (req, res) => {
  if(!req.session || !req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const oid = new ObjectId(id);
    const existing = await req.app.locals.exercisesCol.findOne({ _id: oid });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await req.app.locals.exercisesCol.deleteOne({ _id: oid });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

module.exports = router;
