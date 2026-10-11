# Usability backlog

From the heuristic pass of 2026-10-11 (`checklist.md`, `survey.md`, `findings-workspace.md`, `findings-chats.md`). 35 obvious fixes shipped in d91df69 and a27efbf (merged d7d8494). This is everything else, for Marcel's review.

Severity is the average of two independent raters (NNG 0 to 4). "Decision" means a product call is needed before building. Effort S/M/L.

## Summary

- **36 open items** in 9 themes. 8 average severity 3, 20 at 2 to 2.5, 8 below 2.
- **The big three:** honest agent status (needs input, working, done) across every chat kind; never losing running work on close or quit; macOS-native keyboard and menus.
- **Review workflow** is where the survey's patterns land: status on the surface, undo, history, provenance you can act on.

## 1. Agent status and attention (decision: status source)

The checklist's top risk: missing a session that is blocked on you.

| id | title | sev | effort | suggestion |
|---|---|---|---|---|
| C-02 | "Needs input" never detected for Claude or Codex | 3 | M | Take state from the CLIs' own hooks (Claude Code Notification hook, Codex notify) instead of transcript guessing; waiting outranks all other states. Survey pattern 1. |
| C-03 | Claude on Strix has no activity tracking | 3 | M | "Connecting to Strix…" until first output; remote state via the same hooks printing an OSC marker the service parses, or tail the remote transcript. |
| C-15 | Stopped looks like running; marks are tiny and color only | 2 | S | One shape per state (dimmed, spinner, "!", dot) plus a text badge when wide. |
| C-29 | Cross-session attention is two clicks deep in the Cy panel | 2 | M | A "Needs you" count in the tab row that filters to waiting and unread; Dock badge. Survey patterns 2 and 3. |

## 2. Never lose running work (decision: when to confirm)

| id | title | sev | effort | suggestion |
|---|---|---|---|---|
| C-05 | Closing a tab kills a working chat with no warning | 3 | S | Confirm only when Working or a foreground child runs. Routine closes stay one click. |
| C-07 | Cmd+Q and tray Quit stop every terminal silently | 3 | S | Native confirm listing working chats, with "Quit anyway". Verify in the real app (read from code). |
| C-20 | Typing while the service is down is silently dropped | 2 | S | "Offline: typing paused" overlay or buffered input; escalate after 30 s with Restart. |

## 3. macOS keyboard and menus (decision: shortcut map)

| id | title | sev | effort | suggestion |
|---|---|---|---|---|
| C-06 | Terminal traps keyboard focus | 3 | S | A documented key to jump to the tab strip (e.g. Cmd+Shift+L), shown in the terminal tooltip. |
| C-11 | Shortcuts are Ctrl-based; Cmd+W hides the whole Chats window | 2 | M | Cmd+T, Cmd+W (close tab), Cmd+Shift+[ ] on macOS. Cmd+K already clears (shipped). |
| C-24 | No real app menu | 2 | M | File (New Chat, Close Tab, Close Window), View (History, Find), Window (Chats, Workspace), Help, with shortcuts listed. Verify in the real app. |
| C-10 | Ctrl+C never reaches the CLI in agent chats | 2 | S | Check first: Escape interrupts Claude Code, so copy-on-Ctrl+C may be deliberate. Decide per platform. |
| W-04 | Scene and compare viewers use different keys; no navigation hint | 2 | S | One key map for both viewers; dismissible "Drag orbit · Right-drag pan · Wheel zoom · R reset". |
| W-09 | Removing files needs forward Delete; no button, menu or undo | 3 | M | "Move to Trash" on row hover and a context menu, Cmd+Backspace, toast with Undo. |

## 4. Strix experience

| id | title | sev | effort | suggestion |
|---|---|---|---|---|
| C-04 | Unreachable Strix shows a raw ssh error and a looping Reconnect | 2.5 | S | On ssh exit 255: "Can't reach Strix. Check it is on and Tailscale is connected." + Retry; raw line under Details; faster keepalive. |
| C-28 | Context bar shows the local folder when the remote fell back to home | 2 | S | Show the remote folder used; say when it fell back. |

## 5. Review workflow (decision: approval model)

Survey patterns 6 to 12. Mr. Mak's rule stays: tools never approve.

