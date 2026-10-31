# Doable MCP server

Lets Claude (Claude Code, the Claude desktop app, or anything that speaks MCP) read and update your Doable directly: tasks, meetings, freelance projects and habits. It signs in to Firebase as you and edits the same records the apps sync, so a change made here shows up in the app within a second, and can be undone there.

It runs on your own computer. Nothing extra is hosted and nothing costs anything.

## Setup (once)

1. Install:
   ```bash
   cd C:\ws\tools\doable\mcp
   npm install --ignore-scripts
   ```
2. Give it your Doable password (the email + password one, added under Cloud sync → Add password). Keep it out of the command line: put it in a file only you can read.
   ```powershell
   New-Item -ItemType Directory -Force "$HOME\.doable-mcp" | Out-Null
   Set-Content -NoNewline "$HOME\.doable-mcp\password" "your-password-here"
   ```
   (Or set the `DOABLE_PASSWORD` environment variable, or `DOABLE_PASSWORD_FILE` to another path.)
3. Register it with Claude Code (user-wide, so every project can use it):
   ```bash
   claude mcp add --scope user doable -e DOABLE_EMAIL=gagan0966@gmail.com -- node C:\ws\tools\doable\mcp\server.mjs
   ```
   For the Claude desktop app, add the same command under Settings → Developer → Edit config:
   ```json
   { "mcpServers": { "doable": { "command": "node", "args": ["C:\\ws\\tools\\doable\\mcp\\server.mjs"], "env": { "DOABLE_EMAIL": "gagan0966@gmail.com" } } } }
   ```

Then, in any Claude session: "add a milestone 'payment gateway' to the clinic project due Friday", "what's overdue", "mark the standup done", "log my kriya".

## Tools

| Tool | What it does |
|---|---|
| `get_overview` | Lists, spaces, counts, projects with progress, habits |
| `search_tasks` | Find tasks (words, list/project, status, tag, dates, overdue) |
| `create_tasks` | Add tasks, meetings, subtasks, milestones |
| `update_tasks` | Edit, move, reschedule, complete, reopen, delete |
| `update_project` | Create or update a freelance project |
| `log_habit` | Tick a habit or set its count |

## Safety

- Only your account: the server signs in with your credentials and Firestore's rules allow it to touch only your records.
- The password file is read at start and never printed or sent anywhere except Firebase sign-in.
- Every write is a normal Doable record change: the app sees it, syncs it, and Undo works on the device where you look.
