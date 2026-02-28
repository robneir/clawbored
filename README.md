# ⚡ Mission Control

AI Agent Operations Platform — deploy, manage, and monitor OpenClaw AI agent instances.

## Features

- **One-Click Deploy** — Agent-driven setup using your Claude subscription or API key
- **Instance Management** — Start, stop, delete, and monitor agent instances
- **10 Themes** — Dark, light, and everything in between with live preview
- **Subscription Auth** — Use your existing Claude Pro/Max/Team plan directly
- **Local-First** — All data stored locally, no external database needed

## Tech Stack

- **Next.js 15** (App Router)
- **React 19** + TypeScript
- **Tailwind CSS v4**
- **shadcn/ui** components
- **Framer Motion** animations
- **Lato** font (Slack-style typography)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

- Instance registry: `~/.mission-control/instances.json`
- Auth config: `~/.mission-control/auth.json`
- Theme preference: `localStorage`
- Each agent instance: `~/.openclaw-<name>/`

## License

Private — not for distribution.
