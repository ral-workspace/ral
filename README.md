<p align="center">
  <img src="packages/desktop/src-tauri/icons/128x128@2x.png" width="128" alt="Ral" />
</p>

<h1 align="center">Ral</h1>

<p align="center">
  <strong>AI Workspace for Everyone</strong><br/>
  Chat, workflows, documents, and tools — all in one native desktop app.
</p>

<p align="center">
  <a href="https://github.com/cohaku-ai/ral/releases"><img alt="Release" src="https://img.shields.io/github/v/release/cohaku-ai/ral?color=%23D97706&labelColor=%2327272a"></a>
  <a href="https://github.com/cohaku-ai/ral/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-%23D97706?labelColor=%2327272a"></a>
  <a href="https://github.com/cohaku-ai/ral"><img alt="GitHub stars" src="https://img.shields.io/github/stars/cohaku-ai/ral?color=%23D97706&labelColor=%2327272a"></a>
</p>

<br/>

<!-- TODO: Add screenshot here -->
<!-- <p align="center"><img src=".github/screenshot.png" width="720" alt="Ral screenshot" /></p> -->

## What is Ral?

Ral is a desktop AI workspace built for **business users, not developers**. It combines a Claude-powered AI assistant with productivity tools — workflows, databases, presentations, and spreadsheets — in a fast, native app powered by Tauri v2.

No terminal. No config files. Just open and work.

### Highlights

- **AI Chat** — Claude-powered assistant via [ACP](https://github.com/anthropics/agent-control-protocol) with tool use, file editing, and MCP integration
- **Workflows** — Automate multi-step AI + MCP pipelines with simple YAML definitions
- **Plugins** — Extend with [first-party plugins](https://github.com/cohaku-ai/ral-plugins) for databases, presentations, spreadsheets, and more
- **Native & Fast** — Rust backend via Tauri v2. No Electron. Lightweight and responsive
- **Open Source** — Apache 2.0 licensed. Build on it, extend it, make it yours

## Getting Started

### Prerequisites

| Tool | Version |
| --- | --- |
| [Node.js](https://nodejs.org/) | >= 20 |
| [pnpm](https://pnpm.io/) | >= 10 |
| [Rust](https://rustup.rs/) | stable (latest) |
| [Tauri CLI](https://v2.tauri.app/) | v2 |

Platform-specific dependencies are listed in the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

### Install & Run

```bash
git clone https://github.com/cohaku-ai/ral.git
cd ral
pnpm install
pnpm dev
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| UI | Tailwind CSS v4 + shadcn/ui |
| Editor | CodeMirror 6 |
| AI | Claude via ACP (Agent Control Protocol) |
| Build | pnpm workspaces + Turborepo |

## Project Structure

```
packages/
  desktop/     Tauri desktop app (Rust + React)
  ui/          Shared UI component library
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

To report vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE)
