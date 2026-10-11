# CyberStudio usability checklist

## Summary

1. This is a heuristic evaluation checklist for CyberStudio. One primary user: a design director running several agent sessions and reviewing images and 3D assets.
2. Spine: Nielsen Norman Group's 10 Usability Heuristics. Each gets a plain summary and testable checks (H1.1 to H10.x).
3. Extra sections cover gaps the heuristics leave: Shneiderman's Golden Rules (G*), macOS conventions (M*), WCAG 2.2 AA (A*), and multi-agent supervision (X*).
4. Every check is pass/fail. Test it in the running app, not from memory.
5. The biggest risk area is H1. Parallel agents fail silently when state is hidden.
6. Second biggest is H3 and H5. Agents spend money and touch files. Stops, undo, and confirmations matter.
7. Spend is system status. Treat cost readouts with the same rigor as progress.
8. Rate severity afterward, not during the walkthrough. NNG says to rate in a separate pass.
9. Use the NNG 0 to 4 scale. Average at least three raters when possible. One rater is unreliable.
10. Severity weighs frequency, impact, and persistence. Our user repeats tasks daily, so persistence weighs heavily.
11. Log each finding with the template at the bottom. One problem per finding.
12. Cite the check ID. A finding without a check ID is fine, but say which heuristic it breaks.
13. Fix order: severity 4 and 3 first, then cheap 2s. Cosmetic 1s ride along.
14. Sources are listed at the end. Wording is ours. Guidance is theirs.
15. Total checks: 106 (H 71, G 6, M 9, A 13, X 7).

## How to use

Walk the core tasks first: start a session, juggle three sessions, intake a file, review an asset, read a report tab, check spend, recover from an error. Mark each check Pass, Fail, or N/A. Log every Fail as a finding.

---

## H1. Visibility of system status

Tell the user what is happening, fast. Feedback within about 0.1s feels instant. Past 1s, show something. Past 10s, show progress and a way to stop.

- **H1.1** Every agent session in the Chats rail shows its state (working, needs input, done, failed, disconnected) without opening it.
- **H1.2** A session waiting on a permission prompt or question is visually distinct from one that is merely idle.
- **H1.3** The remote GPU session shows connection health. A dropped link is visible within a few seconds, not discovered on the next keystroke.
- **H1.4** Any operation longer than about 10s (generation, upload, mesh load, report render) shows progress or named steps, plus a cancel.
- **H1.5** Every click on a primary action gives feedback within about 100ms (pressed state, spinner, or result).
- **H1.6** The spend readout shows current spend, the period it covers, and when it last updated. Stale data is labeled stale.
- **H1.7** Inbox and link intake confirm what landed and where (project, card, file path).
- **H1.8** Cy shows listening, thinking, speaking, and off states clearly. The mic state is never ambiguous.

## H2. Match between system and the real world

Use the director's words, not the codebase's. Order things the way the work flows.

- **H2.1** Labels use studio vocabulary (review, approve, revise, final) rather than internal names (sidecar, worktree, PTY) unless the user chose them.
- **H2.2** Asset status values match a real review pipeline and read in pipeline order (e.g. draft, in review, approved, final).
- **H2.3** Cost shows in currency, not tokens or credits only. Raw units are secondary.
- **H2.4** Provenance reads as a sentence a person could repeat: which model, which prompt, which session, when.
- **H2.5** Mesh stats use terms a 3D artist expects (tris, verts, materials, texture size) with units.
- **H2.6** Icons for session types (Claude Code, Codex, remote GPU) are distinguishable and labeled on first view.
- **H2.7** Dates and times are local and relative where it helps ("4 min ago"), absolute on hover.

## H3. User control and freedom

People change their minds. Give a clear exit and a way back.

