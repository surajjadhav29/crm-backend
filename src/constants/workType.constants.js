/** Canonical document checklist options for work types / file intake. */
const WORK_TYPE_DOCUMENTS = [
  'RC',
  'RC particular',
  'Form 25',
  'Form 26',
  'Form 27',
  'Form 28',
  'Form 29',
  'Form 30',
  'Form 31',
  'Form 33',
  'Form 34',
  'Form 35',
  'Bank noc',
  'Bank latter',
  'Chassis print',
  'Old pan',
  'Old aadhar',
  'Old passport',
  'Old license',
  'New pan',
  'New aadhar',
  'New passport',
  'New voting card',
  'New Light Bill',
  'INDEX II',
  'NCRB Report',
  'commissioner report',
  'Insurance',
  'Puc',
  'CNG Latter',
  'RTO NOC',
  'Vehicle photo front',
  'Vehicle photo back',
  'Vehicle chassis photo',
  'Company latter',
  'Company pan card',
  'GST certificate',
  'Udyam aadhar',
  'Shopact',
  'P-tax',
  'Tax receipt',
  'Fitness certificate',
  'Permit',
  'Notary',
  'register rent agreement',
  'Affidavit',
  'Stamp',
  'Marriage certificate',
  'Sanction order',
];

const DOCUMENT_SET = new Set(WORK_TYPE_DOCUMENTS.map((d) => d.toLowerCase()));

/** Unique key: trim, collapse spaces, uppercase — "to" / "TO" / " To " are the same. */
function normalizeWorkTypeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeDocuments(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const raw = String(item || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!DOCUMENT_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    const canonical = WORK_TYPE_DOCUMENTS.find((d) => d.toLowerCase() === key);
    out.push(canonical);
  }
  return out;
}

module.exports = {
  WORK_TYPE_DOCUMENTS,
  normalizeDocuments,
  normalizeWorkTypeName,
};
