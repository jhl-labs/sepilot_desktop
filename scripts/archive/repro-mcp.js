const initSqlJs = require('sql.js');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');

// Mock StdioMCPClient logic for reproduction
class SimpleMCPClient {
  constructor(config) {
    this.config = config;
    this.idCounter = 0;
    this.pendingRequests = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const cmd = this.config.command;
      const args = this.config.args;
      const env = { ...process.env, ...this.config.env };

      console.log(`Spawning: ${cmd} ${args.join(' ')}`);

      this.process = spawn(cmd, args, { env, shell: true });

      this.process.stderr.on('data', (data) => {
        console.error(`STDERR: ${data}`);
      });

      const rl = readline.createInterface({
        input: this.process.stdout,
        terminal: false,
      });

      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
            const { resolve, timeout } = this.pendingRequests.get(msg.id);
            clearTimeout(timeout);
            this.pendingRequests.delete(msg.id);
            resolve(msg);
          }
        } catch (e) {
          console.error('Failed to parse line:', line);
        }
      });

      // Simply wait a bit to ensure it started
      setTimeout(resolve, 2000);
    });
  }

  async request(method, params) {
    const id = this.idCounter++;
    const req = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Timeout'));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.process.stdin.write(JSON.stringify(req) + '\n');
    });
  }
}

async function run() {
  // 1. Get Token from DB
  const appName = 'sepilot-desktop';
  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  const dbPath = path.join(appData, appName, 'sepilot.db');

  if (!fs.existsSync(dbPath)) {
    console.error('Database file not found!');
    process.exit(1);
  }

  let token = '';
  try {
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(__dirname, '../node_modules/sql.js/dist', file),
    });
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);
    const stmt = db.prepare("SELECT value FROM settings WHERE key = 'app_config'");
    if (stmt.step()) {
      const config = JSON.parse(stmt.getAsObject().value);
      const github = config.mcp.find((s) => s.name === 'GitHub');
      if (github) {
        token = github.env.GITHUB_PERSONAL_ACCESS_TOKEN;
        console.log('Found GitHub token ending in:', token.slice(-4));
      }
    }
    db.close();
  } catch (e) {
    console.error('Error reading DB:', e);
    process.exit(1);
  }

  if (!token) {
    console.error('No GitHub token found');
    process.exit(1);
  }

  // 2. Run MCP Client
  const client = new SimpleMCPClient({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
  });

  await client.connect();

  console.log('Initializing...');
  await client.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'repro', version: '1.0' },
  });
  await client.request('notifications/initialized', {});

  console.log('Listing tools...');
  const tools = await client.request('tools/list', {});
  console.log('Tools found:', tools.result.tools.map((t) => t.name).join(', '));

  console.log('Calling search_repositories...');
  const searchRes = await client.request('tools/call', {
    name: 'search_repositories',
    arguments: { query: 'org:jhl-labs sepilot_desktop' },
  });
  console.log('Search result summary:', JSON.stringify(searchRes).slice(0, 100));

  console.log('Calling list_commits...');
  try {
    const commitRes = await client.request('tools/call', {
      name: 'list_commits',
      arguments: { owner: 'jhl-labs', repo: 'sepilot_desktop' },
    });

    console.log('Commit Result:');
    console.log(JSON.stringify(commitRes, null, 2));

    const content = commitRes.result.content[0].text;
    const json = JSON.parse(content);
    if (json.commits && json.commits.some((c) => c.commit.author.name === 'John Doe')) {
      console.log('\n❌ REPRODUCED: Found John Doe in output!');
    } else {
      console.log('\n✅ NOT REPRODUCED: Real data returned.');
    }
  } catch (e) {
    console.error('Error calling list_commits:', e);
  }

  process.exit(0);
}

run();
