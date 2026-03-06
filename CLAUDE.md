# Clawboard

## Theming Rules

This project supports multiple color themes (10 themes including both dark and light modes). **All UI must work across every theme.**

### Required: Use CSS Variables for Colors

Never use hardcoded color classes like `text-white`, `text-white/40`, `bg-white/5`, `border-white/10`, `text-zinc-500`, `bg-zinc-600`, `bg-[#0a0a0c]`, etc. for text, backgrounds, or borders that sit on the page/card background. These break in light mode.

Instead, use the theme CSS variables via inline `style` props:

| Use case | Style |
|---|---|
| Primary text | `style={{ color: "var(--mc-text)" }}` |
| Muted/secondary text | `style={{ color: "var(--mc-muted)" }}` |
| Dimmer text (labels) | `style={{ color: "var(--mc-muted)", opacity: 0.6 }}` |
| Subtle text (faded) | `style={{ color: "var(--mc-text)", opacity: 0.7 }}` |
| Backgrounds | `style={{ backgroundColor: "var(--mc-surface)" }}` |
| Borders | `style={{ borderColor: "var(--mc-border)" }}` |
| Accent elements | `style={{ color: "var(--mc-accent)" }}` |
| Sidebar background | `style={{ backgroundColor: "var(--mc-sidebar)" }}` |

### Exception: Colored Backgrounds

`text-white` is acceptable ONLY on elements with a colored background (accent buttons, destructive badges, etc.) where the text color is independent of the page theme.

### Exception: Semantic Status Colors

Tailwind classes like `text-emerald-400`, `text-red-400`, `text-amber-400`, `text-blue-400` are fine for status indicators since they work on both light and dark backgrounds.

### Loading Spinners

Use theme variables for spinner border colors:
```tsx
<div className="w-6 h-6 border-2 rounded-full animate-spin"
  style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }} />
```

### Glass Cards

Use the `.glass-card` and `.glass-card-hover` CSS classes which already use theme variables.

### Visual QA: Every New Component Must Work Across All Themes & Fonts

This app has extensive appearance customization — 10 color themes (9 dark + 1 light "Frost") and multiple font presets. **When adding or modifying any visible component, you must mentally verify it against all theme variants:**

- **Light mode (Frost)**: Dark text on light backgrounds — ensure sufficient contrast. `rgba(99, 102, 241, 0.08)` style tinted backgrounds may be invisible on light themes. Use `var(--mc-surface)` instead.
- **Low-contrast dark themes (Midnight, Slate)**: Muted text and borders can disappear — ensure borders use `var(--mc-border)` not hardcoded low-opacity values.
- **High-contrast themes (Terminal, Hacker)**: Bright accents — ensure accent-colored elements don't clash with surrounding text.
- **Warm themes (Ember, Copper)**: Non-indigo accents — don't assume accent is always indigo/purple. Never hardcode `rgba(99, 102, 241, ...)` for accent tints. Use `var(--mc-accent)` with opacity or `var(--mc-surface)` instead.

**Key rules:**
1. Never use hardcoded `rgba(99, 102, 241, ...)` for backgrounds or borders — these are indigo-specific and break on non-indigo themes. Use `var(--mc-surface)` or `var(--mc-accent)` with opacity.
2. Floating/overlay components (status bars, modals, dropdowns) must use `var(--mc-bg)` or `var(--mc-surface)` backgrounds with `var(--mc-border)` borders — never transparent or semi-transparent backgrounds that let incompatible colors bleed through.
3. Text on `var(--mc-bg)` must use `var(--mc-text)` or `var(--mc-muted)` — never assume the background is dark.
4. All shadows should use `shadow-lg` or `shadow-xl` (neutral black shadows) which work on both light and dark backgrounds.

### Available CSS Variables

- `--mc-bg` - Page background
- `--mc-text` - Primary text color
- `--mc-accent` - Accent/brand color
- `--mc-accent-hover` - Accent hover state
- `--mc-surface` - Card/surface background (semi-transparent)
- `--mc-surface-hover` - Surface hover state
- `--mc-border` - Border color (semi-transparent)
- `--mc-muted` - Muted/secondary text color
- `--mc-sidebar` - Sidebar background

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Framer Motion
- shadcn/ui components
- Radix UI primitives

