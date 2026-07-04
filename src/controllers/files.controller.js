const File = require('../models/File');
const Counter = require('../models/Counter');

const EDITABLE_FIELDS = [
  'dealerName',
  'workType',
  'vehicleNo',
  'vehicleModel',
  'chassisNo',
  'engineNo',
  'oldOwnerName',
  'ownerName',
  'oldOwnerMob',
  'newOwnerMob',
  'dealerMob',
  'rtoName',
  'remarks',
];

const STATUSES = ['pending', 'in_progress', 'objection', 'paper_return', 'on_hold', 'completed', 'done'];

function isHoldFile(file) {
  if (file.status === 'on_hold') return true;
  if (file.status !== 'pending') return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  return new Date(file.date) < cutoff;
}

function matchesView(file, type) {
  switch (type) {
    case 'all':
      return ['pending', 'in_progress'].includes(file.status);
    case 'hold':
      return isHoldFile(file);
    case 'return_paper':
      return file.status === 'paper_return';
    case 'objection':
      return file.status === 'objection';
    case 'pending':
      return file.status === 'pending';
    case 'in_progress':
      return file.status === 'in_progress';
    case 'completed':
      return ['completed', 'done'].includes(file.status);
    case 'all_records':
      return true;
    default:
      return true;
  }
}

function matchesSearch(file, search) {
  if (!search || !search.trim()) return true;
  const q = search.toLowerCase();
  const fields = [
    file.fileNumber,
    file.ownerName,
    file.oldOwnerName,
    file.vehicleNo,
    file.vehicleModel,
    file.dealerName,
    file.workType,
    file.rtoName,
  ];
  return fields.some((v) => (v || '').toLowerCase().includes(q));
}

function computeStats(files) {
  return {
    totalFiles: files.length,
    pendingFiles: files.filter((f) => f.status === 'pending').length,
    inProgressFiles: files.filter((f) => f.status === 'in_progress').length,
    completedFiles: files.filter((f) => ['completed', 'done'].includes(f.status)).length,
    objectionFiles: files.filter((f) => f.status === 'objection').length,
    holdSheet: files.filter((f) => f.status === 'pending' && isHoldFile(f)).length,
    returnPaper: files.filter((f) => f.status === 'paper_return').length,
    onHoldManual: files.filter((f) => f.status === 'on_hold').length,
    countAll: files.filter((f) => ['pending', 'in_progress'].includes(f.status)).length,
    countHold: files.filter((f) => isHoldFile(f)).length,
    countReturn: files.filter((f) => f.status === 'paper_return').length,
    countObjection: files.filter((f) => f.status === 'objection').length,
  };
}

async function scopedFiles(req) {
  const query = {};
  if (req.user.role !== 'superadmin') {
    query.createdBy = req.user._id;
  } else if (req.query.userId) {
    query.createdBy = req.query.userId;
  }
  return File.find(query).sort({ createdAt: -1 });
}

function canAccess(file, user) {
  return user.role === 'superadmin' || file.createdBy.toString() === user._id.toString();
}

async function nextFileNumber() {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'fileNumber' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `AA-${100000 + counter.seq}`;
}

async function list(req, res) {
  const { type = 'all', search = '' } = req.query;
  const files = await scopedFiles(req);
  const filtered = files.filter((f) => matchesView(f, type) && matchesSearch(f, search));
  return res.status(200).json({ files: filtered.map((f) => f.toJSON()), total: filtered.length });
}

async function stats(req, res) {
  const files = await scopedFiles(req);
  return res.status(200).json(computeStats(files));
}

async function getOne(req, res) {
  const file = await File.findById(req.params.id);
  if (!file || !canAccess(file, req.user)) {
    return res.status(404).json({ error: 'File not found' });
  }
  return res.status(200).json({ file: file.toJSON() });
}

async function create(req, res) {
  const payload = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) payload[field] = req.body[field];
  }

  const missing = ['dealerName', 'workType', 'vehicleNo', 'vehicleModel', 'chassisNo', 'engineNo', 'oldOwnerName', 'oldOwnerMob', 'newOwnerMob', 'rtoName'].filter(
    (field) => !payload[field]
  );
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const file = await File.create({
    ...payload,
    fileNumber: await nextFileNumber(),
    date: new Date().toISOString().split('T')[0],
    status: 'pending',
    totalBill: 0,
    createdBy: req.user._id,
  });

  return res.status(201).json({ success: true, file: file.toJSON() });
}

async function update(req, res) {
  const file = await File.findById(req.params.id);
  if (!file || !canAccess(file, req.user)) {
    return res.status(404).json({ error: 'File not found' });
  }

  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) file[field] = req.body[field];
  }

  await file.save();
  return res.status(200).json({ success: true, file: file.toJSON() });
}

async function updateStatus(req, res) {
  const { status } = req.body;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const file = await File.findById(req.params.id);
  if (!file || !canAccess(file, req.user)) {
    return res.status(404).json({ error: 'File not found' });
  }

  file.status = status;
  await file.save();
  return res.status(200).json({ success: true, file: file.toJSON() });
}

async function updateExpenses(req, res) {
  const file = await File.findById(req.params.id);
  if (!file || !canAccess(file, req.user)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const expenses = {
    challan: Number(req.body.challan) || 0,
    adjustment: Number(req.body.adjustment) || 0,
    puc: Number(req.body.puc) || 0,
    hsrp: Number(req.body.hsrp) || 0,
    insurance: Number(req.body.insurance) || 0,
    setDeal: Number(req.body.setDeal) || 0,
  };

  file.expenses = expenses;
  file.totalBill = Object.values(expenses).reduce((sum, v) => sum + v, 0);
  await file.save();
  return res.status(200).json({ success: true, file: file.toJSON() });
}

async function remove(req, res) {
  const file = await File.findById(req.params.id);
  if (!file || !canAccess(file, req.user)) {
    return res.status(404).json({ error: 'File not found' });
  }

  await file.deleteOne();
  return res.status(200).json({ success: true });
}

module.exports = { list, stats, getOne, create, update, updateStatus, updateExpenses, remove };
