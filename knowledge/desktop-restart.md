# Restarting CyberStudio from an agent

An agent opened in Chats runs as a child of the CyberStudio service
(app → `runtime/node` → `claude`). Quitting the app ends that agent, so:

- Ask before restarting (AGENTS.md), and say the chat will close.
- Do the observable work first: `npm run desktop:prepare` only writes
  `.cache/desktop-runtime/` and `dist/`, which the running app does not use.
- Leave the rest to a detached process started in a new session
  (`os.setsid`), for example `.cache/restart-studio.sh <app pid>`: quit the app,
  `cargo build` in `src-tauri` (Tauri copies the staged runtime into
  `target/debug/runtime/` there), then `scripts/studio --kit`.
- `scripts/studio` without an argument opens `CYBERSTUDIO_PROJECT_ROOT`, which
  needs its own `workspace/workspace.json`. Use `--kit` to keep the kit's cards.
- Reopen the conversation afterwards from History in Chats.
