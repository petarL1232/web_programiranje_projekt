const DEFAULT_LOCAL_ORIGIN = 'http://localhost:4200';

const isProduction = () => process.env.NODE_ENV === 'production';

const getAllowedOrigins = () => {
  const rawOrigins = process.env.CLIENT_ORIGINS || process.env.CLIENT_URL || DEFAULT_LOCAL_ORIGIN;

  return [
    ...new Set(
      rawOrigins
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    ),
  ];
};

const getDocumentStorageMode = () => {
  const configuredMode = (process.env.DOCUMENT_STORAGE || '').trim().toLowerCase();

  if (configuredMode === 'mongodb' || configuredMode === 'filesystem') {
    return configuredMode;
  }

  return isProduction() ? 'mongodb' : 'filesystem';
};

const assertProductionConfiguration = () => {
  if (!isProduction()) {
    return;
  }

  const errors = [];

  if (!process.env.MONGO_URI) {
    errors.push('MONGO_URI is required in production');
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be set and contain at least 32 characters in production');
  }

  if (!process.env.CLIENT_ORIGINS) {
    errors.push('CLIENT_ORIGINS is required in production');
  }

  if (getDocumentStorageMode() !== 'mongodb') {
    errors.push('DOCUMENT_STORAGE must be mongodb in production');
  }

  if (errors.length) {
    throw new Error(`Invalid production configuration: ${errors.join('; ')}`);
  }
};

module.exports = {
  getAllowedOrigins,
  getDocumentStorageMode,
  isProduction,
  assertProductionConfiguration,
};
