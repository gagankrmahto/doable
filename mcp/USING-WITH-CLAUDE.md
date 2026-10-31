# Using Doable from Claude

Once the MCP server is set up (see [README.md](README.md)), any Claude session can read and change your Doable: tasks, meetings, freelance projects, issues, timers and habits. Changes show up in the app within a second and can be undone there.

## Where it works

| Where | Setup | How to tell it's on |
|---|---|---|
| **Claude Code** (any folder, any session) | `claude mcp add --scope user doable -e DOABLE_EMAIL=you@gmail.com -- node C:\ws\tools\doable\mcp\server.mjs` | `claude mcp list` shows `doable … ✔ Connected` |
| **Claude desktop app** | Add the `doable` entry below to `%APPDATA%\Claude\claude_desktop_config.json`, then fully quit and reopen the app | The tools icon in the chat box lists "doable" |

```json
{
  "mcpServers": {
    "doable": {
      "command": "node",
      "args": ["C:\\ws\\tools\\doable\\mcp\\server.mjs"],
      "env": { "DOABLE_EMAIL": "you@gmail.com" }
    }
  }
}
```

Both read your Doable password from `%USERPROFILE%\.doable-mcp\password` (never from chat).

## Things to say

Plain language works; Claude picks the tools. Examples that map to one or two tool calls:

**Day to day**
- "What's on my plate today?" / "What's overdue?"
- "Add: call Mom Sunday 6pm, pay electricity by Friday, renew domain next month"
- "Move the standup to 10am" / "Mark 'reply to client emails' done"
- "Make 'launch checklist' a subtask of 'release v2'"

**Freelance projects**
- "Create a project 'Clinic website' for Dr Verma, active, due 20 Nov, ₹40,000"
- "Add milestones to Clinic website: design mockups, build pages, go live"
- "Clinic website is delivered; we've received ₹10,000"
- "Which projects are unpaid?" / "What's stale?"

**Bugs and feature requests**
- "File a bug on Clinic website: contact form 500s on empty phone, critical, reported by Dr Verma, found in v1.1"
- "Request a feature on Clinic website: export appointments to PDF, high priority"
- "What's open on Clinic website?"
- "Mark the contact-form bug fixed in v1.2.0"
- "Close the PDF export as won't fix: out of scope"

**Time**
- "Start timing 'build pages'" / "Stop the timer"
- "I spent 2 hours on the invoice feature yesterday"
- "How many hours on Clinic website this week?"

**Habits**
- "Log my kriya" / "I drank 6 glasses of water"

## A status update in one line

In a coding session, after you ship something:

> "Update Doable: mark 'payment gateway' milestone done on Clinic website, and mark the checkout bug fixed in v1.3.0 with note 'retry on timeout'."

## How it stays safe

- The server signs in as you; Firestore's rules let it touch only your records.
- Every write is an ordinary Doable record, so the app shows it immediately and **Undo** reverses it on the device where you look.
- Nothing is sent anywhere except Firebase. Your password is read from the file at start and never printed.

## If a session doesn't show the tools

- **Claude Code:** the session started before `claude mcp add`; start a new one. `claude mcp list` must say "Connected".
- **Desktop app:** quit it completely (tray icon → Quit), then reopen; it reads the config only at launch. Check the JSON is valid (a trailing comma breaks it).
- **"Set DOABLE_EMAIL and DOABLE_PASSWORD"**: the password file is missing; redo step 2 of the README.
- **"Add password fails" in the app:** Firebase sign-ups must be on for a minute while you add it (Authentication → Settings → User actions).
