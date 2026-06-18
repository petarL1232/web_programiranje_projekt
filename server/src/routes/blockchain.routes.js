const express = require('express');

const { authenticate } = require('../middleware/auth.middleware');
const { loadValidatedBlockchain } = require('../utils/chainValidation');

const router = express.Router();

router.get('/', authenticate, async (request, response, next) => {
  try {
    const { summary, blocks } = await loadValidatedBlockchain({
      includeDocuments: true,
      requestUser: request.user,
    });

    return response.json({
      status: 'ok',
      message: summary.isChainValid
        ? 'Blockchain explorer loaded and chain is valid'
        : `Blockchain explorer loaded. Chain is broken from block #${summary.firstBrokenIndex}`,
      summary,
      blocks,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/validate', authenticate, async (_request, response, next) => {
  try {
    const { summary } = await loadValidatedBlockchain({ includeDocuments: false });

    return response.json({
      status: 'ok',
      message: summary.isChainValid
        ? 'Blockchain chain is valid'
        : `Blockchain chain is broken from block #${summary.firstBrokenIndex}`,
      validation: {
        isChainValid: summary.isChainValid,
        totalBlocks: summary.totalBlocks,
        firstBrokenIndex: summary.firstBrokenIndex,
        brokenAtIndex: summary.brokenAtIndex,
        affectedFromIndex: summary.affectedFromIndex,
        directBrokenBlockIndexes: summary.directBrokenBlockIndexes,
        affectedBlockIndexes: summary.affectedBlockIndexes,
        lastBlockHash: summary.lastBlockHash,
        explanation:
          'This validates only blockchain block records. It does not read, send, download, or hash stored document files.',
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
