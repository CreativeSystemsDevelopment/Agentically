#!/usr/bin/env node
// Extracts ALL agents, instructions, prompts, MCP servers, collections from awesome-copilot repo
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
// YAML frontmatter parsed manually below

const REPO = '/workspaces/workspaces/awesome-copilot';
const OUT = '/workspaces/workspaces/portal/data/full-catalog.json';

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: content };
  const meta = parseYamlSimple(m[1]);
  return { meta, body: m[2] };
}

// Simple YAML parser for frontmatter (handles the patterns in awesome-copilot)
function parseYamlSimple(yaml) {
  const meta = {};
  let currentKey = null;
  let currentIndent = 0;
  let listKey = null;
  let mapKey = null;
  let mapObj = null;

  for (const line of yaml.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    // Top-level key: value
    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch && indent === 0) {
      currentKey = kvMatch[1];
      let val = kvMatch[2].trim();

      if (val === '' || val === '|' || val === '>') {
        // Multi-line or nested
        if (val === '') meta[currentKey] = {};
        else meta[currentKey] = '';
        mapKey = currentKey;
        mapObj = {};
        continue;
      }

      // Array: ['a', 'b', 'c']
      if (val.startsWith('[')) {
        try {
          val = JSON.parse(val.replace(/'/g, '"'));
        } catch {
          val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
        }
      }
      // Quoted string
      else if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1);
      }
      // Boolean/number
      else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+$/.test(val)) val = parseInt(val);

      meta[currentKey] = val;
      mapKey = null;
      mapObj = null;
      continue;
    }

    // List item under current key: - value
    const listMatch = trimmed.match(/^-\s+(.+)$/);
    if (listMatch && currentKey && indent > 0) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      let val = listMatch[1].trim();
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) val = val.slice(1, -1);
      meta[currentKey].push(val);
      continue;
    }

    // Nested key under map
    if (mapKey && indent > 0) {
      const nestedKv = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
      if (nestedKv) {
        if (typeof meta[mapKey] !== 'object' || Array.isArray(meta[mapKey])) meta[mapKey] = {};
        let val = nestedKv[2].trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) val = val.slice(1, -1);
        meta[mapKey][nestedKv[1]] = val;
      }
      continue;
    }
  }
  return meta;
}

async function readAllFiles(dir, ext) {
  const results = [];
  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (!f.endsWith(ext)) continue;
      const content = await readFile(join(dir, f), 'utf-8');
      const slug = f.replace(ext, '');
      const { meta, body } = parseFrontmatter(content);
      results.push({ slug, file: f, meta, body: body.trim() });
    }
  } catch (e) {
    console.error(`Error reading ${dir}:`, e.message);
  }
  return results;
}

async function readCollections(dir) {
  const results = [];
  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.collection.yml')) continue;
      const content = await readFile(join(dir, f), 'utf-8');
      const meta = parseYamlSimple(content);
      // Parse items manually
      const items = [];
      const itemMatches = content.matchAll(/- path:\s*(.+)\n\s*kind:\s*(.+)/g);
      for (const m of itemMatches) {
        items.push({ path: m[1].trim(), kind: m[2].trim() });
      }
      results.push({ slug: f.replace('.collection.yml', ''), file: f, meta, items });
    }
  } catch (e) {
    console.error(`Error reading collections:`, e.message);
  }
  return results;
}

