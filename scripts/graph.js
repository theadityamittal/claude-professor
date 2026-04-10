'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, isoNow, parseArgs, listMarkdownFiles } = require('./utils.js');

function createComponent(options) {
  const { id, description, concepts, dependsOn, dependedOnBy,
          keyFiles, patterns, outputDir } = options;

  ensureDir(outputDir);
  const title = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const lines = [`# ${title}`, ''];
  lines.push('## Description', description || '', '');

  if (concepts) {
    lines.push('## Concepts Involved');
    for (const c of concepts.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- \`${c}\``);
    }
    lines.push('');
  }

  if (dependsOn) {
    lines.push('## Depends On');
    for (const dep of dependsOn.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- [[${dep}]]`);
    }
    lines.push('');
  }

  if (dependedOnBy) {
    lines.push('## Depended On By');
    for (const dep of dependedOnBy.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- [[${dep}]]`);
    }
    lines.push('');
  }

  if (keyFiles) {
    lines.push('## Key Files');
    for (const f of keyFiles.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  if (patterns) {
    lines.push('## Patterns');
    for (const p of patterns.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  const filePath = path.join(outputDir, `${id}.md`);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, lines.join('\n'), 'utf-8');
  fs.renameSync(tmpPath, filePath);

  return { success: true, path: filePath };
}

function updateIndex(architectureDir, projectName, branch, summary) {
  const compDir = path.join(architectureDir, 'components');
  const compFiles = listMarkdownFiles(compDir);

  const components = compFiles.map(file => {
    const id = path.basename(file, '.md');
    const raw = fs.readFileSync(path.join(compDir, file), 'utf-8');

    const descMatch = raw.match(/## Description\n(.+)/);
    const description = descMatch ? descMatch[1].trim() : '';

    const conceptIds = [];
    const conceptSection = raw.match(/## Concepts Involved\n([\s\S]*?)(?=\n## |\n$|$)/);
    if (conceptSection) {
      const matches = conceptSection[1].matchAll(/`([^`]+)`/g);
      for (const m of matches) conceptIds.push(m[1]);
    }

    return { id, description, concepts: conceptIds };
  });

  const lines = [
    '# Architecture Overview', '',
    '## Project', projectName, '',
    '## Branch', branch, '',
    '## Last Updated', isoNow(), '',
    '## Summary', summary || '', '',
    '## Components', '',
    '| Component | Description | Key Concepts |',
    '|-----------|-------------|--------------|',
  ];

  for (const comp of components) {
    const conceptStr = comp.concepts.map(c => `\`${c}\``).join(', ');
    lines.push(`| [[${comp.id}]] | ${comp.description} | ${conceptStr} |`);
  }

  lines.push('');
  const indexPath = path.join(architectureDir, '_index.md');
  const tmpPath = indexPath + '.tmp';
  fs.writeFileSync(tmpPath, lines.join('\n'), 'utf-8');
  fs.renameSync(tmpPath, indexPath);

  return { success: true, components: components.length };
}

function detectChanges(architectureDir, scanDirs) {
  const compDir = path.join(architectureDir, 'components');
  const compFiles = listMarkdownFiles(compDir);
  const knownComponents = compFiles.map(f => path.basename(f, '.md'));

  if (knownComponents.length === 0) {
    return { new_directories: [], structural_changes_detected: false, summary: 'No architecture to compare against' };
  }

  const newDirs = [];
  for (const scanDir of scanDirs.split(',').map(s => s.trim()).filter(Boolean)) {
    try {
      const entries = fs.readdirSync(scanDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const subPath = path.join(scanDir, entry.name);
        try {
          const subEntries = fs.readdirSync(subPath, { withFileTypes: true });
          for (const sub of subEntries) {
            if (!sub.isDirectory()) continue;
            const dirName = sub.name;
            const matchesComponent = knownComponents.some(c =>
              c.includes(dirName) || dirName.includes(c.replace(/-/g, ''))
            );
            if (!matchesComponent) {
              newDirs.push(path.join(subPath, dirName));
            }
          }
        } catch (err) {
          if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
            process.stderr.write(`Warning: error scanning ${subPath}: ${err.message}\n`);
          }
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
        process.stderr.write(`Warning: error scanning ${scanDir}: ${err.message}\n`);
      }
    }
  }

  const detected = newDirs.length > 0;
  return {
    new_directories: newDirs,
    structural_changes_detected: detected,
    summary: detected
      ? `New director${newDirs.length === 1 ? 'y' : 'ies'}: ${newDirs.join(', ')}`
      : 'No structural changes detected',
  };
}

/**
 * Deterministic filesystem walk. Returns compact manifest sorted by type priority.
 * @param {string} dir - Absolute path to the directory to scan
 * @param {number} budget - Max file count to include in the manifest
 * @returns {{ project_root, scan_budget, files, directories, total_files, truncated }}
 */
function scan(dir, budget) {
  const EXCLUDED = new Set([
    'node_modules', '.git', 'dist', 'build', 'coverage',
    '__pycache__', '.next', '.nuxt', 'vendor', '.cache', '.build',
  ]);
  const LANG_EXT = {
    js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
    ts: 'ts', tsx: 'ts',
    py: 'py', go: 'go', rs: 'rs', java: 'java', rb: 'rb', php: 'php',
  };
  const MANIFEST_NAMES = new Set([
    'package.json', 'cargo.toml', 'go.mod', 'requirements.txt',
    'pyproject.toml', 'pom.xml', 'composer.json', 'gemfile',
    'build.gradle', 'setup.py',
  ]);
  const CONFIG_NAMES = new Set([
    'dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
    'tsconfig.json', '.env.example',
  ]);
  const TYPE_PRIORITY = { manifest: 0, config: 1, source: 2, test: 3, docs: 4, other: 5 };

  function detectLanguage(ext) {
    return LANG_EXT[ext] || 'other';
  }

  function detectType(name, relPath) {
    const lower = name.toLowerCase();
    if (MANIFEST_NAMES.has(lower)) return 'manifest';
    if (CONFIG_NAMES.has(lower) || lower.includes('config')) return 'config';
    const parts = relPath.split(path.sep);
    const inTestDir = parts.some(p => p === 'test' || p === 'tests' || p === '__tests__');
    if (inTestDir || lower.includes('.test.') || lower.includes('.spec.')) return 'test';
    if (['.md', '.txt', '.rst', '.adoc'].some(e => lower.endsWith(e))) return 'docs';
    const ext = path.extname(lower).slice(1);
    if (LANG_EXT[ext]) return 'source';
    return 'other';
  }

  const allFiles = [];

  function walk(currentDir, relBase) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      if (EXCLUDED.has(entry.name)) continue;
      // Skip hidden files/dirs except Dockerfile
      if (entry.name.startsWith('.') && entry.name !== 'Dockerfile') continue;
      const relPath = relBase ? path.join(relBase, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name), relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        const type = detectType(entry.name, relPath);
        let size = 0;
        try { size = fs.statSync(path.join(currentDir, entry.name)).size; } catch {}
        allFiles.push({ path: relPath, language: detectLanguage(ext), type, size });
      }
    }
  }

  walk(dir, '');

  // Sort by type priority so manifests/configs survive budget trimming
  allFiles.sort((a, b) =>
    (TYPE_PRIORITY[a.type] ?? 5) - (TYPE_PRIORITY[b.type] ?? 5)
  );

  const truncated = allFiles.length > budget;
  const files = truncated ? allFiles.slice(0, budget) : allFiles;

  // Derive directory summary from the included files only
  const dirCounts = new Map();
  for (const f of files) {
    const d = path.dirname(f.path);
    if (d !== '.') {
      dirCounts.set(d, (dirCounts.get(d) || 0) + 1);
    }
  }
  const directories = [...dirCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([p, file_count]) => ({ path: p, file_count }));

  return { project_root: dir, scan_budget: budget, files, directories, total_files: files.length, truncated };
}

if (require.main === module) {
  const mode = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  function validateArgs(required, usage) {
    const missing = required.filter(k => !args[k]);
    if (missing.length > 0) {
      process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
      process.stderr.write(`Usage: node graph.js ${usage}\n`);
      process.exit(1);
    }
  }

  try {
    let result;
    switch (mode) {
      case 'create-component':
        validateArgs(['id', 'output-dir'], 'create-component --id ID --output-dir PATH [--description TEXT] [--concepts LIST]');
        result = createComponent({
          id: args.id,
          description: args.description,
          concepts: args.concepts,
          dependsOn: args['depends-on'],
          dependedOnBy: args['depended-on-by'],
          keyFiles: args['key-files'],
          patterns: args.patterns,
          outputDir: args['output-dir'],
        });
        break;
      case 'update-index':
        validateArgs(['architecture-dir', 'project-name', 'branch'], 'update-index --architecture-dir PATH --project-name NAME --branch NAME');
        result = updateIndex(
          args['architecture-dir'],
          args['project-name'],
          args.branch,
          args.summary,
        );
        break;
      case 'detect-changes':
        validateArgs(['architecture-dir', 'scan-dirs'], 'detect-changes --architecture-dir PATH --scan-dirs DIRS');
        result = detectChanges(
          args['architecture-dir'],
          args['scan-dirs'],
        );
        break;
      case 'scan':
        validateArgs(['dir'], 'scan --dir PATH [--budget N]');
        result = scan(path.resolve(args.dir), parseInt(args.budget || '100', 10));
        break;
      default:
        process.stderr.write(`Unknown mode: ${mode}. Use create-component, update-index, or detect-changes.\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

module.exports = { createComponent, updateIndex, detectChanges, scan };
