const API_URL = 'http://localhost:4000';

async function testFullAPI() {
  console.log('🧪 Testing Claude Agent SDK through full API flow...\n');

  try {
    // Step 1: Request magic link
    console.log('Step 1: Requesting magic link for windows@example.com...');
    const magicLinkResponse = await fetch(`${API_URL}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'windows@example.com',
        callbackURL: 'http://localhost:5173/auth/callback'
      })
    });

    if (!magicLinkResponse.ok) {
      throw new Error(`Magic link request failed: ${await magicLinkResponse.text()}`);
    }

    console.log('✅ Magic link sent! Check the backend console for the URL.\n');
    console.log('⏸️  Please check the backend output, copy the token from the Magic Link URL,');
    console.log('   and set it as TOKEN environment variable, then run:');
    console.log('   TOKEN=<your-token> npx tsx test-api.ts verify\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function verifyAndTest() {
  const token = process.env.TOKEN;
  if (!token) {
    console.error('❌ TOKEN environment variable not set');
    process.exit(1);
  }

  console.log('🧪 Verifying token and testing chat API...\n');

  try {
    // Step 2: Verify the magic link token
    console.log('Step 2: Verifying magic link token...');
    const verifyResponse = await fetch(
      `${API_URL}/api/auth/magic-link/verify?token=${token}`,
      {
        method: 'GET',
        redirect: 'manual'
      }
    );

    // Extract session token from Set-Cookie header
    const setCookie = verifyResponse.headers.get('set-cookie');
    if (!setCookie) {
      throw new Error('No session cookie received');
    }

    // Parse the better_auth.session_token cookie
    const sessionMatch = setCookie.match(/better_auth\.session_token=([^;]+)/);
    if (!sessionMatch) {
      throw new Error('Could not find session token in cookies');
    }

    const sessionToken = sessionMatch[1];
    console.log('✅ Session token received\n');

    // Step 3: Create a chat session
    console.log('Step 3: Creating chat session...');
    const sessionResponse = await fetch(`${API_URL}/api/chat/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `better_auth.session_token=${sessionToken}`
      }
    });

    if (!sessionResponse.ok) {
      throw new Error(`Session creation failed: ${await sessionResponse.text()}`);
    }

    const { session } = await sessionResponse.json();
    console.log('✅ Chat session created:', session.id, '\n');

    // Step 4: Send a message to Claude
    console.log('Step 4: Sending message to Claude Agent...');
    console.log('Request: "Change the phone number in the quote section to 555-9999"\n');

    const messageResponse = await fetch(
      `${API_URL}/api/chat/sessions/${session.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better_auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({
          content: 'Change the phone number in the quote section to 555-9999'
        })
      }
    );

    if (!messageResponse.ok) {
      throw new Error(`Message send failed: ${await messageResponse.text()}`);
    }

    const { message } = await messageResponse.json();
    console.log('--- Claude Agent Response ---\n');
    console.log(message.content);
    console.log('\n--- Response Metadata ---');
    console.log('Flagged:', message.flagged);
    console.log('Message ID:', message.id);
    console.log('\n✅ API test completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Check if we're in verify mode
if (process.argv.includes('verify')) {
  verifyAndTest();
} else {
  testFullAPI();
}
