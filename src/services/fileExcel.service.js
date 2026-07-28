const ExcelJS = require('exceljs');
const ApiError = require('../utils/apiError');
const { EXCEL_COLUMNS } = require('../constants/excel.constants');
const {
  WORK_TYPE_DOCUMENTS,
  normalizeWorkTypeName,
  normalizeDocuments,
} = require('../constants/workType.constants');
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
    // Keep in sync with FE downloadExcelTemplate (FILE_UPLOAD_EXCEL_COLUMNS).
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
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A73E8' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB6C6E0' } },
        bottom: { style: 'thin', color: { argb: 'FFB6C6E0' } },
        left: { style: 'thin', color: { argb: 'FFB6C6E0' } },
        right: { style: 'thin', color: { argb: 'FFB6C6E0' } },
      };
    });

    // Row 2 = sample only — helps clients see how to fill each column.
    sheet.addRow({
      dealerName: 'ABC FINANCE',
      workType: 'TO',
      vehicleNo: 'MH12AB1234',
      vehicleModel: 'SWIFT',
      chassisNo: 'AB123',
      engineNo: 'EN456',
      oldOwnerName: 'RAMESH PATIL',
      ownerName: 'SURESH SHINDE',
      oldOwnerMob: '9876543210',
      newOwnerMob: '9123456780',
      dealerMob: '9988776655',
      rtoName: 'MH12',
      remarks: 'SAMPLE ROW — replace with real data',
      documents: 'RC, Form 29, Form 30, Old aadhar',
      challan: 500,
      adjustment: 0,
      puc: 100,
      hsrp: 0,
      insurance: 0,
      roadTax: 0,
      permitCancel: 0,
      duplicatePermit: 0,
      newPermit: 0,
      pTax: 0,
      setDeal: 2500,
      paymentDone: 'No',
    });

    const sampleRow = sheet.getRow(2);
    sampleRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };
    });

    [
      'oldOwnerMob',
      'newOwnerMob',
      'dealerMob',
      'chassisNo',
      'engineNo',
      'vehicleNo',
      'paymentDone',
      'documents',
    ].forEach((key) => {
      sheet.getColumn(key).numFmt = '@';
    });

    [
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
      'setDeal',
    ].forEach((key) => {
      sheet.getColumn(key).numFmt = '#,##0.00';
    });

    const colCount = EXCEL_COLUMNS.length;
    const notes = workbook.addWorksheet('Instructions');
    notes.getColumn(1).width = 100;
    notes.addRow([`AutoAxis CRM — File upload format (${colCount} columns)`]);
    notes.addRow(['Keep header names exactly as on "File Upload" sheet.']);
    notes.addRow([
      'Row 2 is SAMPLE / DUMMY data only — it is auto-skipped on upload. Replace it with real data or leave it; add your rows below.',
    ]);
    notes.addRow([
      'REQUIRED (if any empty → that row is NOT uploaded): Dealer Name, Work Type, Vehicle No, Vehicle Model, Chassis No (5), Engine No (5), Old Owner Name, Old Owner Mobile (10 digits), RTO',
    ]);
    notes.addRow([
      'OPTIONAL (empty OK — record still added): New Owner Name, New Owner Mobile, Dealer Mobile, Remarks, Documents',
    ]);
    notes.addRow([
      'Documents: comma-separated (or semicolon), e.g. RC, Form 29, Old aadhar. Use exact names from the "Documents" sheet.',
    ]);
    notes.addRow([
      'Prices: Challan / Adjustment / PUC / HSRP / Insurance / Road Tax / Permit Cancel / Duplicate Permit / New Permit / P-tax / Set Deal — empty → 0. Payment Done empty → No',
    ]);
    notes.addRow([
      'Vehicle No + Work Type must be unique — same vehicle with the same work type is rejected; different work type is allowed.',
    ]);
    notes.addRow(['Work Type examples: TO, HPT, TO+HPT, TO+HPT+HPA, DRC, CA, FITNESS, …']);
    notes.addRow(['Save as .xlsx then use Upload Excel file on New Entry (superadmin@autoaxis.com only).']);
    notes.addRow(['Failed rows auto-download after upload with an "Error Reason" column.']);
    notes.getRow(1).font = { bold: true, size: 12 };

    const docSheet = workbook.addWorksheet('Documents');
    docSheet.getColumn(1).width = 36;
    docSheet.addRow(['Allowed document names (copy into Documents column, comma-separated)']);
    docSheet.getRow(1).font = { bold: true };
    WORK_TYPE_DOCUMENTS.forEach((name) => docSheet.addRow([name]));

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

