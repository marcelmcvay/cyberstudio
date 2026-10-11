# Workspace window: heuristic findings (Tester A)

Pass date 2026-10-11. Surface: Workspace window (home grid, readout strip, card tabs, report, Markdown, compare3d and scene3d viewers, Properties, Files and link intake, Skills, MCP, Settings, Help, Cy eye, collapsed menu, theme, narrow widths). Built `./dist` served by the desktop service, driven with Playwright WebKit at 1440x900, 900x800 and 720x450 (200% zoom equivalent). Real interactions only. Contrast from computed styles with alpha compositing (WCAG ratios). The client project was opened read-only; status changes, notes and link intake ran against a copy. Severity is the tester's independent rating (NNG 0 to 4). Screenshots are kept locally in `scratchpad/usability/workspace/`, not in the repo.

## Summary: top 5

1. **W-01 Keyboard users reach nothing with Tab** (sev 3). In WebKit plain Tab moves focus nowhere; only Option-Tab works. With focus on cards there is also no visible ring (W-02).
2. **W-09 Removing intake and files depends on a Windows Delete key** (sev 3). The only remove path is forward Delete (fn+delete on a Mac laptop), announced as "Delete to Recycle Bin"; no menu, button or undo.
3. **W-06 The current asset status looks disabled** (sev 3). The selected status button is greyed out at 2.5:1.
4. **W-05 Light theme makes the Add link form unreadable** (sev 3). Labels and hints at 1.5 to 2.2:1.
5. **W-02 Home cards have no focus indicator** (sev 3). A later stylesheet overrides the card focus ring.

Counts by severity: sev 4: 0 · sev 3: 5 · sev 2: 16 · sev 1: 9 · total 30. Obvious fixes: 17 of 30.

## Findings

