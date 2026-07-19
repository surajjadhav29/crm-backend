// All file-related domain constants live here so both services and any future
// modules share a single source of truth.

const FILE_STATUSES = [
  'pending',
  'in_progress',
  'objection',
  'paper_return',
  'on_hold',
  'completed',
  'done',
];

// Fields a client is allowed to set/change on a file (mass-assignment guard).
const EDITABLE_FIELDS = [
  'dealerName',
  'workType',
  'vehicleNo',
  'vehicleModel',
  'chassisNo',
  'engineNo',
  'oldOwnerName',
  'ownerName',
  'oldOwnerMob',
  'newOwnerMob',
  'dealerMob',
  'rtoName',
  'remarks',
];

// Fields required to create a file.
const REQUIRED_CREATE_FIELDS = [
  'dealerName',
  'workType',
  'vehicleNo',
  'vehicleModel',
  'chassisNo',
  'engineNo',
  'oldOwnerName',
  'oldOwnerMob',
  'rtoName',
];

// The expense line items that make up a file's total bill.
const EXPENSE_FIELDS = ['challan', 'adjustment', 'puc', 'hsrp', 'insurance', 'setDeal'];

// Transfer-of-ownership work types. New owner name + mobile are optional at
// creation, but required before the file can move to "in_progress".
const NEW_OWNER_WORK_TYPES = ['TO', 'TO+HPT', 'TO+HPT+HPA'];

// A pending file older than this many days is treated as "on hold".
const HOLD_DAYS = 60;

// File number generation, e.g. AA-100001.
const FILE_NUMBER_PREFIX = 'AA-';
const FILE_NUMBER_BASE = 100000;
const FILE_NUMBER_COUNTER_ID = 'fileNumber';

module.exports = {
  FILE_STATUSES,
  EDITABLE_FIELDS,
  REQUIRED_CREATE_FIELDS,
  EXPENSE_FIELDS,
  NEW_OWNER_WORK_TYPES,
  HOLD_DAYS,
  FILE_NUMBER_PREFIX,
  FILE_NUMBER_BASE,
  FILE_NUMBER_COUNTER_ID,
};
