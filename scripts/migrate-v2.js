'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJSON, writeMarkdownFile, parseArgs } = require('./utils.js');

function migrate(sourceDir, targetDir) {
  let totalMigrated = 0;
  let totalSkipped = 0;
  let domainCount = 0;

  let files;
  try {
    files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stdout.write(`Source directory not found: ${sourceDir}\nMigrated 0 concepts across 0 domains.\n`);
      return;
    }
    throw err;
  }

  for (const file of files) {
    const domain = path.basename(file, '.json');
    const profile = readJSON(path.join(sourceDir, file));
    if (!profile) {
      process.stderr.write(`Warning: could not read ${file}, skipping\n`);
      continue;
    }
    if (!Array.isArray(profile)) {
      process.stderr.write(`Warning: ${file} is not a valid profile array, skipping\n`);
      continue;
    }
    if (profile.length === 0) continue;

    domainCount++;

    for (const entry of profile) {
      const conceptPath = path.join(targetDir, domain, `${entry.concept_id}.md`);

      if (fs.existsSync(conceptPath)) {
        totalSkipped++;
        continue;
      }

      const { notes, ...frontmatter } = entry;

      const title = entry.concept_id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const body = `\n# ${title}\n\n## Notes\n${notes || 'No notes yet.'}\n`;

      writeMarkdownFile(conceptPath, frontmatter, body);
      totalMigrated++;
    }
  }

  process.stdout.write(
    `Migrated ${totalMigrated} concept${totalMigrated !== 1 ? 's' : ''} across ${domainCount} domain${domainCount !== 1 ? 's' : ''}.`
    + (totalSkipped > 0 ? ` Skipped ${totalSkipped} (already exist).` : '')
    + ' Source directory preserved.\n'
  );
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const required = ['source', 'target'];
  const missing = required.filter(k => !args[k]);
  if (missing.length > 0) {
    process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
    process.stderr.write('Usage: node migrate-v2.js --source PATH --target PATH\n');
    process.exit(1);
  }

  try {
    migrate(args.source, args.target);
  } catch (err) {
    process.stderr.write(`Migration failed: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { migrate };
