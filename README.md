# Helm

AI-native code editor built with Tauri v2.

## Tech Stack

- **Desktop**: Tauri v2 (Rust) + React + TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Editor**: CodeMirror 6
- **AI**: Claude Code via ACP (Agent Control Protocol)
- **Build**: pnpm workspaces + Turborepo

## Project Structure

```
packages/
  desktop/     Tauri desktop app
  ui/          Shared UI components
```

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

Apache License 2.0 - see [LICENSE](LICENSE) for details.
