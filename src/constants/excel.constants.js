// Excel import/export column map for bulk file creation.
// Headers must match the downloadable template exactly (case-insensitive match on import).

const SYSTEM_ACCOUNT_EMAIL = 'superadmin@autoaxis.com';

const EXCEL_COLUMNS = [
  { header: 'Dealer Name', key: 'dealerName', required: true, width: 22 },
  { header: 'Work Type', key: 'workType', required: true, width: 16 },
  { header: 'Vehicle No', key: 'vehicleNo', required: true, width: 16 },
  { header: 'Vehicle Model', key: 'vehicleModel', required: true, width: 18 },
  { header: 'Chassis No', key: 'chassisNo', required: true, width: 12 },
  { header: 'Engine No', key: 'engineNo', required: true, width: 12 },
  { header: 'Old Owner Name', key: 'oldOwnerName', required: true, width: 22 },
  { header: 'New Owner Name', key: 'ownerName', required: false, width: 22 },
  { header: 'Old Owner Mobile', key: 'oldOwnerMob', required: true, width: 16 },
  { header: 'New Owner Mobile', key: 'newOwnerMob', required: false, width: 16 },
  { header: 'Dealer Mobile', key: 'dealerMob', required: false, width: 16 },
  { header: 'RTO', key: 'rtoName', required: true, width: 24 },
  { header: 'Remarks', key: 'remarks', required: false, width: 28 },
  // Received documents — comma / semicolon separated (optional)
  { header: 'Documents', key: 'documents', required: false, width: 40 },
  // Price / expense columns (optional)
  { header: 'Challan Amount', key: 'challan', required: false, width: 14, isExpense: true },
  { header: 'Adjustment Amount', key: 'adjustment', required: false, width: 16, isExpense: true },
  { header: 'PUC Amount', key: 'puc', required: false, width: 12, isExpense: true },
  { header: 'HSRP Amount', key: 'hsrp', required: false, width: 12, isExpense: true },
  { header: 'Insurance Amount', key: 'insurance', required: false, width: 16, isExpense: true },
  { header: 'Road Tax', key: 'roadTax', required: false, width: 12, isExpense: true },
  { header: 'Permit Cancel', key: 'permitCancel', required: false, width: 14, isExpense: true },
  { header: 'Duplicate Permit', key: 'duplicatePermit', required: false, width: 16, isExpense: true },
  { header: 'New Permit', key: 'newPermit', required: false, width: 12, isExpense: true },
  { header: 'P-tax', key: 'pTax', required: false, width: 10, isExpense: true },
  { header: 'Urgent', key: 'urgent', required: false, width: 12, isExpense: true },
  { header: 'CNG Adjustment', key: 'cngAdjustment', required: false, width: 14, isExpense: true },
  { header: 'Mob No. Update', key: 'mobNoUpdate', required: false, width: 14, isExpense: true },
  { header: 'Late Invoice', key: 'lateInvoice', required: false, width: 14, isExpense: true },
  { header: 'Set Deal Amount', key: 'setDeal', required: false, width: 14, isExpense: true },
  { header: 'Payment Done', key: 'paymentDone', required: false, width: 14 },
];

module.exports = {
  SYSTEM_ACCOUNT_EMAIL,
  EXCEL_COLUMNS,
};
