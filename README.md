<p align="center">
  <img src="packages/desktop/src-tauri/icons/128x128@2x.png" width="128" alt="Ral" />
</p>

<h3 align="center">AI Workspace for Everyone</h3>

<p align="center">
  <a href="https://github.com/cohaku-ai/ral/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-%23D97706?labelColor=%2327272a"></a>
  <a href="https://github.com/cohaku-ai/ral"><img alt="GitHub stars" src="https://img.shields.io/github/stars/cohaku-ai/ral?color=%23D97706&labelColor=%2327272a"></a>
</p>

---

Ral is a desktop AI workspace built with Tauri v2. It brings AI-powered tools — chat, workflows, databases, presentations, and spreadsheets — into a single native app designed for business users.

## Key Features

- **AI Chat** — Claude-powered assistant via ACP (Agent Control Protocol)
- **Workflows** — Automated MCP + AI pipelines defined in YAML
- **Plugins** — Extensible via [Claude Code plugins](https://github.com/cohaku-ai/ral-plugins) (database, presentation, spreadsheet, workflow)
- **Native Performance** — Tauri v2 (Rust) backend with React frontend

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Desktop** | Tauri v2 (Rust) |
| **Frontend** | React + TypeScript + Vite |
| **UI** | Tailwind CSS v4 + shadcn/ui |
| **Editor** | CodeMirror 6 |
| **AI** | Claude Code via ACP |
| **Build** | pnpm workspaces + Turborepo |

## Project Structure

```
packages/
  desktop/     Tauri desktop app
  ui/          Shared UI components
```

## Prerequisites

| Tool | Version |
| --- | --- |
| [Node.js](https://nodejs.org/) | >= 20 |
| [pnpm](https://pnpm.io/) | >= 10 |
| [Rust](https://rustup.rs/) | stable (latest) |
| [Tauri CLI](https://v2.tauri.app/) | v2 |

Platform-specific dependencies (system libraries, etc.) are listed in the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

## Development

```bash
pnpm install
pnpm dev
```

### Tauri dev (with native window)

```bash
cd packages/desktop
pnpm tauri dev
```

### Type check

```bash
pnpm typecheck
```

## License

[Apache License 2.0](LICENSE)
