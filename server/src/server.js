const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const mongoose = require('mongoose');

const modelStatusRoutes = require('./routes/modelStatus.routes');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:4200';
const mongoUri = process.env.MONGO_URI;

app.use(
  cors({
    origin: clientUrl,
  })
);
app.use(express.json());

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

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    message: 'DocumentChain backend is running',
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/models', modelStatusRoutes);

app.use((request, response) => {
  response.status(404).json({
    status: 'error',
    message: `Route ${request.method} ${request.originalUrl} not found`,
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);

  response.status(error.status || 500).json({
    status: 'error',
    message: error.message || 'Internal server error',
  });
});

const connectToDatabase = async () => {
  if (!mongoUri) {
    console.warn('MONGO_URI is not set. Server will start without a database connection.');
    return;
  }

  await mongoose.connect(mongoUri);
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
};

const startServer = async () => {
  try {
    await connectToDatabase();

    app.listen(port, () => {
      console.log(`DocumentChain backend is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
