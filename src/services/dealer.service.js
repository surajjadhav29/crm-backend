const Dealer = require('../models/Dealer');
const ApiError = require('../utils/apiError');
const { isValidObjectId } = require('../utils/objectId');

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
  const email = trim(body.email).toLowerCase();
  const phone = trim(body.phone);
  const address = trim(body.address);
  const city = trim(body.city);
  const state = trim(body.state);
  const zip = trim(body.zip);
  const country = trim(body.country) || 'India';

  if (!name || !email || !phone || !address || !city || !state || !zip) {
    throw ApiError.badRequest('name, email, phone, address, city, state and zip are required');
  }

  if (await Dealer.findOne({ email })) {
    throw ApiError.conflict('A dealer with this email already exists');
  }
  if (await Dealer.findOne({ phone })) {
    throw ApiError.conflict('A dealer with this phone already exists');
  }

  const dealer = await Dealer.create({
    name,
    email,
    phone,
    address,
    city,
    state,
    zip,
    country,
    createdBy: user._id,
  });

  return dealer.toJSON();
}

async function updateDealer(id, { name, email, phone, address, city, state, zip, country } = {}) {
  const dealer = await findDealer(id);

  if (name && trim(name) !== dealer.name) {
    dealer.name = trim(name);
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

  if (email) {
    const nextEmail = trim(email).toLowerCase();
    if (nextEmail !== dealer.email) {
      if (await Dealer.findOne({ email: nextEmail, _id: { $ne: dealer._id } })) {
        throw ApiError.conflict('A dealer with this email already exists');
      }
      dealer.email = nextEmail;
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
  return dealer.toJSON();
}

module.exports = {
  listDealers,
  listDealerNames,
  getDealer,
  createDealer,
  updateDealer,
};
