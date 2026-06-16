const express = require('express');
const multer = require('multer');
const { authenticate, optionalAuthenticate } = require('../middleware/auth.middleware');
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
const toBoolean = (value) => value === true || value === 'true' || value === 'on';

const toBlockSummary = (block) => {
  if (!block) {
    return null;
  }

  return {
    id: block._id.toString(),
    index: block.index,
    previousHash: block.previousHash,
    hash: block.hash,
    createdAt: block.createdAt,
  };
};

const toDocumentSummary = (document) => ({
  id: document._id.toString(),
  originalName: document.originalName,
  mimeType: document.mimeType,
  size: document.size,
  fileHash: document.fileHash,
  isPublic: Boolean(document.isPublic),
  storageType: document.storageType,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  block: toBlockSummary(document.blockId),
});

const toUploadReceipt = ({ document, block }) => ({
  document: {
    id: document._id.toString(),
    originalName: document.originalName,
    storedName: document.storedName,
    mimeType: document.mimeType,
    size: document.size,
    fileHash: document.fileHash,
    isPublic: Boolean(document.isPublic),
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

const findDocumentWithBlock = (filter) =>
  Document.find(filter).select('-fileData').populate({
    path: 'blockId',
    select: 'index previousHash hash createdAt',
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
    const isPublic = toBoolean(request.body.isPublic);

    const document = await Document.create({
      userId: request.user._id,
      originalName: request.file.originalname,
      storedName,
      mimeType: request.file.mimetype,
      size: request.file.size,
      fileHash,
      isPublic,
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

router.get('/mine', authenticate, async (request, response, next) => {
  try {
    const documents = await findDocumentWithBlock({ userId: request.user._id }).sort({
      createdAt: -1,
    });

    return response.json({
      status: 'ok',
      message: 'Your documents loaded',
      documents: documents.map(toDocumentSummary),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/public', async (_request, response, next) => {
  try {
    const documents = await findDocumentWithBlock({ isPublic: true }).sort({ createdAt: -1 });

    return response.json({
      status: 'ok',
      message: 'Public documents loaded',
      documents: documents.map(toDocumentSummary),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:documentId/visibility', authenticate, async (request, response, next) => {
  try {
    const { isPublic } = request.body;

    if (typeof isPublic !== 'boolean') {
      return response.status(400).json({
        status: 'error',
        message: 'isPublic boolean value is required',
      });
    }

    const document = await Document.findOne({
      _id: request.params.documentId,
      userId: request.user._id,
    }).populate({
      path: 'blockId',
      select: 'index previousHash hash createdAt',
    });

    if (!document) {
      return response.status(404).json({
        status: 'error',
        message: 'Document not found for current user',
      });
    }

    document.isPublic = isPublic;
    await document.save();

    return response.json({
      status: 'ok',
      message: `Document is now ${document.isPublic ? 'public' : 'private'}`,
      document: toDocumentSummary(document),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:documentId/download', optionalAuthenticate, async (request, response, next) => {
  try {
    const document = await Document.findById(request.params.documentId).select('+fileData');

    if (!document) {
      return response.status(404).json({
        status: 'error',
        message: 'Document not found',
      });
    }

    const isOwner = request.user && document.userId.toString() === request.user._id.toString();

    if (!document.isPublic && !request.user) {
      return response.status(401).json({
        status: 'error',
        message: 'Login is required to download this private document',
      });
    }

    if (!document.isPublic && !isOwner) {
      return response.status(403).json({
        status: 'error',
        message: 'You can download only your private documents',
      });
    }

    if (!document.fileData) {
      return response.status(404).json({
        status: 'error',
        message: 'Document file data is missing',
      });
    }

    const safeFileName = document.originalName.replace(/["\r\n]/g, '_');

    response.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    response.setHeader('X-Document-Hash', document.fileHash);
    response.setHeader('X-Document-Visibility', document.isPublic ? 'public' : 'private');

    return response.send(document.fileData);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
