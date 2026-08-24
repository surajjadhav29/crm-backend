/**
 * statusHistory = source of truth for the status log.
 * lastStatusAt = denormalized latest history timestamp for fast indexed list sort.
 */

function latestStatusHistoryAt(statusHistory) {
  if (!Array.isArray(statusHistory) || !statusHistory.length) return null;
  let latest = null;
  for (const entry of statusHistory) {
    const at = entry?.at ? new Date(entry.at) : null;
    if (!at || Number.isNaN(at.getTime())) continue;
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

/** Derive lastStatusAt from existing file data (backfill / pre-save). */
function resolveLastStatusAt({ statusHistory, createdAt } = {}) {
  return latestStatusHistoryAt(statusHistory) || (createdAt ? new Date(createdAt) : null);
}

module.exports = { latestStatusHistoryAt, resolveLastStatusAt };