- **H3.1** Any running agent session can be interrupted from the rail or the session header in one action, without closing the terminal.
- **H3.2** Closing a tab or session that has unsaved or running work warns first, and says what will be lost.
- **H3.3** Deleting or archiving a card, asset, or report is undoable for at least the session, or goes to a recoverable trash.
- **H3.4** Metadata edits in the Properties panel support Cmd+Z undo, with more than one step.
- **H3.5** Escape closes any modal, popover, or overlay and returns focus to where it was.
- **H3.6** Cy can be silenced or stopped instantly by key or click, mid-sentence.
- **H3.7** The 3D viewer has a one-step reset view. Camera changes never feel stuck.
- **H3.8** Accidental intake (wrong file, wrong link) can be removed from the inbox without hunting.

## H4. Consistency and standards

Same thing, same name, same place. Follow macOS and pro-tool norms unless there is a strong reason not to.

- **H4.1** One name per concept across rail, cards, tabs, menus, and Cy (e.g. "session" never also "chat", "agent", or "terminal" for the same thing).
- **H4.2** The same status uses the same color, icon, and label in the rail, the cards, and the Properties panel.
- **H4.3** Primary and destructive buttons sit in the same position in every dialog.
- **H4.4** Tabs (report, 3D, terminal) share open, close, reorder, and pin behavior.
- **H4.5** Terminal tabs respect standard terminal keys (Ctrl+C interrupts, Cmd+C copies a selection, Cmd+K or equivalent clears) and the app never steals them.
- **H4.6** 3D viewer navigation matches a common DCC convention (orbit, pan, zoom) and says which.
- **H4.7** Markdown and HTML reports render with the same type scale and spacing as the rest of the app.

## H5. Error prevention

Prevent costly mistakes first. Constraints, good defaults, and warnings before risk.

- **H5.1** Actions that spend real money above a set threshold show the estimated cost before running.
- **H5.2** Destructive actions (delete project, kill remote session, overwrite asset) are visually separated from frequent actions and need a confirm that names the target.
- **H5.3** Input to the wrong session is hard: the focused session is unmistakable before typing.
- **H5.4** File intake checks type and size up front and refuses unsupported files before upload starts.
- **H5.5** Status fields use pickers, not free text. Sensible defaults are prefilled.
- **H5.6** Two sessions writing to the same project or file get a visible conflict warning.
- **H5.7** Confirm dialogs are rare enough to stay meaningful. Routine reversible actions use undo instead.

## H6. Recognition rather than recall

Show options. Do not make the user remember IDs, paths, or which session did what.

- **H6.1** Each session shows a human title, project, and last activity. The user never needs a session ID to find one.
- **H6.2** Recently opened projects, assets, and reports are one click away.
- **H6.3** Every asset links back to the session and prompt that made it, from the Properties panel.
- **H6.4** Icon-only controls have text labels or tooltips with the shortcut.
- **H6.5** A command palette or searchable menu lists every command with its shortcut.
- **H6.6** Returning to a session shows what happened while away (summary, last output, pending question) at the top.
- **H6.7** Cy's available commands are discoverable in the UI, not only by asking Cy.

## H7. Flexibility and efficiency of use

Fast paths for the expert. Never at the cost of the obvious path.

- **H7.1** Every frequent action (new session, switch session, next asset, approve, open spend) has a keyboard shortcut.
- **H7.2** Sessions can be switched by number or fuzzy search without the mouse.
- **H7.3** Multiple assets can be selected and status-changed in one action.
- **H7.4** Window layout, panel sizes, open tabs, and rail order persist across restarts.
- **H7.5** The user can rebind or disable shortcuts that clash with their tools.
- **H7.6** Last-used choices (sort order, filter, viewer settings) are remembered.
- **H7.7** Asset review supports arrow-key next/previous with no extra clicks.

## H8. Aesthetic and minimalist design

Dense is fine. Noise is not. Every element earns its place. The most important thing is the most visible.

- **H8.1** In the default view, the thing needing attention (a blocked session, a failed job) is the most prominent element on screen.
- **H8.2** The Properties panel shows key fields first and tucks rare fields behind disclosure.
- **H8.3** Color carries meaning (status, selection, error) and is not spent on decoration.
- **H8.4** Generated images and 3D assets get the visual weight. Chrome recedes during review.
- **H8.5** No element looks clickable that is not, and no clickable element looks static.
- **H8.6** A focus or review mode can hide rails and panels in one action.

