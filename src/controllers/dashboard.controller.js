const dashboardService = require('../services/dashboard.service');

async function stats(req, res) {
  const result = await dashboardService.getStats(req.user, {
    filterUserId: req.query.userId,
    rtoName: req.query.rtoName,
    workType: req.query.workType,
    dealerName: req.query.dealerName,
    search: req.query.search,
    date: req.query.date,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    datePreset: req.query.datePreset,
  });
  return res.status(200).json(result);
}

module.exports = { stats };
