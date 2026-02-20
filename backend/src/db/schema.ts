import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Better Auth tables (based on Better Auth schema)
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// UpServer custom tables

export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  siteFolder: text('site_folder').notNull(),
  stagingUrl: text('staging_url'),
  githubRepo: text('github_repo'),
  stagingPort: integer('staging_port'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  title: text('title'),
  status: text('status', { enum: ['active', 'closed'] }).notNull().default('active'),
  claudeSessionId: text('claude_session_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['customer', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  images: text('images'), // JSON stringified array
  flagged: integer('flagged', { mode: 'boolean' }).notNull().default(false),
  sdkUserMessageUuid: text('sdk_user_message_uuid'),
  filesModified: text('files_modified'), // JSON stringified array of file paths
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const reviewRequests = sqliteTable('review_requests', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  customerMessageId: text('customer_message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  assistantMessageId: text('assistant_message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  requestContent: text('request_content').notNull(),
  decision: text('decision', { enum: ['auto', 'flag'] }).notNull(),
  scope: text('scope', { enum: ['minor', 'major', 'uncertain'] }).notNull(),
  confidencePct: integer('confidence_pct').notNull(),
  reason: text('reason').notNull(),
  triggers: text('triggers'),
  quotedPriceCents: integer('quoted_price_cents'),
  quoteNote: text('quote_note'),
  quotedAt: integer('quoted_at', { mode: 'timestamp' }),
  approvedAt: integer('approved_at', { mode: 'timestamp' }),
  policyVersion: text('policy_version').notNull().default('v1'),
  status: text('status', { enum: ['open', 'quoted', 'approved', 'rejected', 'completed'] }).notNull().default('open'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const devServers = sqliteTable('dev_servers', {
  customerId: text('customer_id').primaryKey().references(() => customers.id, { onDelete: 'cascade' }),
  port: integer('port').notNull(),
  pid: integer('pid'),
  status: text('status', { enum: ['stopped', 'starting', 'running', 'error'] }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  lastActivity: integer('last_activity', { mode: 'timestamp' }),
});