## H9. Help users recognize, diagnose, and recover from errors

Plain words, the exact problem, a way out. Keep the user's work.

- **H9.1** Agent and API errors appear in plain language first. Raw codes and stack traces sit behind a "details" toggle.
- **H9.2** Errors say what failed, which session or asset it affects, and what to do next.
- **H9.3** Failed generations offer one-click retry with the same inputs.
- **H9.4** A failed send or intake preserves the user's typed prompt or dropped files.
- **H9.5** Lost remote connections offer reconnect and resume, and say whether work in progress survived.
- **H9.6** Error severity matches presentation: inline for minor, modal only when work is blocked.
- **H9.7** Errors are marked by icon and text, not color alone.
- **H9.8** Budget or quota exhaustion says which service, the limit, and how to proceed.

## H10. Help and documentation

Best is no help needed. When needed, short, searchable, and in context.

- **H10.1** A first-run state explains the rail, workspace, and inbox in a few lines and is easy to skip.
- **H10.2** Tips appear in context (pull), for example on first use of the 3D viewer, not as a launch tour (push).
- **H10.3** A shortcut reference is reachable from the Help menu and by key.
- **H10.4** Help is searchable and task-based ("connect the GPU box", "set a spend limit"), with numbered steps.
- **H10.5** Empty states (no sessions, no assets, empty inbox) say what to do next.
- **H10.6** Skipped onboarding content can be found again later.

---

## G. Shneiderman's Golden Rules (not covered above)

- **G1** Universal usability: the app works for a newcomer on day one and for the director in week ten. Check both paths on the same task.
- **G2** Closure: multi-step flows (intake to card, generate to approve) end with a clear done state.
- **G3** Feedback scales with weight: frequent small actions get subtle feedback, rare big ones (approve final, delete project) get strong feedback.
- **G4** Failed actions leave the app unchanged, or say exactly what changed.
- **G5** Internal locus of control: nothing moves, reorders, or steals focus without a user action. A new agent message never yanks focus from the session being typed in.
- **G6** No carrying data between screens: the user never copies a path, ID, or prompt from one panel to paste in another.

## M. macOS conventions (Apple HIG)

- **M1** The menu bar has App, File, Edit, View, Window, and Help menus. Every command lives in a menu.
- **M2** Standard shortcuts keep standard meaning: Cmd+Q, W, N, O, Z, Shift+Z, X, C, V, A, F, comma (Settings), H, M.
- **M3** Menu items show their shortcuts and disable when unavailable rather than failing silently.
- **M4** Windows resize freely, support full screen, and restore size and position on relaunch.
- **M5** Cmd+W closes the current tab or window. Quitting with running sessions warns and lists them.
- **M6** System notifications are used only for events that matter when the app is in the background (session blocked, job done, budget hit). They are rate limited and deep link to the right session.
- **M7** Dock badge or menu bar indicator shows the count of sessions needing input.
- **M8** The app follows system light/dark appearance and accent color, or offers an explicit override.
- **M9** Drag and drop works between Finder and the inbox in both directions where it makes sense.

## A. WCAG 2.2 AA essentials

- **A1** Text contrast is at least 4.5:1, or 3:1 for large text (SC 1.4.3). Check muted labels and terminal themes.
- **A2** UI component boundaries, focus rings, and status icons hit 3:1 against neighbors (SC 1.4.11).
- **A3** Color is never the only signal for status, selection, or error (SC 1.4.1).
- **A4** Every function works by keyboard alone (SC 2.1.1). Includes rail, cards, Properties, viewer basics, and dialogs.
- **A5** No keyboard trap (SC 2.1.2). Focus can always leave the terminal and 3D canvas with a documented key.
- **A6** Single-key shortcuts can be turned off or only fire when the relevant panel has focus (SC 2.1.4). Matters near terminals.
- **A7** Focus order follows the visual layout (SC 2.4.3).
- **A8** Focus is always visible (SC 2.4.7) and never fully hidden behind panels or overlays (SC 2.4.11).
- **A9** Pointer targets are at least 24 by 24 CSS px, or spaced so 24px circles do not overlap (SC 2.5.8). Check rail icons and tab close buttons.
- **A10** Tooltips and hover cards can be dismissed with Escape, stay while hovered, and do not vanish on their own (SC 1.4.13).
- **A11** Status changes (session done, upload complete) are announced to assistive tech without moving focus (SC 4.1.3).
- **A12** Motion respects the system Reduce Motion setting: spinners, pulses, and viewer auto-rotate calm down (prefers-reduced-motion; SC 2.3.3 is AAA, treat as best practice). Anything that auto-moves for over 5s can be paused (SC 2.2.2).
- **A13** Text scales to 200% without loss of content or function (SC 1.4.4).

