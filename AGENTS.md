# Agent notes

- Architecture mirror of local `~/Code/dsh-bot`; this tree is an **empty shell**.
- Do not port DeepSeek / dsh-bot business logic unless explicitly tasked.
- Leave `design/wireframes/` alone unless the task is wireframe work.
- JS: Bun workspaces (`apps/*`, `packages/*`). Rust: Cargo workspace (`apps/client`, `apps/host`, `apps/relay`).
- Lightest proof: `bun install && bun run check`.
