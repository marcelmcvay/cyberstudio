# Findings: Chats window

Tester B, 2026-10-11. Heuristic evaluation against `checklist.md`. Surface: the Chats window (tab strip, New chat, terminal pane, status, History, pin, color, reorder, header, Cy control) plus the Tauri shell items read from `src-tauri/src/main.rs`.

Method. Isolated preview services (throwaway project and state folders) driven with Playwright WebKit at 520x900, 1200x900 and 360x700. Mouse, keyboard (Tab, Option+Tab, Enter, Escape, app shortcuts), wheel, hover and tab drag. Contrast computed from styles against composited backgrounds. Most terminal tests used the Shell agent. One real Claude Code chat and one Claude on Strix chat were opened, then closed. A second preview simulated an unreachable Strix with `CYBERSTUDIO_STRIX_HOST=nosuchhost`. Screenshots: `scratchpad/usability/chats/` (named `NN-*.png` below, kept locally, not in the repo).

Test caveat. The preview service was started from inside a Claude Code session, so the local Claude chat inherited `CLAUDE_CODE_CHILD_SESSION` and ran with transcript saving off. That broke Working and Finished tracking for that chat. The leak itself is logged as C-26. "Code" in the evidence means the result was read from source, not watched live.

## Summary: top 5

1. **C-01 A stopped chat claims to be reconnecting.** After a CLI exits, fails to start or can't reach Strix, the pane says "Reconnecting to your conversation…" and the footer says "Reconnecting…" next to a green dot. Nothing is reconnecting.
2. **C-02 "Needs input" isn't detected for Claude or Codex.** A Claude chat on its folder-trust prompt shows "Ready", local and on Strix. Permission prompts never produce the waiting state.
3. **C-03 Claude on Strix has no activity tracking.** It never shows Working, Finished or unread, and shows "Ready" while SSH is still connecting.
4. **C-05 Closing a tab kills running work with no warning.** One click on a 21px × (or Ctrl+Shift+W) ends the process. Cmd+Q and the tray Quit do the same to every chat (C-07).
5. **C-06 The terminal is a keyboard trap.** Tab, Shift+Tab, Option+Tab and Escape all stay in xterm.

Counts by severity: 4: 0 · 3: 7 · 2: 23 · 1: 9 · total 39. Obvious fixes: 18.

## What works well

- **Paste an image.** A pasted PNG is saved to `inbox/attachments/<date>/`, its quoted path goes into the prompt in about 150 ms, and the status line confirms it.
- **Tab reorder.** Ghost and drop marker, respects pinned groups, persists; Escape cancels.
- **New chat dialog basics.** Autofocus on name, Escape closes and returns focus, input kept after an error, bypass off by default, Shell hides options that don't apply.
- **History reopen is fast and keeps the screen.** A closed shell came back in 130 ms with its scrollback. Pinned chats sort first.
- **Labels and focus.** Tabs carry an aria-label and tooltip with name, state, folder and a drag hint. Buttons get a visible focus outline.
- **Clean process lifecycle.** Closing chats and killing the service left no stray local shells and no remote `claude` process.

## Findings

Order: severity, then surface. "Obvious fix?" is yes only when the fix is low risk, local, clearly correct and needs no product decision.

