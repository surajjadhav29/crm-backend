// One-off: sync lastStatusAt from statusHistory (source of truth) for old files.
//
//   node src/scripts/backfillLastStatusAt.js

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { resolveLastStatusAt } = require('../utils/fileStatus');

async function run() {
  await connectDB();
  const col = mongoose.connection.collection('files');

  
  const cursor = col.find({
    $or: [{ lastStatusAt: { $exists: false } }, { lastStatusAt: null }],
  });

  let updated = 0;
  for await (const doc of cursor) {
    const lastStatusAt = resolveLastStatusAt(doc);
    if (!lastStatusAt) continue;
    await col.updateOne({ _id: doc._id }, { $set: { lastStatusAt } });
    updated += 1;
    if (updated % 500 === 0) {
      console.log(`  updated ${updated} files…`);
    }
  }

  console.log(`Backfill complete: ${updated} file(s) updated.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
