// Public client config: which optional integrations are wired, so the browser
// knows whether to show the Google sign-in gate and the Drive picker.

import { authEnabled } from '../../src/auth/session.js';

export default async () => {
  return new Response(
    JSON.stringify({
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      googleApiKey: process.env.GOOGLE_API_KEY || null,
      llmConfigured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      authEnabled: authEnabled(),
      authConfig: {
        clientId: !!process.env.GOOGLE_CLIENT_ID,
        domains: !!process.env.ALLOWED_EMAIL_DOMAINS,
        secret: !!process.env.SESSION_SECRET,
      },
    }),
    { headers: { 'content-type': 'application/json' } }
  );
};

export const config = { path: '/api/config' };
