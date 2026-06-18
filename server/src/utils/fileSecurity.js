const path = require('path');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_FILE_TYPES = new Map([
  ['.pdf', new Set(['application/pdf'])],
  ['.txt', new Set(['text/plain'])],
  ['.doc', new Set(['application/msword'])],
  [
    '.docx',
    new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ],
  ['.png', new Set(['image/png'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.ps1',
  '.sh',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.svg',
  '.zip',
  '.rar',
  '.7z',
]);

const sanitizeOriginalFileName = (fileName) => {
  const baseName = path.basename(fileName || 'document');
  return baseName.replace(/[\r\n"<>:\\|?*]/g, '_').trim() || 'document';
};

const getLowerExtension = (fileName) => path.extname(fileName || '').toLowerCase();

const looksLikePdf = (buffer) => buffer.subarray(0, 4).toString('utf8') === '%PDF';
const looksLikePng = (buffer) =>
  buffer.length >= 8 &&
  buffer[0] === 0x89 &&
  buffer[1] === 0x50 &&
  buffer[2] === 0x4e &&
  buffer[3] === 0x47 &&
  buffer[4] === 0x0d &&
  buffer[5] === 0x0a &&
  buffer[6] === 0x1a &&
  buffer[7] === 0x0a;
const looksLikeJpeg = (buffer) =>
  buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
const looksLikeDoc = (buffer) =>
  buffer.length >= 8 &&
  buffer[0] === 0xd0 &&
  buffer[1] === 0xcf &&
  buffer[2] === 0x11 &&
  buffer[3] === 0xe0 &&
  buffer[4] === 0xa1 &&
  buffer[5] === 0xb1 &&
  buffer[6] === 0x1a &&
  buffer[7] === 0xe1;
const looksLikeZipBasedOfficeFile = (buffer) => {
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return false;
  }

  // DOCX is a ZIP container, but a random .zip renamed to .docx should not pass.
  // These internal file names are visible in normal DOCX ZIP metadata.
  const zipText = buffer.toString('latin1');
  return zipText.includes('[Content_Types].xml') && zipText.includes('word/document.xml');
};
const looksLikeTxt = (buffer) => {
  if (!buffer.length) {
    return true;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));

  for (const byte of sample) {
    const isAllowedControl = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    const isPrintable = byte >= 0x20;

    if (!isAllowedControl && !isPrintable) {
      return false;
    }
  }

  // TXT is allowed, but obvious HTML/SVG files renamed to .txt should not pass.
  const text = sample.toString('utf8').trim().toLowerCase();
  const looksLikeExecutableMarkup =
    text.startsWith('<!doctype html') ||
    text.startsWith('<html') ||
    text.startsWith('<svg') ||
    text.includes('<script') ||
    text.includes('javascript:');

  return !looksLikeExecutableMarkup;
};

const hasExpectedMagicBytes = (extension, buffer) => {
  if (extension === '.pdf') return looksLikePdf(buffer);
  if (extension === '.png') return looksLikePng(buffer);
  if (extension === '.jpg' || extension === '.jpeg') return looksLikeJpeg(buffer);
  if (extension === '.doc') return looksLikeDoc(buffer);
  if (extension === '.docx') return looksLikeZipBasedOfficeFile(buffer);
  if (extension === '.txt') return looksLikeTxt(buffer);

  return false;
};

const validateUploadedFile = (file) => {
  if (!file) {
    const error = new Error('Document file is required');
    error.status = 400;
    throw error;
  }

  const safeOriginalName = sanitizeOriginalFileName(file.originalname);
  const extension = getLowerExtension(safeOriginalName);

  if (!extension) {
    const error = new Error('File extension is required');
    error.status = 400;
    throw error;
  }

  if (BLOCKED_EXTENSIONS.has(extension)) {
    const error = new Error('This file type is blocked for security reasons');
    error.status = 400;
    throw error;
  }

  const allowedMimeTypes = ALLOWED_FILE_TYPES.get(extension);

  if (!allowedMimeTypes || !allowedMimeTypes.has(file.mimetype)) {
    const error = new Error('Unsupported file type. Allowed: PDF, TXT, DOC, DOCX, PNG, JPG/JPEG.');
    error.status = 400;
    throw error;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const error = new Error('File is too large. Maximum allowed size is 10 MB.');
    error.status = 413;
    throw error;
  }

  if (!hasExpectedMagicBytes(extension, file.buffer)) {
    const error = new Error('File content does not match the allowed file type.');
    error.status = 400;
    throw error;
  }

  return {
    safeOriginalName,
    extension,
    mimeType: file.mimetype,
    size: file.size,
  };
};

module.exports = {
  MAX_FILE_SIZE_BYTES,
  sanitizeOriginalFileName,
  validateUploadedFile,
};
