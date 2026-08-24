/** Canonical document checklist options for work types / file intake. */
const WORK_TYPE_DOCUMENTS = [
  'Affidavit',
  'Authorization',
  'Bank latter',
  'Bank noc',
  'Blacklist',
  'Challan',
  'Chassis print',
  'CNG Latter',
  'commissioner report',
  'Company latter',
  'Company pan card',
  'Customer presence',
  'Death certificate',
  'F.I.R',
  'Fitness certificate',
  'Form 20',
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
  'Form F.T',
  'Green tax',
  'GST certificate',
  'HP continue letter',
  'HSRP',
  'INDEX II',
  'Insurance',
  'Marriage certificate',
  'NCRB Report',
  'New aadhar',
  'New e-aadhar',
  'New Light Bill',
  'New pan',
  'New paper',
  'New passport',
  'New voting card',
  'Notary',
  'Old aadhar',
  'Old e-aadhar',
  'Old license',
  'Old Light Bill',
  'Old pan',
  'Old passport',
  'Permit',
  'P-tax',
  'Puc',
  'Ration card',
  'RC',
  'RC correction',
  'RC particular',
  'register rent agreement',
  'RTO NOC',
  'Sanction order',
  'Shopact',
  'Stamp',
  'Tax receipt',
  'Udyam aadhar',
  'Vehicle chassis photo',
  'Vehicle photo back',
  'Vehicle photo front',
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
