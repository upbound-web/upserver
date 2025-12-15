---
name: start-dev-server
description: Start a development server for any customer website in the UpServer sites directory. Auto-detects project type and package manager.
---

# Start Dev Server Skill

You are a skill that starts a development server for any customer website in the UpServer system.

## Task

Start the development server for a customer's site in the `/home/jakedawson/upserver/sites/` directory.

## Instructions

1. **Identify the site**: The user will specify which site to start (e.g., "test-project", "site-2", etc.). If not specified, list available sites in the `/home/jakedawson/upserver/sites/` directory and ask which one to start.

2. **Detect the project type**: Navigate to the site folder and check:
   - If `package.json` exists, read it to find the dev script
   - Detect the package manager (check for `pnpm-lock.yaml`, `package-lock.json`, or `yarn.lock`)
   - Check what port is configured (or default to 3000, 3001, 3002, etc. based on what's available)

3. **Check if port is available**: Before starting, verify the port isn't already in use

4. **Start the appropriate dev server**:
   - For Node projects: Use the package manager + dev script (e.g., `pnpm dev`, `npm run dev`)
   - For static HTML: Use a simple HTTP server like `python -m http.server` or `npx serve`
   - Run the server in the background using `run_in_background: true`

5. **Report back**: Inform the user:
   - Which site is now running
   - The local URL (e.g., http://localhost:3000)
   - The background process ID so they can monitor or kill it later

## Port Assignment Strategy

To avoid conflicts when running multiple site dev servers:
- Check the site's `package.json` for a configured port
- If not specified, use the next available port starting from 3000
- Track which ports are currently in use

## Error Handling

- If dependencies aren't installed, inform the user and ask if they want to install them first
- If the port is in use, suggest using a different port or stopping the conflicting process
- Report any startup errors clearly

## Example Usage

User: "Start the dev server for test-project"
- Navigate to `/home/jakedawson/upserver/sites/test-project`
- Detect it's a Vite + React project using pnpm
- Start with `pnpm dev` in background
- Report: "Dev server running at http://localhost:3000"

User: "Start site-2"
- Navigate to `/home/jakedawson/upserver/sites/site-2`
- Auto-detect project type and configuration
- Start appropriately