| id | checks | sev | where | evidence (short) | suggested fix | effort | obvious |
|---|---|---|---|---|---|---|---|
| C-01 | H1.1 H9.2 X1 G4 | 3 | Terminal pane reconnect bar and footer, any ended chat | After `exit`, tab says Stopped but pane says "Reconnecting to your conversation… [Reconnect]" and footer "Reconnecting…" with a green dot, indefinitely. Same on Strix exit and unreachable host. Chats.tsx shows `restoreError \|\| 'Reconnecting…'` for every non-running status. (22, 35, 37) | Word by state: "Ended · exit 0", "Could not start: <reason>", "Restoring…". Button "Restart" / "Resume conversation". Keep "Reconnecting" for WebSocket loss only. | S | yes |
| C-02 | H1.2 X1 X4 H8.1 | 3 | Tab status, Claude Code and Codex | Claude chat on the trust prompt read "Ready" for 12 s, local and Strix (27, 34). native-events.mjs only emits attention for a Claude api_error; tool permission prompts and Codex approvals never set waiting. A Claude chat blocked on tool approval shows "Working". | Feed waiting state from the CLIs' notification hooks (Claude Code Notification hook, Codex notify); fallback: match prompt footers. Waiting outranks everything. | M | no |
| C-03 | H1.1 H1.3 X1 X3 | 3 | Claude on Strix tabs and Activity | "Ready" with a blank pane during SSH connect, "Ready" on the trust prompt (33, 34). sessions.mjs has no watcher for `strix`. | "Connecting to Strix…" until first output; remote turn state by tailing the remote transcript over SSH or a hook printing an OSC marker. | M | no |
| C-04 | H9.1 H9.2 H9.5 H1.3 | 3 | Claude on Strix, host unreachable | Raw `ssh: Could not resolve hostname…`, bar says Reconnecting, Reconnect repeats it (36, 37). Mid-session drop detected only after about 90 s (ServerAliveInterval 30). | On ssh exit 255: "Can't reach Strix. Check that it is on and Tailscale is connected." + Retry, raw line under Details. ServerAliveInterval 10, CountMax 2. Say whether the remote conversation can resume. | S | no |
| C-05 | H3.2 H5.2 M5 | 3 | Tab ×, Ctrl+Shift+W, "Close tab · keep in History" | Closing a shell running `sleep 30` gives no prompt; reopen shows `zsh: warning: 1 jobs SIGHUPed` (21). remove() kills a working agent mid-turn. × is 21x23 px next to the name. | Confirm only when Working or a foreground child runs: "Claude is still working in <name>. Stop it and close?" | S | no |
| C-06 | A5 A4 H7.1 | 3 | Terminal focus | Tab, Shift+Tab, Option+Tab, Escape stay in xterm; terminal also grabs focus on window focus. Chat options, Attach, header unreachable without mouse. | A documented key to move focus to the tab strip (e.g. Ctrl+F6 or Cmd+Shift+L), shown in the terminal tooltip; a Chat options shortcut. | S | no |
| C-07 | M5 H3.2 | 3 | Cmd+Q (default menu) and tray Quit | main.rs builds no app menu; Quit and tray Quit exit, killing every terminal with no warning (code). | On quit with chats Working or Waiting, a native confirm listing them; "Quit anyway". | S | no |
| C-08 | H7.2 A4 | 2 | Find a chat (Ctrl+Shift+P) | Enter and ArrowDown+Enter do nothing; Tab jumps into the terminal with the switcher open (17b). Mouse only. | Highlight first match, arrows move, Enter opens, Escape closes and returns focus. | S | yes |
| C-09 | H2.1 M2 | 2 | Footer and New chat copy on macOS | Footer "Windows" for Shell and "Ctrl+V · image" (Cmd+V works, Ctrl+V does nothing). Tooltips "Ctrl+V for screenshots", "Same Windows account", "Explorer" (07, 02). | Platform-aware labels: "zsh", "Cmd+V · image", "your Mac account", "Finder". | S | yes |
| C-10 | H4.5 | 2 | Terminal, agent chats on macOS | TerminalPane treats Ctrl+C as copy only in agent chats, never sends ETX (code). | On macOS pass Ctrl+C to the CLI; copy stays Cmd+C. | S | no |
| C-11 | M2 H7.1 | 2 | App shortcuts on macOS | New/find/History/close are Ctrl+Shift+T/P/H/W; Cmd+W hides the whole Chats window; Cmd+K doesn't clear (11). | Map Cmd+T, Cmd+W (close tab), Cmd+K, Cmd+Shift+[ ] on macOS. | M | no |
| C-12 | H7.2 M2 | 2 | Alt+1..9 tab shortcut | Chats.tsx tests `event.key`; Option+1 is "¡" on macOS US, so it never fires (code). | Match `event.code` /^Digit[1-9]$/. | S | yes |
| C-13 | H5.3 H4.2 A3 | 2 | Colored tabs | A colored unselected tab looks more selected than the real selection (44). | Tab color as stripe or dot; filled background for selection only. | S | no |
| C-14 | H8.1 H7.4 | 2 | Tab strip at narrow widths | 8 chats: strip 157 px at 520 wide, 271 of 700 px at 360 wide (43, 45). | One scrolling row with an overflow list, or a vertical rail past about 5 chats. | M | no |
| C-15 | H1.1 A3 X1 | 2 | Tab glyphs | Stopped looks like running; Shell never shows Working; unread/waiting marks are tiny color-only overlays (22). | Distinct shapes per state: dimmed for stopped, spinner working, "!" waiting, dot unread; text badge when wide. | S | no |
| C-16 | H9.1 H9.2 | 2 | New chat, working folder errors | Missing folder gives raw "ENOENT: no such file or directory, stat …" (23). | "That folder doesn't exist: <path>", point at the field. | S | yes |
| C-17 | G6 H6.1 | 2 | New chat, working folder field | No Browse button; long default path truncated (02). | Choose folder button (native picker exists) + recent folders. | M | no |
| C-18 | H9.2 G6 H6.6 | 2 | History, missing native conversation | Banner "The native conversation could not be located…" with no chat name, tab doesn't open, covers the History button (47). | Open read-only with saved screen + "Start a new conversation here" / "Pick a conversation"; name the chat. | M | no |
| C-19 | A4 H7.2 | 2 | History search | Enter does nothing with one result; no arrow navigation; terminal content not searched. | Enter opens top result; arrows move. | S | yes |
| C-20 | H9.4 H1.1 | 2 | Terminal while the service is down | Banner appears; typing is silently dropped; New chat Open disabled with no reason; never escalates (38, 39). | "Offline: typing paused" overlay or buffer input; after 30 s "The CyberStudio service stopped" + Restart. | S | no |
| C-21 | A4 A7 H3.5 | 2 | New chat dialog semantics | No role="dialog"/aria-modal, background not inert; Bypass checkbox unreachable by Tab in WebKit; agent picker before the autofocused field. | role="dialog", aria-modal, aria-labelledby, focus trap, picker as a radio group, check the checkbox tab stop. | S | no |
| C-22 | A1 | 2 | Footer, menus, empty state | Contrast: footer 2.39:1 at 9 px, empty-state line 3.37:1 at 10 px, menu label 3.36:1 at 9 px, History footer 4.04:1, context folder 4.36:1. Labels 8-9 px. | Muted text token to 4.5:1 or more; 11 px minimum for UI text. | S | yes |
| C-23 | H1.8 H8.5 | 2 | Cy voice control in Chats header | Same eye as the brand mark, reads as decoration; Chats CSS hides the state label and wave; on vs off is a faint tint (01, code). | Mic glyph with clear on/off; short "Listening" or pulsing ring. | S | no |
| C-24 | M1 M3 M5 | 2 | Menu bar | Default Tauri menu: no New Chat, History, Find, Close Tab, Show Workspace; Cmd+W hides the whole window (code). | Real menu: File (New Chat, Close Tab Cmd+W, Close Window Cmd+Shift+W), View (History, Find), Window (Chats, Workspace), Help. | M | no |
| C-25 | M4 H3.1 | 2 | Dock icon with windows hidden | No RunEvent::Reopen handler, so Dock click does nothing (code). | Handle Reopen: recall_open_windows / reveal("chats"). | S | yes |
| C-26 | H1.1 G4 | 2 | Env passed to child Claude chats | When CyberStudio starts from a Claude Code terminal, CLAUDE_CODE_CHILD_SESSION, CLAUDE_CODE_SESSION_ID, CLAUDE_CODE_MESSAGING_*, CLAUDE_PID leak; child prints "Transcript saving is off", status and resume break (31, 47). | Strip those named variables in agents.mjs childEnvironment (named only, keep provider settings). | S | yes |
| C-27 | X6 H5.1 | 2 | Reasoning effort | Claude and Strix chats start at xhigh; no picker in New chat; footer value not clickable. | Effort picker in New chat (remember last); footer opens it. | S | no |
| C-28 | H1.1 H9.2 X6 | 2 | Claude on Strix context bar | Shows local folder name while the remote fell back to the remote home folder (34). | Show the remote folder used; say when it fell back. | S | no |
| C-29 | X2 X4 H6.6 | 2 | Cy panel Activity | Cross-session attention list two clicks deep; user closes logged as "exited (1)"; count never clears (25). | A "Needs you" count in the tab row that filters; skip user-initiated closes; unread-only count. | M | no |
| C-30 | H4.1 | 2 | Header pin vs tab pin | Same pin icon for always-on-top and Pin in History; Pin also moves the tab to the front (14). | Different always-on-top icon; "Pin tab (stays first)". | S | no |
| C-31 | H9.1 H5.4 | 1 | Working folder | `~/Desktop` not expanded, fails with ENOENT. | Expand a leading ~. | S | yes |
| C-32 | H3.5 H8 | 1 | Chat options menu | Stays open after Save/Pin; outside click doesn't close; covers the terminal (12). | Close on outside pointerdown and after one-shot actions. | S | yes |
| C-33 | H10.5 H4.1 | 1 | History filters | No Shell or Kimi filter; empty filter text reads as empty History (20). | Filters from agents present; "No Claude conversations yet." | S | yes |
| C-34 | H4.1 | 1 | Cy voice button label | Visible label reads "Talk to Mak" while tooltip says "Talk to Cy" (code). | "Talk to Cy". | S | yes |
| C-35 | H3.5 | 1 | Cy panel | Escape doesn't close it. | Escape closes, focus returns to the toggle. | S | yes |
| C-36 | A8 H3.5 | 1 | Tab close by keyboard | Focus drops to body after closing. | Focus the newly selected tab or its terminal. | S | yes |
| C-37 | A4 A7 | 1 | Tab strip keyboard model | Two tab stops per tab; arrows do nothing. | Roving tabindex with Left/Right; Delete or Cmd+W closes. | S | yes |
| C-38 | H10.5 H9.2 | 1 | Empty state and agent picker | Empty state lists agents regardless of install; "Not installed" with no hint; Strix says Not installed when Host strix is missing (01). | List available agents; per-agent hint ("Add Host strix to ~/.ssh/config"). | S | yes |
| C-39 | H4.5 | 1 | Terminal | Cmd+K does nothing (11). | Bind Cmd+K to clear scrollback. | S | yes |

## Cleanup

All test chats were closed, both preview services were killed. No local `claude`, `ssh -tt` or test shell processes remain. Remote `Get-Process claude` on the Strix returned nothing. The Strix trust prompt was declined, so nothing was written to the remote trust settings.
