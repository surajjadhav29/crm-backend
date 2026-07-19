// Escapes a string for safe use inside a RegExp.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Builds a case-insensitive, exact-match RegExp for a value.
function exactInsensitive(value) {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

module.exports = { escapeRegex, exactInsensitive };