| id | title | sev | effort | suggestion |
|---|---|---|---|---|
| W-12 | Status control buried under the asset detail | 2 | M | Header chip becomes the status picker; fold provenance jobs behind "7 jobs · $1.40". |
| W-13 | Status changes: no undo, no history; revert leaves approved_* | 2 | M | Toast with Undo, a status history line, clear or archive approved_* on revert. |
| W-26 | Cards show a meaningless white dot, never "in review" | 2 | M | Text chip with what needs you ("2 in review"). |
| W-15 | Provenance rows are identical; no prompt, session or re-run | 2 | M | Prompt excerpt and output thumbnail per job, link the session, "Copy job to chat". |
| W-11 | Readout spend and Properties spend disagree | 2 | M | Rename the Properties figure "Asset cost (est.)" and show the unlinked remainder. |
| W-14 | Review notes cannot be edited or removed | 1.5 | M | Edit own note for a short window, or retract with strike-through. |
| W-17 | Intake success has no next step | 1 | M | "Preview · Open in Properties"; later a triage strip (assign to card, set status). |

## 6. Layout and visual hierarchy (decision: Cy placement)

| id | title | sev | effort | suggestion |
|---|---|---|---|---|
| W-18 | Floating Cy eye covers content at every width | 2 | M | Reserve a gutter, dock it in the right rail, or fade over canvas and cards. You chose to keep it floating; revisit with this evidence. |
| W-23 | Narrow widths: compare toolbar clips, panes collapse | 2 | M | Wrapping mode bar, stats under titles below 1000 px, minimum pane height. |
| C-13 | A colored tab looks more selected than the real selection | 2 | S | Tab color as a stripe or dot; fill for selection only. |
| C-14 | Tabs wrap to many rows at narrow widths | 2 | M | One scrolling row with an overflow list, or a vertical rail past about 5 chats. |
| C-23 | Cy voice control reads as decoration; state invisible in Chats | 2 | S | Mic glyph with clear on/off and a short "Listening". |
| C-30 | Same pin icon for always-on-top and pin tab | 1.5 | S | Different always-on-top icon; "Pin tab (stays first)". |

## 7. New chat and history

| id | title | sev | effort | suggestion |
|---|---|---|---|---|
| C-18 | Missing native conversation: tab won't open, unnamed banner | 2 | M | Open read-only with the saved screen; "Start a new conversation here" / "Pick a conversation". C-26's env fix should prevent most cases. |
| C-21 | New chat dialog lacks dialog semantics and a focus trap | 2 | S | role="dialog", aria-modal, focus trap, agent picker as a radio group. |
| C-17 | No folder picker | 2 | M | Choose folder button and recent folders. |
| C-27 | No reasoning effort control; every chat starts at xhigh | 2 | S | Effort picker in New chat (remembered); footer opens it. |

## 8. Help

| id | title | sev | effort | suggestion |
|---|---|---|---|---|
| W-21 | Help has no Workspace topics, search or shortcut list; opens editable | 2 | M | Task sections (review an asset, read spend, viewer keys, shortcuts); open read-only. |

## 9. Engineering follow-ups

| item | sev | effort | note |
|---|---|---|---|
| C-22 | Chats contrast: re-check footer, menus and empty state after the W-07 token change | 2 | S | The shared muted token was raised; Chats uses some literal colors. |
| CSP blocks WebAssembly | 2 | S | Draco or meshopt GLBs would fail. Decision: add `wasm-unsafe-eval` before compressing assets. |
| Amber-on-amber in light theme | 1 | S | "pinned" chip 3.96:1, Properties review counts 4.45:1. |
| C-01 follow-up | 1 | S | A failed reopen from History still uses the old banner. |
| Scene readout default | 1 | S | Collapse to totals by default? (W-28 shipped as remembered toggle, default expanded.) |
| Project help copies | 1 | S | Projects keep their own `workspace/_shared/help.md`; refresh on launch or link it. |
| UI test suites need msedge | 1 | S | `desktop:test:ui` launches the msedge channel; switch to WebKit (the real engine). |
| `test:template` .mcp.json mismatch | 1 | S | Pre-existing; the template check expects the upstream .mcp.json. |
