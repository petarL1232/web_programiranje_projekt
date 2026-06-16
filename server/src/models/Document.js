const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    storedName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    fileHash: {
      type: String,
      required: true,
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
    },
    storageType: {
      type: String,
      enum: ['mongodb', 'filesystem'],
      default: 'mongodb',
    },
    fileData: {
      type: Buffer,
      select: false,
    },
    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Block',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Document', documentSchema);
