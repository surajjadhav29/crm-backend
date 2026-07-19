// One-off cleanup: backfill the space-insensitive `key` on every RTO, drop rows
// that duplicate a built-in RTO or another custom RTO, then (re)build the unique
// index on `key`. Safe to run multiple times.
//
//   node src/scripts/dedupeRtos.js

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { BASE_RTO_KEYS, rtoKey } = require('../constants/rto.constants');

function cleanName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

async function run() {
  await connectDB();
  const col = mongoose.connection.collection('rtos');

  const docs = await col.find({}).sort({ createdAt: 1, _id: 1 }).toArray();
  console.log(`Found ${docs.length} RTO rows.`);

  const seen = new Set();
  let deleted = 0;
  let updated = 0;

  for (const doc of docs) {
    const key = rtoKey(doc.name);

    // Duplicates a built-in RTO, or a custom RTO we already kept -> remove.
    if (BASE_RTO_KEYS.has(key) || seen.has(key)) {
      await col.deleteOne({ _id: doc._id });
      deleted += 1;
      console.log(`  deleted duplicate "${doc.name}" (key ${key})`);
      continue;
    }

    seen.add(key);
    await col.updateOne({ _id: doc._id }, { $set: { key, name: cleanName(doc.name) } });
    updated += 1;
  }

  // Rebuild indexes: drop the old unique-on-name index if present, ensure key is unique.
  const indexes = await col.indexes();
  for (const idx of indexes) {
    if (idx.name === 'name_1') {
      await col.dropIndex('name_1');
      console.log('  dropped stale name_1 index');
    }
  }
  await col.createIndex({ key: 1 }, { unique: true });
  console.log('  ensured unique index on key');

  console.log(`Done. kept/updated=${updated}, deleted=${deleted}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
