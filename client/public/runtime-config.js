/*
 * Public runtime configuration. This file contains no secret.
 *
 * Local development: leave apiUrl on http://localhost:5000.
 * Before Netlify production deploy: replace apiUrl with the exact HTTPS Render backend URL.
 * Development tools are rendered only on localhost/127.0.0.1 as an additional safety guard.
 */
window.DOCUMENTCHAIN_RUNTIME_CONFIG = {
  apiUrl: 'http://localhost:5000',
  showDevTools: true,
};
