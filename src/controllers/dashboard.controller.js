const dashboardService = require('../services/dashboard.service');

async function stats(req, res) {
  const result = await dashboardService.getStats(req.user, req.query.userId);
  return res.status(200).json(result);
}

module.exports = { stats };