async function main() {
  console.log('Extracting from', REPO);

  const agents = await readAllFiles(join(REPO, 'agents'), '.agent.md');
  console.log(`  Agents: ${agents.length}`);

  const instructions = await readAllFiles(join(REPO, 'instructions'), '.instructions.md');
  console.log(`  Instructions: ${instructions.length}`);

  const prompts = await readAllFiles(join(REPO, 'prompts'), '.prompt.md');
  console.log(`  Prompts: ${prompts.length}`);

  const collections = await readCollections(join(REPO, 'collections'));
  console.log(`  Collections: ${collections.length}`);

  // Extract unique tools from all agents
  const toolSet = new Set();
  agents.forEach(a => {
    const tools = a.meta.tools;
    if (Array.isArray(tools)) tools.forEach(t => toolSet.add(t));
  });
  const allTools = Array.from(toolSet).sort();
  console.log(`  Unique tools: ${allTools.length}`);

  // Extract MCP servers from agents by parsing the raw frontmatter
  const mcpServers = {};
  for (const a of agents) {
    const raw = await readFile(join(REPO, 'agents', a.file), 'utf-8');
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    if (!fm.includes('mcp-servers')) continue;
    // Extract server blocks: indented under mcp-servers
    const mcpSection = fm.split('mcp-servers:')[1];
    if (!mcpSection) continue;
    // Find server names (2-space indented keys)
    const serverMatches = mcpSection.matchAll(/^  (\w[\w-]*):/gm);
    for (const sm of serverMatches) {
      const srvName = sm[1];
      // Extract type and url from the block
      const blockStart = mcpSection.indexOf(srvName + ':');
      const block = mcpSection.slice(blockStart, blockStart + 500);
      const typeMatch = block.match(/type:\s*['"]?(\w+)['"]?/);
      const urlMatch = block.match(/url:\s*['"]?([^'"\n]+)['"]?/);
      if (!mcpServers[srvName]) {
        mcpServers[srvName] = { id: srvName, type: typeMatch?.[1] || 'unknown', url: urlMatch?.[1] || '', usedBy: [] };
      }
      mcpServers[srvName].usedBy.push(a.slug);
    }
  }
  console.log(`  MCP servers: ${Object.keys(mcpServers).length}`);

  // Categorize tools
  const toolCategories = categorizeTools(allTools);

  const catalog = {
    agents: agents.map(a => ({
      slug: a.slug,
      name: a.meta.name || a.slug,
      description: a.meta.description || '',
      model: a.meta.model || '',
      tools: Array.isArray(a.meta.tools) ? a.meta.tools : [],
      body: a.body,
      hasMcp: !!a.meta['mcp-servers'],
    })),
    instructions: instructions.map(i => ({
      slug: i.slug,
      name: i.meta.description || i.slug,
      applyTo: i.meta.applyTo || '',
      body: i.body,
    })),
    prompts: prompts.map(p => ({
      slug: p.slug,
      name: p.meta.description || p.slug,
      agent: p.meta.agent || '',
      body: p.body,
    })),
    collections: collections.map(c => ({
      slug: c.slug,
      name: c.meta.name || c.slug,
      description: c.meta.description || '',
      tags: c.meta.tags || [],
      items: c.items,
    })),
    tools: allTools,
    toolCategories,
    mcpServers: Object.values(mcpServers),
  };

  await mkdir(join(OUT, '..'), { recursive: true });
  await writeFile(OUT, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`\nWritten to ${OUT}`);
  console.log(`  Total size: ${(JSON.stringify(catalog).length / 1024).toFixed(0)} KB`);
}

function categorizeTools(tools) {
  const cats = {
    'Core (Read/Edit/Search)': ['codebase', 'read', 'edit', 'editFiles', 'edit/editFiles', 'new', 'search', 'search/codebase', 'search/searchResults', 'searchResults', 'search/usages', 'usages', 'search/changes', 'changes', 'findTestFiles', 'problems', 'read/problems'],
    'Terminal & Execute': ['runCommands', 'terminalCommand', 'shell', 'terminalLastCommand', 'terminalSelection', 'read/terminalLastCommand', 'read/terminalSelection', 'runTests', 'execute/runTests', 'testFailure', 'execute/testFailure', 'runTasks', 'execute/getTerminalOutput', 'execute/runInTerminal', 'execute/createAndRunTask', 'execute/getTaskOutput', 'execute/runTask'],
    'Web': ['web/fetch', 'fetch', 'web/githubRepo', 'githubRepo', 'openSimpleBrowser', 'vscode/openSimpleBrowser', 'websearch'],
    'VS Code': ['extensions', 'vscode/extensions', 'vscodeAPI', 'vscode/vscodeAPI', 'vscode', 'runNotebooks', 'execute/runNotebookCell', 'readCellOutput', 'read/getNotebookSummary', 'read/readNotebookCellOutput', 'vscode/getProjectSetupInfo', 'vscode/installExtension', 'vscode/newWorkspace', 'updateUserPreferences'],
    'GitHub': ['github', 'github/*', 'github/create_branch', 'github/create_issue', 'github/create_or_update_file', 'github/create_pull_request', 'github/get_commit', 'github/get_file_contents', 'github/get_pull_request', 'github/get_repository', 'github/issue_read', 'github/list_branches', 'github/list_commits', 'github/list_pull_requests', 'github/list_repository_contributors', 'github/search_code', 'github/search_commits', 'github/search_issues', 'git', 'git_diff', 'git_log', 'git_show', 'git_status', 'list_issues', 'add_issue_comment', 'create_issue', 'create_issue_comment', 'update_issue', 'delete_issue', 'get_issue', 'search_issues', 'activePullRequest', 'copilotCodingAgent'],
    'Database': ['database', 'pgsql_*', 'pgsql_connect', 'pgsql_disconnect', 'pgsql_listDatabases', 'pgsql_listServers', 'pgsql_query', 'pgsql_visualizeSchema', 'pgsql_bulkLoadCsv', 'pgsql_describeCsv', 'pgsql_modifyDatabase', 'pgsql_open_script', 'mssql_*', 'mssql_connect', 'mssql_disconnect', 'mssql_listDatabases', 'mssql_listServers', 'mssql_query', 'mssql_visualizeSchema'],
    'Agent & Orchestration': ['agent', 'agent/runSubagent', 'runSubagent', 'todo', 'todos', 'think'],
    'Azure & Cloud': ['azure-mcp/*', 'microsoft.docs.mcp', 'microsoft-docs', 'microsoft_docs_search', 'microsoft_docs_fetch', 'azure_design_architecture', 'azure_get_code_gen_best_practices', 'azure_get_deployment_best_practices', 'azure_get_swa_best_practices', 'azure_query_learn', 'azure_get_schema_for_Bicep', 'azureterraformbestpractices', 'cloudarchitect', 'ms-azuretools.vscode-azure-github-copilot/azure_query_azure_resource_graph'],
    'Python': ['configurePythonEnvironment', 'getPythonEnvironmentInfo', 'getPythonExecutableCommand', 'installPythonPackage'],
    'Specialized': ['playwright', 'atlassian', 'filesystem', 'terraform', 'terraform/*', 'documentation', 'get_bestpractices'],
  };

  const result = [];
  const assigned = new Set();
  for (const [catName, catTools] of Object.entries(cats)) {
    const matched = tools.filter(t => catTools.includes(t));
    matched.forEach(t => assigned.add(t));
    if (matched.length) result.push({ name: catName, tools: matched });
  }
  // Uncategorized
  const uncat = tools.filter(t => !assigned.has(t));
  if (uncat.length) result.push({ name: 'Other / MCP', tools: uncat });
  return result;
}

main().catch(e => { console.error(e); process.exit(1); });