## OpenClaw Documentation Reference

When working on OpenClaw-related features (gateway setup, agent management, CLI commands, configuration, etc.), **always check the relevant OpenClaw docs first** before guessing at APIs, config fields, or CLI flags. The full docs index is at: https://docs.openclaw.ai/llms.txt

### Key Docs by Topic

**Gateway (setup, config, architecture):**
- [Configuration Reference](https://docs.openclaw.ai/gateway/configuration-reference.md) — complete field-by-field reference for `~/.openclaw/openclaw.json`
- [Configuration](https://docs.openclaw.ai/gateway/configuration.md)
- [Configuration Examples](https://docs.openclaw.ai/gateway/configuration-examples.md)
- [Gateway Architecture](https://docs.openclaw.ai/concepts/architecture.md)
- [Multiple Gateways](https://docs.openclaw.ai/gateway/multiple-gateways.md)
- [Authentication](https://docs.openclaw.ai/gateway/authentication.md)
- [Health Checks](https://docs.openclaw.ai/gateway/health.md)
- [Heartbeat](https://docs.openclaw.ai/gateway/heartbeat.md)
- [Doctor](https://docs.openclaw.ai/gateway/doctor.md)
- [Troubleshooting](https://docs.openclaw.ai/gateway/troubleshooting.md)
- [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing.md)
- [Secrets Management](https://docs.openclaw.ai/gateway/secrets.md)
- [Gateway Lock](https://docs.openclaw.ai/gateway/gateway-lock.md)
- [Logging](https://docs.openclaw.ai/gateway/logging.md)
- [Network Model](https://docs.openclaw.ai/gateway/network-model.md)
- [OpenAI Chat Completions API](https://docs.openclaw.ai/gateway/openai-http-api.md)
- [OpenResponses API](https://docs.openclaw.ai/gateway/openresponses-http-api.md)

**CLI Commands:**
- [CLI Reference (index)](https://docs.openclaw.ai/cli/index.md)
- [gateway](https://docs.openclaw.ai/cli/gateway.md)
- [agent](https://docs.openclaw.ai/cli/agent.md)
- [agents](https://docs.openclaw.ai/cli/agents.md)
- [onboard](https://docs.openclaw.ai/cli/onboard.md)
- [config](https://docs.openclaw.ai/cli/config.md)
- [doctor](https://docs.openclaw.ai/cli/doctor.md)
- [status](https://docs.openclaw.ai/cli/status.md)
- [skills](https://docs.openclaw.ai/cli/skills.md)
- [cron](https://docs.openclaw.ai/cli/cron.md)
- [models](https://docs.openclaw.ai/cli/models.md)
- [sessions](https://docs.openclaw.ai/cli/sessions.md)
- [memory](https://docs.openclaw.ai/cli/memory.md)
- [secrets](https://docs.openclaw.ai/cli/secrets.md)
- [daemon](https://docs.openclaw.ai/cli/daemon.md)
- [logs](https://docs.openclaw.ai/cli/logs.md)
- [setup](https://docs.openclaw.ai/cli/setup.md)
- [update](https://docs.openclaw.ai/cli/update.md)

**Agent Concepts:**
- [Agent Runtime](https://docs.openclaw.ai/concepts/agent.md)
- [Agent Loop](https://docs.openclaw.ai/concepts/agent-loop.md)
- [Agent Workspace](https://docs.openclaw.ai/concepts/agent-workspace.md)
- [System Prompt](https://docs.openclaw.ai/concepts/system-prompt.md)
- [Memory](https://docs.openclaw.ai/concepts/memory.md)
- [Session Management](https://docs.openclaw.ai/concepts/session.md)
- [Sessions](https://docs.openclaw.ai/concepts/sessions.md)
- [Model Providers](https://docs.openclaw.ai/concepts/model-providers.md)
- [Model Failover](https://docs.openclaw.ai/concepts/model-failover.md)
- [Multi-Agent Routing](https://docs.openclaw.ai/concepts/multi-agent.md)
- [OAuth](https://docs.openclaw.ai/concepts/oauth.md)
- [Streaming and Chunking](https://docs.openclaw.ai/concepts/streaming.md)
- [Context](https://docs.openclaw.ai/concepts/context.md)

**Tools & Skills:**
- [Tools (index)](https://docs.openclaw.ai/tools/index.md)
- [Skills](https://docs.openclaw.ai/tools/skills.md)
- [Creating Skills](https://docs.openclaw.ai/tools/creating-skills.md)
- [Skills Config](https://docs.openclaw.ai/tools/skills-config.md)
- [Browser](https://docs.openclaw.ai/tools/browser.md)
- [Exec Tool](https://docs.openclaw.ai/tools/exec.md)
- [Sub-Agents](https://docs.openclaw.ai/tools/subagents.md)
- [Slash Commands](https://docs.openclaw.ai/tools/slash-commands.md)

**Automation:**
- [Cron Jobs](https://docs.openclaw.ai/automation/cron-jobs.md)
- [Cron vs Heartbeat](https://docs.openclaw.ai/automation/cron-vs-heartbeat.md)
- [Webhooks](https://docs.openclaw.ai/automation/webhook.md)
- [Hooks](https://docs.openclaw.ai/automation/hooks.md)
- [Polls](https://docs.openclaw.ai/automation/poll.md)

**Model Providers:**
- [Anthropic](https://docs.openclaw.ai/providers/anthropic.md)
- [OpenAI](https://docs.openclaw.ai/providers/openai.md)
- [Ollama](https://docs.openclaw.ai/providers/ollama.md)
- [Mistral](https://docs.openclaw.ai/providers/mistral.md)
- [Moonshot AI](https://docs.openclaw.ai/providers/moonshot.md)
- [OpenRouter](https://docs.openclaw.ai/providers/openrouter.md)
- [All Providers (index)](https://docs.openclaw.ai/providers/index.md)

**Setup & Onboarding:**
- [Getting Started](https://docs.openclaw.ai/start/getting-started.md)
- [Quick Start](https://docs.openclaw.ai/start/quickstart.md)
- [Setup](https://docs.openclaw.ai/start/setup.md)
- [Onboarding Wizard (CLI)](https://docs.openclaw.ai/start/wizard.md)
- [CLI Onboarding Reference](https://docs.openclaw.ai/start/wizard-cli-reference.md)
- [Agent Bootstrapping](https://docs.openclaw.ai/start/bootstrapping.md)

**Reference & Templates:**
- [Default AGENTS.md](https://docs.openclaw.ai/reference/AGENTS.default.md)
- [AGENTS.md Template](https://docs.openclaw.ai/reference/templates/AGENTS.md)
- [SOUL.md Template](https://docs.openclaw.ai/reference/templates/SOUL.md)
- [BOOT.md Template](https://docs.openclaw.ai/reference/templates/BOOT.md)
- [HEARTBEAT.md Template](https://docs.openclaw.ai/reference/templates/HEARTBEAT.md)
- [TOOLS.md Template](https://docs.openclaw.ai/reference/templates/TOOLS.md)
- [Onboarding Wizard Reference](https://docs.openclaw.ai/reference/wizard.md)
- [Session Management Deep Dive](https://docs.openclaw.ai/reference/session-management-compaction.md)
- [API Usage and Costs](https://docs.openclaw.ai/reference/api-usage-costs.md)
- [OpenAPI Spec](https://docs.openclaw.ai/api-reference/openapi.json)

**Installation:**
- [Install (index)](https://docs.openclaw.ai/install/index.md)
- [Node.js](https://docs.openclaw.ai/install/node.md)
- [Docker](https://docs.openclaw.ai/install/docker.md)
- [Updating](https://docs.openclaw.ai/install/updating.md)
- [Uninstall](https://docs.openclaw.ai/install/uninstall.md)

**Web & Dashboard:**
- [Dashboard](https://docs.openclaw.ai/web/dashboard.md)
- [Control UI](https://docs.openclaw.ai/web/control-ui.md)
- [TUI](https://docs.openclaw.ai/web/tui.md)
- [WebChat](https://docs.openclaw.ai/web/webchat.md)

**Help & Debugging:**
- [FAQ](https://docs.openclaw.ai/help/faq.md)
- [Debugging](https://docs.openclaw.ai/help/debugging.md)
- [Environment Variables](https://docs.openclaw.ai/help/environment.md)
- [Troubleshooting](https://docs.openclaw.ai/help/troubleshooting.md)
