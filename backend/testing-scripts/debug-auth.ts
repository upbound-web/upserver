import express from 'express';
import { auth } from '../src/auth.js';

const app = express();

app.get('/test-auth', async (req, res) => {
  try {
    console.log('Headers:', req.headers);
    console.log('Cookies:', req.headers.cookie);

    const session = await auth.api.getSession({ headers: req.headers });

    console.log('Session result:', session);

    res.json({
      hasSession: !!session,
      session: session ? {
        user: session.user,
        sessionId: session.session?.id
      } : null
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(4001, () => {
  console.log('Debug server running on http://localhost:4001');
  console.log('Test with: curl http://localhost:4001/test-auth -H "Cookie: better_auth.session_token=YOUR_TOKEN"');
});
