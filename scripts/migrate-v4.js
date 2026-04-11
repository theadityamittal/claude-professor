'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, readMarkdownWithFrontmatter, writeMarkdownFile, expandHome, envelope, envelopeError } = require('./utils.js');

function migrate(profileDir, dryRun) {
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  let domainDirs;
  try {
    domainDirs = fs.readdirSync(profileDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch (err) {
    if (err.code === 'ENOENT') return { migrated, skipped, errors, dry_run: dryRun };
    throw err;
  }

  for (const domainName of domainDirs) {
    const domainPath = path.join(profileDir, domainName);
    let files;
    try {
      files = fs.readdirSync(domainPath).filter(f => f.endsWith('.md'));
    } catch (err) {
      errors++;
      continue;
    }

    for (const file of files) {
      const filePath = path.join(domainPath, file);
      try {
        const existing = readMarkdownWithFrontmatter(filePath);
        if (!existing) {
          errors++;
          continue;
        }

        if (existing.frontmatter.schema_version >= 4) {
          skipped++;
          continue;
        }

        if (dryRun) {
          migrated++;
          continue;
        }

        const updatedFrontmatter = {
          ...existing.frontmatter,
          schema_version: 4,
          operation_nonce: existing.frontmatter.operation_nonce || null,
        };

        writeMarkdownFile(filePath, updatedFrontmatter, existing.body);
        migrated++;
      } catch (err) {
        errors++;
      }
    }
  }

  return { migrated, skipped, errors, dry_run: dryRun };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (!args['profile-dir']) {
    process.stderr.write(JSON.stringify(envelopeError('blocking', 'Missing required argument: --profile-dir')) + '\n');
    process.stderr.write('Usage: node migrate-v4.js --profile-dir PATH [--dry-run]\n');
    process.exit(1);
  }

  try {
    const dryRun = args['dry-run'] === true;
    const result = migrate(expandHome(args['profile-dir']), dryRun);
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
}

module.exports = { migrate };
