const { scopedFiles, isHoldFile } = require('./files.controller');

function computeDashboardStats(files) {
  return {
    totalRecords: files.length,
    pending: files.filter((f) => f.status === 'pending').length,
    inProcess: files.filter((f) => f.status === 'in_progress').length,
    completed: files.filter((f) => ['completed', 'done'].includes(f.status)).length,
    objection: files.filter((f) => f.status === 'objection').length,
    returnPaper: files.filter((f) => f.status === 'paper_return').length,
    holdSheet: files.filter((f) => isHoldFile(f)).length,
    totalBilling: files.reduce((sum, f) => (f.paymentDone ? sum : sum + (f.totalBill || 0)), 0),
  };
}

async function stats(req, res) {
  const files = await scopedFiles(req);
  return res.status(200).json(computeDashboardStats(files));
}

module.exports = { stats };
