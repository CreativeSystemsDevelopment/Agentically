# Awesome Copilot Tools Reference

Complete catalog of all tools from the [github/awesome-copilot](https://github.com/github/awesome-copilot) repository, with Python implementations for each tool. These tools are used across 156+ agent definitions to power specialized AI workflows.

> **Source**: github/awesome-copilot (21k+ stars)
> **Purpose**: Reference for building no-code drag-and-drop agent/workflow builders

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Read/Edit/Search Tools](#2-core-readedit-search-tools)
3. [Terminal and Execute Tools](#3-terminal-and-execute-tools)
4. [Web Tools](#4-web-tools)
5. [VS Code Integration Tools](#5-vs-code-integration-tools)
6. [Database Tools](#6-database-tools)
7. [MCP Server Tools](#7-mcp-server-tools)
8. [GitHub API Tools](#8-github-api-tools)
9. [Agent and Orchestration Tools](#9-agent-and-orchestration-tools)
10. [Azure and Cloud Tools](#10-azure-and-cloud-tools)
11. [Python Environment Tools](#11-python-environment-tools)
12. [Specialized Domain Tools](#12-specialized-domain-tools)
13. [Appendix: Agent-to-Tool Mapping](#13-appendix-agent-to-tool-mapping)

---

## 1. Architecture Overview

Each agent in awesome-copilot is a `.agent.md` file with YAML frontmatter defining:

```yaml
---
name: "Agent Name"
description: "What the agent does"
model: "GPT-4.1"                    # LLM model
tools: ['codebase', 'edit/editFiles', 'search', 'runCommands']  # Tools available
mcp-servers:                         # External MCP server connections
  server-name:
    type: 'http'
    url: 'https://...'
    tools: ['tool1', 'tool2']
handoffs:                            # Agent-to-agent delegation
  - label: "Hand off to X"
    agent: other-agent
---
# Agent instructions in markdown...
```

### Tool Categories

| Category | Count | Description |
|----------|-------|-------------|
| Core Read/Edit/Search | 12 | File reading, editing, code search |
| Terminal/Execute | 10 | Command execution, terminal interaction |
| Web | 4 | HTTP fetch, browser, web search |
| VS Code Integration | 12 | Extensions, API, notebooks, tasks |
| Database | 18 | PostgreSQL, MSSQL, Neo4j operations |
| MCP Servers | 18+ | External service integrations |
| GitHub API | 16 | Repository, PR, issue management |
| Agent/Orchestration | 5 | Sub-agent delegation, todos |
| Azure/Cloud | 10 | Azure resource management |
| Python Environment | 4 | Python-specific tooling |
| Specialized | 10+ | Playwright, Terraform, Salesforce, etc. |

---


## 2. Core Read/Edit/Search Tools

These are the foundational tools used by nearly every agent for file system operations.

### 2.1 `codebase` / `read`

Read files and understand project structure. Aliases: `codebase`, `read`, `search/codebase`.

**Used by**: 120+ agents

```python
import os
import fnmatch
from pathlib import Path
from typing import Optional


class CodebaseTool:
    """Read files, list directories, and understand project structure."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def read_file(self, file_path: str, start_line: int = 0, end_line: int = -1) -> dict:
        """Read a file's contents, optionally a specific line range."""
        full_path = self.workspace_root / file_path
        if not full_path.exists():
            return {"error": f"File not found: {file_path}"}
        if not full_path.is_file():
            return {"error": f"Not a file: {file_path}"}

        lines = full_path.read_text(encoding="utf-8", errors="replace").splitlines()
        if end_line == -1:
            end_line = len(lines)
        selected = lines[start_line:end_line]
        return {
            "path": file_path,
            "content": "\n".join(selected),
            "total_lines": len(lines),
            "range": [start_line, end_line],
        }

    def list_directory(self, dir_path: str = ".", max_depth: int = 2) -> dict:
        """List files and directories up to a given depth."""
        full_path = self.workspace_root / dir_path
        if not full_path.is_dir():
            return {"error": f"Not a directory: {dir_path}"}

        entries = []
        self._walk(full_path, entries, depth=0, max_depth=max_depth)
        return {"path": dir_path, "entries": entries}

    def _walk(self, path: Path, entries: list, depth: int, max_depth: int):
        if depth > max_depth:
            return
        ignore = {"node_modules", ".git", "__pycache__", ".venv", "venv"}
        for item in sorted(path.iterdir()):
            if item.name.startswith(".") or item.name in ignore:
                continue
            entry = {"name": item.name, "type": "dir" if item.is_dir() else "file"}
            if item.is_dir():
                entry["children"] = []
                self._walk(item, entry["children"], depth + 1, max_depth)
            entries.append(entry)

    def find_files(self, pattern: str, directory: str = ".") -> list[str]:
        """Find files matching a glob pattern."""
        full_path = self.workspace_root / directory
        return [
            str(p.relative_to(self.workspace_root))
            for p in full_path.rglob(pattern)
            if p.is_file()
        ]

    def get_file_outline(self, file_path: str) -> dict:
        """Extract function/class definitions from a file (basic outline)."""
        full_path = self.workspace_root / file_path
        content = full_path.read_text(encoding="utf-8", errors="replace")
        symbols = []
        for i, line in enumerate(content.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith(("def ", "class ", "async def ")):
                symbols.append({"line": i, "text": stripped.split("(")[0]})
            elif stripped.startswith(("function ", "export function ", "export default")):
                symbols.append({"line": i, "text": stripped[:80]})
        return {"path": file_path, "symbols": symbols}
```

### 2.2 `edit/editFiles` / `editFiles` / `edit`

Create, modify, and delete files. Aliases: `edit/editFiles`, `editFiles`, `edit`, `new`.

**Used by**: 100+ agents

```python
import difflib
from pathlib import Path
from typing import Optional


class EditFilesTool:
    """Create, edit, and delete files with diff-based or full-content edits."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def create_file(self, file_path: str, content: str) -> dict:
        """Create a new file or overwrite an existing one."""
        full_path = self.workspace_root / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")
        return {"status": "created", "path": file_path, "size": len(content)}

    def edit_file(self, file_path: str, old_text: str, new_text: str) -> dict:
        """Replace exact text in a file (str_replace style)."""
        full_path = self.workspace_root / file_path
        if not full_path.exists():
            return {"error": f"File not found: {file_path}"}

        content = full_path.read_text(encoding="utf-8")
        count = content.count(old_text)
        if count == 0:
            return {"error": "old_text not found in file"}
        if count > 1:
            return {"error": f"old_text found {count} times, must be unique"}

        new_content = content.replace(old_text, new_text, 1)
        full_path.write_text(new_content, encoding="utf-8")

        diff = list(difflib.unified_diff(
            content.splitlines(keepends=True),
            new_content.splitlines(keepends=True),
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
        ))
        return {"status": "edited", "path": file_path, "diff": "".join(diff)}

    def insert_at_line(self, file_path: str, line_number: int, text: str) -> dict:
        """Insert text at a specific line number."""
        full_path = self.workspace_root / file_path
        lines = full_path.read_text(encoding="utf-8").splitlines(keepends=True)
        lines.insert(line_number, text if text.endswith("\n") else text + "\n")
        full_path.write_text("".join(lines), encoding="utf-8")
        return {"status": "inserted", "path": file_path, "at_line": line_number}

    def delete_file(self, file_path: str) -> dict:
        """Delete a file."""
        full_path = self.workspace_root / file_path
        if not full_path.exists():
            return {"error": f"File not found: {file_path}"}
        full_path.unlink()
        return {"status": "deleted", "path": file_path}

    def multi_replace(self, file_path: str, replacements: list[dict]) -> dict:
        """Apply multiple replacements to a file in one operation.
        Each replacement: {"old": "...", "new": "..."}
        """
        full_path = self.workspace_root / file_path
        content = full_path.read_text(encoding="utf-8")
        applied = 0
        for r in replacements:
            if r["old"] in content:
                content = content.replace(r["old"], r["new"], 1)
                applied += 1
        full_path.write_text(content, encoding="utf-8")
        return {"status": "multi_replaced", "applied": applied, "total": len(replacements)}
```

### 2.3 `search` / `search/searchResults`

Search across the codebase using text, regex, or semantic queries.

**Used by**: 110+ agents

```python
import re
import subprocess
from pathlib import Path
from dataclasses import dataclass


@dataclass
class SearchResult:
    file: str
    line: int
    text: str
    context_before: list[str]
    context_after: list[str]


class SearchTool:
    """Search codebase by text, regex, or symbol references."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def text_search(self, query: str, include: str = "**/*",
                    exclude: str = "", max_results: int = 50) -> list[dict]:
        """Search for text across files using ripgrep if available, else fallback."""
        try:
            cmd = ["rg", "--json", "-n", "--max-count", "5", query, str(self.workspace_root)]
            if include != "**/*":
                cmd.extend(["--glob", include])
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return self._parse_rg_output(result.stdout, max_results)
        except FileNotFoundError:
            return self._fallback_search(query, include, max_results)

    def regex_search(self, pattern: str, include: str = "**/*",
                     max_results: int = 50) -> list[dict]:
        """Search using a regular expression pattern."""
        compiled = re.compile(pattern)
        results = []
        for path in self.workspace_root.rglob("*"):
            if not path.is_file():
                continue
            try:
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
                for i, line in enumerate(lines):
                    if compiled.search(line):
                        results.append({
                            "file": str(path.relative_to(self.workspace_root)),
                            "line": i + 1,
                            "text": line.strip(),
                        })
                        if len(results) >= max_results:
                            return results
            except (OSError, UnicodeDecodeError):
                continue
        return results

    def find_references(self, symbol: str, file_path: str = None) -> list[dict]:
        """Find all references to a symbol across the codebase."""
        return self.text_search(symbol)

    def _fallback_search(self, query, include, max_results):
        results = []
        for path in self.workspace_root.rglob("*"):
            if not path.is_file() or path.stat().st_size > 1_000_000:
                continue
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
                for i, line in enumerate(content.splitlines()):
                    if query in line:
                        results.append({
                            "file": str(path.relative_to(self.workspace_root)),
                            "line": i + 1,
                            "text": line.strip(),
                        })
                        if len(results) >= max_results:
                            return results
            except (OSError, UnicodeDecodeError):
                continue
        return results

    def _parse_rg_output(self, output: str, max_results: int) -> list[dict]:
        import json as _json
        results = []
        for line in output.splitlines():
            try:
                data = _json.loads(line)
                if data.get("type") == "match":
                    match_data = data["data"]
                    results.append({
                        "file": match_data["path"]["text"],
                        "line": match_data["line_number"],
                        "text": match_data["lines"]["text"].strip(),
                    })
                    if len(results) >= max_results:
                        break
            except (ValueError, KeyError):
                continue
        return results
```

### 2.4 `usages` / `search/usages`

Find all usages/references of a symbol.

**Used by**: 40+ agents

```python
from pathlib import Path
import re


class UsagesTool:
    """Find all usages of a symbol (function, class, variable) across the codebase."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def find_usages(self, symbol: str, language: str = None) -> list[dict]:
        """Find all files and lines where a symbol is referenced."""
        results = []
        extensions = self._get_extensions(language)

        for path in self.workspace_root.rglob("*"):
            if not path.is_file():
                continue
            if extensions and path.suffix not in extensions:
                continue
            if any(part.startswith(".") or part == "node_modules"
                   for part in path.parts):
                continue
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
                for i, line in enumerate(content.splitlines(), 1):
                    if re.search(rf'\b{re.escape(symbol)}\b', line):
                        results.append({
                            "file": str(path.relative_to(self.workspace_root)),
                            "line": i,
                            "text": line.strip(),
                            "is_definition": self._is_definition(line, symbol),
                        })
            except (OSError, UnicodeDecodeError):
                continue
        return results

    def _is_definition(self, line: str, symbol: str) -> bool:
        stripped = line.strip()
        patterns = [
            rf'^(def|class|async def)\s+{re.escape(symbol)}\b',
            rf'^(function|const|let|var|export)\s+{re.escape(symbol)}\b',
        ]
        return any(re.match(p, stripped) for p in patterns)

    def _get_extensions(self, language: str) -> set:
        mapping = {
            "python": {".py"}, "javascript": {".js", ".jsx", ".mjs"},
            "typescript": {".ts", ".tsx"}, "go": {".go"},
            "rust": {".rs"}, "java": {".java"}, "csharp": {".cs"},
        }
        return mapping.get(language, set())
```

### 2.5 `changes` / `search/changes`

View pending changes (git diff) in the workspace.

**Used by**: 50+ agents

```python
import subprocess
from pathlib import Path


class ChangesTool:
    """View uncommitted changes, staged files, and recent git history."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def get_changes(self, staged_only: bool = False) -> dict:
        """Get current uncommitted changes."""
        cmd = ["git", "diff"]
        if staged_only:
            cmd.append("--staged")
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            cwd=self.workspace_root, timeout=30
        )
        return {
            "diff": result.stdout,
            "changed_files": self._get_changed_files(staged_only),
        }

    def get_changed_files(self) -> list[dict]:
        """List all changed files with their status."""
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True,
            cwd=self.workspace_root, timeout=30
        )
        files = []
        for line in result.stdout.splitlines():
            if len(line) >= 4:
                status = line[:2].strip()
                path = line[3:]
                files.append({"status": status, "path": path})
        return files

    def _get_changed_files(self, staged: bool) -> list[str]:
        cmd = ["git", "diff", "--name-only"]
        if staged:
            cmd.append("--staged")
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            cwd=self.workspace_root, timeout=30
        )
        return [f for f in result.stdout.splitlines() if f.strip()]
```

### 2.6 `findTestFiles`

Locate test files related to a source file.

**Used by**: 45+ agents

```python
from pathlib import Path
import json


class FindTestFilesTool:
    """Find test files associated with source files."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def find_test_files(self, source_file: str = None) -> list[str]:
        """Find test files, optionally related to a specific source file."""
        test_patterns = [
            "*_test.*", "*_spec.*", "*.test.*", "*.spec.*",
            "test_*.*",
        ]
        test_dirs = ["tests", "__tests__", "test", "spec"]
        test_files = set()

        for pattern in test_patterns:
            for path in self.workspace_root.rglob(pattern):
                if path.is_file():
                    test_files.add(str(path.relative_to(self.workspace_root)))

        for td in test_dirs:
            test_dir = self.workspace_root / td
            if test_dir.is_dir():
                for path in test_dir.rglob("*"):
                    if path.is_file() and path.suffix in {".py", ".js", ".ts", ".go", ".rs"}:
                        test_files.add(str(path.relative_to(self.workspace_root)))

        if source_file:
            source_stem = Path(source_file).stem
            related = [f for f in test_files if source_stem in f]
            return related if related else sorted(test_files)[:20]

        return sorted(test_files)[:50]

    def find_test_framework(self) -> dict:
        """Detect the test framework used in the project."""
        pkg_json = self.workspace_root / "package.json"
        if pkg_json.exists():
            data = json.loads(pkg_json.read_text())
            deps = {**data.get("devDependencies", {}), **data.get("dependencies", {})}
            for fw, cmd in [("jest", "npx jest"), ("vitest", "npx vitest"), ("mocha", "npx mocha")]:
                if fw in deps:
                    return {"framework": fw, "command": cmd}

        if (self.workspace_root / "pytest.ini").exists() or \
           (self.workspace_root / "pyproject.toml").exists():
            return {"framework": "pytest", "command": "pytest"}

        return {"framework": "unknown", "command": None}
```

### 2.7 `problems` / `read/problems`

Get diagnostics/errors from the editor or linter.

**Used by**: 55+ agents

```python
import subprocess
import json
from pathlib import Path


class ProblemsTool:
    """Get compiler errors, linter warnings, and diagnostics."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def get_problems(self, file_path: str = None, severity: str = "all") -> list[dict]:
        """Get current problems/diagnostics from linters and compilers."""
        problems = []
        problems.extend(self._run_eslint(file_path))
        problems.extend(self._run_pyflakes(file_path))
        problems.extend(self._run_tsc(file_path))

        if severity != "all":
            problems = [p for p in problems if p["severity"] == severity]
        return problems

    def _run_eslint(self, file_path: str = None) -> list[dict]:
        target = file_path or "."
        try:
            result = subprocess.run(
                ["npx", "eslint", "--format", "json", target],
                capture_output=True, text=True,
                cwd=self.workspace_root, timeout=60
            )
            data = json.loads(result.stdout) if result.stdout else []
            problems = []
            for file_result in data:
                for msg in file_result.get("messages", []):
                    problems.append({
                        "file": file_result["filePath"],
                        "line": msg.get("line", 0),
                        "column": msg.get("column", 0),
                        "severity": "error" if msg.get("severity") == 2 else "warning",
                        "message": msg.get("message", ""),
                        "rule": msg.get("ruleId", ""),
                        "source": "eslint",
                    })
            return problems
        except (FileNotFoundError, json.JSONDecodeError, subprocess.TimeoutExpired):
            return []

    def _run_pyflakes(self, file_path: str = None) -> list[dict]:
        if not file_path or not file_path.endswith(".py"):
            return []
        try:
            result = subprocess.run(
                ["python", "-m", "pyflakes", file_path],
                capture_output=True, text=True,
                cwd=self.workspace_root, timeout=30
            )
            problems = []
            for line in result.stdout.splitlines():
                parts = line.split(":", 2)
                if len(parts) >= 3:
                    problems.append({
                        "file": parts[0], "line": int(parts[1]),
                        "severity": "warning", "message": parts[2].strip(),
                        "source": "pyflakes",
                    })
            return problems
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return []

    def _run_tsc(self, file_path: str = None) -> list[dict]:
        tsconfig = self.workspace_root / "tsconfig.json"
        if not tsconfig.exists():
            return []
        try:
            result = subprocess.run(
                ["npx", "tsc", "--noEmit", "--pretty", "false"],
                capture_output=True, text=True,
                cwd=self.workspace_root, timeout=120
            )
            problems = []
            for line in result.stdout.splitlines():
                match = __import__("re").match(r'(.+)\((\d+),(\d+)\): error (TS\d+): (.+)', line)
                if match:
                    problems.append({
                        "file": match.group(1), "line": int(match.group(2)),
                        "column": int(match.group(3)), "severity": "error",
                        "message": match.group(5), "rule": match.group(4),
                        "source": "typescript",
                    })
            return problems
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return []
```

---

## 3. Terminal and Execute Tools

Tools for running commands, interacting with terminals, and executing tasks.

### 3.1 `runCommands` / `terminalCommand` / `execute/runInTerminal`

Execute shell commands in the terminal.

**Used by**: 70+ agents

```python
import subprocess
import shlex
from pathlib import Path
from typing import Optional


class RunCommandsTool:
    """Execute shell commands and capture output."""

    def __init__(self, workspace_root: str, timeout: int = 120):
        self.workspace_root = Path(workspace_root)
        self.timeout = timeout
        self._history: list[dict] = []

    def run(self, command: str, cwd: str = None, env: dict = None) -> dict:
        """Execute a shell command and return output."""
        work_dir = Path(cwd) if cwd else self.workspace_root
        merged_env = {**__import__("os").environ, **(env or {})}

        try:
            result = subprocess.run(
                command, shell=True,
                capture_output=True, text=True,
                cwd=work_dir, timeout=self.timeout,
                env=merged_env,
            )
            output = {
                "command": command,
                "stdout": result.stdout[-10000:],  # Truncate large output
                "stderr": result.stderr[-5000:],
                "exit_code": result.returncode,
                "success": result.returncode == 0,
            }
            self._history.append(output)
            return output
        except subprocess.TimeoutExpired:
            return {"command": command, "error": f"Timed out after {self.timeout}s"}
        except Exception as e:
            return {"command": command, "error": str(e)}

    def run_background(self, command: str, cwd: str = None) -> dict:
        """Start a background process (e.g., dev server)."""
        work_dir = Path(cwd) if cwd else self.workspace_root
        process = subprocess.Popen(
            command, shell=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=work_dir,
        )
        return {"pid": process.pid, "command": command, "status": "running"}

    def get_history(self, last_n: int = 5) -> list[dict]:
        """Get recent command history."""
        return self._history[-last_n:]
```

### 3.2 `terminalLastCommand` / `read/terminalLastCommand`

Get the output of the last terminal command.

**Used by**: 50+ agents

```python
class TerminalLastCommandTool:
    """Retrieve the output and status of the most recent terminal command."""

    def __init__(self, run_commands_tool: "RunCommandsTool"):
        self.run_commands = run_commands_tool

    def get_last_command(self) -> dict:
        """Get the last executed command and its output."""
        history = self.run_commands.get_history(last_n=1)
        if not history:
            return {"error": "No commands have been executed yet"}
        return history[0]

    def get_last_output(self) -> str:
        """Get just the stdout of the last command."""
        last = self.get_last_command()
        return last.get("stdout", last.get("error", ""))
```

### 3.3 `terminalSelection` / `read/terminalSelection`

Get the currently selected text in the terminal.

**Used by**: 40+ agents

```python
class TerminalSelectionTool:
    """Access the currently selected text in the terminal."""

    def __init__(self):
        self._selection: str = ""

    def set_selection(self, text: str):
        """Set the current terminal selection (called by IDE integration)."""
        self._selection = text

    def get_selection(self) -> dict:
        """Get the currently selected text in the terminal."""
        if not self._selection:
            return {"error": "No text is currently selected in the terminal"}
        return {"selection": self._selection}
```

### 3.4 `runTests` / `execute/runTests`

Run the project's test suite.

**Used by**: 45+ agents

```python
import subprocess
import json
from pathlib import Path


class RunTestsTool:
    """Run test suites and parse results."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def run_tests(self, test_file: str = None, test_name: str = None,
                  framework: str = None) -> dict:
        """Run tests and return structured results."""
        if not framework:
            framework = self._detect_framework()

        cmd = self._build_command(framework, test_file, test_name)
        if not cmd:
            return {"error": f"Unknown test framework: {framework}"}

        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            cwd=self.workspace_root, timeout=300
        )
        return {
            "command": cmd,
            "passed": result.returncode == 0,
            "stdout": result.stdout[-10000:],
            "stderr": result.stderr[-5000:],
            "exit_code": result.returncode,
        }

    def _detect_framework(self) -> str:
        if (self.workspace_root / "package.json").exists():
            data = json.loads((self.workspace_root / "package.json").read_text())
            deps = {**data.get("devDependencies", {}), **data.get("dependencies", {})}
            if "vitest" in deps: return "vitest"
            if "jest" in deps: return "jest"
        if (self.workspace_root / "pyproject.toml").exists():
            return "pytest"
        if (self.workspace_root / "go.mod").exists():
            return "go"
        return "unknown"

    def _build_command(self, framework: str, test_file: str, test_name: str) -> str:
        commands = {
            "jest": "npx jest",
            "vitest": "npx vitest run",
            "pytest": "pytest -v",
            "go": "go test -v ./...",
            "mocha": "npx mocha",
        }
        cmd = commands.get(framework)
        if not cmd:
            return None
        if test_file:
            cmd += f" {test_file}"
        if test_name and framework in ("jest", "vitest"):
            cmd += f" -t '{test_name}'"
        elif test_name and framework == "pytest":
            cmd += f" -k '{test_name}'"
        return cmd
```

### 3.5 `testFailure` / `execute/testFailure`

Get details about the most recent test failure.

**Used by**: 40+ agents

```python
import re
from dataclasses import dataclass


@dataclass
class TestFailureInfo:
    test_name: str
    file_path: str
    line_number: int
    message: str
    expected: str
    actual: str
    stack_trace: str


class TestFailureTool:
    """Parse and present test failure details for debugging."""

    def get_failure_details(self, test_output: str) -> list[dict]:
        """Parse test output to extract failure details."""
        failures = []

        # Jest/Vitest pattern
        jest_pattern = re.compile(
            r'● (.+?)\n\n\s+expect\((.+?)\)\.(.+?)\((.+?)\)\n\n'
            r'\s+Expected: (.+?)\n\s+Received: (.+?)\n',
            re.DOTALL
        )
        for match in jest_pattern.finditer(test_output):
            failures.append({
                "test_name": match.group(1).strip(),
                "expected": match.group(5).strip(),
                "actual": match.group(6).strip(),
                "framework": "jest",
            })

        # Pytest pattern
        pytest_pattern = re.compile(
            r'FAILED (.+?)::(.+?) - (.+?)$',
            re.MULTILINE
        )
        for match in pytest_pattern.finditer(test_output):
            failures.append({
                "file": match.group(1),
                "test_name": match.group(2),
                "message": match.group(3),
                "framework": "pytest",
            })

        # Go test pattern
        go_pattern = re.compile(
            r'--- FAIL: (.+?) \((.+?)\)\n(.*?)(?=--- |FAIL\s)',
            re.DOTALL
        )
        for match in go_pattern.finditer(test_output):
            failures.append({
                "test_name": match.group(1),
                "duration": match.group(2),
                "output": match.group(3).strip(),
                "framework": "go",
            })

        return failures
```

### 3.6 `runTasks` / `execute/createAndRunTask` / `execute/runTask`

Run predefined VS Code tasks or create new ones.

**Used by**: 30+ agents

```python
import json
import subprocess
from pathlib import Path


class RunTasksTool:
    """Run VS Code tasks defined in .vscode/tasks.json or custom tasks."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def list_tasks(self) -> list[dict]:
        """List available tasks from .vscode/tasks.json."""
        tasks_file = self.workspace_root / ".vscode" / "tasks.json"
        if not tasks_file.exists():
            return []
        data = json.loads(tasks_file.read_text())
        return [
            {"label": t.get("label"), "type": t.get("type"), "command": t.get("command")}
            for t in data.get("tasks", [])
        ]

    def run_task(self, label: str) -> dict:
        """Run a task by its label."""
        tasks = self._load_tasks()
        task = next((t for t in tasks if t.get("label") == label), None)
        if not task:
            return {"error": f"Task not found: {label}"}

        command = task.get("command", "")
        args = task.get("args", [])
        full_cmd = f"{command} {' '.join(args)}".strip()

        result = subprocess.run(
            full_cmd, shell=True, capture_output=True, text=True,
            cwd=self.workspace_root, timeout=300
        )
        return {
            "task": label, "command": full_cmd,
            "stdout": result.stdout[-10000:],
            "exit_code": result.returncode,
        }

    def create_and_run(self, label: str, command: str) -> dict:
        """Create a temporary task and run it."""
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True,
            cwd=self.workspace_root, timeout=300
        )
        return {
            "task": label, "command": command,
            "stdout": result.stdout[-10000:],
            "stderr": result.stderr[-5000:],
            "exit_code": result.returncode,
        }

    def _load_tasks(self) -> list[dict]:
        tasks_file = self.workspace_root / ".vscode" / "tasks.json"
        if not tasks_file.exists():
            return []
        return json.loads(tasks_file.read_text()).get("tasks", [])
```

### 3.7 `execute/getTerminalOutput` / `execute/getTaskOutput`

Get output from running terminals or tasks.

**Used by**: 15+ agents

```python
class GetTerminalOutputTool:
    """Retrieve output from running terminal sessions or completed tasks."""

    def __init__(self):
        self._outputs: dict[str, str] = {}

    def register_output(self, terminal_id: str, output: str):
        """Register output from a terminal (called by IDE integration)."""
        self._outputs[terminal_id] = output

    def get_output(self, terminal_id: str = None) -> dict:
        """Get output from a specific terminal or the most recent one."""
        if terminal_id and terminal_id in self._outputs:
            return {"terminal_id": terminal_id, "output": self._outputs[terminal_id]}
        if self._outputs:
            last_id = list(self._outputs.keys())[-1]
            return {"terminal_id": last_id, "output": self._outputs[last_id]}
        return {"error": "No terminal output available"}

    def get_task_output(self, task_id: str) -> dict:
        """Get output from a completed task."""
        return self.get_output(f"task-{task_id}")
```

---

## 4. Web Tools

Tools for fetching web content, browsing, and web search.

### 4.1 `web/fetch` / `fetch`

Fetch content from URLs.

**Used by**: 60+ agents

```python
import urllib.request
import urllib.error
import json
from html.parser import HTMLParser


class WebFetchTool:
    """Fetch web content and convert to readable format."""

    def __init__(self, timeout: int = 30, max_size: int = 100_000):
        self.timeout = timeout
        self.max_size = max_size

    def fetch(self, url: str, headers: dict = None) -> dict:
        """Fetch a URL and return its content."""
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "AwesomeCopilot/1.0")
        if headers:
            for k, v in headers.items():
                req.add_header(k, v)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                content_type = response.headers.get("Content-Type", "")
                raw = response.read(self.max_size)

                if "json" in content_type:
                    return {
                        "url": url, "status": response.status,
                        "content_type": "json",
                        "content": json.loads(raw.decode("utf-8")),
                    }
                elif "html" in content_type:
                    html = raw.decode("utf-8", errors="replace")
                    return {
                        "url": url, "status": response.status,
                        "content_type": "html",
                        "content": self._html_to_text(html),
                    }
                else:
                    return {
                        "url": url, "status": response.status,
                        "content_type": content_type,
                        "content": raw.decode("utf-8", errors="replace"),
                    }
        except urllib.error.HTTPError as e:
            return {"url": url, "error": f"HTTP {e.code}: {e.reason}"}
        except Exception as e:
            return {"url": url, "error": str(e)}

    def fetch_json(self, url: str, headers: dict = None) -> dict:
        """Fetch a JSON API endpoint."""
        h = {"Accept": "application/json", **(headers or {})}
        return self.fetch(url, headers=h)

    def _html_to_text(self, html: str) -> str:
        """Basic HTML to text conversion."""
        import re
        text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:self.max_size]
```

### 4.2 `web/githubRepo` / `githubRepo`

Access GitHub repository information.

**Used by**: 55+ agents

```python
import urllib.request
import json


class GitHubRepoTool:
    """Access GitHub repository metadata, files, and structure."""

    def __init__(self, token: str = None):
        self.base_url = "https://api.github.com"
        self.token = token

    def get_repo_info(self, owner: str, repo: str) -> dict:
        """Get repository metadata."""
        return self._api_get(f"/repos/{owner}/{repo}")

    def get_file_contents(self, owner: str, repo: str, path: str,
                          ref: str = "main") -> dict:
        """Get file contents from a repository."""
        data = self._api_get(f"/repos/{owner}/{repo}/contents/{path}?ref={ref}")
        if "content" in data:
            import base64
            data["decoded_content"] = base64.b64decode(data["content"]).decode("utf-8")
        return data

    def get_tree(self, owner: str, repo: str, ref: str = "main") -> dict:
        """Get the file tree of a repository."""
        return self._api_get(f"/repos/{owner}/{repo}/git/trees/{ref}?recursive=1")

    def get_readme(self, owner: str, repo: str) -> dict:
        """Get the repository README."""
        return self._api_get(f"/repos/{owner}/{repo}/readme")

    def search_code(self, query: str, owner: str = None, repo: str = None) -> dict:
        """Search code across GitHub."""
        q = query
        if owner and repo:
            q += f" repo:{owner}/{repo}"
        return self._api_get(f"/search/code?q={q}")

    def _api_get(self, endpoint: str) -> dict:
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/vnd.github.v3+json")
        req.add_header("User-Agent", "AwesomeCopilot/1.0")
        if self.token:
            req.add_header("Authorization", f"token {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            return {"error": str(e)}
```

### 4.3 `openSimpleBrowser` / `vscode/openSimpleBrowser`

Open a URL in a simple browser panel.

**Used by**: 35+ agents

```python
import webbrowser


class OpenSimpleBrowserTool:
    """Open URLs in a browser panel for preview."""

    def open(self, url: str) -> dict:
        """Open a URL in the simple browser."""
        try:
            webbrowser.open(url)
            return {"status": "opened", "url": url}
        except Exception as e:
            return {"error": str(e), "url": url}

    def open_preview(self, file_path: str, port: int = 3000) -> dict:
        """Open a local file or dev server in the browser."""
        if file_path.startswith("http"):
            return self.open(file_path)
        url = f"http://localhost:{port}"
        return self.open(url)
```

### 4.4 `websearch` / `web`

Search the web for information.

**Used by**: 15+ agents

```python
import urllib.request
import urllib.parse
import json


class WebSearchTool:
    """Search the web for information using search APIs."""

    def __init__(self, api_key: str = None):
        self.api_key = api_key

    def search(self, query: str, num_results: int = 5) -> list[dict]:
        """Search the web and return results."""
        # Using DuckDuckGo instant answer API (no key required)
        encoded = urllib.parse.quote(query)
        url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_html=1"

        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent", "AwesomeCopilot/1.0")
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            results = []
            if data.get("AbstractText"):
                results.append({
                    "title": data.get("Heading", ""),
                    "snippet": data["AbstractText"],
                    "url": data.get("AbstractURL", ""),
                })
            for topic in data.get("RelatedTopics", [])[:num_results]:
                if isinstance(topic, dict) and "Text" in topic:
                    results.append({
                        "title": topic.get("Text", "")[:100],
                        "snippet": topic.get("Text", ""),
                        "url": topic.get("FirstURL", ""),
                    })
            return results
        except Exception as e:
            return [{"error": str(e)}]
```

---

## 5. VS Code Integration Tools

Tools for interacting with the VS Code editor environment.

### 5.1 `extensions` / `vscode/extensions`

List, install, and manage VS Code extensions.

**Used by**: 30+ agents

```python
import subprocess
import json


class ExtensionsTool:
    """Manage VS Code extensions."""

    def list_extensions(self) -> list[dict]:
        """List installed VS Code extensions."""
        try:
            result = subprocess.run(
                ["code", "--list-extensions", "--show-versions"],
                capture_output=True, text=True, timeout=30
            )
            extensions = []
            for line in result.stdout.splitlines():
                if "@" in line:
                    name, version = line.rsplit("@", 1)
                    extensions.append({"id": name, "version": version})
                else:
                    extensions.append({"id": line.strip(), "version": "unknown"})
            return extensions
        except FileNotFoundError:
            return [{"error": "VS Code CLI not found"}]

    def install_extension(self, extension_id: str) -> dict:
        """Install a VS Code extension."""
        result = subprocess.run(
            ["code", "--install-extension", extension_id, "--force"],
            capture_output=True, text=True, timeout=120
        )
        return {
            "extension": extension_id,
            "installed": result.returncode == 0,
            "output": result.stdout,
        }

    def is_installed(self, extension_id: str) -> bool:
        """Check if an extension is installed."""
        extensions = self.list_extensions()
        return any(e.get("id", "").lower() == extension_id.lower() for e in extensions)
```

### 5.2 `vscodeAPI` / `vscode/vscodeAPI` / `vscode/runCommand`

Execute VS Code commands programmatically.

**Used by**: 35+ agents

```python
import json
from typing import Any


class VSCodeAPITool:
    """Execute VS Code commands and interact with the editor API."""

    def __init__(self):
        self._commands_registry: dict[str, callable] = {}

    def run_command(self, command: str, args: dict = None) -> dict:
        """Execute a VS Code command."""
        known_commands = {
            "workbench.action.files.save": self._save_file,
            "workbench.action.terminal.new": self._new_terminal,
            "editor.action.formatDocument": self._format_document,
            "workbench.action.closeActiveEditor": self._close_editor,
            "workbench.action.reloadWindow": self._reload_window,
        }
        handler = known_commands.get(command)
        if handler:
            return handler(args)
        return {"command": command, "args": args, "status": "dispatched"}

    def get_active_editor(self) -> dict:
        """Get information about the active editor."""
        return {
            "file_path": None,  # Populated by IDE integration
            "language": None,
            "selection": None,
            "cursor_position": None,
        }

    def get_workspace_info(self) -> dict:
        """Get workspace configuration and settings."""
        return {
            "folders": [],  # Populated by IDE
            "settings": {},
            "extensions": [],
        }

    def _save_file(self, args): return {"status": "saved"}
    def _new_terminal(self, args): return {"status": "terminal_created"}
    def _format_document(self, args): return {"status": "formatted"}
    def _close_editor(self, args): return {"status": "closed"}
    def _reload_window(self, args): return {"status": "reloading"}
```

### 5.3 `runNotebooks` / `execute/runNotebookCell` / `read/getNotebookSummary`

Interact with Jupyter notebooks.

**Used by**: 15+ agents

```python
import json
from pathlib import Path


class NotebookTool:
    """Interact with Jupyter notebooks - run cells, read output."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def get_notebook_summary(self, notebook_path: str) -> dict:
        """Get a summary of a notebook's cells and outputs."""
        full_path = self.workspace_root / notebook_path
        if not full_path.exists():
            return {"error": f"Notebook not found: {notebook_path}"}

        nb = json.loads(full_path.read_text())
        cells = []
        for i, cell in enumerate(nb.get("cells", [])):
            cell_info = {
                "index": i,
                "type": cell.get("cell_type"),
                "source_preview": "".join(cell.get("source", []))[:200],
                "has_output": bool(cell.get("outputs")),
            }
            if cell.get("outputs"):
                outputs = cell["outputs"]
                cell_info["output_types"] = [o.get("output_type") for o in outputs]
            cells.append(cell_info)

        return {
            "path": notebook_path,
            "kernel": nb.get("metadata", {}).get("kernelspec", {}).get("display_name"),
            "cell_count": len(cells),
            "cells": cells,
        }

    def read_cell_output(self, notebook_path: str, cell_index: int) -> dict:
        """Read the output of a specific notebook cell."""
        full_path = self.workspace_root / notebook_path
        nb = json.loads(full_path.read_text())
        cells = nb.get("cells", [])

        if cell_index >= len(cells):
            return {"error": f"Cell index {cell_index} out of range"}

        cell = cells[cell_index]
        outputs = []
        for output in cell.get("outputs", []):
            if output.get("output_type") == "stream":
                outputs.append({"type": "text", "content": "".join(output.get("text", []))})
            elif output.get("output_type") in ("execute_result", "display_data"):
                data = output.get("data", {})
                if "text/plain" in data:
                    outputs.append({"type": "text", "content": "".join(data["text/plain"])})
                if "text/html" in data:
                    outputs.append({"type": "html", "content": "".join(data["text/html"])})
            elif output.get("output_type") == "error":
                outputs.append({
                    "type": "error",
                    "ename": output.get("ename"),
                    "evalue": output.get("evalue"),
                    "traceback": output.get("traceback", []),
                })
        return {"cell_index": cell_index, "outputs": outputs}

    def run_cell(self, notebook_path: str, cell_index: int) -> dict:
        """Run a notebook cell (requires jupyter kernel)."""
        import subprocess
        cmd = f"jupyter execute --ExecutePreprocessor.timeout=60 {notebook_path}"
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            cwd=self.workspace_root, timeout=120
        )
        return {
            "cell_index": cell_index,
            "executed": result.returncode == 0,
            "output": result.stdout[-5000:],
        }
```

### 5.4 `readCellOutput` / `updateUserPreferences`

Read notebook cell output and update user preferences.

**Used by**: 5+ agents

```python
class ReadCellOutputTool:
    """Read output from a specific notebook cell."""

    def __init__(self, notebook_tool: "NotebookTool"):
        self.notebook_tool = notebook_tool

    def read(self, notebook_path: str, cell_index: int) -> dict:
        return self.notebook_tool.read_cell_output(notebook_path, cell_index)


class UpdateUserPreferencesTool:
    """Update user preferences and settings."""

    def __init__(self):
        self._preferences: dict = {}

    def update(self, key: str, value) -> dict:
        """Update a user preference."""
        self._preferences[key] = value
        return {"status": "updated", "key": key, "value": value}

    def get(self, key: str) -> dict:
        """Get a user preference."""
        if key in self._preferences:
            return {"key": key, "value": self._preferences[key]}
        return {"error": f"Preference not found: {key}"}
```

### 5.5 `vscode/getProjectSetupInfo` / `vscode/newWorkspace` / `vscode/installExtension`

Project setup and workspace management.

**Used by**: 10+ agents

```python
import json
import subprocess
from pathlib import Path


class ProjectSetupTool:
    """Get project setup information and manage workspaces."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def get_project_setup_info(self) -> dict:
        """Detect project type, language, and setup requirements."""
        info = {"root": str(self.workspace_root), "languages": [], "frameworks": []}

        # Detect languages
        if (self.workspace_root / "package.json").exists():
            info["languages"].append("javascript/typescript")
            pkg = json.loads((self.workspace_root / "package.json").read_text())
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            for fw in ["react", "vue", "angular", "next", "express", "fastify"]:
                if fw in deps:
                    info["frameworks"].append(fw)
        if (self.workspace_root / "pyproject.toml").exists() or \
           (self.workspace_root / "requirements.txt").exists():
            info["languages"].append("python")
        if (self.workspace_root / "go.mod").exists():
            info["languages"].append("go")
        if (self.workspace_root / "Cargo.toml").exists():
            info["languages"].append("rust")
        if list(self.workspace_root.glob("*.csproj")):
            info["languages"].append("csharp")

        return info

    def new_workspace(self, path: str) -> dict:
        """Create a new workspace folder."""
        new_path = Path(path)
        new_path.mkdir(parents=True, exist_ok=True)
        return {"status": "created", "path": str(new_path)}
```

### 5.6 `think`

Internal reasoning tool for complex problem-solving.

**Used by**: 10+ agents

```python
class ThinkTool:
    """Internal reasoning and planning tool.
    Allows the agent to think through complex problems step by step
    without producing visible output to the user.
    """

    def __init__(self):
        self._thoughts: list[str] = []

    def think(self, thought: str) -> dict:
        """Record an internal thought/reasoning step.
        This is used for chain-of-thought reasoning without
        cluttering the user-facing output.
        """
        self._thoughts.append(thought)
        return {
            "status": "thought_recorded",
            "thought_count": len(self._thoughts),
        }

    def get_thoughts(self) -> list[str]:
        """Retrieve all recorded thoughts (for debugging)."""
        return self._thoughts

    def clear(self):
        """Clear thought history."""
        self._thoughts.clear()
```

---

## 6. Database Tools

Tools for interacting with databases directly from agents.

### 6.1 PostgreSQL Tools (`pgsql_*`)

Full PostgreSQL database management. Used by: `postgresql-dba` agent.

```python
import subprocess
import json
from typing import Optional


class PostgreSQLTools:
    """PostgreSQL database management tools."""

    def __init__(self):
        self._connections: dict[str, dict] = {}
        self._active_connection: str = None

    def pgsql_connect(self, host: str, port: int = 5432, database: str = "postgres",
                      username: str = "postgres", password: str = None) -> dict:
        """Connect to a PostgreSQL server."""
        conn_id = f"{host}:{port}/{database}"
        self._connections[conn_id] = {
            "host": host, "port": port, "database": database,
            "username": username, "password": password,
        }
        self._active_connection = conn_id
        # Test connection
        result = self.pgsql_query("SELECT version();")
        if "error" in result:
            del self._connections[conn_id]
            return {"error": f"Connection failed: {result['error']}"}
        return {"status": "connected", "connection_id": conn_id, "version": result.get("rows", [[""]])[0][0]}

    def pgsql_disconnect(self, connection_id: str = None) -> dict:
        """Disconnect from a PostgreSQL server."""
        conn_id = connection_id or self._active_connection
        if conn_id in self._connections:
            del self._connections[conn_id]
            return {"status": "disconnected", "connection_id": conn_id}
        return {"error": "No active connection"}

    def pgsql_query(self, sql: str, params: list = None) -> dict:
        """Execute a SQL query and return results."""
        conn = self._connections.get(self._active_connection)
        if not conn:
            return {"error": "No active connection"}

        env = {"PGPASSWORD": conn.get("password", "")}
        cmd = [
            "psql", "-h", conn["host"], "-p", str(conn["port"]),
            "-U", conn["username"], "-d", conn["database"],
            "-t", "-A", "-F", "\t", "-c", sql
        ]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=60,
                env={**__import__("os").environ, **env}
            )
            if result.returncode != 0:
                return {"error": result.stderr}
            rows = [row.split("\t") for row in result.stdout.strip().splitlines() if row]
            return {"rows": rows, "row_count": len(rows)}
        except Exception as e:
            return {"error": str(e)}

    def pgsql_listServers(self) -> list[dict]:
        """List known PostgreSQL server connections."""
        return [{"id": k, **v} for k, v in self._connections.items()]

    def pgsql_listDatabases(self) -> dict:
        """List databases on the connected server."""
        return self.pgsql_query("SELECT datname FROM pg_database WHERE datistemplate = false;")

    def pgsql_visualizeSchema(self, schema: str = "public") -> dict:
        """Get schema visualization data (tables, columns, relationships)."""
        tables_result = self.pgsql_query(f"""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = '{schema}' ORDER BY table_name;
        """)
        if "error" in tables_result:
            return tables_result

        schema_info = {}
        for row in tables_result.get("rows", []):
            table = row[0]
            cols = self.pgsql_query(f"""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = '{schema}' AND table_name = '{table}'
                ORDER BY ordinal_position;
            """)
            schema_info[table] = cols.get("rows", [])
        return {"schema": schema, "tables": schema_info}

    def pgsql_modifyDatabase(self, sql: str) -> dict:
        """Execute a DDL/DML statement (CREATE, ALTER, INSERT, UPDATE, DELETE)."""
        return self.pgsql_query(sql)

    def pgsql_bulkLoadCsv(self, table: str, csv_path: str, delimiter: str = ",") -> dict:
        """Bulk load data from a CSV file into a table."""
        sql = f"\\COPY {table} FROM '{csv_path}' WITH (FORMAT csv, HEADER true, DELIMITER '{delimiter}');"
        return self.pgsql_query(sql)

    def pgsql_describeCsv(self, csv_path: str) -> dict:
        """Describe the structure of a CSV file."""
        from pathlib import Path
        path = Path(csv_path)
        if not path.exists():
            return {"error": f"File not found: {csv_path}"}
        with open(path) as f:
            header = f.readline().strip().split(",")
            sample_row = f.readline().strip().split(",")
        return {"columns": header, "sample": dict(zip(header, sample_row))}

    def pgsql_open_script(self, script_path: str) -> dict:
        """Open and read a SQL script file."""
        from pathlib import Path
        path = Path(script_path)
        if not path.exists():
            return {"error": f"Script not found: {script_path}"}
        return {"path": script_path, "content": path.read_text()}
```

### 6.2 MS SQL Server Tools (`mssql_*`)

Microsoft SQL Server management. Used by: `ms-sql-dba` agent.

```python
import subprocess
from typing import Optional


class MSSQLTools:
    """Microsoft SQL Server database management tools."""

    def __init__(self):
        self._connections: dict[str, dict] = {}
        self._active_connection: str = None

    def mssql_connect(self, server: str, database: str = "master",
                      username: str = None, password: str = None,
                      trusted: bool = False) -> dict:
        """Connect to a SQL Server instance."""
        conn_id = f"{server}/{database}"
        self._connections[conn_id] = {
            "server": server, "database": database,
            "username": username, "password": password,
            "trusted": trusted,
        }
        self._active_connection = conn_id
        result = self.mssql_query("SELECT @@VERSION;")
        if "error" in result:
            del self._connections[conn_id]
            return {"error": f"Connection failed: {result['error']}"}
        return {"status": "connected", "connection_id": conn_id}

    def mssql_disconnect(self, connection_id: str = None) -> dict:
        """Disconnect from SQL Server."""
        conn_id = connection_id or self._active_connection
        if conn_id in self._connections:
            del self._connections[conn_id]
            return {"status": "disconnected"}
        return {"error": "No active connection"}

    def mssql_query(self, sql: str) -> dict:
        """Execute a T-SQL query."""
        conn = self._connections.get(self._active_connection)
        if not conn:
            return {"error": "No active connection"}

        cmd = ["sqlcmd", "-S", conn["server"], "-d", conn["database"]]
        if conn.get("trusted"):
            cmd.append("-E")
        else:
            cmd.extend(["-U", conn.get("username", ""), "-P", conn.get("password", "")])
        cmd.extend(["-Q", sql, "-s", "\t", "-W"])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode != 0:
                return {"error": result.stderr}
            lines = result.stdout.strip().splitlines()
            rows = [line.split("\t") for line in lines if line.strip() and not line.startswith("-")]
            return {"rows": rows, "row_count": len(rows)}
        except Exception as e:
            return {"error": str(e)}

    def mssql_listServers(self) -> list[dict]:
        """List known SQL Server connections."""
        return [{"id": k, **v} for k, v in self._connections.items()]

    def mssql_listDatabases(self) -> dict:
        """List databases on the connected server."""
        return self.mssql_query("SELECT name FROM sys.databases ORDER BY name;")

    def mssql_visualizeSchema(self, schema: str = "dbo") -> dict:
        """Get schema visualization data."""
        return self.mssql_query(f"""
            SELECT t.name AS table_name, c.name AS column_name,
                   ty.name AS data_type, c.is_nullable
            FROM sys.tables t
            JOIN sys.columns c ON t.object_id = c.object_id
            JOIN sys.types ty ON c.user_type_id = ty.user_type_id
            WHERE SCHEMA_NAME(t.schema_id) = '{schema}'
            ORDER BY t.name, c.column_id;
        """)
```

### 6.3 Neo4j Tools (`neo4j-local/*`)

Neo4j graph database operations. Used by: `neo4j-docker-client-generator` agent.

```python
import subprocess
import json


class Neo4jTools:
    """Neo4j graph database tools via MCP server."""

    def __init__(self, uri: str, username: str, password: str, database: str = "neo4j"):
        self.uri = uri
        self.username = username
        self.password = password
        self.database = database

    def get_neo4j_schema(self) -> dict:
        """Retrieve the database schema (labels, relationships, properties)."""
        schema = {
            "node_labels": self._run_cypher("CALL db.labels() YIELD label RETURN label"),
            "relationship_types": self._run_cypher(
                "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType"
            ),
            "property_keys": self._run_cypher(
                "CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey"
            ),
            "constraints": self._run_cypher("SHOW CONSTRAINTS"),
            "indexes": self._run_cypher("SHOW INDEXES"),
        }
        return schema

    def read_neo4j_cypher(self, query: str, params: dict = None) -> dict:
        """Execute a read-only Cypher query."""
        if any(kw in query.upper() for kw in ["CREATE", "MERGE", "DELETE", "SET", "REMOVE"]):
            return {"error": "Write operations not allowed in read mode. Use write_neo4j_cypher."}
        return self._run_cypher(query, params)

    def write_neo4j_cypher(self, query: str, params: dict = None) -> dict:
        """Execute a write Cypher query."""
        return self._run_cypher(query, params)

    def _run_cypher(self, query: str, params: dict = None) -> dict:
        """Execute a Cypher query using cypher-shell."""
        cmd = [
            "cypher-shell",
            "-a", self.uri,
            "-u", self.username,
            "-p", self.password,
            "-d", self.database,
            "--format", "plain",
            query,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                return {"error": result.stderr}
            return {"result": result.stdout, "query": query}
        except FileNotFoundError:
            # Fallback: use HTTP API
            return self._http_query(query, params)

    def _http_query(self, query: str, params: dict = None) -> dict:
        """Execute query via Neo4j HTTP API."""
        import urllib.request
        import base64

        url = self.uri.replace("bolt://", "http://").replace("7687", "7474")
        url = f"{url}/db/{self.database}/tx/commit"

        payload = json.dumps({
            "statements": [{"statement": query, "parameters": params or {}}]
        }).encode()

        auth = base64.b64encode(f"{self.username}:{self.password}".encode()).decode()
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Authorization", f"Basic {auth}")
        req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
                if data.get("errors"):
                    return {"error": data["errors"]}
                results = data.get("results", [{}])[0]
                return {
                    "columns": results.get("columns", []),
                    "rows": [r["row"] for r in results.get("data", [])],
                }
        except Exception as e:
            return {"error": str(e)}
```

### 6.4 Generic Database Tool (`database`)

Generic database operations used alongside specific DB tools.

**Used by**: 5+ agents

```python
class DatabaseTool:
    """Generic database operations - dispatches to specific DB implementations."""

    def __init__(self):
        self._pgsql = None
        self._mssql = None
        self._neo4j = None

    def register_backend(self, backend_type: str, instance):
        """Register a database backend."""
        if backend_type == "pgsql":
            self._pgsql = instance
        elif backend_type == "mssql":
            self._mssql = instance
        elif backend_type == "neo4j":
            self._neo4j = instance

    def query(self, sql: str, backend: str = None) -> dict:
        """Execute a query on the appropriate backend."""
        if backend == "pgsql" and self._pgsql:
            return self._pgsql.pgsql_query(sql)
        elif backend == "mssql" and self._mssql:
            return self._mssql.mssql_query(sql)
        elif backend == "neo4j" and self._neo4j:
            return self._neo4j.read_neo4j_cypher(sql)
        return {"error": f"No backend registered for: {backend}"}
```

---

## 7. MCP Server Tools

External service integrations via Model Context Protocol (MCP) servers.

### 7.1 Terraform MCP (`terraform/*`)

Infrastructure as Code management. Used by: `terraform` agent.

```python
import json
import urllib.request
from typing import Optional


class TerraformMCPTools:
    """Terraform MCP server tools for registry, workspace, and run management."""

    def __init__(self, tfe_token: str, tfe_address: str = "https://app.terraform.io"):
        self.tfe_token = tfe_token
        self.tfe_address = tfe_address

    def search_providers(self, query: str, namespace: str = None) -> dict:
        """Search the Terraform public registry for providers."""
        url = f"https://registry.terraform.io/v1/providers?q={query}"
        if namespace:
            url += f"&namespace={namespace}"
        return self._registry_get(url)

    def search_modules(self, query: str, provider: str = None) -> dict:
        """Search the Terraform public registry for modules."""
        url = f"https://registry.terraform.io/v1/modules?q={query}"
        if provider:
            url += f"&provider={provider}"
        return self._registry_get(url)

    def get_latest_provider_version(self, namespace: str, name: str) -> dict:
        """Get the latest version of a provider."""
        url = f"https://registry.terraform.io/v1/providers/{namespace}/{name}"
        return self._registry_get(url)

    def get_latest_module_version(self, namespace: str, name: str, provider: str) -> dict:
        """Get the latest version of a module."""
        url = f"https://registry.terraform.io/v1/modules/{namespace}/{name}/{provider}"
        return self._registry_get(url)

    def get_provider_docs(self, namespace: str, name: str, resource: str = None) -> dict:
        """Get provider documentation."""
        url = f"https://registry.terraform.io/v1/providers/{namespace}/{name}"
        data = self._registry_get(url)
        if resource and "docs" in data:
            return {"resource": resource, "docs": data.get("docs", {}).get(resource)}
        return data

    def search_private_providers(self, org: str, query: str = "") -> dict:
        """Search private registry providers."""
        return self._tfe_get(f"/api/v2/organizations/{org}/registry-providers?q={query}")

    def search_private_modules(self, org: str, query: str = "") -> dict:
        """Search private registry modules."""
        return self._tfe_get(f"/api/v2/organizations/{org}/registry-modules?q={query}")

    def list_workspaces(self, org: str) -> dict:
        """List HCP Terraform workspaces."""
        return self._tfe_get(f"/api/v2/organizations/{org}/workspaces")

    def create_workspace(self, org: str, name: str, vcs_repo: str = None) -> dict:
        """Create a new HCP Terraform workspace."""
        payload = {
            "data": {
                "type": "workspaces",
                "attributes": {"name": name},
            }
        }
        if vcs_repo:
            payload["data"]["attributes"]["vcs-repo"] = {"identifier": vcs_repo}
        return self._tfe_post(f"/api/v2/organizations/{org}/workspaces", payload)

    def create_run(self, workspace_id: str, message: str = "Triggered by agent") -> dict:
        """Create a new run (plan + apply) in a workspace."""
        payload = {
            "data": {
                "type": "runs",
                "attributes": {"message": message},
                "relationships": {
                    "workspace": {"data": {"type": "workspaces", "id": workspace_id}}
                },
            }
        }
        return self._tfe_post("/api/v2/runs", payload)

    def get_run_status(self, run_id: str) -> dict:
        """Get the status of a run."""
        return self._tfe_get(f"/api/v2/runs/{run_id}")

    def set_workspace_variables(self, workspace_id: str, variables: list[dict]) -> list[dict]:
        """Set variables on a workspace. Each: {"key": ..., "value": ..., "sensitive": bool}"""
        results = []
        for var in variables:
            payload = {
                "data": {
                    "type": "vars",
                    "attributes": {
                        "key": var["key"], "value": var["value"],
                        "category": var.get("category", "terraform"),
                        "sensitive": var.get("sensitive", False),
                    },
                }
            }
            results.append(self._tfe_post(
                f"/api/v2/workspaces/{workspace_id}/vars", payload
            ))
        return results

    def _registry_get(self, url: str) -> dict:
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def _tfe_get(self, endpoint: str) -> dict:
        url = f"{self.tfe_address}{endpoint}"
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {self.tfe_token}")
        req.add_header("Content-Type", "application/vnd.api+json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def _tfe_post(self, endpoint: str, payload: dict) -> dict:
        url = f"{self.tfe_address}{endpoint}"
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Bearer {self.tfe_token}")
        req.add_header("Content-Type", "application/vnd.api+json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}
```

### 7.2 Context7 MCP (`context7/*`)

Library documentation lookup. Used by: `context7` agent.

```python
import json
import urllib.request


class Context7MCPTools:
    """Context7 MCP tools for up-to-date library documentation."""

    def __init__(self, api_key: str = None):
        self.base_url = "https://mcp.context7.com"
        self.api_key = api_key

    def resolve_library_id(self, library_name: str) -> dict:
        """Resolve a library name to a Context7-compatible library ID.
        Returns matching libraries with scores and version info.
        """
        return self._call("resolve-library-id", {"libraryName": library_name})

    def get_library_docs(self, library_id: str, topic: str = None,
                         tokens: int = 5000) -> dict:
        """Get documentation for a specific library.
        Args:
            library_id: Context7 library ID (e.g., '/expressjs/express')
            topic: Specific topic to search for (e.g., 'middleware', 'routing')
            tokens: Max tokens of documentation to return
        """
        params = {"context7CompatibleLibraryID": library_id}
        if topic:
            params["topic"] = topic
        if tokens:
            params["tokens"] = tokens
        return self._call("get-library-docs", params)

    def _call(self, tool_name: str, params: dict) -> dict:
        url = f"{self.base_url}/mcp"
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": params},
            "id": 1,
        }
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        if self.api_key:
            req.add_header("CONTEXT7_API_KEY", self.api_key)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}
```

### 7.3 PagerDuty MCP (`pagerduty/*`)

Incident management. Used by: `pagerduty-incident-responder` agent.

```python
import json
import urllib.request


class PagerDutyMCPTools:
    """PagerDuty MCP tools for incident response."""

    def __init__(self, api_token: str):
        self.base_url = "https://api.pagerduty.com"
        self.api_token = api_token

    def get_incident(self, incident_id: str) -> dict:
        """Get details of a specific incident."""
        return self._get(f"/incidents/{incident_id}")

    def list_incidents(self, service_id: str = None, status: str = "triggered,acknowledged",
                       since: str = None, until: str = None) -> dict:
        """List incidents, optionally filtered by service and status."""
        params = f"statuses[]={status}"
        if service_id:
            params += f"&service_ids[]={service_id}"
        if since:
            params += f"&since={since}"
        if until:
            params += f"&until={until}"
        return self._get(f"/incidents?{params}")

    def get_incident_timeline(self, incident_id: str) -> dict:
        """Get the timeline/log entries for an incident."""
        return self._get(f"/incidents/{incident_id}/log_entries")

    def get_service(self, service_id: str) -> dict:
        """Get service details."""
        return self._get(f"/services/{service_id}")

    def list_services(self, query: str = None) -> dict:
        """List services, optionally filtered by name."""
        url = "/services"
        if query:
            url += f"?query={query}"
        return self._get(url)

    def get_oncall(self, schedule_id: str = None) -> dict:
        """Get current on-call users."""
        url = "/oncalls"
        if schedule_id:
            url += f"?schedule_ids[]={schedule_id}"
        return self._get(url)

    def acknowledge_incident(self, incident_id: str, user_email: str) -> dict:
        """Acknowledge an incident."""
        payload = {
            "incident": {
                "type": "incident_reference",
                "status": "acknowledged",
            }
        }
        return self._put(f"/incidents/{incident_id}", payload, user_email)

    def resolve_incident(self, incident_id: str, user_email: str) -> dict:
        """Resolve an incident."""
        payload = {
            "incident": {
                "type": "incident_reference",
                "status": "resolved",
            }
        }
        return self._put(f"/incidents/{incident_id}", payload, user_email)

    def add_note(self, incident_id: str, content: str, user_email: str) -> dict:
        """Add a note to an incident."""
        payload = {"note": {"content": content}}
        return self._post(f"/incidents/{incident_id}/notes", payload, user_email)

    def _get(self, endpoint: str) -> dict:
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Token token={self.api_token}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def _put(self, endpoint: str, payload: dict, user_email: str) -> dict:
        url = f"{self.base_url}{endpoint}"
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="PUT")
        req.add_header("Authorization", f"Token token={self.api_token}")
        req.add_header("Content-Type", "application/json")
        req.add_header("From", user_email)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def _post(self, endpoint: str, payload: dict, user_email: str) -> dict:
        url = f"{self.base_url}{endpoint}"
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Token token={self.api_token}")
        req.add_header("Content-Type", "application/json")
        req.add_header("From", user_email)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}
```

### 7.4 Apify MCP (`apify/*`)

Web scraping and automation. Used by: `apify-integration-expert` agent.

```python
import json
import urllib.request


class ApifyMCPTools:
    """Apify MCP tools for web scraping Actor management."""

    def __init__(self, api_token: str):
        self.base_url = "https://api.apify.com/v2"
        self.api_token = api_token

    def fetch_actor_details(self, actor_id: str) -> dict:
        """Get details about an Apify Actor (scraper/automation)."""
        return self._get(f"/acts/{actor_id}")

    def search_actors(self, query: str, category: str = None) -> dict:
        """Search the Apify store for Actors."""
        url = f"/store?search={query}"
        if category:
            url += f"&category={category}"
        return self._get(url)

    def run_actor(self, actor_id: str, input_data: dict = None) -> dict:
        """Run an Actor with optional input."""
        payload = input_data or {}
        return self._post(f"/acts/{actor_id}/runs", payload)

    def get_run_status(self, run_id: str) -> dict:
        """Get the status of an Actor run."""
        return self._get(f"/actor-runs/{run_id}")

    def get_dataset_items(self, dataset_id: str, limit: int = 100) -> dict:
        """Get items from a dataset (Actor output)."""
        return self._get(f"/datasets/{dataset_id}/items?limit={limit}")

    def _get(self, endpoint: str) -> dict:
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {self.api_token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def _post(self, endpoint: str, payload: dict) -> dict:
        url = f"{self.base_url}{endpoint}"
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Bearer {self.api_token}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}
```

### 7.5 Dynatrace MCP (`dynatrace/*`)

Observability and monitoring. Used by: `dynatrace-expert` agent.

```python
import json
import urllib.request


class DynatraceMCPTools:
    """Dynatrace MCP tools for observability and monitoring."""

    def __init__(self, api_url: str, api_token: str):
        self.api_url = api_url.rstrip("/")
        self.api_token = api_token

    def query_metrics(self, metric_selector: str, time_from: str = "now-1h",
                      time_to: str = "now") -> dict:
        """Query Dynatrace metrics."""
        params = f"metricSelector={metric_selector}&from={time_from}&to={time_to}"
        return self._get(f"/api/v2/metrics/query?{params}")

    def get_problems(self, time_from: str = "now-24h") -> dict:
        """Get detected problems."""
        return self._get(f"/api/v2/problems?from={time_from}")

    def get_entities(self, entity_selector: str) -> dict:
        """Get monitored entities."""
        return self._get(f"/api/v2/entities?entitySelector={entity_selector}")

    def get_logs(self, query: str, time_from: str = "now-1h") -> dict:
        """Search logs."""
        payload = {"query": query, "from": time_from}
        return self._post("/api/v2/logs/search", payload)

    def get_traces(self, service_id: str, time_from: str = "now-1h") -> dict:
        """Get distributed traces for a service."""
        return self._get(f"/api/v2/traces?serviceId={service_id}&from={time_from}")

    def _get(self, endpoint: str) -> dict:
        url = f"{self.api_url}{endpoint}"
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Api-Token {self.api_token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def _post(self, endpoint: str, payload: dict) -> dict:
        url = f"{self.api_url}{endpoint}"
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Api-Token {self.api_token}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}
```

### 7.6 Additional MCP Servers

Other MCP servers referenced across agents:

```python
import json
import urllib.request


class MCPServerClient:
    """Generic MCP server client for any MCP-compatible service."""

    def __init__(self, server_url: str, auth_header: str = None, auth_value: str = None):
        self.server_url = server_url
        self.auth_header = auth_header
        self.auth_value = auth_value

    def call_tool(self, tool_name: str, arguments: dict = None) -> dict:
        """Call any tool on the MCP server."""
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments or {}},
            "id": 1,
        }
        return self._post(payload)

    def list_tools(self) -> dict:
        """List available tools on the MCP server."""
        payload = {"jsonrpc": "2.0", "method": "tools/list", "id": 1}
        return self._post(payload)

    def _post(self, payload: dict) -> dict:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(self.server_url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        if self.auth_header and self.auth_value:
            req.add_header(self.auth_header, self.auth_value)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}


# Pre-configured MCP server instances:

# Elastic Observability
elastic_mcp = MCPServerClient(
    server_url="https://your-elastic-mcp-endpoint",
    auth_header="Authorization", auth_value="Bearer $ELASTIC_TOKEN"
)

# LaunchDarkly Feature Flags
# Uses local MCP: npx @launchdarkly/mcp-server --access-token $LD_ACCESS_TOKEN
launchdarkly_mcp = MCPServerClient(
    server_url="http://localhost:3000",  # Local MCP server
)

# Lingo.dev i18n
lingo_mcp = MCPServerClient(
    server_url="https://mcp.lingo.dev/main",
)

# Monday.com
monday_mcp = MCPServerClient(
    server_url="https://mcp.monday.com/mcp",
    auth_header="Authorization", auth_value="Bearer $MONDAY_TOKEN"
)

# Octopus Deploy
# Uses local MCP: npx @octopusdeploy/mcp-server
octopus_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)

# StackHawk Security
# Uses local MCP: uvx stackhawk-mcp
stackhawk_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)

# CAST Imaging (Impact Analysis, Software Discovery, Structural Quality)
cast_imaging_mcp = MCPServerClient(
    server_url="https://castimaging.io/imaging/mcp/",
    auth_header="x-api-key", auth_value="$IMAGING_KEY"
)

# Comet Opik (LLM Observability)
# Uses local MCP: npx -y mcp-opik
opik_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)

# Diffblue Cover (Java Test Generation)
# Uses local MCP: uv run diffblue-cover-mcp
diffblue_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)

# ARM Migration
# Uses Docker: docker run --rm -i armlimited/arm-mcp:latest
arm_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)

# Salesforce DX (sfdx-mcp/*)
sfdx_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)

# Figma Dev Mode
figma_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)

# Playwright Browser Automation
playwright_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)

# Microsoft Docs
microsoft_docs_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)

# Pulumi
pulumi_mcp = MCPServerClient(
    server_url="http://localhost:3000",
)
```

---

## 8. GitHub API Tools

Tools for interacting with GitHub repositories, issues, PRs, and code.

### 8.1 GitHub Repository Tools (`github/*`)

Full GitHub API integration. Used by: `pagerduty-incident-responder`, `address-comments`, and 20+ agents.

```python
import json
import urllib.request
import urllib.parse
from typing import Optional


class GitHubAPITools:
    """GitHub API tools for repository, issue, PR, and code management."""

    def __init__(self, token: str, base_url: str = "https://api.github.com"):
        self.token = token
        self.base_url = base_url

    # --- Repository ---

    def get_repository(self, owner: str, repo: str) -> dict:
        """Get repository metadata."""
        return self._get(f"/repos/{owner}/{repo}")

    def get_file_contents(self, owner: str, repo: str, path: str,
                          ref: str = None) -> dict:
        """Get file contents from a repository."""
        url = f"/repos/{owner}/{repo}/contents/{path}"
        if ref:
            url += f"?ref={ref}"
        data = self._get(url)
        if isinstance(data, dict) and "content" in data:
            import base64
            data["decoded_content"] = base64.b64decode(data["content"]).decode("utf-8")
        return data

    def create_or_update_file(self, owner: str, repo: str, path: str,
                               content: str, message: str, branch: str = "main",
                               sha: str = None) -> dict:
        """Create or update a file in a repository."""
        import base64
        payload = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "branch": branch,
        }
        if sha:
            payload["sha"] = sha
        return self._put(f"/repos/{owner}/{repo}/contents/{path}", payload)

    def list_branches(self, owner: str, repo: str) -> dict:
        """List repository branches."""
        return self._get(f"/repos/{owner}/{repo}/branches")

    def create_branch(self, owner: str, repo: str, branch_name: str,
                      from_ref: str = "main") -> dict:
        """Create a new branch."""
        # Get the SHA of the source ref
        ref_data = self._get(f"/repos/{owner}/{repo}/git/ref/heads/{from_ref}")
        if "error" in ref_data:
            return ref_data
        sha = ref_data.get("object", {}).get("sha")
        return self._post(f"/repos/{owner}/{repo}/git/refs", {
            "ref": f"refs/heads/{branch_name}",
            "sha": sha,
        })

    def list_repository_contributors(self, owner: str, repo: str) -> dict:
        """List repository contributors."""
        return self._get(f"/repos/{owner}/{repo}/contributors")

    # --- Issues ---

    def create_issue(self, owner: str, repo: str, title: str, body: str = "",
                     labels: list[str] = None, assignees: list[str] = None) -> dict:
        """Create a new issue."""
        payload = {"title": title, "body": body}
        if labels:
            payload["labels"] = labels
        if assignees:
            payload["assignees"] = assignees
        return self._post(f"/repos/{owner}/{repo}/issues", payload)

    def get_issue(self, owner: str, repo: str, issue_number: int) -> dict:
        """Get issue details."""
        return self._get(f"/repos/{owner}/{repo}/issues/{issue_number}")

    def update_issue(self, owner: str, repo: str, issue_number: int,
                     title: str = None, body: str = None, state: str = None,
                     labels: list[str] = None) -> dict:
        """Update an issue."""
        payload = {}
        if title: payload["title"] = title
        if body: payload["body"] = body
        if state: payload["state"] = state
        if labels: payload["labels"] = labels
        return self._patch(f"/repos/{owner}/{repo}/issues/{issue_number}", payload)

    def add_issue_comment(self, owner: str, repo: str, issue_number: int,
                          body: str) -> dict:
        """Add a comment to an issue."""
        return self._post(
            f"/repos/{owner}/{repo}/issues/{issue_number}/comments",
            {"body": body}
        )

    def list_issues(self, owner: str, repo: str, state: str = "open",
                    labels: str = None) -> dict:
        """List repository issues."""
        url = f"/repos/{owner}/{repo}/issues?state={state}"
        if labels:
            url += f"&labels={labels}"
        return self._get(url)

    def search_issues(self, query: str, owner: str = None, repo: str = None) -> dict:
        """Search issues across GitHub."""
        q = query
        if owner and repo:
            q += f" repo:{owner}/{repo}"
        return self._get(f"/search/issues?q={urllib.parse.quote(q)}")

    # --- Pull Requests ---

    def create_pull_request(self, owner: str, repo: str, title: str, body: str,
                            head: str, base: str = "main") -> dict:
        """Create a pull request."""
        return self._post(f"/repos/{owner}/{repo}/pulls", {
            "title": title, "body": body, "head": head, "base": base,
        })

    def get_pull_request(self, owner: str, repo: str, pr_number: int) -> dict:
        """Get pull request details."""
        return self._get(f"/repos/{owner}/{repo}/pulls/{pr_number}")

    def list_pull_requests(self, owner: str, repo: str, state: str = "open") -> dict:
        """List pull requests."""
        return self._get(f"/repos/{owner}/{repo}/pulls?state={state}")

    # --- Commits ---

    def get_commit(self, owner: str, repo: str, sha: str) -> dict:
        """Get commit details."""
        return self._get(f"/repos/{owner}/{repo}/commits/{sha}")

    def list_commits(self, owner: str, repo: str, path: str = None,
                     since: str = None, until: str = None) -> dict:
        """List commits."""
        url = f"/repos/{owner}/{repo}/commits?"
        params = []
        if path: params.append(f"path={path}")
        if since: params.append(f"since={since}")
        if until: params.append(f"until={until}")
        return self._get(url + "&".join(params))

    def search_commits(self, query: str, owner: str = None, repo: str = None) -> dict:
        """Search commits."""
        q = query
        if owner and repo:
            q += f" repo:{owner}/{repo}"
        return self._get(f"/search/commits?q={urllib.parse.quote(q)}")

    # --- Code Search ---

    def search_code(self, query: str, owner: str = None, repo: str = None) -> dict:
        """Search code across GitHub."""
        q = query
        if owner and repo:
            q += f" repo:{owner}/{repo}"
        return self._get(f"/search/code?q={urllib.parse.quote(q)}")

    # --- Active Pull Request ---

    def get_active_pull_request(self) -> dict:
        """Get the currently active pull request (from branch context)."""
        # This would be populated by IDE integration
        return {"status": "requires_ide_context"}

    # --- HTTP helpers ---

    def _get(self, endpoint: str) -> dict:
        return self._request("GET", endpoint)

    def _post(self, endpoint: str, payload: dict) -> dict:
        return self._request("POST", endpoint, payload)

    def _put(self, endpoint: str, payload: dict) -> dict:
        return self._request("PUT", endpoint, payload)

    def _patch(self, endpoint: str, payload: dict) -> dict:
        return self._request("PATCH", endpoint, payload)

    def _request(self, method: str, endpoint: str, payload: dict = None) -> dict:
        url = f"{self.base_url}{endpoint}"
        data = json.dumps(payload).encode() if payload else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"token {self.token}")
        req.add_header("Accept", "application/vnd.github.v3+json")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "AwesomeCopilot/1.0")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.fp else ""
            return {"error": f"HTTP {e.code}", "message": body}
        except Exception as e:
            return {"error": str(e)}
```

### 8.2 Git CLI Tools (`git`, `git_diff`, `git_log`, `git_show`, `git_status`)

Local git operations. Used by: `devops-expert` and similar agents.

```python
import subprocess
from pathlib import Path


class GitCLITools:
    """Local git operations via CLI."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def status(self) -> dict:
        """Get git status."""
        return self._run(["git", "status", "--porcelain", "-b"])

    def diff(self, staged: bool = False, file_path: str = None) -> dict:
        """Get git diff."""
        cmd = ["git", "diff"]
        if staged:
            cmd.append("--staged")
        if file_path:
            cmd.extend(["--", file_path])
        return self._run(cmd)

    def log(self, n: int = 10, oneline: bool = True, file_path: str = None) -> dict:
        """Get git log."""
        cmd = ["git", "log", f"-{n}"]
        if oneline:
            cmd.append("--oneline")
        if file_path:
            cmd.extend(["--", file_path])
        return self._run(cmd)

    def show(self, ref: str) -> dict:
        """Show a commit."""
        return self._run(["git", "show", ref])

    def blame(self, file_path: str) -> dict:
        """Get git blame for a file."""
        return self._run(["git", "blame", file_path])

    def branch(self, list_all: bool = False) -> dict:
        """List branches."""
        cmd = ["git", "branch"]
        if list_all:
            cmd.append("-a")
        return self._run(cmd)

    def _run(self, cmd: list[str]) -> dict:
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True,
                cwd=self.workspace_root, timeout=30
            )
            return {
                "output": result.stdout,
                "error": result.stderr if result.returncode != 0 else None,
                "exit_code": result.returncode,
            }
        except Exception as e:
            return {"error": str(e)}
```

---

## 9. Agent and Orchestration Tools

Tools for multi-agent coordination, sub-agent delegation, and task management.

### 9.1 `agent/runSubagent` / `runSubagent`

Delegate tasks to specialized sub-agents. Used by: `gem-orchestrator`, `context7`, and orchestration agents.

```python
from typing import Any, Callable
from dataclasses import dataclass, field
import json
import uuid


@dataclass
class SubagentResult:
    agent_name: str
    task_id: str
    status: str  # "success", "failed", "needs_revision"
    summary: str
    output: Any = None


class RunSubagentTool:
    """Delegate tasks to specialized sub-agents in a multi-agent workflow."""

    def __init__(self):
        self._agents: dict[str, dict] = {}
        self._results: dict[str, SubagentResult] = {}
        self._max_concurrent: int = 4

    def register_agent(self, name: str, handler: Callable, description: str = ""):
        """Register a sub-agent that can be delegated to."""
        self._agents[name] = {
            "handler": handler,
            "description": description,
        }

    def run_subagent(self, agent_name: str, instruction: str,
                     context: dict = None) -> dict:
        """Delegate a task to a sub-agent.
        Args:
            agent_name: Name of the registered sub-agent
            instruction: Task instruction for the sub-agent
            context: Additional context (files, data, etc.)
        """
        if agent_name not in self._agents:
            return {"error": f"Unknown agent: {agent_name}",
                    "available": list(self._agents.keys())}

        task_id = str(uuid.uuid4())[:8]
        agent = self._agents[agent_name]

        try:
            result = agent["handler"](instruction, context or {})
            subagent_result = SubagentResult(
                agent_name=agent_name,
                task_id=task_id,
                status=result.get("status", "success"),
                summary=result.get("summary", ""),
                output=result.get("output"),
            )
            self._results[task_id] = subagent_result
            return {
                "task_id": task_id,
                "agent": agent_name,
                "status": subagent_result.status,
                "summary": subagent_result.summary,
            }
        except Exception as e:
            return {"task_id": task_id, "agent": agent_name,
                    "status": "failed", "error": str(e)}

    def run_parallel(self, tasks: list[dict]) -> list[dict]:
        """Run multiple sub-agent tasks in parallel (up to max_concurrent).
        Each task: {"agent": "name", "instruction": "...", "context": {...}}
        """
        import concurrent.futures
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=self._max_concurrent) as executor:
            futures = {
                executor.submit(
                    self.run_subagent,
                    task["agent"], task["instruction"], task.get("context")
                ): task
                for task in tasks[:self._max_concurrent]
            }
            for future in concurrent.futures.as_completed(futures):
                results.append(future.result())
        return results

    def get_result(self, task_id: str) -> dict:
        """Get the result of a previously delegated task."""
        if task_id in self._results:
            r = self._results[task_id]
            return {"task_id": task_id, "agent": r.agent_name,
                    "status": r.status, "summary": r.summary}
        return {"error": f"Task not found: {task_id}"}

    def list_agents(self) -> list[dict]:
        """List all registered sub-agents."""
        return [
            {"name": name, "description": info["description"]}
            for name, info in self._agents.items()
        ]
```

### 9.2 `todo` / `todos`

Task management and tracking within agent workflows.

**Used by**: 15+ agents

```python
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class TodoItem:
    id: str
    description: str
    status: str = "pending"  # pending, in_progress, done
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None


class TodoTool:
    """Manage task lists for tracking agent workflow progress."""

    def __init__(self):
        self._items: list[TodoItem] = []

    def add(self, descriptions: list[str]) -> list[dict]:
        """Add one or more todo items."""
        added = []
        for desc in descriptions:
            item = TodoItem(id=str(uuid.uuid4())[:8], description=desc)
            self._items.append(item)
            added.append({"id": item.id, "description": item.description})
        return added

    def list_all(self) -> list[dict]:
        """List all todo items with their status."""
        return [
            {"id": i.id, "description": i.description, "status": i.status,
             "created_at": i.created_at, "completed_at": i.completed_at}
            for i in self._items
        ]

    def mark_done(self, item_id: str) -> dict:
        """Mark a todo item as done."""
        for item in self._items:
            if item.id == item_id:
                item.status = "done"
                item.completed_at = datetime.now().isoformat()
                return {"id": item_id, "status": "done"}
        return {"error": f"Item not found: {item_id}"}

    def mark_in_progress(self, item_id: str) -> dict:
        """Mark a todo item as in progress."""
        for item in self._items:
            if item.id == item_id:
                item.status = "in_progress"
                return {"id": item_id, "status": "in_progress"}
        return {"error": f"Item not found: {item_id}"}

    def next_item(self) -> dict:
        """Complete current in-progress item and start the next pending one."""
        # Complete current
        for item in self._items:
            if item.status == "in_progress":
                item.status = "done"
                item.completed_at = datetime.now().isoformat()
                break

        # Start next
        for item in self._items:
            if item.status == "pending":
                item.status = "in_progress"
                return {"started": item.id, "description": item.description}

        return {"status": "all_complete"}

    def clear(self) -> dict:
        """Clear all todo items."""
        count = len(self._items)
        self._items.clear()
        return {"cleared": count}

    def get_progress(self) -> dict:
        """Get progress summary."""
        total = len(self._items)
        done = sum(1 for i in self._items if i.status == "done")
        in_progress = sum(1 for i in self._items if i.status == "in_progress")
        pending = sum(1 for i in self._items if i.status == "pending")
        return {
            "total": total, "done": done,
            "in_progress": in_progress, "pending": pending,
            "percent_complete": round(done / total * 100, 1) if total else 0,
        }
```

### 9.3 `copilotCodingAgent` / `activePullRequest`

Copilot Coding Agent integration tools.

**Used by**: 5+ agents (insiders-a11y-tracker, etc.)

```python
class CopilotCodingAgentTool:
    """Integration with GitHub Copilot Coding Agent (CCA) for automated PR workflows."""

    def __init__(self, github_tools: "GitHubAPITools"):
        self.github = github_tools

    def get_active_pull_request(self) -> dict:
        """Get the PR that the coding agent is currently working on."""
        # In CCA context, this is provided by the runtime
        return {"status": "requires_cca_context"}

    def create_fix_pr(self, owner: str, repo: str, branch: str,
                      title: str, body: str, files: dict[str, str]) -> dict:
        """Create a PR with file changes.
        Args:
            files: Dict of {file_path: content} to create/update
        """
        # Create branch
        self.github.create_branch(owner, repo, branch)

        # Update files
        for path, content in files.items():
            existing = self.github.get_file_contents(owner, repo, path, ref=branch)
            sha = existing.get("sha") if isinstance(existing, dict) else None
            self.github.create_or_update_file(
                owner, repo, path, content,
                message=f"Fix: {title}", branch=branch, sha=sha
            )

        # Create PR
        return self.github.create_pull_request(owner, repo, title, body, branch)

    def suggest_changes(self, pr_number: int, file_path: str,
                        suggestion: str, line: int) -> dict:
        """Add a review suggestion to a PR."""
        return {"status": "suggestion_added", "pr": pr_number,
                "file": file_path, "line": line}
```

### 9.4 Handoffs

Agent-to-agent handoff mechanism for workflow transitions.

```python
from dataclasses import dataclass
from typing import Optional


@dataclass
class Handoff:
    label: str
    target_agent: str
    prompt: str
    send_context: bool = True


class HandoffManager:
    """Manage agent-to-agent handoffs in multi-agent workflows."""

    def __init__(self):
        self._handoffs: list[Handoff] = []
        self._history: list[dict] = []

    def register_handoff(self, label: str, target_agent: str,
                         prompt: str, send_context: bool = True):
        """Register a possible handoff to another agent."""
        self._handoffs.append(Handoff(
            label=label, target_agent=target_agent,
            prompt=prompt, send_context=send_context,
        ))

    def execute_handoff(self, label: str, context: dict = None) -> dict:
        """Execute a handoff to another agent."""
        handoff = next((h for h in self._handoffs if h.label == label), None)
        if not handoff:
            return {"error": f"Handoff not found: {label}",
                    "available": [h.label for h in self._handoffs]}

        self._history.append({
            "label": label, "target": handoff.target_agent,
            "context_sent": handoff.send_context,
        })

        return {
            "status": "handed_off",
            "target_agent": handoff.target_agent,
            "prompt": handoff.prompt,
            "context": context if handoff.send_context else None,
        }

    def list_handoffs(self) -> list[dict]:
        """List available handoffs."""
        return [
            {"label": h.label, "target": h.target_agent, "prompt": h.prompt}
            for h in self._handoffs
        ]
```

---

## 10. Azure and Cloud Tools

Tools for Azure resource management, architecture, and deployment.

### 10.1 Azure MCP Tools (`azure-mcp/*`)

Azure resource management and best practices. Used by: `azure-iac-generator`, `azure-principal-architect`, and 10+ agents.

```python
import json
import urllib.request


class AzureMCPTools:
    """Azure MCP tools for resource management and best practices."""

    def __init__(self, subscription_id: str = None, token: str = None):
        self.subscription_id = subscription_id
        self.token = token
        self.mgmt_url = "https://management.azure.com"

    def azure_query_azure_resource_graph(self, query: str,
                                          subscriptions: list[str] = None) -> dict:
        """Query Azure Resource Graph for resource information."""
        subs = subscriptions or ([self.subscription_id] if self.subscription_id else [])
        payload = {"query": query, "subscriptions": subs}
        return self._post(
            f"{self.mgmt_url}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01",
            payload
        )

    def azure_design_architecture(self, requirements: str,
                                   services: list[str] = None) -> dict:
        """Get architecture design recommendations based on requirements."""
        return {
            "tool": "azure_design_architecture",
            "requirements": requirements,
            "services": services,
            "recommendation": "Use Azure Well-Architected Framework pillars: "
                            "Reliability, Security, Cost Optimization, "
                            "Operational Excellence, Performance Efficiency",
        }

    def azure_get_code_gen_best_practices(self, language: str,
                                           service: str) -> dict:
        """Get code generation best practices for Azure services."""
        return {
            "tool": "azure_get_code_gen_best_practices",
            "language": language,
            "service": service,
            "practices": [
                "Use managed identity for authentication",
                "Implement retry policies with exponential backoff",
                "Use connection pooling",
                "Enable Application Insights telemetry",
                "Follow Azure SDK best practices for the target language",
            ],
        }

    def azure_get_deployment_best_practices(self, service: str) -> dict:
        """Get deployment best practices for Azure services."""
        return {
            "tool": "azure_get_deployment_best_practices",
            "service": service,
            "practices": [
                "Use Infrastructure as Code (Bicep/Terraform)",
                "Implement blue-green or canary deployments",
                "Enable diagnostic settings and monitoring",
                "Use Azure Key Vault for secrets",
                "Configure network security groups and private endpoints",
            ],
        }

    def azure_get_schema_for_Bicep(self, resource_type: str) -> dict:
        """Get the Bicep schema for an Azure resource type."""
        # Maps to Azure Resource Manager schema
        url = f"https://schema.management.azure.com/schemas/2023-01-01/{resource_type}.json"
        return self._get_external(url)

    def azure_get_swa_best_practices(self) -> dict:
        """Get Azure Static Web Apps best practices."""
        return {
            "tool": "azure_get_swa_best_practices",
            "practices": [
                "Use managed functions for API backend",
                "Configure custom domains with SSL",
                "Set up staging environments for PR previews",
                "Use authentication providers (GitHub, Azure AD)",
                "Configure routing rules in staticwebapp.config.json",
            ],
        }

    def azure_query_learn(self, query: str) -> dict:
        """Search Microsoft Learn documentation."""
        url = f"https://learn.microsoft.com/api/search?search={query}&locale=en-us"
        return self._get_external(url)

    def azureterraformbestpractices(self, resource_type: str = None) -> dict:
        """Get Terraform best practices for Azure resources."""
        return {
            "tool": "azureterraformbestpractices",
            "resource_type": resource_type,
            "practices": [
                "Use azurerm provider with features block",
                "Implement remote state with Azure Storage backend",
                "Use data sources for existing resources",
                "Follow naming conventions (Azure CAF)",
                "Use lifecycle blocks for zero-downtime updates",
            ],
        }

    def bicepschema(self, resource_type: str) -> dict:
        """Get Bicep schema information for a resource type."""
        return self.azure_get_schema_for_Bicep(resource_type)

    def search(self, query: str) -> dict:
        """Search Azure documentation and resources."""
        return self.azure_query_learn(query)

    def _post(self, url: str, payload: dict) -> dict:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def _get_external(self, url: str) -> dict:
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}
```

### 10.2 Microsoft Docs Tools (`microsoft.docs.mcp`, `microsoft_docs_search`, `microsoft_docs_fetch`)

Search and fetch Microsoft documentation. Used by: 25+ agents.

```python
import json
import urllib.request
import urllib.parse


class MicrosoftDocsTool:
    """Search and fetch Microsoft documentation."""

    def __init__(self):
        self.search_url = "https://learn.microsoft.com/api/search"
        self.base_url = "https://learn.microsoft.com"

    def search(self, query: str, locale: str = "en-us",
               top: int = 10) -> dict:
        """Search Microsoft Learn documentation."""
        params = urllib.parse.urlencode({
            "search": query, "locale": locale, "$top": top,
        })
        url = f"{self.search_url}?{params}"
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def fetch(self, url: str) -> dict:
        """Fetch a specific Microsoft Learn page."""
        if not url.startswith("http"):
            url = f"{self.base_url}/{url}"
        req = urllib.request.Request(url)
        req.add_header("Accept", "text/html")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                import re
                html = resp.read().decode("utf-8", errors="replace")
                # Extract main content
                main_match = re.search(r'<main[^>]*>(.*?)</main>', html, re.DOTALL)
                content = main_match.group(1) if main_match else html
                # Strip HTML tags
                text = re.sub(r'<[^>]+>', ' ', content)
                text = re.sub(r'\s+', ' ', text).strip()
                return {"url": url, "content": text[:20000]}
        except Exception as e:
            return {"error": str(e)}
```

---

## 11. Python Environment Tools

Tools for managing Python environments within agents.

### 11.1 Python Environment Management

Used by: `microsoft-agent-framework-python`, `semantic-kernel-python` agents.

```python
import subprocess
import json
from pathlib import Path


class PythonEnvironmentTools:
    """Manage Python environments, packages, and configurations."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def configurePythonEnvironment(self, python_version: str = None,
                                    venv_path: str = ".venv") -> dict:
        """Configure a Python virtual environment."""
        venv_dir = self.workspace_root / venv_path
        python_cmd = f"python{python_version}" if python_version else "python3"

        result = subprocess.run(
            [python_cmd, "-m", "venv", str(venv_dir)],
            capture_output=True, text=True,
            cwd=self.workspace_root, timeout=60
        )
        if result.returncode != 0:
            return {"error": result.stderr}

        return {
            "status": "configured",
            "venv_path": str(venv_dir),
            "python": str(venv_dir / "bin" / "python"),
            "pip": str(venv_dir / "bin" / "pip"),
        }

    def getPythonEnvironmentInfo(self) -> dict:
        """Get information about the current Python environment."""
        info = {}
        for cmd, key in [
            (["python3", "--version"], "python_version"),
            (["pip3", "--version"], "pip_version"),
            (["python3", "-c", "import sys; print(sys.prefix)"], "prefix"),
            (["python3", "-c", "import sys; print(sys.executable)"], "executable"),
        ]:
            try:
                result = subprocess.run(
                    cmd, capture_output=True, text=True,
                    cwd=self.workspace_root, timeout=10
                )
                info[key] = result.stdout.strip()
            except Exception:
                info[key] = "unknown"

        # Check for virtual environment
        venv_dir = self.workspace_root / ".venv"
        info["has_venv"] = venv_dir.exists()
        info["venv_path"] = str(venv_dir) if venv_dir.exists() else None

        return info

    def getPythonExecutableCommand(self, venv_path: str = ".venv") -> dict:
        """Get the Python executable command for the environment."""
        venv_dir = self.workspace_root / venv_path
        if venv_dir.exists():
            python = venv_dir / "bin" / "python"
            if python.exists():
                return {"command": str(python), "type": "venv"}

        # Fallback to system Python
        for cmd in ["python3", "python"]:
            try:
                result = subprocess.run(
                    [cmd, "--version"], capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    return {"command": cmd, "type": "system"}
            except FileNotFoundError:
                continue

        return {"error": "No Python executable found"}

    def installPythonPackage(self, packages: list[str],
                              venv_path: str = ".venv") -> dict:
        """Install Python packages."""
        pip_cmd = self._get_pip(venv_path)
        cmd = [pip_cmd, "install"] + packages

        result = subprocess.run(
            cmd, capture_output=True, text=True,
            cwd=self.workspace_root, timeout=300
        )
        return {
            "packages": packages,
            "installed": result.returncode == 0,
            "output": result.stdout[-5000:],
            "errors": result.stderr[-2000:] if result.returncode != 0 else None,
        }

    def _get_pip(self, venv_path: str) -> str:
        venv_dir = self.workspace_root / venv_path
        pip = venv_dir / "bin" / "pip"
        if pip.exists():
            return str(pip)
        return "pip3"
```

---

## 12. Specialized Domain Tools

Domain-specific tools used by specialized agents.

### 12.1 Playwright Browser Automation (`playwright`)

Used by: `playwright-tester`, `gem-chrome-tester` agents.

```python
import subprocess
import json
from pathlib import Path


class PlaywrightTool:
    """Playwright browser automation for testing and web interaction."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def navigate(self, url: str) -> dict:
        """Navigate to a URL and take a page snapshot."""
        script = f"""
        const {{ chromium }} = require('playwright');
        (async () => {{
            const browser = await chromium.launch();
            const page = await browser.newPage();
            await page.goto('{url}');
            const title = await page.title();
            const content = await page.content();
            const snapshot = await page.accessibility.snapshot();
            console.log(JSON.stringify({{title, snapshot, url: page.url()}}));
            await browser.close();
        }})();
        """
        result = subprocess.run(
            ["node", "-e", script],
            capture_output=True, text=True,
            cwd=self.workspace_root, timeout=30
        )
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return {"output": result.stdout, "error": result.stderr}

    def take_screenshot(self, url: str, output_path: str = "screenshot.png") -> dict:
        """Take a screenshot of a page."""
        script = f"""
        const {{ chromium }} = require('playwright');
        (async () => {{
            const browser = await chromium.launch();
            const page = await browser.newPage();
            await page.goto('{url}');
            await page.screenshot({{ path: '{output_path}', fullPage: true }});
            await browser.close();
            console.log('{{"status": "captured", "path": "{output_path}"}}');
        }})();
        """
        result = subprocess.run(
            ["node", "-e", script],
            capture_output=True, text=True,
            cwd=self.workspace_root, timeout=30
        )
        return {"status": "captured", "path": output_path}

    def get_page_snapshot(self, url: str) -> dict:
        """Get accessibility tree snapshot of a page (for locator identification)."""
        return self.navigate(url)

    def run_test(self, test_file: str) -> dict:
        """Run a Playwright test file."""
        result = subprocess.run(
            ["npx", "playwright", "test", test_file, "--reporter=json"],
            capture_output=True, text=True,
            cwd=self.workspace_root, timeout=120
        )
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return {
                "passed": result.returncode == 0,
                "output": result.stdout[-10000:],
                "errors": result.stderr[-5000:],
            }
```

### 12.2 Atlassian/Jira Tools (`atlassian`)

Used by: `atlassian-requirements-to-jira` agent.

```python
import json
import urllib.request
import base64


class AtlassianTools:
    """Atlassian/Jira integration tools."""

    def __init__(self, base_url: str, email: str, api_token: str):
        self.base_url = base_url.rstrip("/")
        self.auth = base64.b64encode(f"{email}:{api_token}".encode()).decode()

    def create_issue(self, project_key: str, summary: str, description: str,
                     issue_type: str = "Story", labels: list[str] = None) -> dict:
        """Create a Jira issue."""
        payload = {
            "fields": {
                "project": {"key": project_key},
                "summary": summary,
                "description": description,
                "issuetype": {"name": issue_type},
            }
        }
        if labels:
            payload["fields"]["labels"] = labels
        return self._post("/rest/api/3/issue", payload)

    def search_issues(self, jql: str, max_results: int = 50) -> dict:
        """Search issues using JQL."""
        payload = {"jql": jql, "maxResults": max_results}
        return self._post("/rest/api/3/search", payload)

    def get_issue(self, issue_key: str) -> dict:
        """Get issue details."""
        return self._get(f"/rest/api/3/issue/{issue_key}")

    def update_issue(self, issue_key: str, fields: dict) -> dict:
        """Update issue fields."""
        return self._put(f"/rest/api/3/issue/{issue_key}", {"fields": fields})

    def add_comment(self, issue_key: str, body: str) -> dict:
        """Add a comment to an issue."""
        payload = {
            "body": {
                "type": "doc", "version": 1,
                "content": [{"type": "paragraph",
                             "content": [{"type": "text", "text": body}]}]
            }
        }
        return self._post(f"/rest/api/3/issue/{issue_key}/comment", payload)

    def _get(self, endpoint: str) -> dict:
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Basic {self.auth}")
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def _post(self, endpoint: str, payload: dict) -> dict:
        url = f"{self.base_url}{endpoint}"
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Basic {self.auth}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def _put(self, endpoint: str, payload: dict) -> dict:
        url = f"{self.base_url}{endpoint}"
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="PUT")
        req.add_header("Authorization", f"Basic {self.auth}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read()) if resp.read() else {"status": "updated"}
        except Exception as e:
            return {"error": str(e)}
```

### 12.3 `filesystem`

Direct filesystem operations (used by TDD agents).

**Used by**: `tdd-red`, `tdd-green`, `tdd-refactor` agents.

```python
import os
import shutil
from pathlib import Path


class FilesystemTool:
    """Direct filesystem operations for file management."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)

    def exists(self, path: str) -> bool:
        """Check if a path exists."""
        return (self.workspace_root / path).exists()

    def is_file(self, path: str) -> bool:
        return (self.workspace_root / path).is_file()

    def is_directory(self, path: str) -> bool:
        return (self.workspace_root / path).is_dir()

    def mkdir(self, path: str, parents: bool = True) -> dict:
        """Create a directory."""
        full_path = self.workspace_root / path
        full_path.mkdir(parents=parents, exist_ok=True)
        return {"status": "created", "path": path}

    def copy(self, src: str, dst: str) -> dict:
        """Copy a file or directory."""
        src_path = self.workspace_root / src
        dst_path = self.workspace_root / dst
        if src_path.is_dir():
            shutil.copytree(src_path, dst_path, dirs_exist_ok=True)
        else:
            shutil.copy2(src_path, dst_path)
        return {"status": "copied", "src": src, "dst": dst}

    def move(self, src: str, dst: str) -> dict:
        """Move/rename a file or directory."""
        shutil.move(str(self.workspace_root / src), str(self.workspace_root / dst))
        return {"status": "moved", "src": src, "dst": dst}

    def remove(self, path: str) -> dict:
        """Remove a file or directory."""
        full_path = self.workspace_root / path
        if full_path.is_dir():
            shutil.rmtree(full_path)
        elif full_path.is_file():
            full_path.unlink()
        else:
            return {"error": f"Path not found: {path}"}
        return {"status": "removed", "path": path}

    def glob(self, pattern: str) -> list[str]:
        """Find files matching a glob pattern."""
        return [
            str(p.relative_to(self.workspace_root))
            for p in self.workspace_root.glob(pattern)
        ]

    def stat(self, path: str) -> dict:
        """Get file/directory statistics."""
        full_path = self.workspace_root / path
        if not full_path.exists():
            return {"error": f"Path not found: {path}"}
        s = full_path.stat()
        return {
            "path": path, "size": s.st_size,
            "modified": s.st_mtime, "is_file": full_path.is_file(),
        }
```

### 12.4 `shell` / `execute`

Generic shell execution (used by CCA-style agents).

**Used by**: 20+ agents

```python
import subprocess
import os
from pathlib import Path


class ShellTool:
    """Execute shell commands with environment management."""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)
        self._env_overrides: dict = {}

    def execute(self, command: str, cwd: str = None, env: dict = None,
                timeout: int = 120) -> dict:
        """Execute a shell command."""
        work_dir = Path(cwd) if cwd else self.workspace_root
        merged_env = {**os.environ, **self._env_overrides, **(env or {})}

        try:
            result = subprocess.run(
                command, shell=True,
                capture_output=True, text=True,
                cwd=work_dir, timeout=timeout,
                env=merged_env,
            )
            return {
                "command": command,
                "stdout": result.stdout[-10000:],
                "stderr": result.stderr[-5000:],
                "exit_code": result.returncode,
                "success": result.returncode == 0,
            }
        except subprocess.TimeoutExpired:
            return {"command": command, "error": f"Timed out after {timeout}s"}

    def set_env(self, key: str, value: str):
        """Set an environment variable for subsequent commands."""
        self._env_overrides[key] = value

    def get_env(self, key: str) -> str:
        """Get an environment variable."""
        return self._env_overrides.get(key, os.environ.get(key, ""))
```

---

## 13. Appendix: Agent-to-Tool Mapping

Complete mapping of all 156 agents to their declared tools.

### Tool Usage Frequency

| Tool | Agent Count | Category |
|------|------------|----------|
| `codebase` / `read` / `search/codebase` | 120+ | Core |
| `edit/editFiles` / `editFiles` / `edit` | 100+ | Core |
| `search` | 110+ | Core |
| `runCommands` / `terminalCommand` / `shell` | 70+ | Execute |
| `web/fetch` / `fetch` | 60+ | Web |
| `githubRepo` / `web/githubRepo` | 55+ | Web |
| `problems` / `read/problems` | 55+ | Diagnostics |
| `changes` / `search/changes` | 50+ | Git |
| `terminalLastCommand` | 50+ | Execute |
| `findTestFiles` | 45+ | Testing |
| `runTests` / `execute/runTests` | 45+ | Testing |
| `usages` / `search/usages` | 40+ | Core |
| `testFailure` | 40+ | Testing |
| `terminalSelection` | 40+ | Execute |
| `searchResults` / `search/searchResults` | 35+ | Core |
| `extensions` / `vscode/extensions` | 30+ | VS Code |
| `openSimpleBrowser` | 35+ | Web |
| `vscodeAPI` / `vscode/vscodeAPI` | 35+ | VS Code |
| `runTasks` | 30+ | Execute |
| `microsoft.docs.mcp` | 25+ | Azure |
| `github` | 20+ | GitHub |
| `new` | 20+ | Core |
| `runNotebooks` | 15+ | VS Code |
| `todo` / `todos` | 15+ | Orchestration |
| `agent` / `runSubagent` | 10+ | Orchestration |
| `think` | 10+ | Reasoning |
| `terraform/*` | 5+ | MCP |
| `context7/*` | 3+ | MCP |
| `pagerduty/*` | 1 | MCP |
| `neo4j-local/*` | 1 | MCP |
| `pgsql_*` | 1 | Database |
| `mssql_*` | 1 | Database |
| `playwright` | 2 | Testing |
| `atlassian` | 1 | Integration |

### All 156 Agents and Their Tools

| Agent | Tools |
|-------|-------|
| 4.1-Beast | *(no tools declared - uses defaults)* |
| CSharpExpert | *(no tools declared)* |
| Thinking-Beast-Mode | *(no tools declared)* |
| Ultimate-Transparent-Thinking-Beast-Mode | *(no tools declared)* |
| WinFormsExpert | *(no tools declared)* |
| accessibility | changes, codebase, edit/editFiles, extensions, web/fetch, findTestFiles, githubRepo, new, openSimpleBrowser, problems, runCommands, runTasks, runTests, search, searchResults, terminalLastCommand, terminalSelection, testFailure, usages, vscodeAPI |
| address-comments | changes, codebase, editFiles, extensions, fetch, findTestFiles, githubRepo, new, openSimpleBrowser, problems, runCommands, runTasks, runTests, search, searchResults, terminalLastCommand, terminalSelection, testFailure, usages, vscodeAPI, microsoft.docs.mcp, github |
| adr-generator | *(no tools declared)* |
| aem-frontend-specialist | codebase, edit/editFiles, web/fetch, githubRepo, figma-dev-mode-mcp-server |
| amplitude-experiment-implementation | *(no tools declared)* |
| api-architect | *(no tools declared)* |
| apify-integration-expert | *(MCP: apify - fetch-actor-details)* |
| arch-linux-expert | codebase, search, terminalCommand, runCommands, edit/editFiles |
| arch | codebase, search, terminalCommand, runCommands, edit/editFiles |
| arm-migration | *(MCP: custom-mcp - skopeo, check_image, knowledge_base_search, etc.)* |
| atlassian-requirements-to-jira | atlassian |
| azure-iac-exporter | read, edit, search, web, execute, todo, runSubagent, azure-mcp/*, ms-azuretools... |
| azure-iac-generator | vscode, execute, read, edit, search, web, agent, azure-mcp/*, pulumi-mcp/get-type, runSubagent |
| azure-logic-apps-expert | changes, codebase, edit/editFiles, search, runCommands, microsoft.docs.mcp, azure_get_code_gen_best_practices, azure_query_learn |
| azure-principal-architect | changes, codebase, edit/editFiles, extensions, fetch, ..., microsoft.docs.mcp, azure_design_architecture, azure_get_code_gen_best_practices, azure_get_deployment_best_practices, azure_get_swa_best_practices, azure_query_learn |
| azure-saas-architect | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp, azure_design_architecture, azure_get_code_gen_best_practices, azure_get_deployment_best_practices, azure_get_swa_best_practices, azure_query_learn |
| azure-verified-modules-bicep | changes, codebase, edit/editFiles, ..., microsoft.docs.mcp, azure_get_deployment_best_practices, azure_get_schema_for_Bicep |
| azure-verified-modules-terraform | changes, codebase, edit/editFiles, ..., microsoft.docs.mcp, azure_get_deployment_best_practices, azure_get_schema_for_Bicep |
| bicep-implement | *(tools in multi-line YAML)* |
| bicep-plan | *(tools in multi-line YAML)* |
| blueprint-mode-codex | codebase, search, terminalCommand, runCommands, edit/editFiles |
| blueprint-mode | read, edit, search, shell, opik/* |
| cast-imaging-impact-analysis | *(MCP: imaging-impact-analysis)* |
| cast-imaging-software-discovery | *(MCP: imaging-structural-search)* |
| cast-imaging-structural-quality-advisor | *(MCP: imaging-structural-quality)* |
| centos-linux-expert | codebase, search, terminalCommand, runCommands, edit/editFiles |
| clojure-interactive-programming | codebase, terminalCommand |
| code-tour | read, search, web |
| comet-opik | read, edit, search, shell, opik/* |
| context-architect | codebase, extensions, web/fetch, findTestFiles, githubRepo, problems, search, searchResults, usages |
| context7 | read, search, web, context7/*, agent/runSubagent |
| critical-thinking | codebase |
| csharp-dotnet-janitor | codebase, web/fetch, findTestFiles, githubRepo, search, usages |
| csharp-mcp-expert | changes, codebase, edit/editFiles, ..., microsoft.docs.mcp, github |
| custom-agent-foundry | vscode, execute, read, edit, search, web, agent, github/*, todo |
| debian-linux-expert | codebase, search, terminalCommand, runCommands, edit/editFiles |
| debug | edit/editFiles, search, execute/getTerminalOutput, execute/runInTerminal, read/terminalLastCommand, read/terminalSelection, search/usages, read/problems, execute/testFailure, web/fetch, web/githubRepo, execute/runTests |
| declarative-agents-architect | codebase, edit/editFiles, terminalCommand, search, githubRepo, runCommands, runTasks |
| demonstrate-understanding | DiffblueCover/* |
| devils-advocate | *(no tools declared)* |
| devops-expert | codebase, editFiles, fetch, problems, runCommands, search, searchResults, terminalLastCommand, git, git_diff, git_log, git_show, git_status |
| diffblue-cover | DiffblueCover/* |
| dotnet-maui | codebase, edit/editFiles, search, runCommands, runTasks, runTests, problems, changes, usages, findTestFiles, testFailure, terminalLastCommand, terminalSelection, web/fetch, microsoft.docs.mcp |
| dotnet-upgrade | read, search, edit, shell |
| droid | codebase, terminalCommand, edit/editFiles, web/fetch, githubRepo, runTests, problems |
| drupal-expert | *(tools in multi-line YAML)* |
| dynatrace-expert | *(MCP: dynatrace - all tools)* |
| elasticsearch-observability | *(MCP: elastic-mcp)* |
| electron-angular-native | changes, codebase, edit/editFiles, ..., microsoft.docs.mcp |
| expert-cpp-software-engineer | *(no tools declared)* |
| expert-dotnet-software-engineer | changes, codebase, edit/editFiles, ..., microsoft.docs.mcp |
| expert-nextjs-developer | changes, codebase, edit/editFiles, ..., figma-dev-mode-mcp-server |
| expert-react-frontend-engineer | changes, codebase, edit/editFiles, ..., microsoft.docs.mcp |
| fedora-linux-expert | codebase, search, terminalCommand, runCommands, edit/editFiles |
| gem-chrome-tester | changes, codebase, web/fetch, findTestFiles, githubRepo, openSimpleBrowser, problems, search, searchResults, terminalLastCommand, terminalSelection, usages, vscodeAPI |
| gem-devops | codebase, edit/editFiles, terminalCommand, search, githubRepo |
| gem-documentation-writer | full VS Code tool suite + notebooks |
| gem-implementer | *(no tools declared - uses disable-model-invocation)* |
| gem-orchestrator | *(no tools declared - uses runSubagent via instructions)* |
| gem-planner | search/codebase, usages, vscodeAPI, think, problems, changes, ... |
| gem-researcher | github/search_issues, github/issue_read |
| gem-reviewer | full VS Code tool suite + github |
| gilfoyle | *(no tools declared)* |
| github-actions-expert | codebase, terminalCommand, edit/editFiles, web/fetch, githubRepo, runTests, problems, search |
| go-mcp-expert | * (all tools) |
| gpt-5-beast-mode | *(no tools declared)* |
| hlbpa | * (all tools) |
| implementation-plan | codebase, web/fetch, findTestFiles, githubRepo, search, usages |
| insiders-a11y-tracker | changes, codebase, edit/editFiles, ..., readCellOutput, runNotebooks, ..., updateUserPreferences, activePullRequest, copilotCodingAgent |
| janitor | changes, codebase, edit/editFiles, ..., microsoft.docs.mcp, github |
| java-mcp-expert | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp, github, configurePythonEnvironment, getPythonEnvironmentInfo, getPythonExecutableCommand, installPythonPackage |
| jfrog-sec | microsoft_docs_search, microsoft_docs_fetch |
| kotlin-mcp-expert | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp |
| kusto-assistant | *(no tools declared)* |
| laravel-expert-agent | * (all tools) |
| launchdarkly-flag-cleanup | *(MCP: launchdarkly - all tools)* |
| lingodotdev-i18n | *(MCP: lingo - all tools)* |
| mcp-m365-agent-expert | search/codebase, edit/editFiles, githubRepo, extensions, runCommands, database, mssql_* |
| mentor | *(no tools declared)* |
| meta-agentic-project-scaffold | * (all tools) |
| microsoft-agent-framework-dotnet | changes, search/codebase, editFiles, ..., microsoft.docs.mcp |
| microsoft-agent-framework-python | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp, github, configurePythonEnvironment, getPythonEnvironmentInfo, getPythonExecutableCommand, installPythonPackage |
| microsoft-study-mode | *(no tools declared)* |
| microsoft_learn_contributor | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp |
| modernization | codebase, edit/editFiles, search, runCommands, runTasks, runTests, problems, changes, usages, findTestFiles, testFailure, terminalLastCommand, terminalSelection, web/fetch, microsoft.docs.mcp |
| monday-bug-fixer | *(MCP: monday-api-mcp - all tools)* |
| mongodb-performance-advisor | codebase, edit/editFiles, search/codebase |
| ms-sql-dba | search/codebase, edit/editFiles, githubRepo, extensions, runCommands, database, mssql_* |
| neo4j-docker-client-generator | read, edit, search, shell, neo4j-local/* |
| neon-migration-specialist | codebase, edit/editFiles, search/codebase |
| neon-optimization-analyzer | codebase, edit/editFiles, search/codebase |
| octopus-deploy-release-notes-mcp | *(MCP: octopus)* |
| openapi-to-application | read, search, edit, github/search_code, github/search_commits, ..., pagerduty/* |
| pagerduty-incident-responder | read, search, edit, github/*, pagerduty/* |
| php-mcp-expert | codebase, terminalCommand, edit/editFiles, web/fetch, githubRepo, runTests, problems |
| pimcore-expert | *(no tools declared)* |
| plan | codebase, fetch, findTestFiles, githubRepo, search, usages |
| planner | changes, codebase, edit/editFiles, fetch, findTestFiles, problems, runCommands, runTasks, runTests, search, searchResults, terminalLastCommand, terminalSelection, testFailure, playwright |
| platform-sre-kubernetes | codebase, edit/editFiles, githubRepo, extensions, runCommands, database, pgsql_* |
| playwright-tester | changes, codebase, edit/editFiles, fetch, findTestFiles, problems, runCommands, runTasks, runTests, search, searchResults, terminalLastCommand, terminalSelection, testFailure, playwright |
| postgresql-dba | codebase, edit/editFiles, githubRepo, extensions, runCommands, database, pgsql_* |
| power-bi-data-modeling-expert | changes, search/codebase, editFiles, ..., microsoft.docs.mcp |
| power-bi-dax-expert | changes, search/codebase, editFiles, ..., microsoft.docs.mcp |
| power-bi-performance-expert | changes, codebase, editFiles, ..., microsoft.docs.mcp |
| power-bi-visualization-expert | changes, search/codebase, editFiles, ..., microsoft.docs.mcp |
| power-platform-expert | codebase, edit/editFiles, fetch, findTestFiles, list_issues, githubRepo, search, add_issue_comment, create_issue, update_issue, get_issue, search_issues |
| power-platform-mcp-integration-expert | changes, search/codebase, edit/editFiles, ..., github |
| prd | codebase, edit/editFiles, web/fetch, githubRepo, problems, runCommands, search, searchResults, terminalLastCommand, terminalSelection, usages, terraform, Microsoft Docs, context7 |
| principal-software-engineer | list_issues, githubRepo, search, add_issue_comment, create_issue, create_issue_comment, update_issue, delete_issue, get_issue, search_issues |
| prompt-builder | changes, codebase, edit/editFiles, fetch, new, problems, runCommands, search, terminalLastCommand |
| prompt-engineer | vscode, execute, read, edit, search, web, agent, todo |
| python-mcp-expert | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp, github, configurePythonEnvironment, getPythonEnvironmentInfo, getPythonExecutableCommand, installPythonPackage |
| reepl-linkedin | *(no tools declared)* |
| refine-issue | codebase, githubRepo, create_issue, update_issue, list_issues, search_issues |
| repo-architect | codebase, edit/editFiles, search |
| research-technical-spike | codebase, edit/editFiles, search, problems |
| ruby-mcp-expert | codebase, edit/editFiles, search, web/fetch |
| rust-gpt-4.1-beast-mode | codebase, edit/editFiles, search, web/fetch |
| rust-mcp-expert | codebase, edit/editFiles, search, web/fetch |
| salesforce-expert | vscode, execute, read, edit, search, web, sfdx-mcp/*, agent, todo |
| se-gitops-ci-specialist | codebase, web/fetch, githubRepo, terminalCommand, edit/editFiles, problems |
| se-product-manager-advisor | changes, codebase, edit/editFiles, ..., microsoft.docs.mcp, github |
| se-responsible-ai-code | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp, github, configurePythonEnvironment, getPythonEnvironmentInfo, getPythonExecutableCommand, installPythonPackage |
| se-security-reviewer | codebase, terminalCommand, edit/editFiles, web/fetch, githubRepo, runTests, problems |
| se-system-architecture-reviewer | changes, codebase, web/fetch, githubRepo, openSimpleBrowser, problems, search, searchResults, usages, microsoft.docs.mcp, websearch |
| se-technical-writer | changes, search/codebase, edit/editFiles, ..., github |
| se-ux-ui-designer | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp, github |
| search-ai-optimization-expert | read, edit, search, shell, stackhawk-mcp/* |
| semantic-kernel-dotnet | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp, github |
| semantic-kernel-python | changes, search/codebase, edit/editFiles, ..., microsoft.docs.mcp, github, configurePythonEnvironment, ... |
| shopify-expert | codebase, terminalCommand, edit/editFiles, web/fetch, githubRepo, runTests, problems |
| simple-app-idea-generator | *(no tools declared)* |
| software-engineer-agent-v1 | codebase, edit/editFiles, terminalCommand, search, githubRepo |
| specification | codebase, edit/editFiles, terminalCommand, search, githubRepo |
| stackhawk-security-onboarding | read, edit, search, shell, stackhawk-mcp/* |
| swift-mcp-expert | changes, search/codebase, edit/editFiles, ..., terraform, Microsoft Docs, azure_get_schema_for_Bicep, context7 |
| task-planner | changes, codebase, edit/editFiles, ..., terraform, Microsoft Docs, azure_get_schema_for_Bicep, context7 |
| task-researcher | github, findTestFiles, edit/editFiles, runTests, runCommands, codebase, filesystem, search, problems, testFailure, terminalLastCommand |
| tdd-green | github, findTestFiles, edit/editFiles, runTests, runCommands, codebase, filesystem, search, problems, testFailure, terminalLastCommand |
| tdd-red | github, findTestFiles, edit/editFiles, runTests, runCommands, codebase, filesystem, search, problems, testFailure, terminalLastCommand |
| tdd-refactor | github, findTestFiles, edit/editFiles, runTests, runCommands, codebase, filesystem, search, problems, testFailure, terminalLastCommand |
| tech-debt-remediation-plan | changes, codebase, edit/editFiles, ..., github |
| technical-content-evaluator | edit, search, shell, web/fetch, runTasks, githubRepo, todos, runSubagent |
| terraform-azure-implement | edit/editFiles, fetch, todos, azureterraformbestpractices, documentation, get_bestpractices, microsoft-docs |
| terraform-azure-planning | edit/editFiles, fetch, todos, azureterraformbestpractices, cloudarchitect, documentation, get_bestpractices, microsoft-docs |
| terraform-iac-reviewer | codebase, edit/editFiles, terminalCommand, search, githubRepo |
| terraform | read, edit, search, shell, terraform/* |
| typescript-mcp-expert | changes, codebase, edit/editFiles, ..., readCellOutput, runNotebooks, ..., updateUserPreferences, usages, vscodeAPI |
| voidbeast-gpt41enhanced | changes, search/codebase, edit/editFiles, ..., runNotebooks, ..., testFailure, usages, vscodeAPI |
| wg-code-alchemist | changes, codebase, edit/editFiles, ..., runNotebooks, ..., searchResults, terminalLastCommand, terminalSelection, testFailure, usages, vscodeAPI |
| wg-code-sentinel | changes, codebase, edit/editFiles, ..., runNotebooks, ..., searchResults, terminalLastCommand, terminalSelection, testFailure, usages, vscodeAPI |

### MCP Server Registry

| MCP Server | Type | URL/Command | Used By |
|------------|------|-------------|---------|
| apify | http | https://mcp.apify.com | apify-integration-expert |
| arm-mcp | local/docker | armlimited/arm-mcp:latest | arm-migration |
| cast-imaging | http | https://castimaging.io/imaging/mcp/ | cast-imaging-* (3 agents) |
| context7 | http | https://mcp.context7.com/mcp | context7 |
| DiffblueCover | local/uv | diffblue-cover-mcp | diffblue-cover, demonstrate-understanding |
| dynatrace | http | Dynatrace MCP gateway | dynatrace-expert |
| elastic-mcp | remote | Elastic Agent Builder MCP | elasticsearch-observability |
| launchdarkly | local/npx | @launchdarkly/mcp-server | launchdarkly-flag-cleanup |
| lingo | sse | https://mcp.lingo.dev/main | lingodotdev-i18n |
| monday-api-mcp | http | https://mcp.monday.com/mcp | monday-bug-fixer |
| neo4j-local | local/docker | mcp/neo4j-cypher:latest | neo4j-docker-client-generator |
| octopus | local/npx | @octopusdeploy/mcp-server | octopus-deploy-release-notes-mcp |
| opik | local/npx | mcp-opik | comet-opik, blueprint-mode |
| pagerduty | http | https://mcp.pagerduty.com/mcp | pagerduty-incident-responder |
| stackhawk-mcp | local/uvx | stackhawk-mcp | stackhawk-security-onboarding, search-ai-optimization-expert |
| terraform | local/docker | hashicorp/terraform-mcp-server:latest | terraform |

---

## Complete Tool Registry

All unique tool identifiers found across the repository:

```
*                                          activePullRequest
add_issue_comment                          agent
agent/runSubagent                          atlassian
azure-mcp/*                                azure-mcp/azureterraformbestpractices
azure-mcp/bicepschema                      azure-mcp/search
azure_design_architecture                  azure_get_code_gen_best_practices
azure_get_deployment_best_practices        azure_get_schema_for_Bicep
azure_get_swa_best_practices               azure_query_learn
azureterraformbestpractices                changes
cloudarchitect                             codebase
configurePythonEnvironment                 context7
context7/*                                 copilotCodingAgent
create_issue                               create_issue_comment
database                                   delete_issue
DiffblueCover/*                            documentation
edit                                       edit/editFiles
editFiles                                  execute
execute/createAndRunTask                   execute/getTaskOutput
execute/getTerminalOutput                  execute/runInTerminal
execute/runNotebookCell                    execute/runTask
execute/runTests                           execute/testFailure
extensions                                 fetch
figma-dev-mode-mcp-server                  filesystem
findTestFiles                              get_bestpractices
get_issue                                  getPythonEnvironmentInfo
getPythonExecutableCommand                 git
git_diff                                   git_log
git_show                                   git_status
github                                     github/*
github/create_branch                       github/create_issue
github/create_or_update_file               github/create_pull_request
github/get_commit                          github/get_file_contents
github/get_pull_request                    github/get_repository
github/issue_read                          github/list_branches
github/list_commits                        github/list_pull_requests
github/list_repository_contributors        github/search_code
github/search_commits                      github/search_issues
githubRepo                                 installPythonPackage
list_issues                                microsoft-docs
microsoft.docs.mcp                         microsoft_docs_fetch
microsoft_docs_search                      ms-azuretools.vscode-azure-github-copilot/azure_query_azure_resource_graph
mssql_connect                              mssql_disconnect
mssql_listDatabases                        mssql_listServers
mssql_query                                mssql_visualizeSchema
neo4j-local/neo4j-local-get_neo4j_schema   neo4j-local/neo4j-local-read_neo4j_cypher
neo4j-local/neo4j-local-write_neo4j_cypher new
openSimpleBrowser                          opik/*
pagerduty/*                                pgsql_bulkLoadCsv
pgsql_connect                              pgsql_describeCsv
pgsql_disconnect                           pgsql_listDatabases
pgsql_listServers                          pgsql_modifyDatabase
pgsql_open_script                          pgsql_query
pgsql_visualizeSchema                      playwright
problems                                   pulumi-mcp/get-type
read                                       read/getNotebookSummary
read/problems                              read/readNotebookCellOutput
read/terminalLastCommand                   read/terminalSelection
readCellOutput                             runCommands
runCommands/terminalLastCommand            runCommands/terminalSelection
runNotebooks                               runSubagent
runTasks                                   runTests
search                                     search/changes
search/codebase                            search/searchResults
search/usages                              search_issues
searchResults                              sfdx-mcp/*
shell                                      stackhawk-mcp/*
terminalCommand                            terminalLastCommand
terminalSelection                          terraform
terraform/*                                testFailure
think                                      todo
todos                                      updateUserPreferences
update_issue                               usages
vscode                                     vscode/extensions
vscode/getProjectSetupInfo                 vscode/installExtension
vscode/newWorkspace                        vscode/openSimpleBrowser
vscode/runCommand                          vscode/vscodeAPI
vscodeAPI                                  web
web/fetch                                  web/githubRepo
websearch
```

**Total unique tool identifiers: 140+**
