import { db } from './src/config/db.js';
import { session, user } from './src/db/schema.js';
import { eq, desc } from 'drizzle-orm';

async function checkSessions() {
  // Find windows user
  const windowsUser = await db
    .select()
    .from(user)
    .where(eq(user.email, 'windows@example.com'))
    .limit(1);

  if (!windowsUser.length) {
    console.log('User not found');
    return;
  }

  console.log('User ID:', windowsUser[0].id);

  // Find sessions for this user
  const sessions = await db
    .select()
    .from(session)
    .where(eq(session.userId, windowsUser[0].id))
    .orderBy(desc(session.createdAt))
    .limit(5);

  console.log('\nSessions:');
  sessions.forEach((s, i) => {
    console.log(`\n${i + 1}.`, {
      id: s.id,
      token: s.token,
      expiresAt: s.expiresAt,
      expired: s.expiresAt < new Date()
    });
  });
}

checkSessions().then(() => process.exit(0));
