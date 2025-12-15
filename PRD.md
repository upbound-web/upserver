# UpServer — Product Requirements Document

## Overview

**Product Name:** UpServer
**One-liner:** A chat interface that lets small business owners update their websites by describing changes in plain English.

**Problem:** Small business owners need to make occasional website updates (text changes, new images, adding services) but lack technical skills. Currently they either contact their developer for minor changes or struggle with complex CMS interfaces. This creates friction for customers and support burden for the developer.

**Solution:** A simple chat interface where customers describe what they want changed. AI makes the changes to a staging version of their site. Customer previews the changes and publishes when satisfied.

---

## Users

| User | Description |
|------|-------------|
| **Customer** | Small business owner or their admin. Non-technical. Needs to make occasional website updates without learning code or complex tools. |
| **Developer (you)** | Maintains the underlying infrastructure. Gets notified of errors and complex requests. |

---

## Customer Experience

### Access & Authentication

- Customer receives a magic link via email to access their dashboard
- No password to remember
- Link expires after reasonable timeframe, can request new one
- Each customer only sees their own site

### Dashboard

The dashboard is minimal with three main elements:

1. **Chat Interface** — Primary interaction point
2. **"View Staging Site" Button** — Opens staging URL in new tab
3. **"Publish to Live Site" Button** — Pushes changes to production

### Chat Flow

**Starting a conversation:**
- Customer opens dashboard, sees chat interface
- Can continue previous conversation or start a new one
- New chat = new context (for unrelated changes)
- Same chat = maintains context (for iterating on changes)

**Making a request:**
```
Customer: Can you change the phone number on the contact page to 555-0123?

UpServer: Done! I've updated the phone number on your contact page from
         555-9999 to 555-0123. Click "View Staging Site" to preview
         the change.
```

**Uploading images:**
```
Customer: [uploads image] Can you replace the hero image with this one?

UpServer: Done! I've replaced the hero image on your homepage. The new
         image has been optimized for web. Click "View Staging Site"
         to see how it looks.
```

**Iterating:**
```
Customer: Actually can you make the heading bigger too?

UpServer: Done! I've increased the heading size. Take a look at the
         staging site to see if that's the right size.
```

**Publishing:**
- Customer clicks "View Staging Site" to preview
- When satisfied, clicks "Publish to Live Site"
- Brief confirmation: "Are you sure you want to publish these changes?"
- On confirm: changes pushed to production
- Success message: "Your changes are now live! It may take a minute to update."

---

## Scope of Changes

### In Scope (Claude handles automatically)

| Category | Examples |
|----------|----------|
| **Text updates** | Change phone number, update address, edit descriptions, fix typos |
| **Image changes** | Replace hero image, add team photo, update logo |
| **Content additions** | Add a new service, add a team member, add a testimonial |
| **Simple styling** | Make heading bigger, change button color, adjust spacing |
| **Content removal** | Remove outdated service, delete old team member |

### Out of Scope (Flagged to developer)

| Category | Examples | Response |
|----------|----------|----------|
| **New functionality** | Add booking system, add payment, add contact form | "This is a bigger change that needs developer involvement. I've flagged this for review and they'll be in touch." |
| **Major redesign** | Redesign the homepage, change the layout completely | Same as above |
| **Technical requests** | Update dependencies, change hosting, modify build | Same as above |
| **Unclear/risky** | Anything Claude is uncertain about | "I want to make sure I get this right. I've flagged this for review." |

---

## Technical Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         Customer Device                           │
│                    (Browser - Dashboard/Chat)                     │
└─────────────────────────────┬────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                        UpServer Backend                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │   Auth      │  │   Chat      │  │   Site Manager          │   │
│  │   Service   │  │   Service   │  │   (Claude Code + Dev)   │   │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘   │
└─────────────────────────────┬────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Customer 1   │      │ Customer 2   │      │ Customer N   │
│ Site Folder  │      │ Site Folder  │      │ Site Folder  │
│ Dev Server   │      │ Dev Server   │      │ Dev Server   │
│ :3001        │      │ :3002        │      │ :300N        │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             ▼
                    Cloudflare Tunnel
                    staging[N].upserver.app
