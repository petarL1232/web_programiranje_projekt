const express = require('express');

const router = express.Router();

const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedRepositoryStatus = null;
let cacheExpiresAt = 0;

const getRepositorySlug = () => {
  const value = (process.env.SOURCE_REPOSITORY || 'petarL1232/web_programiranje_projekt').trim();

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('SOURCE_REPOSITORY must use the owner/repository format');
  }

  return value;
};

const fetchRepositoryStatus = async () => {
  if (cachedRepositoryStatus && Date.now() < cacheExpiresAt) {
    return { ...cachedRepositoryStatus, cached: true };
  }

  const repository = getRepositorySlug();
  const response = await fetch(`https://api.github.com/repos/${repository}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'DocumentChain-Web-Programming-Project',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`GitHub repository API returned HTTP ${response.status}`);
  }

  const data = await response.json();
  cachedRepositoryStatus = {
    repository: {
      fullName: data.full_name,
      url: data.html_url,
      visibility: data.private ? 'private' : 'public',
      defaultBranch: data.default_branch,
      updatedAt: data.updated_at,
      pushedAt: data.pushed_at,
    },
    fetchedAt: new Date().toISOString(),
  };
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;

  return { ...cachedRepositoryStatus, cached: false };
};

router.get('/repository', async (_request, response) => {
  try {
    const status = await fetchRepositoryStatus();

    response.setHeader('Cache-Control', 'public, max-age=300');
    return response.json({
      status: 'ok',
      message: 'Repository metadata loaded through the server-side GitHub API request',
      ...status,
    });
  } catch (error) {
    return response.status(502).json({
      status: 'degraded',
      message:
        'Repository metadata is temporarily unavailable. Core document features are unaffected.',
    });
  }
});

module.exports = router;
