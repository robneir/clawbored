# Clawboard — AI Agent Operations Platform

## Overview
A Next.js + Electron app for deploying and managing OpenClaw AI agent instances. 
Browser-first for development, Electron wrapper for production.

## Tech Stack
- **Next.js 15** (App Router)
- **React 19**
- **Tailwind CSS v4**
- **shadcn/ui** (components)
- **Electron** (desktop wrapper — add later, browser-first for now)
- **Node.js** backend (API routes in Next.js)
- **No database** — JSON file registry at ~/.clawboard/instances.json

## Design Language
Apple Liquid Glass + Linear (developer tool aesthetic):
- Dark mode by default (can support light)
- Glassmorphism: frosted glass cards with subtle backdrop-blur, translucent backgrounds
- Smooth micro-animations (framer-motion or CSS transitions)
- Clean SF-style typography, generous whitespace
- Subtle gradients and glows on interactive elements
- Monospace for logs/terminal output
- Status indicators with soft glow (green pulse for running, red for stopped)
- Rounded corners (16px for cards, 8px for inputs)
- Sidebar navigation (like Linear)
- Minimal borders, rely on elevation/blur for hierarchy

## Pages / Views

### 1. Dashboard (/)
- Top stats row: Total Instances, Running, Stopped, Total API Cost (placeholder)
- Grid of instance cards showing: name, status (live dot), port, template, created date
- Quick actions on each card: Start/Stop, Open Control UI, Delete
- "Deploy New Agent" prominent CTA button

### 2. Deploy (/deploy)
- Clean form: Instance Name, Display Name, Template selector
- No API key field — uses existing connected model
- "Deploy" button starts agent-driven deployment
- Live terminal-style log panel showing agent progress (SSE stream)
- Animated progress indicator
- On completion: auto-redirect to instance detail or show success state

### 3. Instance Detail (/instances/[name])  
- Instance header: name, status, port, uptime, created date
- Action buttons: Start/Stop, Open Control UI, Delete
- Tabs: Overview, Logs (future), Analytics (future), Settings (future)
- Overview shows: connection info, template, profile directory

### 4. Settings (/settings) — placeholder
- Future: global settings, default templates, notification preferences

## Layout
- Sidebar (collapsible): Logo/name at top, nav links (Dashboard, Deploy, Settings), instance list at bottom
- Main content area with header breadcrumb

## API Routes (Next.js API routes)

### GET /api/instances
Returns list of all registered instances with live status.

### POST /api/deploy
Body: { name, displayName, template }
Starts agent-driven deployment. Returns { deployId, name, port }.

### GET /api/deploy/[id]/stream
SSE stream of deployment logs.

### GET /api/deploy/[id]
Returns deployment status and logs.

### POST /api/instances/[name]/start
Start a stopped instance.

### POST /api/instances/[name]/stop
Stop a running instance.

### DELETE /api/instances/[name]
Delete instance (kills process, removes profile dir, removes from registry).

### DELETE /api/instances
Delete ALL instances (double-confirm on frontend).

## Instance Registry
File: ~/.clawboard/instances.json
```json
[{
  "name": "my-agent",
  "displayName": "My Agent",
  "port": 19100,
  "token": "hex-token",
  "template": "general",
  "createdAt": "2026-02-27T...",
  "profileDir": "/Users/me/.openclaw-my-agent",
  "pid": null,
  "status": "ready"
}]
```

## Agent-Driven Deploy
When user clicks Deploy, we spawn `openclaw agent` with a task prompt that:
1. Reads latest OpenClaw docs (https://docs.openclaw.ai/start/getting-started)
2. Runs `openclaw --profile <name> onboard` with appropriate flags
3. Configures the gateway on the assigned port
4. Starts the gateway
5. Reports back with instance details

The agent's stdout is streamed to the frontend via SSE.

## Key Files from v1 to Preserve Logic From
The backend logic (instances.js and deployer.js) from ../mission-control-v1/src/ should be adapted into Next.js API routes. The core logic for:
- Registry management (load/save JSON)
- Instance lifecycle (start/stop/delete)
- Agent-driven deployment (spawn openclaw agent, stream output)
- Port assignment
- Cleanup (kill processes, remove dirs, remove plists)

## Important Notes
- `openclaw --profile <name>` creates isolated instances at ~/.openclaw-<name>/
- Gateway runs on assigned port (base 19100, incrementing)
- Control UI accessed via http://127.0.0.1:<port>/#token=<token>
- No API key needed — reuses the host's existing auth (user's Claude subscription)
- Delete must be thorough: kill process, remove profile dir, remove LaunchAgent plist, sweep port, remove from registry