/** Parse Documents cell: "RC, Form 29, Old aadhar" (comma / semicolon / | / newline). */
function excelDocuments(value) {
  const raw = cellText(value);
  if (!raw) return { documents: [], unknown: [] };

  const parts = raw
    .split(/[,;|\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const allowed = new Set(WORK_TYPE_DOCUMENTS.map((d) => d.toLowerCase()));
  const unknown = [];
  for (const part of parts) {
    if (!allowed.has(part.toLowerCase()) && !unknown.includes(part)) {
      unknown.push(part);
    }
  }

  return { documents: normalizeDocuments(parts), unknown };
}

function rowToPayload(row, columnMap) {
  const raw = {};
  for (const [colNumber, key] of Object.entries(columnMap)) {
    raw[key] = row.getCell(Number(colNumber)).value;
  }

  const { documents, unknown: unknownDocuments } = excelDocuments(raw.documents);
  const documentsRaw = cellText(raw.documents);

  const filePayload = {
    dealerName: upper(raw.dealerName),
    workType: normalizeWorkTypeName(cellText(raw.workType)),
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
    documents,
    documentsRaw,
  };

  const expenses = {
    challan: excelAmount(raw.challan),
    adjustment: excelAmount(raw.adjustment),
    puc: excelAmount(raw.puc),
    hsrp: excelAmount(raw.hsrp),
    insurance: excelAmount(raw.insurance),
    roadTax: excelAmount(raw.roadTax),
    permitCancel: excelAmount(raw.permitCancel),
    duplicatePermit: excelAmount(raw.duplicatePermit),
    newPermit: excelAmount(raw.newPermit),
    pTax: excelAmount(raw.pTax),
    setDeal: excelAmount(raw.setDeal),
  };
  // Empty / missing Payment Done → No (false)
  const paymentDone = excelPaymentDone(raw.paymentDone);

  return { filePayload, expenses, paymentDone, unknownDocuments };
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

/** Template dummy row — never create a real file from it. */
function isSampleTemplateRow(payload) {
  return /SAMPLE\s*ROW/i.test(String(payload?.remarks || ''));
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
      documents:
        filePayload?.documentsRaw ||
        (Array.isArray(filePayload?.documents) ? filePayload.documents.join(', ') : ''),
      challan: expenses?.challan ?? 0,
      adjustment: expenses?.adjustment ?? 0,
      puc: expenses?.puc ?? 0,
      hsrp: expenses?.hsrp ?? 0,
      insurance: expenses?.insurance ?? 0,
      roadTax: expenses?.roadTax ?? 0,
      permitCancel: expenses?.permitCancel ?? 0,
      duplicatePermit: expenses?.duplicatePermit ?? 0,
      newPermit: expenses?.newPermit ?? 0,
      pTax: expenses?.pTax ?? 0,
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
    workbook.worksheets.find((ws) => {
      const name = normalizeHeader(ws.name);
      return name !== 'instructions' && name !== 'documents';
    }) ||
    workbook.worksheets[0];

  if (!sheet) {
    throw ApiError.badRequest('Excel file has no worksheet');
  }

  // Guard: user may have opened/saved only the Documents reference sheet.
  if (normalizeHeader(sheet.name) === 'documents') {
    throw ApiError.badRequest(
      'Upload the "File Upload" sheet (not the Documents reference sheet). Download the Excel format and try again.'
    );
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
  // Block duplicate Vehicle No + Work Type inside the same Excel upload.
  const seenPairs = new Map();

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
        buildFailedRow(rowNumber, {}, { challan: 0, adjustment: 0, puc: 0, hsrp: 0, insurance: 0, roadTax: 0, permitCancel: 0, duplicatePermit: 0, newPermit: 0, pTax: 0, setDeal: 0 }, false, err.message || 'Failed to read row')
      );
      continue;
    }

    const { filePayload, expenses, paymentDone, unknownDocuments } = parsed;
    // Completely blank required columns → skip silently (spacer rows).
    if (isEmptyFilePayload(filePayload)) continue;

    // Template dummy row — skip so accidental upload does not create junk files.
    if (isSampleTemplateRow(filePayload)) continue;

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

    if (unknownDocuments && unknownDocuments.length) {
      errors.push(
        buildFailedRow(
          rowNumber,
          filePayload,
          expenses,
          paymentDone,
          `Unknown document(s): ${unknownDocuments.join(', ')}. Use names from the Documents sheet. Record not uploaded.`
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
    const workType = filePayload.workType;
    const pairKey = `${vehicleNo}||${workType}`;
    if (seenPairs.has(pairKey)) {
      errors.push(
        buildFailedRow(
          rowNumber,
          filePayload,
          expenses,
          paymentDone,
          `Duplicate Vehicle No "${vehicleNo}" + Work Type "${workType}" in Excel (also on row ${seenPairs.get(pairKey)}). Record not uploaded.`
        )
      );
      continue;
    }

    // Also block Vehicle No + Work Type that already exists in the database.
    try {
      const existing = await fileService.findDuplicateFile(vehicleNo, workType);
      if (existing) {
        errors.push(
          buildFailedRow(
            rowNumber,
            filePayload,
            expenses,
            paymentDone,
            `A file already exists for vehicle ${vehicleNo} with work type ${workType}. Record not uploaded.`
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
          err.message || 'Failed to check duplicate file'
        )
      );
      continue;
    }

    try {
      // Strip import-only fields before createFile.
      const { documentsRaw: _documentsRaw, ...createPayload } = filePayload;
      const file = await fileService.createFile(user, createPayload);
      try {
        // Empty prices → 0, missing Payment Done → No
        await fileService.updateExpenses(user, file.id, { ...expenses, paymentDone });
      } catch (expenseErr) {
        // Do not leave a half-created row as "success" — roll back the file.
        console.error(`Excel row ${rowNumber}: expenses update failed:`, expenseErr);
        try {
          await fileService.deleteFile(user, file.id);
        } catch (rollbackErr) {
          console.error(`Excel row ${rowNumber}: rollback delete failed:`, rollbackErr);
        }
        errors.push(
          buildFailedRow(
            rowNumber,
            filePayload,
            expenses,
            paymentDone,
            `Expenses could not be saved (${expenseErr.message || 'update failed'}). Record not uploaded.`
          )
        );
        continue;
      }
      // Only mark pair as seen after a successful create (failed rows can be fixed & re-tried).
      seenPairs.set(pairKey, rowNumber);
      created.push({ row: rowNumber, fileNumber: file.fileNumber, id: file.id });
    } catch (err) {
      let message = err.message || 'Failed to create file';
      if (err.errorCode === 'DUPLICATE_FILE' || err.errorCode === 'DUPLICATE_VEHICLE' || /already exists for vehicle/i.test(message)) {
        message = `Duplicate Vehicle No "${vehicleNo}" + Work Type "${workType}". Record not uploaded.`;
      } else if (/not in the catalog/i.test(message)) {
        message = `${message} Record not uploaded.`;
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
