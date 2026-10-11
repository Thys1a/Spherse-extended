<div align="center">

# Spherse Extended

[中文](README.md)｜EN

**A local, ready-to-use personal agent runtime.**

> This repository is a feature-extended fork of [mengrru/Spherse](https://github.com/mengrru/Spherse): everything upstream can do, plus the "Extended features" below. The original upstream intro lives in [README_origin.en.md](README_origin.en.md). Same license as upstream (MIT).

Run multiple agents—with independent identities, permissions, skills, and automations—over one shared user-owned data space. Then combine those agents and data into interactive applications with HTML and the UI SDK.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<img src="packages/landing/public/screenshots/screenshots-collage.png" alt="Spherse application screenshot" />

</div>

## What is Spherse?

Spherse is not a writing tool with a fixed workflow, nor is it just another chat client. It provides the infrastructure for running agents, managing local data, and experiencing content you build yourself.

In Spherse:

- **A project folder is a shared data space.** Regular files are your data: local, inspectable, editable, portable, and owned by you.
- **Agents are independent workers.** Each agent can have its own system prompt, tool permissions, private skills, MCP servers, sessions, and chat theme.
- **Sessions are isolated task contexts.** One agent can have multiple sessions with separate tasks and histories.
- **Triggers form an automation network.** Agents can run on schedules or custom events emitted by users, pages, or other agents.
- **HTML becomes a runnable application interface.** Spherse can serve and display local HTML, while the UI SDK lets those pages read data, create sessions, send messages, and trigger agents.

A Spherse project is therefore more than a collection of chats. It can be a complete **Agent Workspace** containing user data, agents, skills, automations, themes, and interactive pages.

## What can you build?

Spherse does not prescribe a single use case. A project could be:

- A persistent worldbuilding or interactive storytelling space maintained by multiple characters
- A personal journal with dashboards, daily reports, and automated organization
- A knowledge workspace where research, summarization, and archival agents collaborate
- An event-driven AI character community or text game
- A personal tool or data application presented through custom HTML

The reusable, distributable unit is not merely a prompt. It is a complete Workspace composed of **data structures + agents + skills + automations + UI**.

## Extended features (new in this fork)

### Chat

- **Bubble context menu**: copy the selection, or insert it into the composer as a quote block for further editing.
- **Per-session model switching**: a model pill above the composer switches the session's persisted model; commands can carry a one-turn override.
- **System notifications**: pushed on approvals and trigger completion. OS notification when the window is blurred, in-app toast only when focused; events still land while minimized so nothing is lost on restore.
- **Attachments**: multi-attach images and text files (txt/md/json) via the attach button.
- **Edit and resend**: edit the last user message in place and resend it; the editor auto-grows.
- **Slash commands**: `/skill:` invokes a skill, `/command:` invokes a project-level command (with `$ARGUMENTS`/`$1..`/`@path` expansion), managed in the Commands panel.
- **Summon an Agent**: `>> <slug> <message>` hands a task to another Agent (fire-and-forget); the current session keeps a clickable summon card.
- **Pet mode**: the floating window collapses into a desktop mini window (avatar circle + mini composer). Enter via "Pet mode" in the session context menu; click the avatar to return to full mode.
- **Theming and scroll**: chat themes are isolated per session with no leaking; history scroll position and stick-to-bottom restored.
- **Embedded live chat in HTML**: drop a chat panel placeholder into an HtmlCard for a real embedded chat (streaming/retry/approvals included) following the App theme.

### Models, voice, and connectivity

- **Per-agent default model**: each Agent can pick its own model, falling back to the global default; the in-session pill switch persists to the session.
- **TTS readout**: one-click readout per message, with optional auto-read of new replies in settings (desktop).
- **Custom provider headers**: self-hosted/gateway providers can carry custom HTTP headers.
- **Proxy settings**: route model traffic through a local HTTP proxy (desktop).

### Files, tabs, and content

- **Single reuse slot for files**: left-clicking a file reuses the current content tab (no more tab sprawl); middle/right-click opens a new tab. Chat sessions still open new tabs by default.
- **Tab management**: close / close others / close all from the tab context menu; split view for two files side by side.
- **Markdown**: outline jump navigation, check/uncheck checkboxes in reading mode (saved to disk), find and replace in editing mode.
- **File list**: blank-area context menu, rename, drag-to-move, shift multi-select with batch delete.

## Builtin skills

9 builtin skills out of the box (merged in memory, updated with releases, zero project disk usage):

| Skill | Purpose |
| --- | --- |
| `spherse-guide` | Product tour and usage guide |
| `spherse-write-html` | Must-read before writing HTML: data access and App capability conventions |
| `spherse-use-ui-sdk` | `window.spherse` SDK reference |
| `spherse-build-data-app` | Data apps co-written by HTML + Agents |
| `spherse-embed-chat` | Embed a live chat panel inside a chat HtmlCard |
| `spherse-create-skill` | Hierarchy and format for custom skills |
| `spherse-create-command` | File format and placeholder expansion for custom slash commands |
| `spherse-create-ui-theme` | Project-level UI theming |
| `spherse-create-agent-chat-theme` | Agent chat window theming |

Skills merge as `agent-private > .spherse/skills > .agents/skills > builtin`; same name wins by highest priority. Sources live in `packages/presets/skills/`; custom skills go in the project's `.spherse/skills/` (managed visually in the Skills panel).

## Download and installation

Download the latest build from [Releases](https://github.com/Thys1a/Spherse-extended/releases):

- **macOS:** Download the `.dmg` for your architecture and drag Spherse into Applications
- **Windows:** Download and run the `.exe` installer
- **Linux:** Download the `.AppImage` (mark it executable and run) or the `.deb` package

> [!NOTE]
> The macOS build is not yet signed with an Apple Developer certificate. If macOS reports that the app is damaged or cannot verify the developer, run:
>
> ```bash
> xattr -cr /Applications/Spherse.app
> ```

> [!NOTE]
> Ubuntu 23.10 and newer restrict unprivileged user namespaces by default. If the Linux build reports a SUID sandbox error on first launch, run the following command first and try again:
>
> ```bash
> sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
> ```

After installation, configure an API key for a supported LLM provider, then create your first project and agent.

## Core capabilities

### Multiple agents, one shared data space

Create specialized agents around the same project. They share project files while retaining independent configurations:

- System prompts and preloaded context
- Tools and file-access permissions
- Shared project skills, private agent skills, and built-in skills
- Independent MCP server connections
- Multiple persistent sessions
- Individual chat themes

### Event-driven agent automation

Triggers allow agents to work without waiting for a new chat:

- Run on a Cron schedule
- Respond to custom events with payloads
- Execute in a new or designated existing session
- Receive events from users, HTML pages, or other agents
- Persist execution status and logs

### World books and long-term memory

- World books: attach `.card.json` character books to an agent; matching entries are injected into context automatically, and multiple agents can link to one shared book
- Long-term memory: agents remember facts across sessions with `memory_save` / `memory_recall`, and `rollback_turn` can undo a single turn's writes
- Structured data: `.data.json` files with manifest-validated reads and writes; linked HTML cards refresh as data changes

### HTML + UI SDK: from content to application

Spherse includes a local HTTP preview server for HTML, images, and other project content. User-authored pages can call runtime capabilities through the UI SDK:

- `data.get` / `data.set` / `data.delete` for project-local JSON data
- Create a session under an agent
- Send a message to a specific session
- Emit a custom agent event
- Open a project file or show content in a floating window

This enables a complete loop:

> An agent creates or updates content → HTML presents the data → the user interacts → the page calls an agent again

### Distribute the entire Workspace

Spherse treats the project folder as a complete distribution unit. Copy or share that folder and its data, agent configurations, skills, automation rules, themes, and interactive pages all travel together. When someone opens it in Spherse, they receive more than static content: they get a runnable Agent Workspace they can use and extend.

### Local-first and user-owned

- Project content is stored as regular files
- Agent configuration uses Markdown, YAML, and JSON
- Sessions are persisted in project-local SQLite databases
- AI file access is constrained by path categories and permission policies
- File tools include path-traversal protection and concurrent-write coordination
- Dangerous operations require explicit user approval

### Desktop runtime, mobile access

Spherse ships as a macOS, Windows, and Linux desktop app. A token-protected Web client can connect mobile devices to the desktop runtime. Quick Tunnel mode can establish a Cloudflare Tunnel automatically, while manual public endpoints are also supported.

## Local development

Requires Node.js 22.19+.

```bash
git clone https://github.com/Thys1a/Spherse-extended.git
cd Spherse-extended
npm install
npm run dev
```

Common commands:

```bash
npm run build       # Build all packages
npm run verify      # Lint, build, unit tests, and i18n checks
npm run verify:e2e  # Full verification plus Electron E2E
npm run dist        # Build an installer for the current platform
```

The repository uses npm workspaces:

| Package | Responsibility |
| --- | --- |
| `@spherse/core` | Runtime for agents, sessions, skills, tools, triggers, and local data |
| `@spherse/server` | Fastify HTTP/WebSocket API and runtime contracts |
| `@spherse/app` | Shared React renderer for desktop and Web |
| `@spherse/desktop` | Electron main process, preload, IPC, and desktop infrastructure |
| `@spherse/web` | Mobile Web/PWA host |
| `@spherse/presets` | Built-in templates, skills, and sample content |
| `@spherse/i18n` | Internationalization infrastructure and translations |

See [`docs/official/`](docs/official/) for architecture and data conventions, and [`AGENTS.md`](AGENTS.md) for development guidelines.

## Tech stack

Electron · React · TypeScript · Fastify · pi-agent-core · pi-ai · MCP · SQLite · Zustand · Tailwind CSS

## License

[MIT](LICENSE). Upstream: [mengrru/Spherse](https://github.com/mengrru/Spherse).
