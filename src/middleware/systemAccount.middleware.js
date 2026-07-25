const ApiError = require('../utils/apiError');
const { SYSTEM_ACCOUNT_EMAIL } = require('../constants/excel.constants');

/** Only the system account (superadmin@autoaxis.com) may use Excel bulk tools. */
function requireSystemAccount(req, _res, next) {
  const email = (req.user?.email || '').trim().toLowerCase();
  if (email !== SYSTEM_ACCOUNT_EMAIL.toLowerCase()) {
    return next(ApiError.forbidden('Excel upload is restricted to the system superadmin account'));
  }
  return next();
}

module.exports = requireSystemAccount;
