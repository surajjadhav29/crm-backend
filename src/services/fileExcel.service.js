const ExcelJS = require('exceljs');
const ApiError = require('../utils/apiError');
const { EXCEL_COLUMNS } = require('../constants/excel.constants');
const fileService = require('./file.service');

/** Required for a row to be created — missing any of these skips the record. */
const REQUIRED_ROW_FIELDS = [
  { key: 'dealerName', label: 'Dealer Name' },
  { key: 'workType', label: 'Work Type' },
  { key: 'vehicleNo', label: 'Vehicle No' },
  { key: 'vehicleModel', label: 'Vehicle Model' },
  { key: 'chassisNo', label: 'Chassis No' },
  { key: 'engineNo', label: 'Engine No' },
  { key: 'oldOwnerName', label: 'Old Owner Name' },
  { key: 'oldOwnerMob', label: 'Old Owner Mobile' },
  { key: 'rtoName', label: 'RTO' },
];

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.text != null) return String(value.text).trim();
  if (typeof value === 'object' && value.result !== undefined && value.result !== null) {
    return String(value.result).trim();
  }
  if (typeof value === 'object' && value.richText) {
    return value.richText.map((part) => part.text || '').join('').trim();
  }
  return String(value).trim();
}

/** Excel often stores mobiles as numbers / scientific notation — keep last 10 digits. */
function excelMobile(value) {
  if (value === null || value === undefined || value === '') return '';

  let digits = '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    digits = String(Math.round(value));
  } else if (typeof value === 'object' && value !== null && value.result != null) {
    return excelMobile(value.result);
  } else {
    const raw = cellText(value);
    if (/e/i.test(raw)) {
      const n = Number(raw);
      digits = Number.isFinite(n) ? String(Math.round(n)) : raw;
    } else {
      digits = raw;
    }
  }

  return digits.replace(/\D/g, '').slice(-10);
}

function upper(value) {
  return cellText(value).toUpperCase();
}

function normalizeVehicleNo(value) {
  return cellText(value).replace(/\s+/g, '').toUpperCase();
}

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function buildExcelTemplateBuffer() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoAxis CRM';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('File Upload', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = EXCEL_COLUMNS.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width,
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF5' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    const notes = workbook.addWorksheet('Instructions');
    notes.getColumn(1).width = 96;
    notes.addRow(['AutoAxis CRM — File bulk upload template']);
    notes.addRow(['1. Fill rows on the "File Upload" sheet. Keep the header row exactly as-is.']);
    notes.addRow([
      '2. REQUIRED (row skipped if any empty): Dealer Name, Work Type, Vehicle No, Vehicle Model, Chassis No (5 chars), Engine No (5 chars), Old Owner Name, Old Owner Mobile (10 digits), RTO.',
    ]);
    notes.addRow([
      '3. OPTIONAL (empty OK — record still uploaded): New Owner Name, New Owner Mobile, Dealer Mobile, Remarks.',
    ]);
    notes.addRow([
      '4. Prices optional: empty → saved as 0. Payment Done empty → saved as No. Total bill = sum of amounts.',
    ]);
    notes.addRow(['5. Vehicle numbers must be unique across the system.']);
    notes.addRow(['6. Save as .xlsx and upload from New Entry (superadmin@autoaxis.com only).']);
    notes.getRow(1).font = { bold: true, size: 12 };

    return workbook.xlsx.writeBuffer();
  } catch (err) {
    console.error('Excel template build failed:', err);
    throw ApiError.badRequest('Failed to generate Excel template');
  }
}

function mapHeaderRow(headerRow) {
  const headerToKey = new Map(
    EXCEL_COLUMNS.map((col) => [normalizeHeader(col.header), col.key])
  );

  const columnMap = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = headerToKey.get(normalizeHeader(cellText(cell.value)));
    if (key) columnMap[colNumber] = key;
  });

  const mappedKeys = new Set(Object.values(columnMap));
  const missingHeaders = EXCEL_COLUMNS.filter(
    (col) => col.required && !mappedKeys.has(col.key)
  ).map((col) => col.header);

  if (missingHeaders.length) {
    throw ApiError.badRequest(
      `Excel template headers missing: ${missingHeaders.join(', ')}. Download the Excel format and try again.`
    );
  }

  return columnMap;
}

function excelAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 0 ? 0 : value;
  }
  if (typeof value === 'object' && value !== null && value.result != null) {
    return excelAmount(value.result);
  }
  const raw = cellText(value).replace(/,/g, '').replace(/₹/g, '').trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function excelPaymentDone(value) {
  const raw = cellText(value).toLowerCase();
  if (!raw) return false;
  return ['yes', 'y', 'true', '1', 'paid', 'done'].includes(raw);
}

