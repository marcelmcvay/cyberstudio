# Welcome to CyberStudio

Work with your agents in Chats. Read, compare and keep their results in Workspace.
Your project folders connect the two. You can use the Workspace without reading
source code or moving every conversation into one agent's app.

## Accounts and API keys

Claude Code and Codex chats use the real installed CLI with its existing login.
An eligible Claude Pro/Max or ChatGPT subscription can be used without adding an
API key to CyberStudio. Normal plan limits apply. Only the optional voice connection
requires an OpenAI API key; optional generation services use their own accounts.

OpenCode is available in **+ > OpenCode** after installation. Configure its models
and providers in OpenCode; their authentication and billing rules apply. History
and pinned tabs keep its native conversation ID. Keep one conversation per tab.
OpenCode connections are managed in its own MCP controls, separately from the
Workspace MCP inspector.

## Start with one task

1. In Chats, press **+**, choose your agent and its working folder, and give the
   conversation a clear English name.
2. Describe the result you want. Drop reference files or folders into the chat
   when they help: "Compare these concepts and put the findings in a Workspace card."
3. Let the agent work. A glowing logo marks activity; an unread completion marker
   helps you find a result you have not reviewed.
4. Open the Workspace card, compare its tabs and images, then give your decision
   back to the chat: "Use version B. Keep its shape and change only the material."
5. Keep related revisions as tabs in the same card. Archive the card when you no
   longer need it in the active list. Archiving a card preserves its files.

## Review an asset

1. Open the card, then **Properties** in the right rail. It lists the assets
   used by that card. **Show all assets** widens it to the project.
2. Open an asset row to see its preview, provenance, mesh numbers and files.
   Click a file to preview it.
3. Set the status under **Review**: draft, review, approved or superseded. The
   current status is highlighted. Approving records who approved it and when.
4. Add a note in the box under the status buttons. **Cmd+Enter** saves it.
   Notes are kept in the asset's `asset.json` sidecar beside its files.
5. Changed your mind? Click the previous status. Each change is written to the
   sidecar straight away; the project's Git history keeps earlier versions.

## Read spend

**Spend this month** in the readout strip is the project's paid generation
total for the current month, read from `ledger/`, against the monthly cap.
It turns amber at 80 percent of the cap and red above it. Hover it for the time
it was read and the number of paid jobs. While the local service is
disconnected it shows **stale** and keeps the last value.

**Spend** in Properties is different. It adds up the costs recorded on the
assets in view. Jobs that never produced a linked asset count in the monthly
total but not there, so the two figures can differ.

## 3D viewer keys and mouse

Both 3D viewers (side-by-side compare and the placed scene) use one map.
Click the canvas first so a keyboard control does not keep the focus.

| Input | Action |
| --- | --- |
| Drag | Orbit |
| Right-drag | Pan |
| Wheel or pinch | Zoom |
| 1 to 8 | Shading: Wireframe, Clay, Normals, Textured, Base color, Normal map, Roughness, Metalness |
| Shift+1 to Shift+9 | Scene camera presets, in toolbar order |
| R | Reset the view |
| Space | Spin |
| Left and right arrows | Previous or next test (compare) |
| S | Lock both cameras together (compare) |
| I | Show the reference image (compare) |

## Workspace shortcuts

