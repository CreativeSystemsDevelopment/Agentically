import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, relative } from 'path';
import { readdir, stat, readFile, writeFile, mkdir } from 'fs/promises';
import { spawn } from 'child_process';
import pty from 'node-pty';
import { CopilotClient, defineTool } from '@github/copilot-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKSPACE = '/workspaces/workspaces';
const PORT = 4200;

const OAUTH_CLIENT_ID = 'Ov23ligx88wLBSASfBXY';
const OAUTH_CLIENT_SECRET = '35ab57879377b632748842621b3c6dccec9f09ff';

const app = express();
const server = createServer(app);
app.use(express.json({ limit: '5mb' }));
app.use('/lib', express.static(join(__dirname, 'node_modules')));
app.use(express.static(join(__dirname, 'public')));

const AGENTS_DIR = join(WORKSPACE, '.github', 'copilot', 'agents');

// ── Agent CRUD endpoints ────────────────────────────────────────────────────

app.get('/api/agents', async (_req, res) => {
  try {
    await mkdir(AGENTS_DIR, { recursive: true });
    const files = await readdir(AGENTS_DIR);
    const agents = [];
    for (const f of files) {
      if (!f.endsWith('.agent.md')) continue;
      const content = await readFile(join(AGENTS_DIR, f), 'utf-8');
      const fm = parseFrontmatter(content);
      agents.push({ file: f, slug: f.replace('.agent.md', ''), ...fm });
    }
    res.json(agents);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agents/:slug', async (req, res) => {
  try {
    const fp = join(AGENTS_DIR, req.params.slug + '.agent.md');
    const content = await readFile(fp, 'utf-8');
    res.json({ slug: req.params.slug, content, ...parseFrontmatter(content) });
  } catch (e) { res.status(404).json({ error: 'Agent not found' }); }
});

app.post('/api/agents', async (req, res) => {
  try {
    const { slug, content } = req.body;
    if (!slug || !content) return res.status(400).json({ error: 'slug and content required' });
    await mkdir(AGENTS_DIR, { recursive: true });
    const fp = join(AGENTS_DIR, slug + '.agent.md');
    await writeFile(fp, content, 'utf-8');
    res.json({ status: 'saved', slug, path: relative(WORKSPACE, fp) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/agents/:slug', async (req, res) => {
  try {
    const fp = join(AGENTS_DIR, req.params.slug + '.agent.md');
    const { unlink } = await import('fs/promises');
    await unlink(fp);
    res.json({ status: 'deleted', slug: req.params.slug });
  } catch (e) { res.status(404).json({ error: 'Agent not found' }); }
});

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: content };
  const meta = {};
  let currentKey = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      let val = kv[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        try { val = JSON.parse(val.replace(/'/g, '"')); } catch {}
      } else if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      meta[currentKey] = val;
    }
  }
  return { meta, body: m[2] };
}

// ── Catalog endpoints (from extracted full-catalog.json) ────────────────────

let fullCatalogCache = null;

async function getFullCatalog() {
  if (fullCatalogCache) return fullCatalogCache;
  fullCatalogCache = JSON.parse(await readFile(join(__dirname, 'data', 'full-catalog.json'), 'utf-8'));
  return fullCatalogCache;
}

app.get('/api/catalog', async (_req, res) => {
  try { res.json(await getFullCatalog()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tools/catalog', async (_req, res) => {
  try { const c = await getFullCatalog(); res.json({ categories: c.toolCategories }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Models endpoint ─────────────────────────────────────────────────────────

app.get('/api/models', async (req, res) => {
  const token = req.headers['x-github-token'];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const resp = await fetch('https://api.githubcopilot.com/models', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Copilot-Integration-Id': 'vscode-chat',
      },
    });
    const data = await resp.json();
    if (!data.data) return res.json({ models: [] });
    const models = data.data
      .filter(m => m.model_picker_enabled)
      .map(m => ({
        id: m.id,
        name: m.name,
        category: m.model_picker_category || '',
        vendor: m.vendor || '',
        preview: m.preview || false,
      }))
      .sort((a, b) => {
        const order = { powerful: 0, versatile: 1, lightweight: 2 };
        return (order[a.category] ?? 3) - (order[b.category] ?? 3) || a.name.localeCompare(b.name);
      });
    res.json({ models });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── OAuth Device Flow endpoints ─────────────────────────────────────────────

app.post('/api/auth/device-code', async (_req, res) => {
  try {
    const resp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: OAUTH_CLIENT_ID,
        scope: 'copilot read:org read:user',
      }),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/poll-token', async (req, res) => {
  try {
    const resp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        device_code: req.body.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data = await resp.json();
    console.log('poll-token response:', JSON.stringify(data));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Filesystem REST API ─────────────────────────────────────────────────────

app.get('/api/fs/list', async (req, res) => {
  try {
    const dir = resolve(WORKSPACE, req.query.path || '.');
    if (!dir.startsWith(WORKSPACE)) return res.status(403).json({ error: 'Forbidden' });
    const entries = await readdir(dir, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file', path: relative(WORKSPACE, join(dir, e.name)) }))
      .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
    res.json({ path: relative(WORKSPACE, dir) || '.', items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fs/read', async (req, res) => {
  try {
    const fp = resolve(WORKSPACE, req.query.path || '');
    if (!fp.startsWith(WORKSPACE)) return res.status(403).json({ error: 'Forbidden' });
    const s = await stat(fp);
    if (s.size > 2_000_000) return res.status(413).json({ error: 'File too large' });
    const content = await readFile(fp, 'utf-8');
    res.json({ path: relative(WORKSPACE, fp), content, size: s.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/fs/write', async (req, res) => {
  try {
    const fp = resolve(WORKSPACE, req.body.path);
    if (!fp.startsWith(WORKSPACE)) return res.status(403).json({ error: 'Forbidden' });
    await mkdir(dirname(fp), { recursive: true });
    await writeFile(fp, req.body.content, 'utf-8');
    res.json({ status: 'written', path: relative(WORKSPACE, fp) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Tool executor ───────────────────────────────────────────────────────────

async function executeTool(name, args) {
  try {
    switch (name) {
      case 'run_command': {
        const cwd = args.cwd ? resolve(WORKSPACE, args.cwd) : WORKSPACE;
        return await new Promise(r => {
          const p = spawn('bash', ['-c', args.command], { cwd, timeout: 60000, env: { ...process.env, HOME: process.env.HOME || '/root' } });
          let out = '', err = '';
          p.stdout.on('data', d => out += d);
          p.stderr.on('data', d => err += d);
          p.on('close', code => r({ exit_code: code, stdout: out.slice(-8000), stderr: err.slice(-4000) }));
          p.on('error', e => r({ error: e.message }));
        });
      }
      case 'read_file': {
        const p = resolve(WORKSPACE, args.path);
        if (!p.startsWith(WORKSPACE)) return { error: 'Forbidden' };
        return { content: (await readFile(p, 'utf-8')).slice(0, 50000) };
      }
      case 'write_file': {
        const p = resolve(WORKSPACE, args.path);
        if (!p.startsWith(WORKSPACE)) return { error: 'Forbidden' };
        await mkdir(dirname(p), { recursive: true });
        await writeFile(p, args.content, 'utf-8');
        return { status: 'written', path: args.path };
      }
      case 'list_directory': {
        const d = resolve(WORKSPACE, args.path || '.');
        if (!d.startsWith(WORKSPACE)) return { error: 'Forbidden' };
        const entries = await readdir(d, { withFileTypes: true });
        return { items: entries.filter(e => !e.name.startsWith('.') && e.name !== 'node_modules').map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })) };
      }
      case 'search_codebase': {
        const inc = args.include ? `--include="${args.include}"` : '';
        const escaped = args.query.replace(/"/g, '\\"');
        return await new Promise(r => {
          const p = spawn('bash', ['-c', `grep -rn ${inc} --max-count=30 -- "${escaped}" . 2>/dev/null | head -50`], { cwd: WORKSPACE, timeout: 15000 });
          let out = '';
          p.stdout.on('data', d => out += d);
          p.on('close', () => r({ results: out.slice(0, 10000) }));
          p.on('error', e => r({ error: e.message }));
        });
      }
      case 'web_fetch': {
        const resp = await fetch(args.url, { headers: { 'User-Agent': 'CopilotAgentPortal/1.0' }, signal: AbortSignal.timeout(15000) });
        const text = await resp.text();
        const clean = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return { status: resp.status, content: clean.slice(0, 30000) };
      }
      case 'edit_file': {
        const p = resolve(WORKSPACE, args.path);
        if (!p.startsWith(WORKSPACE)) return { error: 'Forbidden' };
        const content = await readFile(p, 'utf-8');
        const count = content.split(args.old_text).length - 1;
        if (count === 0) return { error: 'old_text not found in file' };
        if (count > 1) return { error: `old_text found ${count} times` };
        await writeFile(p, content.replace(args.old_text, args.new_text), 'utf-8');
        return { status: 'edited', path: args.path };
      }
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (e) { return { error: e.message }; }
}

// ── Copilot SDK tool definitions ────────────────────────────────────────────

function buildTools() {
  const defs = [
    ['run_command', 'Execute a shell command in the workspace.', { command: { type: 'string', description: 'Shell command' }, cwd: { type: 'string', description: 'Working directory' } }, ['command']],
    ['read_file', 'Read a file in the workspace.', { path: { type: 'string', description: 'File path' } }, ['path']],
    ['write_file', 'Create or overwrite a file.', { path: { type: 'string', description: 'File path' }, content: { type: 'string', description: 'Content' } }, ['path', 'content']],
    ['list_directory', 'List files in a directory.', { path: { type: 'string', description: 'Directory path' } }, []],
    ['search_codebase', 'Search for text across files.', { query: { type: 'string', description: 'Search query' }, include: { type: 'string', description: 'File glob' } }, ['query']],
    ['web_fetch', 'Fetch content from a URL.', { url: { type: 'string', description: 'URL' } }, ['url']],
    ['edit_file', 'Replace exact unique text in a file.', { path: { type: 'string', description: 'File path' }, old_text: { type: 'string', description: 'Text to find' }, new_text: { type: 'string', description: 'Replacement' } }, ['path', 'old_text', 'new_text']],
  ];
  return defs.map(([name, desc, props, req]) => defineTool(name, {
    description: desc,
    parameters: { type: 'object', properties: props, required: req },
    handler: args => executeTool(name, args),
  }));
}

const SYSTEM_MSG = `You are an elite AI coding agent powered by the GitHub Copilot SDK and the awesome-copilot framework. You have direct access to a real terminal, filesystem, and web.

Tools: run_command, read_file, write_file, edit_file, list_directory, search_codebase, web_fetch

Expertise: GitHub Copilot (agents, instructions, MCP servers, SDK), Google Cloud Platform, Google GenAI API, full-stack development.

Rules: Use tools to verify before answering. Write complete implementations. Read files before editing. Workspace: /workspaces/workspaces`;

// ── WebSocket ───────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let ptyProc = null;
  let client = null;
  let session = null;
  let sessionModel = null;
  let oauthToken = null;

  const send = obj => { try { ws.send(JSON.stringify(obj)); } catch {} };

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── Auth: store OAuth token from frontend ──
    if (msg.type === 'auth:token') {
      oauthToken = msg.token;
      // Tear down existing client so next chat uses new token
      if (session) { try { await session.destroy(); } catch {} session = null; }
      if (client) { try { await client.stop(); } catch {} client = null; }
      sessionModel = null;
      // Verify token
      try {
        const c = new CopilotClient({ logLevel: 'error', githubToken: oauthToken });
        await c.start();
        const status = await c.getAuthStatus();
        await c.stop();
        send({ type: 'auth:verified', authenticated: status.isAuthenticated, detail: status.statusMessage });
      } catch (e) {
        send({ type: 'auth:verified', authenticated: false, error: e.message });
      }
      return;
    }

    // ── Terminal ──
    if (msg.type === 'terminal:input') {
      if (!ptyProc) {
        ptyProc = pty.spawn('bash', [], {
          name: 'xterm-256color', cols: msg.cols || 120, rows: msg.rows || 30,
          cwd: WORKSPACE, env: { ...process.env, TERM: 'xterm-256color' },
        });
        ptyProc.onData(data => send({ type: 'terminal:output', data }));
        ptyProc.onExit(() => { send({ type: 'terminal:exit' }); ptyProc = null; });
      }
      ptyProc.write(msg.data);
    }
    if (msg.type === 'terminal:resize' && ptyProc) ptyProc.resize(msg.cols, msg.rows);

    // ── Chat ──
    if (msg.type === 'chat:message') {
      const model = msg.model || 'gpt-4.1';
      send({ type: 'chat:thinking', status: 'Connecting to Copilot...' });

      try {
        if (!client) {
          const opts = { cwd: WORKSPACE, logLevel: 'error' };
          if (oauthToken) opts.githubToken = oauthToken;
          client = new CopilotClient(opts);
          await client.start();
        }

        if (session && sessionModel !== model) {
          try { await session.destroy(); } catch {}
          session = null;
        }

        if (!session) {
          let lastErr;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              session = await client.createSession({
                model, streaming: true,
                tools: buildTools(),
                systemMessage: { content: SYSTEM_MSG },
              });
              sessionModel = model;
              break;
            } catch (e) {
              lastErr = e;
              if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
            }
          }
          if (!session) throw lastErr;
        }

        send({ type: 'chat:thinking', status: 'Thinking...' });

        let responseText = '';
        const done = new Promise(resolve => {
          const unsubs = [];
          unsubs.push(session.on('assistant.message_delta', ev => {
            if (ev.data?.deltaContent) responseText += ev.data.deltaContent;
          }));
          unsubs.push(session.on('assistant.message', ev => {
            if (ev.data?.content) responseText = ev.data.content;
          }));
          unsubs.push(session.on('tool.execution_start', ev => {
            send({ type: 'chat:tool_call', tool: ev.data?.toolName || 'tool', args: ev.data?.arguments || {} });
          }));
          unsubs.push(session.on('tool.execution_complete', ev => {
            send({ type: 'chat:tool_result', tool: ev.data?.toolName || 'tool', result: JSON.stringify(ev.data?.result || {}).slice(0, 2000) });
          }));
          unsubs.push(session.on('session.idle', () => {
            unsubs.forEach(u => { if (typeof u === 'function') u(); });
            resolve();
          }));
        });

        await session.send({ prompt: msg.text });
        await done;
        send({ type: 'chat:response', text: responseText || '(No response)' });

      } catch (e) {
        console.error('Agent error:', e.message);
        send({ type: 'chat:error', error: e.message });
        if (session) { try { await session.destroy(); } catch {} }
        session = null; sessionModel = null;
      }
    }

    if (msg.type === 'chat:reset') {
      if (session) { try { await session.destroy(); } catch {} session = null; sessionModel = null; }
      send({ type: 'chat:cleared' });
    }
  });

  ws.on('close', () => {
    if (ptyProc) { try { ptyProc.kill(); } catch {} }
    if (session) { session.destroy().catch(() => {}); }
    if (client) { client.stop().catch(() => {}); }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Copilot Agent Portal on port ${PORT}`));