function rowToPayload(row, columnMap) {
  const raw = {};
  for (const [colNumber, key] of Object.entries(columnMap)) {
    raw[key] = row.getCell(Number(colNumber)).value;
  }

  const filePayload = {
    dealerName: upper(raw.dealerName),
    workType: cellText(raw.workType).toUpperCase(),
    vehicleNo: normalizeVehicleNo(raw.vehicleNo),
    vehicleModel: upper(raw.vehicleModel),
    chassisNo: upper(raw.chassisNo),
    engineNo: upper(raw.engineNo),
    oldOwnerName: upper(raw.oldOwnerName),
    ownerName: upper(raw.ownerName),
    oldOwnerMob: excelMobile(raw.oldOwnerMob),
    newOwnerMob: excelMobile(raw.newOwnerMob),
    dealerMob: excelMobile(raw.dealerMob),
    rtoName: upper(raw.rtoName),
    remarks: upper(raw.remarks),
  };

  const expenses = {
    challan: excelAmount(raw.challan),
    adjustment: excelAmount(raw.adjustment),
    puc: excelAmount(raw.puc),
    hsrp: excelAmount(raw.hsrp),
    insurance: excelAmount(raw.insurance),
    setDeal: excelAmount(raw.setDeal),
  };
  // Empty / missing Payment Done → No (false)
  const paymentDone = excelPaymentDone(raw.paymentDone);

  return { filePayload, expenses, paymentDone };
}

/** Extra format checks so Error Reason is clear before hitting createFile. */
function formatErrors(filePayload) {
  const issues = [];
  if (filePayload.chassisNo && filePayload.chassisNo.length !== 5) {
    issues.push('Chassis No must be exactly 5 characters');
  }
  if (filePayload.engineNo && filePayload.engineNo.length !== 5) {
    issues.push('Engine No must be exactly 5 characters');
  }
  if (filePayload.oldOwnerMob && !/^\d{10}$/.test(filePayload.oldOwnerMob)) {
    issues.push('Old Owner Mobile must be a 10 digit number');
  }
  if (filePayload.newOwnerMob && !/^\d{10}$/.test(filePayload.newOwnerMob)) {
    issues.push('New Owner Mobile must be a 10 digit number');
  }
  if (filePayload.dealerMob && !/^\d{10}$/.test(filePayload.dealerMob)) {
    issues.push('Dealer Mobile must be a 10 digit number');
  }
  return issues;
}

/** Returns labels of required fields that are blank — row must not be uploaded. */
function missingRequiredFields(filePayload) {
  return REQUIRED_ROW_FIELDS.filter(({ key }) => !String(filePayload[key] || '').trim()).map(
    ({ label }) => label
  );
}

function isEmptyFilePayload(payload) {
  // Only look at core identity fields — optional empties should not hide a real row.
  return REQUIRED_ROW_FIELDS.every(({ key }) => !String(payload[key] || '').trim());
}

function buildFailedRow(rowNumber, filePayload, expenses, paymentDone, error) {
  return {
    row: rowNumber,
    vehicleNo: (filePayload && filePayload.vehicleNo) || '',
    error,
    // Full row data so FE can auto-download a failed Excel with Error Reason.
    data: {
      dealerName: filePayload?.dealerName || '',
      workType: filePayload?.workType || '',
      vehicleNo: filePayload?.vehicleNo || '',
      vehicleModel: filePayload?.vehicleModel || '',
      chassisNo: filePayload?.chassisNo || '',
      engineNo: filePayload?.engineNo || '',
      oldOwnerName: filePayload?.oldOwnerName || '',
      ownerName: filePayload?.ownerName || '',
      oldOwnerMob: filePayload?.oldOwnerMob || '',
      newOwnerMob: filePayload?.newOwnerMob || '',
      dealerMob: filePayload?.dealerMob || '',
      rtoName: filePayload?.rtoName || '',
      remarks: filePayload?.remarks || '',
      challan: expenses?.challan ?? 0,
      adjustment: expenses?.adjustment ?? 0,
      puc: expenses?.puc ?? 0,
      hsrp: expenses?.hsrp ?? 0,
      insurance: expenses?.insurance ?? 0,
      setDeal: expenses?.setDeal ?? 0,
      paymentDone: paymentDone ? 'Yes' : 'No',
    },
  };
}

/**
 * Parse an .xlsx buffer and create one file per data row.
 * Continues on row errors; returns a summary of created / failed rows.
 */
