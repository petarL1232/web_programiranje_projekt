const jwt = require('jsonwebtoken');

const User = require('../models/User');

const getJwtSecret = () => process.env.JWT_SECRET || 'development-secret-change-me';

const authenticate = async (request, response, next) => {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({
        status: 'error',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, getJwtSecret());

    const user = await User.findById(payload.userId);

    if (!user) {
      return response.status(401).json({
        status: 'error',
        message: 'User no longer exists',
      });
    }

    request.user = user;
    next();
  } catch (_error) {
    return response.status(401).json({
      status: 'error',
      message: 'Invalid or expired token',
    });
  }
};

module.exports = {
  authenticate,
};
