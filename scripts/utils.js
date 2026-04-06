'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isoNow() {
  return new Date().toISOString();
}

function daysBetween(date1, date2) {
  const ms = new Date(date2).getTime() - new Date(date1).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[name] = true;
    } else {
      args[name] = next;
      i++;
    }
  }
  return args;
}

function readMarkdownWithFrontmatter(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  const fmStart = raw.indexOf('---json\n');
  if (fmStart === -1) throw new Error(`No ---json frontmatter in ${filePath}`);
  const fmContentStart = fmStart + '---json\n'.length;
  const fmEnd = raw.indexOf('\n---', fmContentStart);
  if (fmEnd === -1) throw new Error(`Unclosed frontmatter in ${filePath}`);

  const jsonStr = raw.slice(fmContentStart, fmEnd);
  let frontmatter;
  try {
    frontmatter = JSON.parse(jsonStr);
  } catch (parseErr) {
    throw new Error(`Invalid JSON in frontmatter of ${filePath}: ${parseErr.message}`);
  }
  const body = raw.slice(fmEnd + '\n---'.length).replace(/^\n/, '');

  return { frontmatter, body };
}

function writeMarkdownFile(filePath, frontmatter, body) {
  ensureDir(path.dirname(filePath));
  const content = '---json\n' + JSON.stringify(frontmatter, null, 2) + '\n---\n' + (body || '');
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function listMarkdownFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function expandHome(filepath) {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

module.exports = {
  readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs,
  readMarkdownWithFrontmatter, writeMarkdownFile, listMarkdownFiles, expandHome,
};
