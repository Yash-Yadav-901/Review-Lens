import multer from 'multer';
import { extname } from 'node:path';
import { config } from '../config/env.js';
import { UnsupportedMediaTypeError } from '../utils/AppError.js';

const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
]);

const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const ext = extname(file.originalname || '').toLowerCase();
  const isCsvExt = ext === '.csv';
  const isAllowedMime = ALLOWED_MIME_TYPES.has(file.mimetype);

  if (isCsvExt || isAllowedMime) {
    cb(null, true);
  } else {
    cb(new UnsupportedMediaTypeError('Only CSV files are allowed'));
  }
}

export const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter,
});
