const Block = require('../models/Block');
const { calculateBlockHash } = require('./blockchain');

const sameId = (left, right) => left && right && left.toString() === right.toString();

const getDocumentForExplorer = (document, requestUser = null) => {
  if (!document) {
    return null;
  }

  const ownerId = document.owner || document.userId;
  const isOwner = requestUser && sameId(ownerId, requestUser._id);
  const isPublic = Boolean(document.isPublic);

  return {
    id: document._id.toString(),
    originalName: isOwner || isPublic ? document.originalName : 'Private document',
    isPublic,
    isOwnedByCurrentUser: Boolean(isOwner),
  };
};

const getDocumentIdForHash = (documentId) => {
  if (documentId && documentId._id) {
    return documentId._id;
  }

  return documentId;
};

const getOwnerIdForHash = (block) => {
  if (block.owner) {
    return block.owner._id || block.owner;
  }

  return null;
};

const getDocumentHashForBlock = (block) => block.documentHash || block.fileHash;

const getValidationProblems = ({ isHashValid, isPreviousHashValid, isIndexSequential }) => {
  const problems = [];

  if (!isHashValid) {
    problems.push('stored block hash does not match recalculated block hash');
  }

  if (!isPreviousHashValid) {
    problems.push('previousHash does not point to the previous block hash');
  }

  if (!isIndexSequential) {
    problems.push('block index is not sequential');
  }

  return problems;
};

const toValidatedBlock = ({ block, expectedPreviousHash, expectedIndex, firstBrokenIndex, requestUser }) => {
  const documentId = getDocumentIdForHash(block.documentId);
  const owner = getOwnerIdForHash(block);
  const documentHash = getDocumentHashForBlock(block);
  const calculatedHash = calculateBlockHash({
    index: block.index,
    documentId,
    owner,
    documentHash,
    previousHash: block.previousHash,
    createdAt: block.createdAt,
    nonce: block.nonce,
  });

  const isHashValid = calculatedHash === block.hash;
  const isPreviousHashValid = block.previousHash === expectedPreviousHash;
  const isIndexSequential = block.index === expectedIndex;
  const isDirectlyValid = isHashValid && isPreviousHashValid && isIndexSequential;
  const breaksChainHere = !isDirectlyValid && firstBrokenIndex === null;
  const effectiveFirstBrokenIndex = breaksChainHere ? block.index : firstBrokenIndex;
  const isAffectedByEarlierBreak =
    effectiveFirstBrokenIndex !== null && block.index >= effectiveFirstBrokenIndex;

  return {
    id: block._id.toString(),
    index: block.index,
    document: getDocumentForExplorer(block.documentId, requestUser),
    documentId: documentId.toString(),
    owner: owner ? owner.toString() : null,
    documentHash,
    fileHash: documentHash,
    previousHash: block.previousHash,
    expectedPreviousHash,
    hash: block.hash,
    calculatedHash,
    nonce: block.nonce,
    createdAt: block.createdAt,
    validation: {
      isHashValid,
      isPreviousHashValid,
      isIndexSequential,
      isDirectlyValid,
      isBlockValid: isDirectlyValid,
      isTrusted: isDirectlyValid && !isAffectedByEarlierBreak,
      breaksChainHere,
      isAffectedByEarlierBreak,
      problems: getValidationProblems({
        isHashValid,
        isPreviousHashValid,
        isIndexSequential,
      }),
    },
  };
};

const loadValidatedBlockchain = async ({ includeDocuments = true, requestUser = null } = {}) => {
  let query = Block.find().sort({ index: 1 });

  if (includeDocuments) {
    query = query.populate({
      path: 'documentId',
      select: 'originalName isPublic userId owner',
    });
  }

  const blocks = await query;
  let expectedPreviousHash = 'GENESIS';
  let expectedIndex = 0;
  let firstBrokenIndex = null;

  const validatedBlocks = blocks.map((block) => {
    const validatedBlock = toValidatedBlock({
      block,
      expectedPreviousHash,
      expectedIndex,
      firstBrokenIndex,
      requestUser,
    });

    if (!validatedBlock.validation.isDirectlyValid && firstBrokenIndex === null) {
      firstBrokenIndex = block.index;
      validatedBlock.validation.breaksChainHere = true;
      validatedBlock.validation.isAffectedByEarlierBreak = true;
      validatedBlock.validation.isTrusted = false;
    }

    if (firstBrokenIndex !== null && block.index >= firstBrokenIndex) {
      validatedBlock.validation.isAffectedByEarlierBreak = true;
      validatedBlock.validation.isTrusted = false;
    }

    expectedPreviousHash = block.hash;
    expectedIndex += 1;

    return validatedBlock;
  });

  const directBrokenBlocks = validatedBlocks.filter((block) => !block.validation.isDirectlyValid);
  const affectedBlocks =
    firstBrokenIndex === null
      ? []
      : validatedBlocks.filter((block) => block.index >= firstBrokenIndex);
  const isChainValid = firstBrokenIndex === null;
  const lastBlock = validatedBlocks.at(-1) || null;

  return {
    summary: {
      totalBlocks: validatedBlocks.length,
      isChainValid,
      firstBrokenIndex,
      brokenAtIndex: firstBrokenIndex,
      affectedFromIndex: firstBrokenIndex,
      directBrokenBlockIndexes: directBrokenBlocks.map((block) => block.index),
      affectedBlockIndexes: affectedBlocks.map((block) => block.index),
      lastBlockHash: lastBlock ? lastBlock.hash : null,
      message: isChainValid
        ? 'Blockchain chain is valid.'
        : `Blockchain chain is broken from block #${firstBrokenIndex}. Blocks from that point onward are not fully trustworthy, even if some later blocks are directly valid.`,
    },
    blocks: validatedBlocks,
  };
};

const getChainStatusForBlock = (summary, blockIndex) => ({
  isChainValid: summary.isChainValid,
  firstBrokenIndex: summary.firstBrokenIndex,
  brokenAtIndex: summary.brokenAtIndex,
  affectedFromIndex: summary.affectedFromIndex,
  directBrokenBlockIndexes: summary.directBrokenBlockIndexes,
  affectedBlockIndexes: summary.affectedBlockIndexes,
  isBlockAffectedByChainBreak:
    !summary.isChainValid && summary.affectedFromIndex !== null && blockIndex >= summary.affectedFromIndex,
  explanation:
    'This checks only blockchain block records, not document files. If an earlier block is changed, every later record becomes less trustworthy because the chain has already broken.',
});

module.exports = {
  getChainStatusForBlock,
  loadValidatedBlockchain,
};
