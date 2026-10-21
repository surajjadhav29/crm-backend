const Dealer = require('../models/Dealer');
const File = require('../models/File');
const ApiError = require('../utils/apiError');
const { isValidObjectId } = require('../utils/objectId');
const { dealerNameKey, dealerNameExactQuery } = require('../utils/dealerNameKey');

function trim(value) {
  return String(value || '').trim();
}

async function findDealer(id) {
  if (!isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid dealer id');
  }

  const dealer = await Dealer.findById(id);
  if (!dealer) {
    throw ApiError.notFound('Dealer not found');
  }

  return dealer;
}

async function assertUniqueDealerName(name, excludeId) {
  const key = dealerNameKey(name);
  if (!key) throw ApiError.badRequest('Dealer name is required');
  const query = { nameKey: key };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await Dealer.findOne(query).select('_id name');
  if (existing) {
    throw ApiError.conflict('A dealer with this name already exists');
  }
}

function legacyFileDealerNameQuery(dealerName) {
  const nameMatch = dealerNameExactQuery(dealerName);
  if (!nameMatch) return null;
  return {
    $or: [{ dealerId: null }, { dealerId: { $exists: false } }],
    dealerName: nameMatch,
  };
}

/** Attach dealerId to files that only have dealerName (same normalized name). */
async function linkLegacyFilesToDealer(dealer) {
  const query = legacyFileDealerNameQuery(dealer.name);
  if (!query) return { matched: 0, updated: 0 };

  const displayName = trim(dealer.name).replace(/\s+/g, ' ');
  const result = await File.updateMany(query, {
    $set: { dealerId: dealer._id, dealerName: displayName },
  });
  return { matched: result.matchedCount ?? result.n ?? 0, updated: result.modifiedCount ?? result.nModified ?? 0 };
}

/** After rename, keep file dealerName in sync for rows already tied to this dealer. */
async function syncFilesDealerNameForDealer(dealer, previousName) {
  const prevKey = dealerNameKey(previousName);
  const nextKey = dealerNameKey(dealer.name);
  const displayName = trim(dealer.name).replace(/\s+/g, ' ');

  if (prevKey && prevKey !== nextKey) {
    await File.updateMany({ dealerId: dealer._id }, { $set: { dealerName: displayName } });
  }

  return linkLegacyFilesToDealer(dealer);
}

/** Populate nameKey on dealers created before the unique-name migration. */
async function ensureDealerNameKeys() {
  const dealers = await Dealer.find().select('_id name nameKey');
  let updated = 0;
  const conflicts = [];
  for (const dealer of dealers) {
    const key = dealerNameKey(dealer.name);
    if (!key) continue;
    if (dealer.nameKey === key) continue;
    dealer.nameKey = key;
    try {
      await dealer.save();
      updated += 1;
    } catch (err) {
      if (err?.code === 11000) {
        conflicts.push({ name: dealer.name, dealerId: String(dealer._id) });
      } else {
        throw err;
      }
    }
  }
  return { updated, conflicts };
}

/**
 * One-time / admin: link orphan files for every dealer in the registry.
 * POST /dealers/sync-legacy-files — run after migrating old file rows to production.
 */
async function backfillAllLegacyDealerFileLinks() {
  const keyResult = await ensureDealerNameKeys();
  const dealers = await Dealer.find().select('_id name');
  let matched = 0;
  let updated = 0;
  for (const dealer of dealers) {
    const stats = await linkLegacyFilesToDealer(dealer);
    matched += stats.matched;
    updated += stats.updated;
  }
  return { dealers: dealers.length, matched, updated, nameKeys: keyResult };
}

async function listDealers() {
  const dealers = await Dealer.find().sort({ name: 1 });
  return dealers.map((dealer) => dealer.toJSON());
}

async function listDealerNames() {
  const dealers = await Dealer.find().select('name').sort({ name: 1 });
  return dealers.map((dealer) => ({
    id: dealer._id.toString(),
    name: dealer.name,
  }));
}

async function getDealer(id) {
  const dealer = await findDealer(id);
  return dealer.toJSON();
}

async function createDealer(user, body = {}) {
  const name = trim(body.name);
  const emailRaw = trim(body.email);
  const email = emailRaw ? emailRaw.toLowerCase() : '';
  const phone = trim(body.phone);
  const address = trim(body.address);
  const city = trim(body.city);
  const state = trim(body.state);
  const zip = trim(body.zip);
  const country = trim(body.country) || 'India';

  if (!name || !phone || !address || !city || !state || !zip) {
    throw ApiError.badRequest('name, phone, address, city, state and zip are required');
  }

  await assertUniqueDealerName(name);

  if (email && (await Dealer.findOne({ email }))) {
    throw ApiError.conflict('A dealer with this email already exists');
  }
  if (await Dealer.findOne({ phone })) {
    throw ApiError.conflict('A dealer with this phone already exists');
  }

  const dealerDoc = {
    name,
    phone,
    address,
    city,
    state,
    zip,
    country,
    createdBy: user._id,
  };
  if (email) dealerDoc.email = email;

  const dealer = await Dealer.create(dealerDoc);

  await linkLegacyFilesToDealer(dealer);

  return dealer.toJSON();
}

async function updateDealer(id, { name, email, phone, address, city, state, zip, country } = {}) {
  const dealer = await findDealer(id);
  const previousName = dealer.name;

  if (name && trim(name) !== dealer.name) {
    const nextName = trim(name);
    await assertUniqueDealerName(nextName, dealer._id);
    dealer.name = nextName;
  }
  if (address && trim(address) !== dealer.address) {
    dealer.address = trim(address);
  }
  if (city && trim(city) !== dealer.city) {
    dealer.city = trim(city);
  }
  if (state && trim(state) !== dealer.state) {
    dealer.state = trim(state);
  }
  if (zip && trim(zip) !== dealer.zip) {
    dealer.zip = trim(zip);
  }
  if (country && trim(country) !== dealer.country) {
    dealer.country = trim(country);
  }

  if (email !== undefined) {
    const nextEmail = trim(email).toLowerCase();
    const current = dealer.email ? String(dealer.email).toLowerCase() : '';
    if (nextEmail !== current) {
      if (nextEmail) {
        if (await Dealer.findOne({ email: nextEmail, _id: { $ne: dealer._id } })) {
          throw ApiError.conflict('A dealer with this email already exists');
        }
        dealer.email = nextEmail;
      } else {
        dealer.email = undefined;
      }
    }
  }

  if (phone) {
    const nextPhone = trim(phone);
    if (nextPhone !== dealer.phone) {
      if (await Dealer.findOne({ phone: nextPhone, _id: { $ne: dealer._id } })) {
        throw ApiError.conflict('A dealer with this phone already exists');
      }
      dealer.phone = nextPhone;
    }
  }

  await dealer.save();

  if (dealerNameKey(previousName) !== dealerNameKey(dealer.name)) {
    await syncFilesDealerNameForDealer(dealer, previousName);
  }

  return dealer.toJSON();
}

module.exports = {
  listDealers,
  listDealerNames,
  getDealer,
  createDealer,
  updateDealer,
  linkLegacyFilesToDealer,
  backfillAllLegacyDealerFileLinks,
};
