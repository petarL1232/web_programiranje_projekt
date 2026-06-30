const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    owner: {
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
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
    },
    storageType: {
      type: String,
      enum: ['mongodb', 'filesystem'],
      default: 'filesystem',
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
    // The file can be removed by its owner while the immutable audit record stays in the chain.
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

documentSchema.pre('validate', function syncCompatibilityFields(next) {
  if (!this.owner && this.userId) {
    this.owner = this.userId;
  }

  if (!this.userId && this.owner) {
    this.userId = this.owner;
  }

  if (!this.documentHash && this.fileHash) {
    this.documentHash = this.fileHash;
  }

  if (!this.fileHash && this.documentHash) {
    this.fileHash = this.documentHash;
  }

  next();
});

module.exports = mongoose.model('Document', documentSchema);
