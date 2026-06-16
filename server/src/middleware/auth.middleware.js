const jwt = require('jsonwebtoken');

const User = require('../models/User');

const getJwtSecret = () => process.env.JWT_SECRET || 'development-secret-change-me';

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
        message: 'Missing or invalid Authorization header',
      });
    }

    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.userId);

    if (!user) {
      return response.status(401).json({
        status: 'error',
        message: 'User no longer exists',
      });
    }

    request.user = user;
    return next();
  } catch (_error) {
    return response.status(401).json({
      status: 'error',
      message: 'Invalid or expired token',
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

    if (user) {
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
