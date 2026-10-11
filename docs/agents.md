# Agent team

Seven roles. One Producer, six subagents. Definitions live in `.claude/agents/`. Profiles can add or override a role by shipping a file with the same `name`.

## At a glance

| Agent | File | Owns | Never |
|---|---|---|---|
| **Producer** | main session | Briefs, dispatch, verification, `docs/decisions.md`, `docs/board.md`, talking to Marcel | Ships unverified work |
| **Workspace Engineer** | `workspace-engineer.md` | The CyberStudio app: shell, panels, viewers, service, sync | Touches project assets |
| **Art Director** | `art-director.md` | Style guide, moodboards, prompt packs, Higgsfield rounds, Midjourney sheets, picks with rationale | Spends past the cap without flagging it |
| **Asset Smith** | `asset-smith.md` | Image to 3D (Tripo), Blender MCP cleanup, LODs, PBR, glTF export | Calls a mesh engine-ready without an import test |
| **Archivist** | `archivist.md` | Inbox triage, sidecars, provenance, ledger joins, changelog, human-team intake | Deletes. It only supersedes |
| **Tech Lead** | `tech-lead.md` | Scene assembly, engine evaluation harness, perf budgets, Strix GPU jobs | Picks the engine. It presents evidence |
| **QA** | `qa.md` | Acceptance checks, schema and glTF validation, screenshots, smoke tests | Fixes things. It reports |

## Rules every agent follows

- **Stop for Marcel** before anything external: account creation, repo or LFS provisioning, deploys. Also before any single generation batch estimated over $25.
- **Spend:** $300/month soft cap, tracked in `ledger/spend.csv` through `scripts/ledger.mjs`. Warn at 80%. Never hard-block. Paid jobs run only through the ledgered wrappers (`scripts/higgsfield/gen.mjs`, `scripts/tripo/tripo.py`). Keep job IDs. Resume, never resubmit.
- **Format:** glTF/GLB is canonical. FBX or USD on request. The engine choice is open.
- **Confidentiality:** the kit is public. Client material lives only in project repos.
- **Voice:** no em dashes. Short declarative fragments.
- **Git:** subagents do not commit unless the brief says so. Nobody pushes before the remote exists.

## Dispatch pattern

Locked brief, then build, then verify.

1. **Brief.** The Producer writes a locked brief: goal, asset ids, file list, budget, acceptance criteria, what is out of scope. Locked means the builder does not renegotiate it mid-run. Questions come back in the report.
2. **Build.** The Producer dispatches one role per build step with the Agent tool (`subagent_type` = the file's `name`). Independent steps can run in parallel. Each builder returns its structured report.
3. **Verify.** The Producer checks the work against the criteria, usually by dispatching `qa` with the brief and the builder's report. QA reports. The owning role fixes. Repeat.
4. **Close.** Only after verification does the Producer mark the board item `done`, log decisions with date and who decided, and tell Marcel what changed, what it cost and what is left.

A typical asset run: Art Director (look and reference sheets), Archivist (file the round), Asset Smith (mesh, cleanup, import test), Archivist (sidecars and costs), QA (verify), Tech Lead (place in scene, measure), QA again.

Gates that go to Marcel, not to a subagent: anything external, a batch over $25, crossing 80% of the cap, approving assets, and the engine decision.

## Agents in a project repo

Project repos borrow the kit's agents the same way they borrow its skills. `scripts/studio <project>` links these into the project if they are missing:

```
.claude/skills  -> ~/cyberstudio/.claude/skills
.claude/agents  -> ~/cyberstudio/.claude/agents
.agents/skills  -> ~/cyberstudio/.agents/skills
processes       -> ~/cyberstudio/processes
```

- The links are local. Each project's `.gitignore` lists them, so the kit's files never get committed into a client repo.
- Edit agents in the kit, never through the link. A change reaches every linked project at once.
- A project that needs a project-only role keeps it out of the link: replace the link with a real `.claude/agents/` folder that holds the kit files plus its own, or add the role in the user's own agent folder. Do not put client details in the kit's files.
- On the Strix, `scripts/strix pull` brings the kit up to date. `scripts/studio` launches the Mac app, so on the Strix make the same links by hand (`ln -s`) before a headless session needs the agents.
