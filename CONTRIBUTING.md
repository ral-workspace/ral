# Contributing to Ral

Thank you for your interest in contributing to Ral! This document provides guidelines to help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork and install dependencies:
   ```bash
   git clone https://github.com/<your-username>/ral.git
   cd ral
   pnpm install
   ```
3. Create a branch for your change:
   ```bash
   git checkout -b my-feature
   ```
4. Run the app in development mode:
   ```bash
   pnpm dev
   ```

## Prerequisites

See the [README](README.md#prerequisites) for required tools and versions.

## Development Workflow

### Type Check

```bash
pnpm typecheck
```

### Lint

```bash
pnpm lint
```

### Rust Check

```bash
cd packages/desktop/src-tauri
cargo check
```

## Submitting Changes

1. Ensure `pnpm typecheck` passes
2. Commit your changes with a clear, descriptive message
3. Push to your fork and open a Pull Request against `main`
4. Describe what your PR does and why

## Reporting Issues

- Use [GitHub Issues](https://github.com/ral-workspace/ral/issues) to report bugs or request features
- Include steps to reproduce, expected behavior, and actual behavior
- Include your OS, Node.js version, and Rust version if relevant

## Code Style

- TypeScript: follow existing patterns in the codebase
- Rust: use `cargo fmt` and `cargo clippy`
- Keep changes focused — one concern per PR

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
