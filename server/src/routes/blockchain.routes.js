const express = require('express');

const Block = require('../models/Block');
const { calculateBlockHash } = require('../utils/blockchain');

const router = express.Router();

const getDocumentForExplorer = (document) => {
  if (!document) {
    return null;
  }

  return {
    id: document._id.toString(),
    originalName: document.isPublic ? document.originalName : 'Private document',
    isPublic: Boolean(document.isPublic),
  };
};

const getDocumentIdForHash = (documentId) => {
  if (documentId && documentId._id) {
    return documentId._id;
  }

  return documentId;
};

const toExplorerBlock = (block, expectedPreviousHash) => {
  const calculatedHash = calculateBlockHash({
    index: block.index,
    documentId: getDocumentIdForHash(block.documentId),
    fileHash: block.fileHash,
    previousHash: block.previousHash,
    createdAt: block.createdAt,
    nonce: block.nonce,
  });

  const isHashValid = calculatedHash === block.hash;
  const isPreviousHashValid = block.previousHash === expectedPreviousHash;

  return {
    id: block._id.toString(),
    index: block.index,
    document: getDocumentForExplorer(block.documentId),
    documentId: getDocumentIdForHash(block.documentId).toString(),
    fileHash: block.fileHash,
    previousHash: block.previousHash,
    hash: block.hash,
    calculatedHash,
    nonce: block.nonce,
    createdAt: block.createdAt,
    validation: {
      isHashValid,
      isPreviousHashValid,
      isBlockValid: isHashValid && isPreviousHashValid,
    },
  };
};

router.get('/', async (_request, response, next) => {
  try {
    const blocks = await Block.find().sort({ index: 1 }).populate({
      path: 'documentId',
      select: 'originalName isPublic',
    });

    let previousHash = 'GENESIS';
    const explorerBlocks = blocks.map((block) => {
      const explorerBlock = toExplorerBlock(block, previousHash);
      previousHash = block.hash;
      return explorerBlock;
    });

    const isChainValid = explorerBlocks.every((block) => block.validation.isBlockValid);
    const lastBlock = explorerBlocks.at(-1) || null;

    return response.json({
      status: 'ok',
      message: 'Blockchain explorer loaded',
      summary: {
        totalBlocks: explorerBlocks.length,
        isChainValid,
        lastBlockHash: lastBlock ? lastBlock.hash : null,
      },
      blocks: explorerBlocks,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
