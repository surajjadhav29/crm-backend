/**
 * RTO office identity for matching (MH12, MH-12, MH12 - PUNE → MH12).
 * Shared by field-agent registry and file auto-mapping.
 */
function rtoMatchKey(name) {
  const s = String(name || '')
    .trim()
    .toUpperCase();
  const m = s.match(/MH[-\s]?(\d{2})/);
  if (m) return `MH${m[1]}`;
  const head = s.split(/[\s-]+/)[0];
  return head || '';
}

function fieldAgentRtoLabel(agent) {
  if (!agent) return '';
  return String(agent.rtoName || agent.district || '').trim();
}

module.exports = {
  rtoMatchKey,
  fieldAgentRtoLabel,
};
