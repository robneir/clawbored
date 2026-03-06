# Deployer Architecture — UPDATED

## Critical Insight
Users do NOT have OpenClaw installed yet when they first use Clawboard.
We CANNOT use `openclaw agent` to set up OpenClaw — chicken-and-egg problem.

## Auth Flow
1. User opens Clawboard (standalone Next.js app)
2. User connects their AI provider:
   - **Anthropic Claude**: OAuth flow or API key paste
   - **OpenAI**: API key paste
   - **OpenRouter**: API key paste
3. Clawboard stores the credential securely (encrypted in ~/.clawboard/auth.json)
4. Clawboard calls the Anthropic API (or OpenAI API) DIRECTLY to spawn an agent
5. That agent uses tool_use (shell commands) to install and configure OpenClaw

## Deploy Flow (Agent-Driven via Direct API)
1. User fills in: instance name, template
2. Clawboard creates a conversation with Claude via the Anthropic Messages API
3. The system prompt instructs Claude to:
   - Fetch the latest OpenClaw docs
   - Install OpenClaw if not present (`npm install -g openclaw@latest`)
   - Run `openclaw --profile <name> onboard` with appropriate flags
   - Configure the gateway port
   - Start the gateway
   - Report back with connection details
4. Claude's responses are streamed to the frontend as deployment logs
5. Shell command execution happens server-side (Clawboard runs commands that Claude requests)

## API Integration
We use the Anthropic Messages API with tool_use:
- Tool: `run_command` — executes a shell command, returns stdout/stderr
- Tool: `read_file` — reads a file and returns contents
- Tool: `write_file` — writes content to a file
- Tool: `fetch_url` — fetches a URL and returns content

The agent loop:
1. Send message to Claude with tools
2. Claude responds with tool_use blocks
3. Mission Control executes the tools
4. Send tool results back to Claude
5. Repeat until Claude sends a final text response (deployment complete)

## Settings Page
Add a /settings page where user can:
- Connect/disconnect AI providers
- Enter API keys
- See usage stats (future)

## Environment Detection
On first launch, Clawboard should check:
- Is Node.js installed? What version?
- Is OpenClaw already installed? (`which openclaw`)
- Is there an existing OpenClaw instance running?
- What OS are we on?

This info gets passed to the deploy agent so it can make smart decisions.
