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

/** Physical custody of file papers (not the same as workflow status). */
const PAPER_LOCATIONS = ['paper_in_office', 'paper_with_field_agent'];
const DEFAULT_PAPER_LOCATION = 'paper_in_office';

// Fields a client is allowed to set/change on a file (mass-assignment guard).
const EDITABLE_FIELDS = [
  'dealerId',
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
  'documents',
  'requiredDocuments',
  'paperLocation',
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
const EXPENSE_FIELDS = [
  'challan',
  'adjustment',
  'puc',
  'hsrp',
  'insurance',
  'roadTax',
  'permitCancel',
  'duplicatePermit',
  'newPermit',
  'pTax',
  'urgent',
  'cngAdjustment',
  'mobNoUpdate',
  'lateInvoice',
  'setDeal',
];

// Transfer-of-ownership work types. New owner name + mobile are optional at
// creation, but required before the file can move to "in_progress".
const NEW_OWNER_WORK_TYPES = ['TO', 'TO+HPT', 'TO+HPT+HPA'];

// File number generation, e.g. AA-100001.
const FILE_NUMBER_PREFIX = 'AA-';
const FILE_NUMBER_BASE = 100000;
const FILE_NUMBER_COUNTER_ID = 'fileNumber';

module.exports = {
  FILE_STATUSES,
  PAPER_LOCATIONS,
  DEFAULT_PAPER_LOCATION,
  EDITABLE_FIELDS,
  REQUIRED_CREATE_FIELDS,
  EXPENSE_FIELDS,
  NEW_OWNER_WORK_TYPES,
  FILE_NUMBER_PREFIX,
  FILE_NUMBER_BASE,
  FILE_NUMBER_COUNTER_ID,
};
