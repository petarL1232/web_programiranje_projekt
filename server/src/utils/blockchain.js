const crypto = require('crypto');

const calculateFileHash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const normalizeHash = (blockData) => blockData.documentHash || blockData.fileHash;

const buildBlockHashInput = ({ index, documentId, owner, documentHash, fileHash, previousHash, createdAt, nonce }) => {
  const baseFields = [
    index,
    documentId.toString(),
    normalizeHash({ documentHash, fileHash }),
    previousHash,
    new Date(createdAt).toISOString(),
    nonce,
  ];

  // Older blocks did not include owner in the hash input. Keep that format when owner is absent
  // so existing development data does not become invalid just because the model became stricter.
  if (!owner) {
    return baseFields.join('|');
  }

  return [index, documentId.toString(), owner.toString(), normalizeHash({ documentHash, fileHash }), previousHash, new Date(createdAt).toISOString(), nonce].join('|');
};

const calculateBlockHash = (blockData) =>
  crypto.createHash('sha256').update(buildBlockHashInput(blockData)).digest('hex');

module.exports = {
  calculateBlockHash,
  calculateFileHash,
};
