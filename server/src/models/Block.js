const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema(
  {
    index: {
      type: Number,
      required: true,
      unique: true,
      min: 0,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    documentHash: {
      type: String,
      required: true,
      index: true,
    },
    fileHash: {
      type: String,
      required: true,
      index: true,
    },
    previousHash: {
      type: String,
      required: true,
    },
    hash: {
      type: String,
      required: true,
      unique: true,
    },
    nonce: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Block', blockSchema);
