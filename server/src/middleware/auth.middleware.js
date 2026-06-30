const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }

  return secret;
};

const readBearerToken = (request) => {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.split(' ')[1];
};

const authenticate = async (request, response, next) => {
  try {
    const token = readBearerToken(request);

    if (!token) {
      return response.status(401).json({
        status: 'error',
        code: 'AUTH_HEADER_MISSING',
        message: 'Missing or invalid Authorization header',
      });
    }

    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.userId);

    if (!user || user.isActive === false) {
      return response.status(401).json({
        status: 'error',
        code: user ? 'USER_INACTIVE' : 'USER_NOT_FOUND',
        message: user ? 'This account is no longer active' : 'User no longer exists',
      });
    }

    request.user = user;
    return next();
  } catch (error) {
    const expired = error?.name === 'TokenExpiredError';

    return response.status(401).json({
      status: 'error',
      code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      message: expired ? 'Your session has expired. Please sign in again.' : 'Invalid token',
    });
  }
};

const optionalAuthenticate = async (request, _response, next) => {
  try {
    const token = readBearerToken(request);

    if (!token) {
      return next();
    }

    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.userId);

    if (user && user.isActive !== false) {
      request.user = user;
    }

    return next();
  } catch (_error) {
    return next();
  }
};

module.exports = {
  authenticate,
  optionalAuthenticate,
};
