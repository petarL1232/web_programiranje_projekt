const express = require('express');
const multer = require('multer');

const { authenticate, optionalAuthenticate } = require('../middleware/auth.middleware');
const { broadcastBlockCreated, broadcastChainChanged } = require('../realtime/blockchain.events');
const Block = require('../models/Block');
const Document = require('../models/Document');
const { calculateBlockHash, calculateFileHash } = require('../utils/blockchain');
const { getChainStatusForBlock, loadValidatedBlockchain } = require('../utils/chainValidation');
const { readDocumentBuffer, saveDocumentBuffer } = require('../utils/documentStorage');
const {
  MAX_FILE_SIZE_BYTES,
  sanitizeOriginalFileName,
  validateUploadedFile,
} = require('../utils/fileSecurity');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

const sameId = (left, right) => Boolean(left && right && left.toString() === right.toString());
const getDocumentOwnerId = (document) => document.owner || document.userId;
const isDocumentOwner = (document, user) =>
  Boolean(user && sameId(getDocumentOwnerId(document), user._id));
const getDocumentHash = (document) => document.documentHash || document.fileHash;
const getBlockDocumentHash = (block) => block.documentHash || block.fileHash;

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

const toDocumentSummary = (document, requestUser = null) => ({
  id: document._id.toString(),
  originalName: document.originalName,
  mimeType: document.mimeType,
  size: document.size,
  documentHash: getDocumentHash(document),
  fileHash: getDocumentHash(document),
  isPublic: Boolean(document.isPublic),
  isOwnedByCurrentUser: isDocumentOwner(document, requestUser),
  canDownload: Boolean(document.isPublic || isDocumentOwner(document, requestUser)),
  storageType: document.storageType,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  block: toBlockSummary(document.blockId),
});

const toUploadReceipt = ({ document, block }) => ({
  message: 'Document uploaded successfully',
  document: {
    id: document._id.toString(),
    originalName: document.originalName,
    size: document.size,
    mimeType: document.mimeType,
    documentHash: getDocumentHash(document),
    isPublic: Boolean(document.isPublic),
  },
  receipt: {
    blockIndex: block.index,
    documentHash: getBlockDocumentHash(block),
    blockHash: block.hash,
    previousHash: block.previousHash,
    timestamp: block.createdAt,
  },
});

const findOwnedDocument = (documentId, userId) =>
  Document.findOne({
    _id: documentId,
    $or: [{ userId }, { owner: userId }],
  });

const findOwnedDocumentWithBlock = (documentId, userId) =>
  findOwnedDocument(documentId, userId).select('+fileData').populate('blockId');

const getExpectedPreviousHash = async (block) => {
  if (block.index === 0) {
    return 'GENESIS';
  }

  const previousBlock = await Block.findOne({ index: block.index - 1 }).select('hash');
  return previousBlock ? previousBlock.hash : null;
};

const createBlockForDocument = async ({ document, documentHash, owner }) => {
  const lastBlock = await Block.findOne().sort({ index: -1 });
  const nextIndex = lastBlock ? lastBlock.index + 1 : 0;
  const previousHash = lastBlock ? lastBlock.hash : 'GENESIS';
  const nonce = 0;
  const createdAt = new Date();
  const blockHash = calculateBlockHash({
    index: nextIndex,
    documentId: document._id,
    owner,
    documentHash,
    previousHash,
    createdAt,
    nonce,
  });

  return Block.create({
    index: nextIndex,
    documentId: document._id,
    owner,
    documentHash,
    fileHash: documentHash,
    previousHash,
    hash: blockHash,
    nonce,
    createdAt,
    updatedAt: createdAt,
  });
};

router.post('/upload', authenticate, upload.single('document'), async (request, response, next) => {
  try {
    const fileInfo = validateUploadedFile(request.file);
    const documentHash = calculateFileHash(request.file.buffer);
    const storedFile = await saveDocumentBuffer({
      buffer: request.file.buffer,
      extension: fileInfo.extension,
    });

    const document = await Document.create({
      userId: request.user._id,
      owner: request.user._id,
      originalName: fileInfo.safeOriginalName,
      storedName: storedFile.storedName,
      mimeType: fileInfo.mimeType,
      size: fileInfo.size,
      documentHash,
      fileHash: documentHash,
      isPublic: false,
      storageType: storedFile.storageType,
    });

    const block = await createBlockForDocument({
      document,
      documentHash,
      owner: request.user._id,
    });

    document.blockId = block._id;
    await document.save();

    broadcastBlockCreated({ blockId: block._id }).catch((error) => {
      console.error('Failed to broadcast blockchain block-created event:', error);
    });

    return response.status(201).json({
      status: 'ok',
      ...toUploadReceipt({ document, block }),
    });
  } catch (error) {
    return next(error);
  }
});

