const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const helmet = require('helmet');
const http = require('http');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth.routes');
const blockchainRoutes = require('./routes/blockchain.routes');
const devRoutes = require('./routes/dev.routes');
const documentRoutes = require('./routes/document.routes');
const modelStatusRoutes = require('./routes/modelStatus.routes');
const projectRoutes = require('./routes/project.routes');
const { setSocketServer } = require('./realtime/blockchain.events');
const {
  assertProductionConfiguration,
  getAllowedOrigins,
  getDocumentStorageMode,
  isProduction,
} = require('./config/runtime');

// Load local variables before reading process.env values.
dotenv.config();
assertProductionConfiguration();

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT) || 5000;
const mongoUri = process.env.MONGO_URI;
const allowedOrigins = getAllowedOrigins();

const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(origin.replace(/\/+$/, ''));
const corsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    return callback(null, true);
  }

  const error = new Error('Origin is not allowed by DocumentChain CORS policy');
  error.status = 403;
  return callback(error);
};

const corsOptions = {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

const io = new Server(server, {
  cors: corsOptions,
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

// Render and other hosting platforms run the app behind one trusted proxy.
app.set('trust proxy', 1);
app.use(
  helmet({
    // Files are downloaded through the API from a separately hosted Angular client.
    crossOriginResourcePolicy: false,
  })
);
app.use(cors(corsOptions));
app.use(
  '/api',
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
    storage: getDocumentStorageMode(),
    environment: isProduction() ? 'production' : 'development',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth/login', authRateLimit);
app.use('/api/auth/register', authRateLimit);
app.use('/api/auth', authRoutes);
app.use('/api/models', modelStatusRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/project', projectRoutes);

if (!isProduction()) {
  app.use('/api/dev', devRoutes);
}

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
    status >= 500 && isProduction()
      ? 'Internal server error'
      : error.message || 'Internal server error';

  return response.status(status).json({
    status: 'error',
    message,
  });
});

const connectToDatabase = async () => {
  if (!mongoUri) {
    throw new Error('MONGO_URI is required to start DocumentChain');
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: !isProduction(),
  });
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
};

const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down DocumentChain gracefully.`);

  server.close(async () => {
    try {
      await mongoose.connection.close();
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(1), 15000).unref();
};

const startServer = async () => {
  try {
    await connectToDatabase();

    server.listen(port, '0.0.0.0', () => {
      console.log(`DocumentChain backend is running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

startServer();
