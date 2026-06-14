require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:4200';

const allowedOrigins = [
  CLIENT_URL,
  'http://localhost:4200',
  'http://127.0.0.1:4200'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests without origin, for example curl/Postman.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is running',
    app: 'DocumentChain API',
    phase: 'Phase 2 - health check',
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found'
  });
});

app.use((err, req, res, next) => {
  console.error(err.message);

  res.status(500).json({
    message: 'Server error',
    error: err.message
  });
});

app.listen(PORT, () => {
  console.log(`DocumentChain API running on http://localhost:${PORT}`);
});
