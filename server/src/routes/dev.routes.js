const express = require('express');

const Block = require('../models/Block');
const Document = require('../models/Document');
const { clearDocumentStorage } = require('../utils/documentStorage');

const router = express.Router();

const requireDevelopment = (request, response, next) => {
  if (process.env.NODE_ENV !== 'development') {
    return response.status(404).json({
      status: 'error',
      message: 'Development route is available only when NODE_ENV=development',
    });
  }

  return next();
};

router.post('/reset-documents-blocks', requireDevelopment, async (_request, response, next) => {
  try {
    const deletedDocuments = await Document.deleteMany({});
    const deletedBlocks = await Block.deleteMany({});
    await clearDocumentStorage();

    return response.json({
      status: 'ok',
      message: 'Development test data reset completed. Users were kept.',
      deleted: {
        documents: deletedDocuments.deletedCount,
        blocks: deletedBlocks.deletedCount,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