| Key | Action |
| --- | --- |
| / | Search cards |
| [ | Hide or show the card menu |
| Escape | Close a preview, this help, an enlarged image or the Cy panel |
| Cmd+S | Save while editing Markdown |
| Cmd+Delete or Delete | Move the selected file in Files to the Trash |

Right-click a file in **Files** for Reveal in Finder, Move to Trash and Copy
path. After a move, **Undo** in the corner puts the item back.

## Chats shortcuts

| Key | Action |
| --- | --- |
| Ctrl+Shift+T | New chat |
| Ctrl+Shift+P | Find a chat |
| Ctrl+Shift+H | History |
| Ctrl+Shift+W | Close the current chat |
| Ctrl+Tab, Ctrl+Shift+Tab | Next or previous chat |
| Option+1 to Option+9 | Go to chat 1 to 9 |
| Escape | Close the open menu, Find, History or New chat |
| Cmd+K | Clear the terminal scrollback. The conversation is unchanged |
| Cmd+C, or Ctrl+C in an agent chat | Copy selected text. It never interrupts the agent |
| Ctrl+C in Shell | Interrupt, as in any terminal. Ctrl+Shift+C copies |
| Cmd+V | Paste text or a clipboard screenshot |
| Delete on a focused tab | Close that tab |

See the menu bar for the full list. On Windows, use Ctrl where this page says
Cmd and Alt where it says Option.

## Two windows, one project

**Chats** contains real terminal sessions for your chosen CLI agents. **Workspace**
contains the cards, reports, previews and files they produce. You can minimize
either window independently while continuing in a browser, Blender or another app.

Drag chat tabs to reorder them. Pinned tabs stay ahead of ordinary tabs, and can
be reordered within their own group. Use History to find and pin conversations
you want to return to. Closing a tab and deleting a project's files are separate
actions. Conversation recovery also depends on the selected CLI's native history.

## Files and previews

**Files** shows the actual project folders. Main folders is a focused view;
All files shows the wider tree. Hover a row for **Move to Trash**, and a folder
for its Finder shortcut (Explorer on Windows).
Select a file to preview it. Images can be enlarged and downloaded, and Markdown
opens with **Preview** and **Edit** modes. Save only when you want to change the file.

| Folder | What belongs here |
| --- | --- |
| `inbox/` | References, clipboard screenshots and incoming material |
| `projects/` | Ongoing project context and working specifications |
| `workspace/` | Cards, reports, previews and task deliverables |
| `knowledge/` | Lessons that should guide future work |
| `processes/` | Repeatable workflows and checklists |
| `.claude/skills/`, `.agents/skills/` | Project-local skills for the agents |

Dropping files or folders into Chats inserts their paths. Pasting a clipboard
image saves it in `inbox/` and inserts that path. This gives the agent an input;
it does not automatically publish or upload it to a service.

Within Files, dragging a file to another project folder moves it; dropping it
back in the same place does nothing. Cmd+Delete, forward Delete, the hover
button or the right-click menu moves an item to the Trash. **Undo** brings it
back for a few seconds. Until then it waits in the project's `.trash/` folder,
which is never committed. Then it goes to the Trash, where Finder can still put
it back. Use Finder for folder moves and other full filesystem operations.

## Skills and MCP: what is the difference?

A **skill** explains how to do a recurring task: decisions, prompts, checks and
sometimes helper scripts. **MCP** connects an agent to a tool or service. For
example, fal.ai MCP can run a model; the fal.ai skill explains model discovery,
reference inputs, job recovery, review and delivery.

Open **Skills** to read the project's Claude skills, Codex skills, knowledge and
processes. These are real files. Keep related agents pointed at one maintained
implementation rather than editing two independent copies.

Open **MCP** to see connection sources and check availability. An enabled entry
means it is configured. A successful connection check means the inspector could
reach it at that time; the intended agent still needs its own active connection
and account login. Some tools also require an application such as Blender to run.

When receiving a skill pack, read its getting-started guide, copy the selected
complete modules into your project, and install only their required dependencies.
Use your own provider accounts and keys. A skill does not include someone else's
subscription, running terminal, API balance or signed-in application.

## Talking to Cy

Press the nose button to start or stop a voice conversation. Ask for quick actions
such as opening a chat, finding a card, checking recent work or changing a card's
status. For a larger task, ask Cy to create an agent conversation and follow
its result. You can continue working directly in any terminal.

Voice uses the configured API connection. Terminal agents use their own installed
CLI and authentication; provider generation services use their own accounts.
The current choices are visible in Settings and in the agent or provider setup.

## Settings

Settings also contains terminal text size and appearance, the default agent,
new-chat permission defaults and voice choices. A CLI permission setting affects
what that agent can do on your machine; choose it deliberately for your workflow.

## Keep the Workspace understandable

- Use clear English card titles and chat names.
- Keep Workspace information in English by default. Another language is used
  only when explicitly requested for that particular output.
- Put revisions of the same task in one card, with readable tab names.
- Make images openable and downloadable. Keep editable sources beside results.
- Record what was checked and what still needs a decision. Do not label a
  technically completed generation as visually approved without reviewing it.
- Archive completed work instead of mixing it into the current task list.

## Bringing the workflow to another computer

The project repository carries its cards, skills, knowledge and workflows.
The desktop application, CLI agents, creative tools and account logins are
installed or configured on that computer. Read the package's installation guide;
copying a repository alone does not recreate every external application.

Share a clean skill pack or a deliberately prepared template, not a copy of your
working account state. Keep `.env`, credentials, private conversations, raw job
receipts and unrelated client files out of a handoff. The supplied skill pack
contains generic examples and instructions; each recipient supplies their own inputs.
