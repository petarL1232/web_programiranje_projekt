const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const { getDocumentStorageMode } = require('../config/runtime');

const STORAGE_ROOT = path.resolve(__dirname, '../../storage/documents');

const ensureStorageRoot = async () => {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
};

const createStoredName = (extension) => `${crypto.randomUUID()}${extension}`;

const getSafeStoredPath = (storedName) => {
  const fileNameOnly = path.basename(storedName);
  const absolutePath = path.resolve(STORAGE_ROOT, fileNameOnly);

  if (!absolutePath.startsWith(`${STORAGE_ROOT}${path.sep}`)) {
    const error = new Error('Invalid stored file path');
    error.status = 400;
    throw error;
  }

  return absolutePath;
};

const saveDocumentBuffer = async ({ buffer, extension }) => {
  const storageType = getDocumentStorageMode();
  const storedName = createStoredName(extension);

  if (storageType === 'mongodb') {
    return {
      storedName,
      storageType,
      fileData: Buffer.from(buffer),
    };
  }

  await ensureStorageRoot();
  const absolutePath = getSafeStoredPath(storedName);
  await fs.writeFile(absolutePath, buffer, { flag: 'wx' });

  return {
    storedName,
    storageType,
    fileData: undefined,
  };
};

const readDocumentBuffer = async (document) => {
  if (document.storageType === 'mongodb') {
    if (!document.fileData) {
      const error = new Error('Document file data is missing');
      error.status = 404;
      throw error;
    }

    return document.fileData;
  }

  if (document.storageType !== 'filesystem') {
    const error = new Error('Unsupported document storage type');
    error.status = 500;
    throw error;
  }

  const absolutePath = getSafeStoredPath(document.storedName);

  try {
    return await fs.readFile(absolutePath);
  } catch (_error) {
    const error = new Error('Stored document file is missing');
    error.status = 404;
    throw error;
  }
};

const deleteStoredDocumentFile = async (document) => {
  if (document.storageType !== 'filesystem' || !document.storedName) {
    return;
  }

  try {
    await fs.unlink(getSafeStoredPath(document.storedName));
  } catch (_error) {
    // Logical deletion remains valid when a development file was already deleted.
  }
};

const clearDocumentStorage = async () => {
  await ensureStorageRoot();
  const entries = await fs.readdir(STORAGE_ROOT);

  await Promise.all(
    entries.map(async (entry) => {
      await fs.rm(path.join(STORAGE_ROOT, entry), { force: true, recursive: false });
    })
  );
};

module.exports = {
  clearDocumentStorage,
  deleteStoredDocumentFile,
  readDocumentBuffer,
  saveDocumentBuffer,
};
