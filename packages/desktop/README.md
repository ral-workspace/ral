# @ral/desktop

Ral desktop application — the main Tauri v2 app package.

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | >= 20 |
| pnpm | >= 10 |
| Rust | stable (latest) |
| Tauri CLI | v2 |

Platform-specific dependencies: see [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

## Development

```bash
# From monorepo root
pnpm install
pnpm dev          # Tauri dev with HMR

# Or from this directory
pnpm tauri dev
```

## Build

```bash
pnpm tauri build
```

Output is in `src-tauri/target/release/bundle/`.

## Type Check

```bash
pnpm typecheck
```

## Project Layout

```
src/              React frontend
  app/            Bootstrap, routing, menu handlers
  components/     UI components (chat, editor, terminal, etc.)
  hooks/          React hooks
  lib/            Utilities
  services/       Frontend services (history, terminal, etc.)
  stores/         Zustand stores (ACP, editor, workspace, etc.)
src-tauri/        Rust backend
  src/
    editor/       File I/O, search, symbols
    system/       Terminal, git, settings
    workflow/     Workflow engine (parser, scheduler, runner)
    acp/          Agent Control Protocol bridge
    mcp/          MCP client
```

## License

[Apache License 2.0](../../LICENSE)
