const fileService = require('./file.service');

async function getStats(user, filterUserId) {
  return fileService.getStatsFor(user, filterUserId);
}

module.exports = { getStats };