| id | title | checks | sev | evidence and cause | suggested fix | effort | obvious |
|---|---|---|---|---|---|---|---|
| W-01 | Plain Tab does not move focus in WebKit | A4 H7.1 | 3 | 50 Tab presses left focus on BODY; Option-Tab works. WKWebView follows the macOS "Keyboard navigation" setting, off by default, which skips links and buttons. | Enable tab focus for links and controls in the macOS webview (`WKPreferences.tabFocusesLinks`, set from the Tauri side), or explicit focus management. Retest with the system setting off. | S | yes |
| W-02 | Card focus ring overridden | A8 A2 | 3 | Focused card is pixel-identical to unfocused. `documents.css` `.home .entity-card:not([data-entity="my-dream-game"]) { box-shadow: 0 3px 12px #0002 }` beats `.mak-card:focus-visible`. | `.home .entity-card:focus-visible { box-shadow: 0 3px 12px #0002, var(--focus-ring); outline: 2px solid var(--pink); outline-offset: 2px }` | S | yes |
| W-03 | Viewer shortcuts hijack Space and fire with modifiers | A6 H4.5 | 2 | Space on a focused rail button toggled Spin instead; Cmd+C/Cmd+W select Clay/Wireframe. Viewers listen on window and skip only INPUT/TEXTAREA/SELECT. | Ignore events with meta/ctrl/alt and when the target is a button, link or `[role=tab]`; better, listen only while the stage has focus. | S | yes |
| W-04 | Scene and compare viewers use different keys, no navigation hint | H4.6 H4.1 H10.2 | 2 | Numbers pick shading in compare3d, cameras in scene3d; mouse controls undocumented; keys only in hover titles. | One key map for both; dismissible "Drag orbit · Right-drag pan · Wheel zoom · R reset" hint. | S | no |
| W-05 | Light theme Add link form unreadable | A1 M8 | 3 | Label 2.23:1, hint 1.55:1. `.link-intake { background: #0b090878 }` has no light override. | Light-theme background from the panel surface token; token input borders. | S | yes |
| W-06 | Selected status button styled as disabled | A1 H1.5 H8.3 | 3 | Selected status 2.48:1 (dark) / 2.50:1 (light) vs 6.3-8.4:1 for the others; it is `disabled` + `aria-pressed=true`. | Style `[aria-pressed=true]` as the strongest state (status color fill, text 4.5:1+); non-clickable but not disabled-looking. | S | yes |
| W-07 | Muted meta text below AA in both themes | A1 | 2 | Dark: Properties meta 3.68:1, intake hint 4.35:1, inactive tabs 4.46:1. Light: readout labels 4.18:1, row labels 4.34:1, hints 4.03:1, "Project root" 3.62:1. Sizes 8-10.5 px. | Muted token one step stronger per theme (dark about #9a8a7e, light about #665a51); 10 px minimum for mono meta. | S | yes |
| W-08 | Windows vocabulary in a macOS app | H2.1 M2 H4.1 H10.4 | 2 | "Open in Explorer", "Delete to Recycle Bin", "Use Explorer to move folders", a WINDOWS section in Settings, Help lists Ctrl/Win/PowerShell controls. | Platform strings (Finder, Trash, Cmd); hide the Windows section on macOS; Mac column in Help. | S | yes |
| W-09 | Removal only via Delete key | H3.8 M2 M9 H6.4 | 3 | Only `event.key === 'Delete'` on a tree row trashes, with no confirm; a Mac laptop delete key sends Backspace. | Visible "Move to Trash" on row hover and a context menu; bind Cmd+Backspace too; toast with Undo. | M | no |
| W-10 | Spend readout lacks period, as-of time, stale state | H1.6 H2.7 | 2 | Month-to-date only in a hover title; no last-updated; keeps the value while disconnected; not clickable. | "Spend Oct" / "this month"; as-of in the title; dim + "stale" while disconnected; link to the ledger or a breakdown. | S | yes (label, as-of, stale) |
| W-11 | Two spend totals disagree | H1.6 H4.1 X7 | 2 | Readout $13.43 (ledger month) vs Properties SPEND $10.20 (sidecar sum). | Rename the Properties figure "Asset cost (est.)"; one line "$3.23 of this month's spend is not linked to an asset". | M | no |
| W-12 | Status control buried at the bottom of Properties | H8.2 H7.1 | 2 | About 700 px down under provenance, mesh, files, review; header chip is display only. | Header chip becomes a status picker or status row moves under the header; fold jobs behind "7 jobs · $1.40". | M | no |
| W-13 | Status changes: no undo, confirm or history | H3.4 G3 G4 | 2 | One click on APPROVED writes approved_by/approved_at; no toast or undo; reverting leaves approved_* in the sidecar. | Toast with Undo; a status history line; clear or archive approved_* on revert. | M | no |
| W-14 | Review notes cannot be edited or removed | H3 H9.4 | 2 | Saved instantly, no edit or delete. | Edit/delete own note for a short window, or retract with strike-through. | M | no |
| W-15 | Provenance lacks prompt and session | H2.4 H6.3 G6 | 2 | Six identical "higgsfield / gpt_image_2_5 · Oct 9" rows; job id only in a hover. | Prompt excerpt + output thumbnail per job; link the session; "Copy job to chat". | M | no |
| W-16 | Link intake result appears far from the form | H9.6 H1.7 | 2 | Error and success lines render about 550 px below the Add button. | Render status and errors directly under the form (keep aria-live). | S | yes |
| W-17 | Intake success has no next step | G2 H1.7 | 1 | New folder selected, but no preview, no Properties, no assign/status action. | "Preview · Open in Properties" in the success line; later a triage strip. | M | no |
| W-18 | Floating Cy eye covers content | H8.4 A8 | 2 | Covers a card hero, the scene canvas, a heading at 900 px and the last menu item. | Reserve a gutter, dock into the right rail, or fade over canvas and cards. | M | no |
| W-19 | "Talk to Mak" label and stale example prompt | H4.1 | 1 | Visible hover label "Talk to Mak", faint over images; welcome example "Open the Dream Game chat." | "Talk to Cy" on a solid chip; generic or project-derived examples. | S | yes |
| W-20 | Cy panel is translucent and ignores Escape | H3.5 A1 | 2 | Cards show through the panel; Escape leaves it open. | Opaque (95%+) background; Escape closes and returns focus. | S | yes |
| W-21 | Help lacks Workspace topics, search and shortcuts | H10.3 H10.4 H6.7 | 2 | Nothing on Properties, status, notes, spend, viewer keys, `/` and `[`; opens editable. | Task sections ("Review an asset", "Read spend", "3D viewer keys", "Workspace shortcuts"); open read-only. | M | no |
| W-22 | Help and file preview do not close with Escape | H3.5 | 1 | Only the X closes it; the image lightbox does close on Escape. | Escape closes the preview when focus is not in the editor. | S | yes |
| W-23 | Narrow width: compare toolbar clips, panes collapse | A13 H8.4 | 2 | At 900x800 with Properties, shading bar cut at "Rough...", canvases about 150 px, titles wrap word by word. | Wrap or scroll the mode bar with a fade; stats under titles below 1000 px; panes min-height 50vh. | M | no |
| W-24 | Search icon overlaps the typed query | H8 | 1 | Magnifier sits on the first letter and the placeholder. | Left padding equal to icon width + gap. | S | yes |
| W-25 | Focus order puts cards before the top bar | A7 | 2 | Order: 31 cards, rail, Chats, Cy, then menu and breadcrumb; step tabs after content. | Top bar before main in DOM order, or a skip link. | S | yes |
| W-26 | Card and menu dots are color only, no review state | A3 H4.2 H8.5 H8.1 | 2 | Every card shows the same white "active" dot; "3 in review" never appears on cards. | Text chip with what needs the user ("2 in review"); drop the dot when all share a state. | M | no |
| W-27 | Compare header repeats stats in two units; red selector | H4.1 H8.3 | 1 | "1.88 M triangles" beside "1,875,023 tris"; "17.8 k faces" beside "17,800 tris"; selector filled red like an error. | One stats line, one term (tris); style the selector like other toolbar controls. | S | yes |
| W-28 | Scene load table covers the canvas | H8.4 H8.6 | 1 | About 640x130 px over the viewport, no collapse. | Collapse toggle (remembered) or collapse to the total row by default. | S | yes |
| W-29 | Reconnect banner covers the breadcrumb | H8 | 1 | "Reconnecting to the local service..." overlays the card title. | Push content down or place the banner in the readout strip. | S | yes |
| W-30 | Tabs and toggles miss ARIA state and arrow keys | A4 A11 | 1 | Step tabs lack aria-controls/tabpanel/arrows; viewer toggles lack aria-pressed; "MARKDOWN" status looks like a button. | Roving focus + tabpanel; aria-pressed on toggles; status as plain text. | S | yes |

## What works well (keep)

1. **Error recovery on report load.** Plain message, Reload and Back, collapsed details, "Your project files have not changed."
2. **Link intake errors are specific and keep input.** Plain cause and fix for a web-page response; URL stays in the field; success selects the new folder.
3. **Markdown editing is safe.** Unsaved drafts survive tab switches, Discard is offered, Cmd+S saves.
4. **Reports feel native.** Wheel and End/Home scroll; in-report links switch tabs; theme re-themes an open report in place; the last card is restored on relaunch.
5. **Image lightbox.** Escape closes it, Fit/100%, Open original, Download, an "Esc to close" hint.
6. **Properties scoping and speed.** Scopes to the card's assets, status changes reflect in about 120 ms, mesh stats use artist terms with units.

## Notes (not findings)

- Reduced motion is honored.
- Console noise: a cross-origin postMessage error on every report load (theme still applies) and a CSP refusal of the WASM decoder (models still load).
- Not tested: drag and drop from Finder (M9), VoiceOver (A11), the native window menu (M1); these need the real app.
