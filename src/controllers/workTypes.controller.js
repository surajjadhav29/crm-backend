const WorkType = require('../models/WorkType');

async function list(_req, res) {
  const workTypes = await WorkType.find().sort({ name: 1 });
  return res.status(200).json({ workTypes: workTypes.map((w) => w.toJSON()) });
}

async function create(req, res) {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Work type name is required' });
  }

  const normalized = name.trim().toUpperCase();
  const existing = await WorkType.findOne({ name: normalized });
  if (existing) {
    return res.status(409).json({ error: 'This work type already exists' });
  }

  const workType = await WorkType.create({ name: normalized, createdBy: req.user._id });
  return res.status(201).json({ workType: workType.toJSON() });
}

module.exports = { list, create };
