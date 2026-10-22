/**
 * One-time (idempotent): create Dealer documents for every distinct file.dealerName
 * that is not in the dealers collection yet, then set file.dealerId for matching rows.
 *
 *   SEED_DEALERS_CONFIRM=yes npm run seed:dealers-from-files
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const File = require('../models/File');
const Dealer = require('../models/Dealer');
const { dealerNameKey } = require('../utils/dealerNameKey');
const { linkLegacyFilesToDealer } = require('../services/dealer.service');

const PLACEHOLDER = {
  address: 'Pending — update in dealer profile',
  city: 'Pending',
  state: 'Pending',
  zip: '000000',
  country: 'India',
};

function slugForEmail(nameKey, index) {
  const base = String(nameKey || 'DEALER')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'dealer'}-${index}@seed.local`;
}

function placeholderPhone(index) {
  const n = String(index).padStart(7, '0');
  return `999${n}`.slice(0, 10);
}

function displayDealerName(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
}

async function distinctFileDealerNames() {
  const names = await File.distinct('dealerName');
  const byKey = new Map();

  for (const raw of names) {
    const name = displayDealerName(raw);
    const key = dealerNameKey(name);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, name);
    }
  }

  return [...byKey.entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function run() {
  if (process.env.SEED_DEALERS_CONFIRM !== 'yes') {
    console.error(
      'Refusing to run without confirmation. Set SEED_DEALERS_CONFIRM=yes and run again.'
    );
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || '';
  const hostHint = uri.replace(/\/\/([^:@/]+)[^@]*@/, '//***@').split('?')[0];
  console.log(`Target DB: ${hostHint}`);

  await connectDB();

  const creator =
    (await User.findOne({ role: 'superadmin', isActive: true }).sort({ createdAt: 1 })) ||
    (await User.findOne({ isActive: true }).sort({ createdAt: 1 }));

  if (!creator) {
    console.error('No active user found for createdBy. Seed a superadmin first.');
    process.exit(1);
  }

  const entries = await distinctFileDealerNames();
  if (entries.length === 0) {
    console.log('No file dealer names found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  let created = 0;
  let skipped = 0;
  let filesMatched = 0;
  let filesUpdated = 0;

  let seq = 0;
  for (const { key, name } of entries) {
    seq += 1;
    let dealer = await Dealer.findOne({ nameKey: key });

    if (!dealer) {
      dealer = await Dealer.create({
        name,
        email: slugForEmail(key, seq),
        phone: placeholderPhone(seq),
        ...PLACEHOLDER,
        createdBy: creator._id,
      });
      created += 1;
    } else {
      skipped += 1;
    }

    const link = await linkLegacyFilesToDealer(dealer);
    filesMatched += link.matched;
    filesUpdated += link.updated;
  }

  console.log('--- seedDealersFromFiles summary ---');
  console.log(`Distinct dealer names on files: ${entries.length}`);
  console.log(`Dealers created: ${created}`);
  console.log(`Dealers already existed: ${skipped}`);
  console.log(`Files matched (orphan by name): ${filesMatched}`);
  console.log(`Files updated with dealerId: ${filesUpdated}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  mongoose.disconnect().finally(() => process.exit(1));
});
