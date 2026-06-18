const express = require('express');
const mongoose = require('mongoose');

const Block = require('../models/Block');
const Document = require('../models/Document');
const User = require('../models/User');

const router = express.Router();

const getDatabaseStatus = () => {
  const statusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return {
    status: statusMap[mongoose.connection.readyState] || 'unknown',
    name: mongoose.connection.name || null,
  };
};

router.get('/status', (_request, response) => {
  response.json({
    status: 'ok',
    message: 'MongoDB models are loaded',
    database: getDatabaseStatus(),
    models: {
      User: {
        collection: User.collection.name,
        fields: ['email', 'passwordHash', 'role', 'createdAt', 'updatedAt'],
      },
      Document: {
        collection: Document.collection.name,
        fields: [
          'userId',
          'owner',
          'originalName',
          'storedName',
          'mimeType',
          'size',
          'documentHash',
          'fileHash',
          'isPublic',
          'storageType',
          'fileData',
          'blockId',
          'createdAt',
          'updatedAt',
        ],
      },
      Block: {
        collection: Block.collection.name,
        fields: [
          'index',
          'documentId',
          'owner',
          'documentHash',
          'fileHash',
          'previousHash',
          'hash',
          'nonce',
          'createdAt',
          'updatedAt',
        ],
      },
    },
  });
});

module.exports = router;
