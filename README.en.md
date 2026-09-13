<div align="center">

# Spherse Extended

[中文](README.md)｜EN

**A local-first, ready-to-use personal Agent runtime.**

Multiple Agents with independent identities, permissions, skills, and automation capabilities work around the same user data space; HTML and the UI SDK then combine Agents and data into genuinely interactive apps.

> This repo is a feature-extended fork of [mengrru/Spherse](https://github.com/mengrru/Spherse): everything upstream can do, plus the "Extended features" below. The original upstream intro lives in [README_origin.en.md](README_origin.en.md). Same license as upstream (MIT).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<img src="packages/landing/public/screenshots/screenshots-collage.png" alt="Spherse screenshots" />

</div>

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

## Download and install

Get the latest release from [Releases](https://github.com/Thys1a/Spherse-extended/releases):

- **macOS**: download the `.dmg` for your arch and drag it into "Applications"
- **Windows**: download the `.exe` installer and run it

> [!NOTE]
> macOS builds are not yet signed with an Apple Developer certificate. If the first launch reports damage or an unverified developer, run:
>
> ```bash
> xattr -cr /Applications/Spherse.app
> ```

Then configure a supported LLM provider API key to create projects and Agents.

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
npm run build       # build all packages
npm run verify      # lint, build, unit tests, and i18n checks
npm run verify:e2e  # full checks + Electron E2E
npm run dist        # package an installer for the current platform
```

The repo uses npm workspaces:

| Package | Responsibility |
| --- | --- |
| `@spherse/core` | Agent, Session, Skill, Tool, Trigger, and local data runtime |
| `@spherse/server` | Fastify HTTP/WebSocket API and runtime contracts |
| `@spherse/app` | Shared React renderer for desktop and web |
| `@spherse/desktop` | Electron main process, preload, IPC, and desktop infra |
| `@spherse/web` | Mobile Web/PWA host |
| `@spherse/presets` | Builtin templates, skills, and sample content |
| `@spherse/i18n` | i18n infrastructure and locales |

Architecture and data conventions: [`docs/official/`](docs/official/). Dev conventions: [`AGENTS.md`](AGENTS.md).

## Tech stack

Electron · React · TypeScript · Fastify · pi-agent-core · pi-ai · MCP · SQLite · Zustand · Tailwind CSS

## License

[MIT](LICENSE). Upstream: [mengrru/Spherse](https://github.com/mengrru/Spherse).
