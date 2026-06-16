const express = require('express');
const multer = require('multer');

const { authenticate } = require('../middleware/auth.middleware');
const Block = require('../models/Block');
const Document = require('../models/Document');
const { calculateBlockHash, calculateFileHash } = require('../utils/blockchain');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const sanitizeFileName = (fileName) => fileName.replace(/[^a-zA-Z0-9._ -]/g, '_');

const toUploadReceipt = ({ document, block }) => ({
  document: {
    id: document._id.toString(),
    originalName: document.originalName,
    storedName: document.storedName,
    mimeType: document.mimeType,
    size: document.size,
    fileHash: document.fileHash,
    storageType: document.storageType,
    createdAt: document.createdAt,
  },
  block: {
    id: block._id.toString(),
    index: block.index,
    documentId: block.documentId.toString(),
    fileHash: block.fileHash,
    previousHash: block.previousHash,
    hash: block.hash,
    nonce: block.nonce,
    createdAt: block.createdAt,
  },
});

router.post('/upload', authenticate, upload.single('document'), async (request, response, next) => {
  try {
    if (!request.file) {
      return response.status(400).json({
        status: 'error',
        message: 'Document file is required',
      });
    }

    const fileHash = calculateFileHash(request.file.buffer);
    const lastBlock = await Block.findOne().sort({ index: -1 });
    const nextIndex = lastBlock ? lastBlock.index + 1 : 0;
    const previousHash = lastBlock ? lastBlock.hash : 'GENESIS';
    const storedName = `${Date.now()}-${sanitizeFileName(request.file.originalname)}`;

    const document = await Document.create({
      userId: request.user._id,
      originalName: request.file.originalname,
      storedName,
      mimeType: request.file.mimetype,
      size: request.file.size,
      fileHash,
      storageType: 'mongodb',
      fileData: request.file.buffer,
    });

    const nonce = 0;
    const createdAt = new Date();
    const blockHash = calculateBlockHash({
      index: nextIndex,
      documentId: document._id,
      fileHash,
      previousHash,
      createdAt,
      nonce,
    });

    const block = await Block.create({
      index: nextIndex,
      documentId: document._id,
      fileHash,
      previousHash,
      hash: blockHash,
      nonce,
      createdAt,
      updatedAt: createdAt,
    });

    document.blockId = block._id;
    await document.save();

    return response.status(201).json({
      status: 'ok',
      message: 'Document uploaded and blockchain block created',
      receipt: toUploadReceipt({ document, block }),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