async function importFilesFromExcel(user, buffer) {
  const hasBuffer =
    buffer && (Buffer.isBuffer(buffer) || buffer instanceof Uint8Array);
  if (!hasBuffer) {
    throw ApiError.badRequest('Excel file is required (.xlsx)');
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    console.error('Excel parse failed:', err);
    throw ApiError.badRequest('Invalid or corrupted Excel file. Please upload a valid .xlsx file.');
  }

  if (!workbook.worksheets.length) {
    throw ApiError.badRequest('Excel file has no worksheet');
  }

  const sheet =
    workbook.getWorksheet('File Upload') ||
    workbook.worksheets.find((ws) => normalizeHeader(ws.name) !== 'instructions') ||
    workbook.worksheets[0];

  if (!sheet) {
    throw ApiError.badRequest('Excel file has no worksheet');
  }

  const headerRow = sheet.getRow(1);
  if (!headerRow || headerRow.cellCount === 0) {
    throw ApiError.badRequest(
      'Excel header row is missing. Download the Excel format and try again.'
    );
  }

  let columnMap;
  try {
    columnMap = mapHeaderRow(headerRow);
  } catch (err) {
    if (err.isApiError) throw err;
    throw ApiError.badRequest('Could not read Excel headers. Download the Excel format and try again.');
  }

  const created = [];
  const errors = [];
  // Block duplicate Vehicle No inside the same Excel upload.
  const seenVehicles = new Map();

  const dataRows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    dataRows.push({ row, rowNumber });
  });

  for (const { row, rowNumber } of dataRows) {
    let parsed;
    try {
      parsed = rowToPayload(row, columnMap);
    } catch (err) {
      errors.push(
        buildFailedRow(rowNumber, {}, { challan: 0, adjustment: 0, puc: 0, hsrp: 0, insurance: 0, setDeal: 0 }, false, err.message || 'Failed to read row')
      );
      continue;
    }

    const { filePayload, expenses, paymentDone } = parsed;
    // Completely blank required columns → skip silently (spacer rows).
    if (isEmptyFilePayload(filePayload)) continue;

    const missing = missingRequiredFields(filePayload);
    if (missing.length) {
      errors.push(
        buildFailedRow(
          rowNumber,
          filePayload,
          expenses,
          paymentDone,
          `Required field(s) missing: ${missing.join(', ')}. Record not uploaded.`
        )
      );
      continue;
    }

    const formatIssues = formatErrors(filePayload);
    if (formatIssues.length) {
      errors.push(
        buildFailedRow(
          rowNumber,
          filePayload,
          expenses,
          paymentDone,
          `${formatIssues.join('; ')}. Record not uploaded.`
        )
      );
      continue;
    }

    const vehicleNo = filePayload.vehicleNo;
    if (seenVehicles.has(vehicleNo)) {
      errors.push(
        buildFailedRow(
          rowNumber,
          filePayload,
          expenses,
          paymentDone,
          `Duplicate Vehicle No "${vehicleNo}" in Excel (also on row ${seenVehicles.get(vehicleNo)}). Record not uploaded.`
        )
      );
      continue;
    }
    seenVehicles.set(vehicleNo, rowNumber);

    // Also block Vehicle No that already exists in the database.
    try {
      const existing = await fileService.findDuplicateVehicle(vehicleNo);
      if (existing) {
        errors.push(
          buildFailedRow(
            rowNumber,
            filePayload,
            expenses,
            paymentDone,
            `A file already exists for vehicle number ${vehicleNo}. Record not uploaded.`
          )
        );
        continue;
      }
    } catch (err) {
      errors.push(
        buildFailedRow(
          rowNumber,
          filePayload,
          expenses,
          paymentDone,
          err.message || 'Failed to check duplicate vehicle'
        )
      );
      continue;
    }

    try {
      const file = await fileService.createFile(user, filePayload);
      try {
        // Empty prices → 0, missing Payment Done → No
        await fileService.updateExpenses(user, file.id, { ...expenses, paymentDone });
      } catch (expenseErr) {
        // File already created with default 0 expenses — still count as success.
        console.error(`Excel row ${rowNumber}: expenses update failed:`, expenseErr);
      }
      created.push({ row: rowNumber, fileNumber: file.fileNumber, id: file.id });
    } catch (err) {
      let message = err.message || 'Failed to create file';
      if (err.errorCode === 'DUPLICATE_VEHICLE' || /vehicle number/i.test(message)) {
        message = `Duplicate Vehicle No "${vehicleNo}". Record not uploaded.`;
      }
      errors.push(buildFailedRow(rowNumber, filePayload, expenses, paymentDone, message));
    }
  }

  if (created.length === 0 && errors.length === 0) {
    throw ApiError.badRequest('No data rows found in the Excel file');
  }

  return {
    createdCount: created.length,
    failedCount: errors.length,
    created,
    errors,
  };
}

module.exports = {
  buildExcelTemplateBuffer,
  importFilesFromExcel,
};
