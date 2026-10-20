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

async function analytics(req, res) {
  const result = await dashboardService.getAnalytics(req.user, {
    filterUserId: req.query.userId,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    period: req.query.period,
  });
  return res.status(200).json(result);
}

async function lists(req, res) {
  const result = await dashboardService.getLists(req.user, {
    filterUserId: req.query.userId,
    overduePage: req.query.overduePage,
    overduePageSize: req.query.overduePageSize,
  });
  return res.status(200).json(result);
}

module.exports = { stats, analytics, lists };