const verifyUploadedHandler = async (request, response, next) => {
  try {
    const fileInfo = validateUploadedFile(request.file);
    const documentHash = calculateFileHash(request.file.buffer);

    const matchingDocuments = await Document.find({
      $or: [{ userId: request.user._id }, { owner: request.user._id }, { isPublic: true }],
      $and: [
        {
          $or: [{ documentHash }, { fileHash: documentHash }],
        },
      ],
    })
      .select('-fileData')
      .populate('blockId')
      .sort({ createdAt: -1 });

    const { summary: chainSummary } = await loadValidatedBlockchain({ includeDocuments: false });
    const matches = matchingDocuments
      .filter((document) => document.blockId)
      .map((document) => {
        const block = document.blockId;
        const chainStatus = getChainStatusForBlock(chainSummary, block.index);
        const isOwnDocument = isDocumentOwner(document, request.user);

        return {
          document: {
            id: document._id.toString(),
            originalName: document.originalName,
            isPublic: Boolean(document.isPublic),
            relation: isOwnDocument ? 'own_document' : 'public_document',
            createdAt: document.createdAt,
          },
          block: {
            id: block._id.toString(),
            index: block.index,
            documentHash: getBlockDocumentHash(block),
            previousHash: block.previousHash,
            hash: block.hash,
            createdAt: block.createdAt,
          },
          isTrusted: !chainStatus.isBlockAffectedByChainBreak && chainSummary.isChainValid,
          chainStatus,
        };
      });

    const isKnown = matches.length > 0;
    const hasTrustedMatch = matches.some((match) => match.isTrusted);

    return response.json({
      status: 'ok',
      message: isKnown
        ? hasTrustedMatch
          ? 'Uploaded file matches an allowed document record in a valid blockchain audit log'
          : 'Uploaded file hash exists, but the blockchain chain is currently broken'
        : 'Uploaded file hash was not found in your allowed blockchain records',
      verification: {
        result: isKnown
          ? hasTrustedMatch
            ? 'known_document'
            : 'known_document_but_chain_invalid'
          : 'unknown_or_modified_document',
        isKnown,
        hasTrustedMatch,
        uploadedFile: {
          originalName: fileInfo.safeOriginalName,
          mimeType: fileInfo.mimeType,
          size: fileInfo.size,
          documentHash,
        },
        chainIntegrity: {
          isChainValid: chainSummary.isChainValid,
          firstBrokenIndex: chainSummary.firstBrokenIndex,
          affectedFromIndex: chainSummary.affectedFromIndex,
          matchingBlockIndexes: matches.map((match) => match.block.index),
          matchingBlocksAffectedByBreak: matches
            .filter((match) => match.chainStatus.isBlockAffectedByChainBreak)
            .map((match) => match.block.index),
        },
        matches,
      },
    });
  } catch (error) {
    return next(error);
  }
};

router.post('/verify-uploaded', authenticate, upload.single('document'), verifyUploadedHandler);

// Backward-compatible route name from the previous development phase.
router.post('/verify-upload', authenticate, upload.single('document'), verifyUploadedHandler);

