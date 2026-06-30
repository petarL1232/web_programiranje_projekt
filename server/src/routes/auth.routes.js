const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');

const { authenticate } = require('../middleware/auth.middleware');
const User = require('../models/User');

const router = express.Router();

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }

  return secret;
};

const getJwtExpiresIn = () => process.env.JWT_EXPIRES_IN || '1d';

const createToken = (user) =>
  jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: getJwtExpiresIn() }
  );

const toUserResponse = (user) => ({
  id: user._id.toString(),
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const validateAuthInput = (email, password) => {
  if (!email || !password) {
    return 'Email and password are required';
  }

  if (typeof email !== 'string' || typeof password !== 'string') {
    return 'Email and password must be strings';
  }

  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    return 'Invalid email format';
  }

  if (password.length < 8) {
    return 'Password must contain at least 8 characters';
  }

  return null;
};

router.post('/register', async (request, response, next) => {
  try {
    const { email, password } = request.body;
    const validationError = validateAuthInput(email, password);

    if (validationError) {
      return response.status(400).json({
        status: 'error',
        message: validationError,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return response.status(409).json({
        status: 'error',
        message: 'User with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
    });

    const token = createToken(user);

    return response.status(201).json({
      status: 'ok',
      message: 'Registration successful',
      token,
      user: toUserResponse(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (request, response, next) => {
  try {
    const { email, password } = request.body;

    if (!email || !password) {
      return response.status(400).json({
        status: 'error',
        message: 'Email and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      return response.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return response.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
    }

    const token = createToken(user);

    return response.json({
      status: 'ok',
      message: 'Login successful',
      token,
      user: toUserResponse(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authenticate, (request, response) =>
  response.json({
    status: 'ok',
    user: toUserResponse(request.user),
  })
);

module.exports = router;
