const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const http = require('http');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth.routes');
const blockchainRoutes = require('./routes/blockchain.routes');
const devRoutes = require('./routes/dev.routes');
const documentRoutes = require('./routes/document.routes');
const modelStatusRoutes = require('./routes/modelStatus.routes');
const { setSocketServer } = require('./realtime/blockchain.events');

// Load .env before reading process.env values.
dotenv.config();

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:4200';
const mongoUri = process.env.MONGO_URI;

const io = new Server(server, {
  cors: {
    origin: clientUrl,
    methods: ['GET', 'POST', 'PATCH'],
  },
});

setSocketServer(io);

io.on('connection', (socket) => {
  socket.emit('blockchain:connected', {
    status: 'ok',
    message: 'Connected to DocumentChain realtime blockchain explorer',
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  });
});

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(
  cors({
    origin: clientUrl,
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: '1mb' }));

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many login/register attempts. Please wait a few minutes and try again.',
  },
});

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

app.use('/api/auth/login', authRateLimit);
app.use('/api/auth/register', authRateLimit);
app.use('/api/auth', authRoutes);
app.use('/api/models', modelStatusRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/dev', devRoutes);

app.use((request, response) => {
  response.status(404).json({
    status: 'error',
    message: `Route ${request.method} ${request.originalUrl} not found`,
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);

  if (error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({
      status: 'error',
      message: 'File is too large. Maximum allowed size is 10 MB.',
    });
  }

  const status = error.status || 500;
  const message =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message || 'Internal server error';

  return response.status(status).json({
    status: 'error',
    message,
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

    server.listen(port, () => {
      console.log(`DocumentChain backend is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
