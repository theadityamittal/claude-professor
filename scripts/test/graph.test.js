'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir, archDir;
const scriptPath = path.resolve(__dirname, '..', 'graph.js');

function runGraph(args) {
  const result = execFileSync('node', [scriptPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-graph-'));
  archDir = path.join(tmpDir, 'architecture');
  fs.mkdirSync(archDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('graph.js create-component', () => {
  it('creates a component markdown file', () => {
    const result = runGraph([
      'create-component',
      '--id', 'auth-service',
      '--description', 'Handles JWT-based authentication',
      '--concepts', 'jwt,rbac,hashing',
      '--depends-on', 'api-gateway,user-service',
      '--depended-on-by', 'notification-service',
      '--key-files', 'src/services/auth/,src/middleware/authenticate.ts',
      '--patterns', 'Middleware auth chain, refresh token rotation',
      '--output-dir', path.join(archDir, 'components'),
    ]);
    assert.equal(result.success, true);

    const filePath = path.join(archDir, 'components', 'auth-service.md');
    assert.ok(fs.existsSync(filePath));

    const raw = fs.readFileSync(filePath, 'utf-8');
    assert.ok(raw.includes('# Auth Service'));
    assert.ok(raw.includes('Handles JWT-based authentication'));
    assert.ok(raw.includes('`jwt`'));
    assert.ok(raw.includes('[[api-gateway]]'));
    assert.ok(raw.includes('[[user-service]]'));
    assert.ok(raw.includes('[[notification-service]]'));
    assert.ok(raw.includes('src/services/auth/'));
    assert.ok(raw.includes('Middleware auth chain'));
  });

  it('creates parent directories', () => {
    runGraph([
      'create-component',
      '--id', 'test-service',
      '--description', 'Test',
      '--output-dir', path.join(archDir, 'deep', 'nested', 'components'),
    ]);
    assert.ok(fs.existsSync(path.join(archDir, 'deep', 'nested', 'components', 'test-service.md')));
  });
});

describe('graph.js update-index', () => {
  it('builds index from existing component files', () => {
    const compDir = path.join(archDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });

    // Create two component files
    fs.writeFileSync(path.join(compDir, 'auth-service.md'), [
      '# Auth Service', '', '## Description', 'Handles authentication',
      '', '## Concepts Involved', '- `jwt` (security)', '- `rbac` (security)',
    ].join('\n'));
    fs.writeFileSync(path.join(compDir, 'api-gateway.md'), [
      '# API Gateway', '', '## Description', 'Request routing and rate limiting',
      '', '## Concepts Involved', '- `rate_limiting` (backend)',
    ].join('\n'));

    const result = runGraph([
      'update-index',
      '--architecture-dir', archDir,
      '--project-name', 'Test API',
      '--branch', 'main',
      '--summary', 'REST API with auth and gateway',
    ]);
    assert.equal(result.success, true);

    const indexPath = path.join(archDir, '_index.md');
    assert.ok(fs.existsSync(indexPath));

    const raw = fs.readFileSync(indexPath, 'utf-8');
    assert.ok(raw.includes('# Architecture Overview'));
    assert.ok(raw.includes('Test API'));
    assert.ok(raw.includes('main'));
    assert.ok(raw.includes('[[auth-service]]'));
    assert.ok(raw.includes('[[api-gateway]]'));
  });
});

describe('graph.js detect-changes', () => {
  it('detects no changes when scan dirs match components', () => {
    const compDir = path.join(archDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'auth-service.md'), '# Auth Service\n');

    const scanDir = path.join(tmpDir, 'src', 'services', 'auth');
    fs.mkdirSync(scanDir, { recursive: true });
    fs.writeFileSync(path.join(scanDir, 'index.ts'), 'export {};');

    const result = runGraph([
      'detect-changes',
      '--architecture-dir', archDir,
      '--scan-dirs', path.join(tmpDir, 'src'),
    ]);
    assert.equal(result.structural_changes_detected, false);
  });

  it('detects new directories as potential components', () => {
    const compDir = path.join(archDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'auth-service.md'), '# Auth Service\n');

    const scanDir = path.join(tmpDir, 'src');
    fs.mkdirSync(path.join(scanDir, 'services', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(scanDir, 'services', 'notifications'), { recursive: true });
    fs.writeFileSync(path.join(scanDir, 'services', 'notifications', 'index.ts'), 'export {};');

    const result = runGraph([
      'detect-changes',
      '--architecture-dir', archDir,
      '--scan-dirs', scanDir,
    ]);
    assert.equal(result.structural_changes_detected, true);
    assert.ok(result.new_directories.length > 0);
  });

  it('handles missing architecture dir gracefully', () => {
    const result = runGraph([
      'detect-changes',
      '--architecture-dir', path.join(tmpDir, 'nonexistent'),
      '--scan-dirs', tmpDir,
    ]);
    assert.equal(result.structural_changes_detected, false);
  });
});

describe('graph.js scan', () => {
  it('returns compact manifest with correct fields', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    fs.writeFileSync(path.join(tmpDir, 'index.js'), 'module.exports = {}');

    const result = runGraph(['scan', '--dir', tmpDir, '--budget', '100']);

    assert.ok(Array.isArray(result.files));
    assert.equal(result.scan_budget, 100);
    assert.equal(typeof result.truncated, 'boolean');
    assert.ok(typeof result.total_files === 'number');

    const pkg = result.files.find(f => f.path === 'package.json');
    assert.ok(pkg, 'package.json must be in manifest');
    assert.equal(pkg.type, 'manifest');
    assert.equal(pkg.language, 'other');
    assert.ok(typeof pkg.size === 'number');

    const idx = result.files.find(f => f.path === 'index.js');
    assert.ok(idx, 'index.js must be in manifest');
    assert.equal(idx.type, 'source');
    assert.equal(idx.language, 'js');
  });

  it('respects budget — truncates and sets truncated=true', () => {
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tmpDir, `file${i}.js`), '');
    }
    const result = runGraph(['scan', '--dir', tmpDir, '--budget', '3']);

    assert.ok(result.files.length <= 3);
    assert.equal(result.truncated, true);
    assert.strictEqual(result.total_files, 10, 'total_files must report actual count, not truncated');
  });

  it('does not truncate when under budget', () => {
    fs.writeFileSync(path.join(tmpDir, 'index.js'), '');
    const result = runGraph(['scan', '--dir', tmpDir, '--budget', '100']);
    assert.equal(result.truncated, false);
  });

  it('excludes node_modules, .git, dist, build directories', () => {
    for (const dir of ['node_modules', '.git', 'dist', 'build']) {
      fs.mkdirSync(path.join(tmpDir, dir), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, dir, 'file.js'), '');
    }
    fs.writeFileSync(path.join(tmpDir, 'index.js'), '');

    const result = runGraph(['scan', '--dir', tmpDir, '--budget', '100']);
    const paths = result.files.map(f => f.path);

    assert.ok(!paths.some(p => p.includes('node_modules')));
    assert.ok(!paths.some(p => p.includes('.git')));
    assert.ok(!paths.some(p => p.includes('dist/')));
    assert.ok(!paths.some(p => p.includes('build/')));
    assert.ok(paths.includes('index.js'));
  });

  it('prioritizes manifests over source files when budget is tight', () => {
    for (let i = 0; i < 8; i++) {
      fs.writeFileSync(path.join(tmpDir, `file${i}.js`), '');
    }
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');

    const result = runGraph(['scan', '--dir', tmpDir, '--budget', '3']);

    const pkg = result.files.find(f => f.path === 'package.json');
    assert.ok(pkg, 'package.json must be included even with tight budget');
  });

  it('includes directory summary derived from included files', () => {
    const src = path.join(tmpDir, 'src');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'index.js'), '');
    fs.writeFileSync(path.join(src, 'utils.js'), '');

    const result = runGraph(['scan', '--dir', tmpDir, '--budget', '100']);

    const srcDir = result.directories.find(d => d.path === 'src');
    assert.ok(srcDir, 'src directory must be in directories list');
    assert.equal(srcDir.file_count, 2);
  });

  it('defaults budget to 100 if not provided', () => {
    fs.writeFileSync(path.join(tmpDir, 'index.js'), '');
    const result = runGraph(['scan', '--dir', tmpDir]);
    assert.equal(result.scan_budget, 100);
  });

  it('sorts files deterministically by path within same type', () => {
    fs.writeFileSync(path.join(tmpDir, 'zebra.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'alpha.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'middle.js'), '');
    const result = runGraph(['scan', '--dir', tmpDir, '--budget', '100']);
    const paths = result.files.filter(f => f.type === 'source').map(f => f.path);
    assert.deepStrictEqual(paths, [...paths].sort());
  });

  it('rejects non-numeric budget', () => {
    assert.throws(() => {
      runGraph(['scan', '--dir', tmpDir, '--budget', 'abc']);
    });
  });

  it('fails without --dir argument', () => {
    assert.throws(() => {
      runGraph(['scan', '--budget', '10']);
    });
  });
});