router.get('/mine', authenticate, async (request, response, next) => {
  try {
    const documents = await Document.find({
      $or: [{ userId: request.user._id }, { owner: request.user._id }],
    })
      .select('-fileData')
      .populate({
        path: 'blockId',
        select: 'index previousHash hash createdAt',
      })
      .sort({ createdAt: -1 });

    return response.json({
      status: 'ok',
      message: 'Your documents loaded',
      documents: documents.map((document) => toDocumentSummary(document, request.user)),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/public', optionalAuthenticate, async (request, response, next) => {
  try {
    const documents = await Document.find({ isPublic: true })
      .select('-fileData')
      .populate({
        path: 'blockId',
        select: 'index previousHash hash createdAt',
      })
      .sort({ createdAt: -1 })
      .limit(100);

    return response.json({
      status: 'ok',
      message: 'Public documents loaded',
      documents: documents.map((document) => toDocumentSummary(document, request.user)),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:documentId/visibility', authenticate, async (request, response, next) => {
  try {
    if (typeof request.body?.isPublic !== 'boolean') {
      return response.status(400).json({
        status: 'error',
        message: 'isPublic boolean value is required',
      });
    }

    const document = await findOwnedDocument(request.params.documentId, request.user._id).populate({
      path: 'blockId',
      select: 'index previousHash hash createdAt',
    });

    if (!document) {
      return response.status(404).json({
        status: 'error',
        message: 'Document not found for current user',
      });
    }

    document.isPublic = request.body.isPublic;
    await document.save();

    broadcastChainChanged('Document visibility changed').catch((error) => {
      console.error('Failed to broadcast blockchain chain-updated event:', error);
    });

    return response.json({
      status: 'ok',
      message: document.isPublic ? 'Document is now public' : 'Document is now private',
      document: toDocumentSummary(document, request.user),
    });
  } catch (error) {
    return next(error);
  }
});

const verifyStoredHandler = async (request, response, next) => {
  try {
    const document = await findOwnedDocumentWithBlock(request.params.documentId, request.user._id);

    if (!document) {
      return response.status(404).json({
        status: 'error',
        message: 'Document not found for current user',
      });
    }

    if (!isDocumentOwner(document, request.user)) {
      return response.status(403).json({
        status: 'error',
        message: 'You can verify only your own documents',
      });
    }

    if (!document.blockId) {
      return response.status(409).json({
        status: 'error',
        message: 'Document does not have a blockchain block',
      });
    }

    const fileBuffer = await readDocumentBuffer(document);
    const currentDocumentHash = calculateFileHash(fileBuffer);
    const block = document.blockId;
    const blockchainDocumentHash = getBlockDocumentHash(block);
    const calculatedBlockHash = calculateBlockHash({
      index: block.index,
      documentId: document._id,
      owner: block.owner || null,
      documentHash: blockchainDocumentHash,
      previousHash: block.previousHash,
      createdAt: block.createdAt,
      nonce: block.nonce,
    });
    const expectedPreviousHash = await getExpectedPreviousHash(block);
    const { summary: chainSummary } = await loadValidatedBlockchain({ includeDocuments: false });

    const documentIntegrity = {
      isValid:
        currentDocumentHash === getDocumentHash(document) &&
        currentDocumentHash === blockchainDocumentHash,
      currentDocumentHash,
      storedDocumentHash: getDocumentHash(document),
      blockchainDocumentHash,
      explanation:
        'This recalculates the SHA-256 hash of the stored file and compares it with Document and Block hashes.',
    };
    const blockchainIntegrity = {
      isValid: calculatedBlockHash === block.hash && block.previousHash === expectedPreviousHash,
      blockHashIsValid: calculatedBlockHash === block.hash,
      previousHashIsValid: block.previousHash === expectedPreviousHash,
      calculatedBlockHash,
      storedBlockHash: block.hash,
      expectedPreviousHash,
      actualPreviousHash: block.previousHash,
      explanation:
        'This recalculates only the blockchain block hash and verifies the direct previousHash link.',
    };
    const chainIntegrity = getChainStatusForBlock(chainSummary, block.index);
    const isAuthentic =
      documentIntegrity.isValid && blockchainIntegrity.isValid && chainIntegrity.isChainValid;

    return response.json({
      status: 'ok',
      message: isAuthentic
        ? 'Stored document is authentic and the blockchain chain is valid'
        : 'Stored document hash, block validation, or full blockchain validation failed',
      verification: {
        valid: isAuthentic,
        result: isAuthentic ? 'authentic' : 'modified_or_chain_invalid',
        isAuthentic,
        documentIntegrity,
        blockchainIntegrity,
        chainIntegrity,
      },
      document: {
        id: document._id.toString(),
        originalName: document.originalName,
        documentHash: getDocumentHash(document),
        isPublic: Boolean(document.isPublic),
        createdAt: document.createdAt,
      },
      block: {
        id: block._id.toString(),
        index: block.index,
        documentHash: blockchainDocumentHash,
        previousHash: block.previousHash,
        hash: block.hash,
        createdAt: block.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

router.post('/:documentId/verify', authenticate, verifyStoredHandler);

// Backward-compatible route name from the previous development phase.
router.get('/:documentId/verify-stored', authenticate, verifyStoredHandler);

router.get('/:documentId/download', optionalAuthenticate, async (request, response, next) => {
  try {
    const document = await Document.findById(request.params.documentId)
      .select('+fileData')
      .populate('blockId');

    if (!document) {
      return response.status(404).json({
        status: 'error',
        message: 'Document not found',
      });
    }

    const isOwner = isDocumentOwner(document, request.user);

    if (!document.isPublic && !request.user) {
      return response.status(401).json({
        status: 'error',
        message: 'Login is required to download private documents',
      });
    }

    if (!document.isPublic && !isOwner) {
      return response.status(403).json({
        status: 'error',
        message: 'You can download only your own private documents',
      });
    }

    const fileBuffer = await readDocumentBuffer(document);
    const safeFileName = sanitizeOriginalFileName(document.originalName);

    response.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Document-Hash', getDocumentHash(document));
    response.setHeader('Cache-Control', 'private, no-store');

    return response.send(fileBuffer);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
