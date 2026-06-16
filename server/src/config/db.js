const mongoose = require('mongoose');

const connectionStates = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

mongoose.set('strictQuery', true);

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing. Add it to server/.env.');
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    autoIndex: process.env.NODE_ENV !== 'production',
  });

  console.log('MongoDB connection established');
};

const getDbStatus = () => {
  const readyState = mongoose.connection.readyState;

  return {
    readyState,
    status: connectionStates[readyState] || 'unknown',
    databaseName: mongoose.connection.name || null,
  };
};

const closeDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error.message);
});

module.exports = {
  connectDB,
  getDbStatus,
  closeDB,
};
