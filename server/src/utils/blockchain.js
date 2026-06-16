const crypto = require('crypto');

const calculateFileHash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const buildBlockHashInput = ({ index, documentId, fileHash, previousHash, createdAt, nonce }) =>
  [
    index,
    documentId.toString(),
    fileHash,
    previousHash,
    new Date(createdAt).toISOString(),
    nonce,
  ].join('|');

const calculateBlockHash = (blockData) =>
  crypto.createHash('sha256').update(buildBlockHashInput(blockData)).digest('hex');

module.exports = {
  calculateBlockHash,
  calculateFileHash,
};
