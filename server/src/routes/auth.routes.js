const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');

const { authenticate } = require('../middleware/auth.middleware');
const User = require('../models/User');
const Document = require('../models/Document');
const { deleteStoredDocumentFile } = require('../utils/documentStorage');
const { broadcastChainChanged } = require('../realtime/blockchain.events');

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

const validateEmail = (email) => {
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
    return 'Invalid email format';
  }

  return null;
};

const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must contain at least 8 characters';
  }

  return null;
};

const validateAuthInput = (email, password) => {
  if (!email || !password) {
    return 'Email and password are required';
  }

  return validateEmail(email) || validatePassword(password);
};

const verifyCurrentPassword = async (userId, currentPassword) => {
  if (!currentPassword || typeof currentPassword !== 'string') {
    const error = new Error('Current password is required');
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId).select('+passwordHash');

  if (!user || user.isActive === false) {
    const error = new Error('Account is no longer active');
    error.status = 401;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!passwordMatches) {
    const error = new Error('Current password is incorrect');
    error.status = 401;
    throw error;
  }

  return user;
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

    if (!user || user.isActive === false) {
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

router.patch('/me', authenticate, async (request, response, next) => {
  try {
    const { currentPassword, email, newPassword } = request.body || {};

    if (email === undefined && newPassword === undefined) {
      return response.status(400).json({
        status: 'error',
        message: 'Provide a new email and/or new password',
      });
    }

    const user = await verifyCurrentPassword(request.user._id, currentPassword);

    if (email !== undefined) {
      const emailError = validateEmail(email);
      if (emailError) {
        return response.status(400).json({ status: 'error', message: emailError });
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail !== user.email) {
        const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
        if (existingUser) {
          return response.status(409).json({
            status: 'error',
            message: 'User with this email already exists',
          });
        }
        user.email = normalizedEmail;
      }
    }

    if (newPassword !== undefined) {
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return response.status(400).json({ status: 'error', message: passwordError });
      }
      user.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    await user.save();
    const token = createToken(user);

    return response.json({
      status: 'ok',
      message: 'Account updated successfully',
      token,
      user: toUserResponse(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/me', authenticate, async (request, response, next) => {
  try {
    const { currentPassword, confirmation } = request.body || {};

    if (confirmation !== 'DELETE MY ACCOUNT') {
      return response.status(400).json({
        status: 'error',
        message: 'Type DELETE MY ACCOUNT to confirm account deactivation',
      });
    }

    const user = await verifyCurrentPassword(request.user._id, currentPassword);
    const documents = await Document.find({
      deletedAt: null,
      $or: [{ userId: user._id }, { owner: user._id }],
    }).select('+fileData');

    const deletedAt = new Date();

    await Promise.all(
      documents.map(async (document) => {
        await deleteStoredDocumentFile(document);
        document.fileData = undefined;
        document.isPublic = false;
        document.deletedAt = deletedAt;
        document.deletedBy = user._id;
        await document.save();
      })
    );

    user.isActive = false;
    user.deletedAt = deletedAt;
    await user.save();

    broadcastChainChanged(
      'An account was deactivated; historical blockchain blocks were retained'
    ).catch((error) => {
      console.error('Failed to broadcast blockchain chain-updated event:', error);
    });

    return response.json({
      status: 'ok',
      message:
        'Account deactivated. Stored document files were removed, while blockchain audit blocks were retained.',
      deletedDocuments: documents.length,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
