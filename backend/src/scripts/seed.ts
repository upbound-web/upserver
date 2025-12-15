import { db } from '../config/db.js';
import { user, customers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

async function seed() {
  console.log('Seeding database...');

  // Create admin user
  const adminEmail = 'jake@upbound.com.au';
  const existingAdmin = await db
    .select()
    .from(user)
    .where(eq(user.email, adminEmail))
    .limit(1);

  if (!existingAdmin.length) {
    const adminId = nanoid();
    await db.insert(user).values({
      id: adminId,
      name: 'Jake Dawson',
      email: adminEmail,
      emailVerified: true,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`✓ Created admin user: ${adminEmail}`);
  } else {
    // Update existing user to admin if not already
    if (existingAdmin[0].role !== 'admin') {
      await db
        .update(user)
        .set({ role: 'admin', updatedAt: new Date() })
        .where(eq(user.email, adminEmail));
      console.log(`✓ Updated user to admin: ${adminEmail}`);
    } else {
      console.log(`✓ Admin user already exists: ${adminEmail}`);
    }
  }

  // Create test users and customers
  const testUsers = [
    {
      email: 'test@example.com',
      name: 'Test Project Customer',
      siteFolder: 'test-project',
      stagingUrl: 'staging1.upserver.local',
      githubRepo: 'user/test-project',
      stagingPort: 3000,
    },
    {
      email: 'windows@example.com',
      name: 'Complete Windows Customer',
      siteFolder: 'complete-windows',
      stagingUrl: 'staging2.upserver.local',
      githubRepo: 'user/complete-windows',
      stagingPort: 3001,
    },
  ];

  for (const testUser of testUsers) {
    const userId = nanoid();
    const customerId = nanoid();

    // Insert user
    await db.insert(user).values({
      id: userId,
      name: testUser.name,
      email: testUser.email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`✓ Created user: ${testUser.email}`);

    // Insert customer
    await db.insert(customers).values({
      id: customerId,
      userId,
      name: testUser.name,
      siteFolder: testUser.siteFolder,
      stagingUrl: testUser.stagingUrl,
      githubRepo: testUser.githubRepo,
      stagingPort: testUser.stagingPort,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`✓ Created customer for site: ${testUser.siteFolder}`);
  }

  console.log('\n✅ Database seeded successfully!');
  process.exit(0);
}

seed().catch((error) => {
  console.error('Error seeding database:', error);
  process.exit(1);
});
