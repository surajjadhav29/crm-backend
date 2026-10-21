const fileService = require('./file.service');
const dashboardAnalytics = require('./dashboardAnalytics.service');

async function getStats(user, filters = {}) {
  // `filters` may be a legacy userId string from older callers.
  if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
    return fileService.getStatsFor(user, filters);
  }
  return fileService.getStatsFor(user, { filterUserId: filters });
}

async function getAnalytics(user, opts = {}) {
  return dashboardAnalytics.getAnalytics(user, opts);
}

async function getLists(user, opts = {}) {
  return dashboardAnalytics.getLists(user, opts);
}

async function getObjectionFollowUps(user, opts = {}) {
  return dashboardAnalytics.listObjectionFollowUpsForUser(user, opts);
}

module.exports = { getStats, getAnalytics, getLists, getObjectionFollowUps };
