# Usability survey: patterns worth borrowing

Surveyor pass, 2026-10-11. Scope: tools that sit near CyberStudio's surfaces.
Chats (agent sessions), Workspace (cards, reports, viewer), Properties (asset
sidecars), Intake (inbox, Dropbox links) and Global (spend, voice, keyboard).

Sources are docs, changelogs, product pages and reviews. Some third-party
claims are marked "reported". Check the live product before copying a detail.

## 1. Agent and terminal workspaces

### Cursor (Agents Window, background agents)
- One list for all agents, local and background, in the left sidebar. Click a
  remote one to watch it work.
  ([changelog 1.4](https://cursor.com/de/changelog/1-4))
- Cursor 3 (April 2026) made an agent-first window the center. Agents run in
  local, worktree, cloud or SSH environments. The classic editor stays beside it.
  ([guide](https://tutorials.technology/tutorials/cursor-ai-v3-complete-guide-2026.html))
- Background agents post progress as a to-do list on the PR. Status lives
  where the reviewer already looks.
  ([changelog 1.4](https://cursor.com/de/changelog/1-4))
- OS notification when an agent finishes or needs input (reported, 1.5).
  ([summary](https://blog.promptlayer.com/cursor-changelog-whats-coming-next-in-2026/))

### Warp (agent mode, blocks, notifications)
- Three attention types, not one: Complete, Request (blocked on approval or
  idle prompt), Error. Each tab carries a status icon for working, blocked,
  done or errored.
  ([agent notifications](https://docs.warp.dev/agents/capabilities/agent-notifications/))
- Unread badge on the tab. Visiting the tab marks it read. A bell "mailbox"
  has All, Unread and Errors filters, plus Mark all read.
- Toasts: corner, auto-dismiss, hover pauses, click opens the session. Max two
  at once, oldest replaced. Background app gets native OS alerts.
- Supports third-party CLIs (Claude Code, Codex, OpenCode) through a small
  notification hook or plugin. Proof that external CLIs can feed status.
- Blocks: each command plus output is one unit. Jump between them with
  Cmd+Up/Down, bookmark, copy, share.
  ([blocks](https://docs.warp.dev/terminal/blocks))

### Zed (agent panel)
- Recent-threads dropdown shows the last six. Closing one only hides it from
  recents. "View All" or a keybinding opens full history.
  ([agent panel docs](https://git.secluded.site/zed/blob/v0.188.5/docs/src/ai/agent-panel.md?source=1))
- `@thread` pulls a past thread in as context. "Start New From Summary"
  continues a long thread without its full context.
- Export a thread as Markdown in one action.
  ([v0.191.4](https://git.secluded.site/zed/blob/v0.191.4/docs/src/ai/agent-panel.md?source=1))

### VS Code (agent sessions, Agents window)
- One sessions list across providers: local chat, Copilot cloud agent,
  Copilot CLI, Codex, Claude agent. Searchable.
  ([chat sessions](https://code.visualstudio.com/docs/copilot/chat/chat-sessions),
  [1.106 notes](https://code.visualstudio.com/updates/v1_106))
- Title-bar badges for "unread" and "in progress". Clicking a badge filters
  the list to those sessions.
  ([manage sessions](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions))
- App icon badge counts sessions with unread results, waiting for input or
  failing CI. Unread work that is still running is not counted. Read or archive
  clears it.
- Archive ("Mark as Done") hides without deleting. Default list shows only
  active sessions. A state filter reveals done ones. Restore rebuilds the
  worktree or container and keeps history.
- Keyboard: Cmd+T new chat, Cmd+B sidebar, chord to move between chat groups.

### Claude Code desktop
- Sidebar shows active and recent sessions together. Filter by status,
  project or environment. Group by project.
  ([redesign article](https://claude.com/resources/articles/claude-code-desktop-redesign),
  [quickstart](https://code.claude.com/docs/en/desktop-quickstart))
- Sessions whose PR merges or closes archive themselves. The list stays live.
- OS notification only when a session finishes and you are not looking at it.
- Cmd+N new session, Ctrl+Tab cycles. A tasks pane shows subagents and
  background commands for one session.

### Conductor and similar session managers
- One workspace per agent: own branch, worktree, run script and context
  folder. Dashboard shows all threads with diffs, checks and errors.
  ([conductor.build](https://www.conductor.build),
  [review](https://www.morphllm.com/conductor-ai-coding))
- Explicit end state: review, merge, archive. Every session has a finish line.
- Peers: Superset (agent-agnostic), AgentsRoom (project-oriented, many repos).
  ([comparison](https://superset.sh/compare/conductor-vs-codex))

### tmux and sesh
- Window list flags: `#` activity, `!` bell. Separate styles for each. Tiny,
  glanceable, always on screen.
  ([tmux status bar](https://arcolinux.com/everything-you-need-to-know-about-tmux-status-bar/))
- sesh merges live sessions, saved configs and recent folders into one fuzzy
  picker. Connect creates the session if missing.
  ([sesh](https://github.com/joshmedeski/sesh))

## 2. Generative and creative studios

### Krea
- Session model: each generation adds a row to the current session. Refine
  and regenerate inside one direction.
  ([Krea image guide](https://www.krea.ai/docs/de/user-guide/features/krea-image))
- All outputs searchable in one Assets grid from the top bar.
- 2026 redesign: sessions carry across tools, drag and drop between tools,
  live indicators show what is running.
  ([redesign](https://www.krea.ai/blog/redesign))
- Compute units are the single currency. Cost varies by model and task.
  ([compute units](https://www.krea.ai/docs/user-guide/help-and-support/compute-units.md))

### Runway
- Generated items land in "All Generations" automatically. Uploads land in a
  Private folder. Private and Shared toggle at the top.
  ([organize assets](https://help.runwayml.com/hc/en-us/articles/23998498329107-How-to-organize-assets))
- Agent shows a card before spending: model, aspect, credits, Approve button.
  Charge matched the quote (reported).
  ([review](https://marcandrews.com/runway-credits-explained/))

### Freepik Spaces, Higgsfield
- Spaces is a node canvas: upload, text and generate nodes on one board.
  Each model has a fixed credit cost per run, shown on the model.
  ([Spaces FAQ](https://www.freepik.com/ai/faq/spaces),
  [pricing review](https://eesel.ai/blog/freepik-ai-pricing))
- Higgsfield shows per-generation credits up front. Failed jobs refund
  automatically and the refund shows in Usage.
  ([stuck or failed](https://higgsfield.ai/creator-hub/help-center/troubleshooting/generation-is-stuck-pending-or-failed))
- Job tiles in the library carry queue state and a Cancel on hover.
- Anti-pattern: credits burn fast while exploring and users feel it late.
  Pricing wall before first generation hurts onboarding.
  ([G2 reviews](https://g2.com/products/higgsfield/reviews))

### ComfyUI
- Workflow is embedded in the output PNG. Drag the image back onto the canvas
  to rebuild the exact graph. Provenance travels with the file.
  ([workflow metadata](https://docs.comfy.org/development/api-development/workflow-metadata.md))
- Queue history with Load (restore params) and Delete. Shortcut Q.
  Cmd+Enter queues, Cmd+Shift+Enter jumps the queue.
  ([UI wiki](https://comfyui-wiki.com/en/interface/basic))
- Caveat: re-encoding strips the metadata. A sidecar is safer as the record.

### Figma
- Named versions with description, date and author. Unnamed autosaves sit
  between them.
  ([file history](https://dev.classmethod.jp/articles/viewing-file-history-in-figma/))
- Compare changes: side by side or overlay. Layers tagged Edited, Added,
  Deleted.
  ([compare changes](https://help.figma.com/hc/en-us/articles/15023193382935))
- Comments pin to a spot. Resolve with a checkmark. Mark as unread. Filter and
  sort in the sidebar. C enters comment mode.
  ([manage comments](https://figma-signup.helpjuice.com/comments/view-and-manage-comments))
- Anti-pattern: no whole-file compare after years of requests. Sort by unread
  resets on reopen.
  ([forum](https://forum.figma.com/suggest-a-feature-11/compare-versions-in-version-history-13616/index4.html))

### Blender asset browser
- Mark as Asset generates a preview automatically. You can swap in a custom
  one from Asset Details.
  ([asset libraries](https://docs.blender.org/manual/th/latest/files/asset_libraries/introduction.html))
- Catalogs in a left tree. Metadata is catalog, description, author, tags.

## 3. Asset review and production tracking

### ftrack
- Statuses roll up into a few states (Not started, In progress, Done,
  Blocked) for reports. Status order defines the approval steps.
  ([managing statuses](https://help.ftrack-studio.backlight.co/hc/en-us/articles/13129920598423))
- Client review: guests join by email link, no login. They press Approve or
  Require Changes. Afterward an owner maps those to real statuses and pushes
  notes back.
  ([approving versions](https://help.ftrack-studio.backlight.co/hc/en-us/articles/13129962733975-Approving-Asset-Versions))
- Only team members can set status. Reviewers give a verdict, owners decide.
- cineSync live sessions export notes, drawings and saved frames to the right
  asset version in one click.
  ([shootonline](https://shootonline.com/?p=156119))

### Flow Production Tracking (ShotGrid)
- Pipeline steps as columns, status per step. Watch assets move in real time.
- Review shows prior notes, versions and statuses next to the media.
- Playlists collect versions for a review session. RV and Screening Room for
  compare and annotate.
  ([features](https://www.autodesk.com/ae/products/flow-production-tracking/features))

### Frame.io
- Color-coded status labels: Needs Review, In Progress, Approved. V4 lets teams
  define their own.
  ([V4 beta](https://www.provideocoalition.com/frame-io-version-4-beta-is-here/))
- Version stacks: drop a new upload onto the old one. Compare two versions
  side by side and comment on either.
  ([version stacking](https://support.frame.io/en/articles/4431-version-stacking-and-comparison))
- Collections: saved, filtered views like "needs review" or "approved".
  ([Frame.io business](https://business.adobe.com/be_en/products/frameio-business.html))
- Anti-pattern: V4 moved status from the top bar into a metadata panel. Users
  called it a step back. Status must stay one click away.
  ([forum](https://forum.frame.io/t/forced-migration-to-frameio-v4-will-break-my-entire-companys-pipeline/3190/3))

### P4 DAM (formerly Helix DAM)
- Asset states: open, in review, approved, rejected. Moving to in review opens
  a Reviewers tab and notifies collection reviewers.
  ([7 steps](https://www.perforce.com/products/helix-dam/setting-up/7-steps))
- Kanban view of assets by status.
- Spin 3D models in the browser. Pin comments to a position on the model.
  GLB and glTF supported.
  ([2024.5 notes](https://www.perforce.com/sites/default/files/pdfs/datasheet-dam-whats-new.pdf))
- Auto tags and user tags are visually distinct (user tags blue).

## 4. Mr. Mak upstream

Source: [README](https://github.com/witnesstodark/mr-mak-workspace).

- Two windows: give tasks in Chats, review results in Workspace. Either can
  minimize. Do not merge them into one pane.
- Real CLIs with their own logins. The app is a host, not a model wrapper.
- Cards hold work in tabs, with status dots and categories. Pin or archive.
  Archived files stay in place.
- Opt-in by default: voice, paid providers, MCP and permission bypass start
  off.
- Human decisions stay separate: "visual approval and engine readiness remain
  separate decisions". Verification checks integrity only.
- Files first: inbox, projects, knowledge, processes are plain folders. Notes
  are Markdown you can edit in place.
- Chats show which agents are working or have an unviewed reply.

Implication. Borrow status, review and cost patterns, but keep them as
annotations on files and cards. Never let a tool auto-approve. Keep Chats and
Workspace as separate windows that talk to each other.

## 5. Anti-patterns to avoid

- One undifferentiated "activity" dot. Warp and VS Code split done, needs
  input and error for a reason.
- Toast storms. Cap and coalesce (Warp max two).
- Status buried in a metadata panel (Frame.io V4).
- Cost shown only on a billing page, after the fact (Higgsfield reviews).
- Provenance only inside the output file (ComfyUI PNG metadata is lost on
  re-encode).
- Lists that grow forever. Nothing archives itself, so the live set is lost.
- Pricing or login wall before the first useful action.

## 6. Synthesis: top 12 for CyberStudio

1. **Three-state attention, not one dot.** [Chats]
   Who: Warp, VS Code. Each tab shows working, needs input, done unread or
   error, with distinct shape plus color. Needs input outranks everything. Feed
   it from Claude Code, Codex and OpenCode hooks, as Warp does. Strix gets the
   same icons plus a "remote" mark.

2. **Attention badge that filters.** [Global / Chats]
   Who: VS Code title bar and dock badge. A count in the title bar and on the
   dock icon: sessions needing input or with unread results. Click it to filter
   the Chats rail to just those. Running-but-unread does not count.

3. **Quiet, capped notifications.** [Global]
   Who: Warp toasts, Claude Code desktop. OS alert only when the session is not
   in view. In-app toast, max two, hover pauses, click jumps to the tab.
   Visiting the tab clears it. A bell inbox with Unread and Errors filters.

4. **Active list with a finish line.** [Chats]
   Who: VS Code "Mark as Done", Claude Code auto-archive, Conductor. Default
   rail shows live sessions. Done hides without deleting. Restore resumes the
   CLI session by id. Optional auto-done when a card hits approved.

5. **One fuzzy switcher for sessions, cards and assets.** [Global]
   Who: sesh, Zed history, VS Code search. Cmd+K over live tabs, history,
   cards and assets in one list. Enter opens or resumes. Typing a new name
   offers "new chat here".

6. **Status chip always on the surface.** [Workspace / Properties]
   Who: Frame.io labels (and its V4 regression), ftrack. Draft, review and
   approved as a colored chip on every asset tile and at the top of
   Properties. One click or one key to change. Never only inside a form.

7. **Verdict vs decision.** [Properties]
   Who: ftrack client review, Mr. Mak README. Reviewers leave "approve" or
   "needs changes" plus a note in `review`. The owner sets `status`. Approval
   is a human field that scan never writes. Show who and when.

8. **Version stack plus side-by-side compare.** [Workspace]
   Who: Frame.io stacks, Figma compare. Use `superseded_by` to stack versions
   under one tile with a "v3 of 3" badge. Compare mode: two images or two GLBs
   side by side with linked orbit, or an overlay slider. Show the stat delta
   (tris, materials, cost).

9. **Notes pinned to the thing.** [Properties / Workspace]
   Who: P4 DAM 3D comments, Figma, cineSync. Click on an image or a point on
   the model to drop a review note. Resolve with a check. Notes list in
   Properties with unresolved first. Notes belong to a version.

10. **Cost before, cost after.** [Global / Properties]
    Who: Runway approve card, Freepik and Higgsfield per-model credits. Before
    a paid generation, show model and estimated cost with an Approve step.
    After, the sidecar shows actual cost and the month readout updates. Show
    refunds and failures as their own lines.

11. **Provenance travels in a sidecar, replays in one click.** [Properties]
    Who: ComfyUI drag-to-restore, Blender asset metadata. Properties shows
    model, prompt, inputs and job id from the sidecar. A "re-run in chat"
    action pastes the job back into a new session. The sidecar, not the image,
    is the record.

12. **Auto-landing intake with a triage view.** [Intake]
    Who: Runway All Generations vs Private, P4 DAM auto tags, Blender
    auto-preview. Every drop or Dropbox link lands in `inbox/` with a preview,
    an auto sidecar and auto tags styled apart from human tags. A triage strip
    offers: assign to card, set status, archive. Empty inbox says how to fill
    it.

Runners-up: saved filtered views of assets (Frame.io Collections), kanban by
status (P4 DAM), export a chat as Markdown (Zed), per-session tasks pane for
subagents (Claude Code desktop), Cmd+Up/Down block navigation in terminal
output (Warp).