## X. Multi-agent supervision (from agent-tool patterns)

Not formal standards. Patterns repeated across agent multiplexers and agent UX writing.

- **X1** Session states are few and fixed (working, needs input, done, failed). Every session is always in exactly one.
- **X2** One queue lists everything awaiting the user's decision across sessions, with jump-to.
- **X3** Indicators attach to the specific session, not just the project or window.
- **X4** Alerts are tuned: a session that needs input is never missed, and routine progress never pings.
- **X5** The user can steer a running agent (redirect, add context) without killing it.
- **X6** Each session shows what it is allowed to do (approvals, file access, spend cap) at a glance.
- **X7** Spend can be attributed per session and per project, not only as a total.

---

## Severity scale (NNG)

| Rating | Meaning |
|---|---|
| 0 | Not a usability problem. |
| 1 | Cosmetic. Fix only if time allows. |
| 2 | Minor. Low priority fix. |
| 3 | Major. Important to fix. High priority. |
| 4 | Catastrophe. Must fix before release. |

Weigh three factors: **frequency** (how often it happens), **impact** (how hard to get past), **persistence** (one-time or every time). Rate after the walkthrough, not during it. Each rater rates alone. Average three or more raters when possible.

## Recording a finding

One problem per finding. Use this template.

```
id:          F-012
checks:      H1.2, X2
severity:    3
where:       Chats rail, session row
evidence:    Remote GPU session sat on a permission prompt for 14 min. Row looked identical to an idle row. Screenshot: shots/f012.png
suggested:   Add a distinct "needs input" badge and amber row tint. Feed it to the global attention queue.
effort:      S | M | L
```

- **id**: sequential, F-001 onward.
- **checks**: one or more check IDs. Name the heuristic if no check fits.
- **severity**: 0 to 4. Leave blank until the rating pass.
- **where**: screen, panel, component, and the task in progress.
- **evidence**: what happened, steps to reproduce, screenshot or clip path.
- **suggested**: the smallest fix that solves it.
- **effort**: S under a day, M a few days, L a week or more.

---

## Sources

- NNG, 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- H1: https://www.nngroup.com/articles/visibility-system-status/
- Response time limits: https://www.nngroup.com/articles/response-times-3-important-limits/
- H2: https://www.nngroup.com/articles/match-system-real-world/
- H3: https://www.nngroup.com/articles/user-control-and-freedom/
- H4: https://www.nngroup.com/articles/consistency-and-standards/
- H5: https://www.nngroup.com/articles/slips/
- H6: https://www.nngroup.com/articles/recognition-and-recall/
- H7: https://www.nngroup.com/articles/flexibility-efficiency-heuristic/
- H8: https://www.nngroup.com/articles/aesthetic-minimalist-design/
- H9: https://www.nngroup.com/articles/error-message-guidelines/
- H10: https://www.nngroup.com/articles/help-and-documentation/
- Severity: https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/
- Shneiderman, Eight Golden Rules: https://www.cs.umd.edu/users/ben/goldenrules.html
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines/ (menus, keyboards, windows, accessibility)
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WCAG 2.5.8 Target Size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Agent multiplexer patterns: https://www.mintlify.com/manaflow-ai/cmux/features/notifications, https://dotzlaw.com/insights/claude-code-13-herdr-parallel-agent-sessions/
- Agent UX patterns: https://pub.towardsai.net/designing-for-ai-agents-8-ux-patterns-that-build-trust-in-2026-713a0c926933