```

### Components

**1. Dashboard Frontend**
- React application
- Simple chat interface with message history
- Image upload (drag-drop or file picker)
- Staging site button (opens customer's staging URL)
- Publish button (triggers production deploy)
- Responsive for mobile (business owners check on phones)

**2. Backend API**
- Handles authentication (magic link generation/validation)
- Manages chat sessions and history
- Orchestrates Claude Code sessions
- Manages dev server lifecycle (spin up/down)
- Triggers production deploys
- Sends notifications on errors/flags

**3. Site Manager**
- One folder per customer: `/sites/{customer_id}/`
- Each folder is a git repo linked to GitHub
- Claude Code runs scoped to customer's folder only
- Dev servers run on demand (Vite for React, simple HTTP for static)

**4. Dev Server Pool**
- Spins up dev server when customer sends first message
- Each customer gets a dedicated port
- Auto-shutdown after 30 minutes of inactivity
- Exposed via Cloudflare tunnel to `staging{N}.upserver.app`

**5. Production Deploy**
- "Publish" button triggers: `git add . && git commit && git push`
- GitHub webhook triggers existing auto-build pipeline
- No changes needed to current hosting setup

---

## Data Model

### Customer
```typescript
Customer {
  id: string
  name: string
  email: string
  site_folder: string        // e.g., "/sites/bobs-plumbing"
  staging_url: string        // e.g., "staging3.upserver.app"
  github_repo: string        // e.g., "yourusername/bobs-plumbing"
  staging_port: number       // e.g., 3003
  created_at: timestamp
}
```

### Chat Session
```typescript
ChatSession {
  id: string
  customer_id: string
  created_at: timestamp
  updated_at: timestamp
  status: 'active' | 'closed'
}
```

### Message
```typescript
Message {
  id: string
  session_id: string
  role: 'customer' | 'assistant' | 'system'
  content: string
  images: string[]           // paths to uploaded images
  flagged: boolean           // true if flagged for developer review
  created_at: timestamp
}
```

### Dev Server State
```typescript
DevServer {
  customer_id: string
  port: number
  status: 'stopped' | 'starting' | 'running'
  started_at: timestamp
  last_activity: timestamp
}
```

---

## Developer Notifications

Notify developer when:

| Event | Channel | Content |
|-------|---------|---------|
| Complex request flagged | Email / Slack | Customer name, request content, link to chat |
| Claude Code error | Email / Slack | Customer name, error details, link to chat |
| Publish completed | Optional digest | Customer name, commit summary |

---

## Security Considerations

### Isolation
- Claude Code runs scoped to customer's folder only
- Cannot access other customers' files
- Consider disabling bash tool or restricting to safe commands

### Authentication
- Magic links expire after 24 hours
- Sessions expire after 7 days of inactivity
- Single session per customer (new login invalidates old)

### Image Uploads
- Validate file types (jpg, png, webp, svg only)
- Scan/validate images before passing to Claude
- Store in customer's folder only

### Prompt Injection
- Customer messages go to Claude Code as user input
- Claude Code's sandboxing limits blast radius
- Log all operations for audit

---

## MVP Scope

### Phase 1 — Core (Build First)
- [ ] Customer dashboard with chat interface
- [ ] Magic link authentication
- [ ] Claude Code integration (one-shot per message, scoped to customer folder)
- [ ] Dev server spin-up/down on demand
- [ ] Cloudflare tunnel setup for staging URLs
- [ ] "View Staging" button
- [ ] "Publish" button (git push)
- [ ] Basic error handling and developer notification

### Phase 2 — Polish (After MVP Works)
- [ ] Image upload in chat
- [ ] Conversation context (multi-turn within session)
- [ ] Complex request detection and flagging
- [ ] Chat history (view previous conversations)
- [ ] Better error messages for customers
- [ ] Mobile responsive refinements

### Phase 3 — Nice to Have (Later)
- [ ] Undo last change button
- [ ] Before/after preview
- [ ] Scheduled publishing
- [ ] Multiple users per customer (team access)
- [ ] Usage analytics for you
