import { db } from './src/config/db.js';
import { customers, user, session as sessionTable } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const API_URL = 'http://localhost:4000';

async function testAPI() {
  console.log('🧪 Testing Claude Agent SDK through Chat API...\n');

  try {
    // Step 1: Get the windows user
    console.log('Step 1: Finding windows@example.com user...');
    const windowsUser = await db
      .select()
      .from(user)
      .where(eq(user.email, 'windows@example.com'))
      .limit(1);

    if (!windowsUser.length) {
      throw new Error('User not found. Run: npm run db:seed');
    }

    console.log('✅ User found:', windowsUser[0].email);

    // Step 2: Create a session
    console.log('\nStep 2: Creating authentication session...');
    const sessionId = nanoid();
    const token = `${nanoid()}.${nanoid()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(sessionTable).values({
      id: sessionId,
      userId: windowsUser[0].id,
      token,
      expiresAt,
    });

    console.log('✅ Session created');
    console.log('   Session ID:', sessionId);
    console.log('   Token:', token);

    // Step 3: Get customer info
    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.userId, windowsUser[0].id))
      .limit(1);

    if (!customer.length) {
      throw new Error('Customer not found');
    }

    console.log('\n   Customer:', customer[0].name);
    console.log('   Site folder:', customer[0].siteFolder);

    // Step 4: Create chat session
    console.log('\nStep 3: Creating chat session...');
    const chatResponse = await fetch(`${API_URL}/api/chat/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `better_auth.session_token=${token}`
      }
    });

    if (!chatResponse.ok) {
      const error = await chatResponse.text();
      throw new Error(`Failed to create chat session: ${error}`);
    }

    const { session } = await chatResponse.json();
    console.log('✅ Chat session created:', session.id);

    // Step 5: Send message
    console.log('\nStep 4: Sending message to Claude Agent...');
    const testMessage = 'Change the phone number in the quote section to 1-800-SPARKLE (1-800-772-7553) and make the text bigger';
    console.log('   Message:', testMessage);

    console.log('\n⏳ Waiting for Claude to process (this may take 20-30 seconds)...\n');

    const messageResponse = await fetch(
      `${API_URL}/api/chat/sessions/${session.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better_auth.session_token=${token}`
        },
        body: JSON.stringify({ content: testMessage })
      }
    );

    if (!messageResponse.ok) {
      const error = await messageResponse.text();
      throw new Error(`Failed to send message: ${error}`);
    }

    const { message } = await messageResponse.json();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('Claude Agent Response:');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(message.content);
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Metadata:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Flagged:', message.flagged);
    console.log('Message ID:', message.id);
    console.log('Created:', message.createdAt);

    // Step 6: Verify file changes
    console.log('\n\nStep 5: Verifying file changes...');
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -o "1-800-SPARKLE\\|1-800-772-7553\\|555-0123" /home/jakedawson/upserver/sites/complete-windows/index.html | head -5',
      { encoding: 'utf-8' }
    ).trim();

    if (result.includes('1-800-SPARKLE') || result.includes('1-800-772-7553')) {
      console.log('✅ File was successfully modified!');
      console.log('   Found:', result.split('\n').join(', '));
    } else if (result.includes('555-0123')) {
      console.log('⚠️  Phone number not changed (still shows 555-0123)');
    } else {
      console.log('   Result:', result || 'No phone numbers found');
    }

    console.log('\n✅ Full API test completed successfully!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

testAPI();
