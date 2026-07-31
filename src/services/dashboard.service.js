const fileService = require('./file.service');

async function getStats(user, filters = {}) {
  // `filters` may be a legacy userId string from older callers.
  if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
    return fileService.getStatsFor(user, filters);
  }
  return fileService.getStatsFor(user, { filterUserId: filters });
}

module.exports = { getStats };
