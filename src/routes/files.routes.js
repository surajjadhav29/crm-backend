const express = require('express');
const multer = require('multer');
const requireAuth = require('../middleware/auth.middleware');
const requireSystemAccount = require('../middleware/systemAccount.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const ApiError = require('../utils/apiError');
const {
  list,
  paginatedList,
  dealerNames,
  getOne,
  create,
  update,
  updateStatus,
  updateExpenses,
  remove,
  bulk,
  downloadExcelTemplate,
  uploadExcel,
} = require('../controllers/files.controller');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      name.endsWith('.xlsx') ||
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/octet-stream';
    if (!ok) {
      return cb(ApiError.badRequest('Only .xlsx Excel files are allowed'));
    }
    return cb(null, true);
  },
});

function excelUploadMiddleware(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('Excel file is too large (max 5 MB)'));
      }
      return next(ApiError.badRequest(err.message || 'Upload failed'));
    }

    if (err.isApiError) return next(err);
    return next(ApiError.badRequest(err.message || 'Upload failed'));
  });
}

router.use(requireAuth);

router.get('/', asyncHandler(list));
router.get('/paginated', asyncHandler(paginatedList));
router.get('/dealers', asyncHandler(dealerNames));
router.get('/excel-template', requireSystemAccount, asyncHandler(downloadExcelTemplate));
router.post(
  '/excel-upload',
  requireSystemAccount,
  excelUploadMiddleware,
  asyncHandler(uploadExcel)
);
router.post('/', asyncHandler(create));
router.post('/bulk', asyncHandler(bulk));
router.get('/:id', asyncHandler(getOne));
router.put('/:id', asyncHandler(update));
router.put('/:id/status', asyncHandler(updateStatus));
router.put('/:id/expenses', asyncHandler(updateExpenses));
router.delete('/:id', asyncHandler(remove));

module.exports = router;
