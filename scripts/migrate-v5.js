#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, envelope, envelopeError, writeMarkdownFile, expandHome } = require('./utils');

const DEPRECATED_FRONTMATTER = ['aliases', 'related_concepts', 'scope_note', 'documentation_url'];
const PLACEHOLDER_NOTES = /^\s*No notes yet\.?\s*$/i;

function walkMd(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && full.endsWith('.md')) out.push(full);
    }
  }
  return out;
}

function parseV4(raw) {
  const fmStart = raw.indexOf('---json\n');
  if (fmStart === -1) throw new Error('No ---json frontmatter');
  const start = fmStart + '---json\n'.length;
  const end = raw.indexOf('\n---', start);
  if (end === -1) throw new Error('Unclosed frontmatter');
  const fm = JSON.parse(raw.slice(start, end));
  const body = raw.slice(end + '\n---'.length).replace(/^\n/, '');
  return { fm, body };
}

function extractSection(body, heading) {
  const re = new RegExp(`(?:^|\\n)##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`);
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function buildTeachingGuide(notes, keyPoints) {
  const hasNotes = notes && !PLACEHOLDER_NOTES.test(notes);
  const hasKp = keyPoints && keyPoints.length > 0;
  if (!hasNotes && !hasKp) return '(No teaching history yet.)';
  const lines = [];
  if (hasKp) lines.push('- **Migrated key points:**\n  ' + keyPoints.replace(/\n/g, '\n  '));
  if (hasNotes) lines.push('- **Migrated notes' + (hasKp ? '' : ' (pre-v5.0.0)') + ':**\n  ' + notes.replace(/\n/g, '\n  '));
  return lines.join('\n');
}

function migrateOne(filePath, { dryRun = false } = {}) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  let parsed;
  try { parsed = parseV4(raw); }
  catch (e) { return { status: 'skipped_unknown', path: filePath, reason: e.message }; }

  if (parsed.fm.schema_version === 5) return { status: 'skipped_already_v5', path: filePath };
  if (parsed.fm.schema_version !== 4) return { status: 'skipped_unknown', path: filePath, reason: `schema ${parsed.fm.schema_version}` };

  const description = extractSection(parsed.body, 'Description') || '(Awaiting professor\'s first teaching of this concept.)';
  const notes = extractSection(parsed.body, 'Notes');
  const keyPoints = extractSection(parsed.body, 'Key Points');
  const teachingGuide = buildTeachingGuide(notes, keyPoints);

  const newFm = { ...parsed.fm };
  for (const k of DEPRECATED_FRONTMATTER) delete newFm[k];
  newFm.schema_version = 5;

  const newBody = `\n## Description\n\n${description}\n\n## Teaching Guide\n\n${teachingGuide}\n`;
  if (!dryRun) writeMarkdownFile(filePath, newFm, newBody);

  return {
    status: 'migrated',
    path: filePath,
    notes_lifted: !!(notes && !PLACEHOLDER_NOTES.test(notes)),
    key_points_lifted: !!keyPoints,
  };
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args['profile-dir']) return [envelopeError('blocking', '--profile-dir required'), 2];
  const dir = expandHome(args['profile-dir']);
  if (!fs.existsSync(dir)) return [envelopeError('blocking', `profile-dir not found: ${dir}`), 2];

  const dryRun = !!args['dry-run'];
  const files = walkMd(dir);
  const results = files.map(f => {
    try { return migrateOne(f, { dryRun }); }
    catch (e) { return { status: 'error', path: f, reason: e.message }; }
  });

  const counts = {
    files_scanned: results.length,
    files_migrated: results.filter(r => r.status === 'migrated').length,
    files_skipped_already_v5: results.filter(r => r.status === 'skipped_already_v5').length,
    files_skipped_unknown_schema: results.filter(r => r.status === 'skipped_unknown').length,
    files_with_notes_lifted: results.filter(r => r.notes_lifted).length,
    files_with_key_points_lifted: results.filter(r => r.key_points_lifted).length,
    errors: results.filter(r => r.status === 'error').map(r => ({ path: r.path, reason: r.reason })),
  };
  if (args['dry-run']) counts.dry_run = true;
  return [envelope(counts), 0];
}

if (require.main === module) {
  const [out, code] = main(process.argv.slice(2));
  if (code === 0) process.stdout.write(JSON.stringify(out) + '\n');
  else process.stderr.write(JSON.stringify(out) + '\n');
  process.exit(code);
}
module.exports = { main, migrateOne };
