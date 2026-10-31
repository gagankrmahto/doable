// Copies the shared MCP tool code into the Cloud Function folder (functions deploy only sees its own directory).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const fn = path.join(root, 'firebase', 'functions');
fs.mkdirSync(path.join(fn, 'web'), { recursive: true });
for (const f of ['issues.js', 'timelog.js']) fs.copyFileSync(path.join(root, 'web', f), path.join(fn, 'web', f));
const tools = fs.readFileSync(path.join(root, 'mcp', 'tools.mjs'), 'utf8').replace("import '../web/issues.js';", "import './web/issues.js';").replace("import '../web/timelog.js';", "import './web/timelog.js';");
fs.writeFileSync(path.join(fn, 'tools.mjs'), tools);
console.log('functions prepared');
