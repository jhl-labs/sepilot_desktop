// ... (same boilerplate as before) ...
const initSqlJs = require('sql.js');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');

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
      this.process = spawn(cmd, args, { env, shell: true });
      this.process.stderr.on('data', (data) => console.error(`STDERR: ${data}`));
      const rl = readline.createInterface({ input: this.process.stdout, terminal: false });
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
      }, 10000);
      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.process.stdin.write(JSON.stringify(req) + '\n');
    });
  }
}

async function run() {
  // Use INVALID token
  const token = 'ghp_INVALIDTOKEN1234567890';
  console.log('Using INVALID token:', token);

  const client = new SimpleMCPClient({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
  });

  await client.connect();

  try {
    console.log('Initializing...');
    await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'repro', version: '1.0' },
    });
    await client.request('notifications/initialized', {});

    console.log('Calling list_commits...');
    const commitRes = await client.request('tools/call', {
      name: 'list_commits',
      arguments: { owner: 'jhl-labs', repo: 'sepilot_desktop' },
    });
    console.log('Commit Result:');
    console.log(JSON.stringify(commitRes, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
run();
