const { exactInsensitive } = require('./regex');

/** Normalized dealer name for uniqueness and legacy file matching (case + spaces). */
function dealerNameKey(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Case-insensitive full-name match for Mongo on `dealerName`. */
function dealerNameExactQuery(name) {
  const normalized = String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!normalized) return null;
  return exactInsensitive(normalized);
}

module.exports = { dealerNameKey, dealerNameExactQuery };
