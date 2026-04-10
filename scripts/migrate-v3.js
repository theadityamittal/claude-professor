'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  readMarkdownWithFrontmatter,
  writeMarkdownFile,
  ensureDir,
  listMarkdownFiles,
  expandHome,
  parseArgs,
} = require('./utils.js');

// ─── Domain mapping tables ────────────────────────────────────────────────────

// Simple 1-to-1 renames: oldName → newName
const DOMAIN_RENAMES = {
  systems: 'operating_systems',
  ml_ai: 'machine_learning',
  languages: 'programming_languages',
  cloud_infrastructure: 'devops_infrastructure',
  tools: 'software_construction',
  custom: '_unmapped',
};

// Many-to-1 merges: oldName → sharedTargetName
const DOMAIN_MERGES = {
  algorithms: 'algorithms_data_structures',
  data_structures: 'algorithms_data_structures',
};

// backend/ concept_id → target domain
const BACKEND_MAP = {
  rest_api: 'api_design',
  graphql: 'api_design',
  websockets: 'networking',
  middleware: 'architecture',
  async_patterns: 'concurrency',
  event_sourcing: 'architecture',
  circuit_breaker: 'reliability_observability',
  rate_limiting: 'api_design',
  idempotency: 'distributed_systems',
  session_management: 'security',
  connection_pooling: 'databases',
  caching: 'performance_scalability',
  message_queue: 'performance_scalability',
  microservices: 'architecture',
  api_gateway: 'api_design',
  pagination: 'api_design',
  authentication: 'security',
  authorization: 'security',
};

const BACKEND_FALLBACK = 'architecture';

// ─── Field enrichment ─────────────────────────────────────────────────────────

function enrichFrontmatter(frontmatter, targetDomain) {
  const { is_registry_concept, difficulty_tier, ...rest } = frontmatter;

  return {
    ...rest,
    domain: targetDomain,
    is_seed_concept: is_registry_concept !== undefined ? is_registry_concept : (frontmatter.is_seed_concept ?? false),
    difficulty_tier: difficulty_tier === 'foundational' ? 'beginner' : (difficulty_tier || 'intermediate'),
    level: frontmatter.level !== undefined ? frontmatter.level : 1,
    parent_concept: frontmatter.parent_concept !== undefined ? frontmatter.parent_concept : null,
    aliases: frontmatter.aliases !== undefined ? frontmatter.aliases : [],
    related_concepts: frontmatter.related_concepts !== undefined ? frontmatter.related_concepts : [],
    scope_note: frontmatter.scope_note !== undefined ? frontmatter.scope_note : '',
  };
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Resolve target domain for a given source domain and concept_id.
 * Returns null for unknown domains that don't need migration (in-place).
 */
function resolveTargetDomain(sourceDomain, conceptId) {
  if (sourceDomain === 'backend') {
    return BACKEND_MAP[conceptId] ?? BACKEND_FALLBACK;
  }
  if (DOMAIN_RENAMES[sourceDomain]) {
    return DOMAIN_RENAMES[sourceDomain];
  }
  if (DOMAIN_MERGES[sourceDomain]) {
    return DOMAIN_MERGES[sourceDomain];
  }
  return null; // No migration needed — domain stays as-is
}

/**
 * Migrate a Phase 2 concept file to its Phase 3 location.
 * Returns 'moved', 'skipped', or 'error'.
 */
function migrateFile(srcPath, profileDir, sourceDomain, conceptId) {
  const targetDomain = resolveTargetDomain(sourceDomain, conceptId);

  if (targetDomain === null) {
    // In-place: just enrich fields without moving
    const parsed = readMarkdownWithFrontmatter(srcPath);
    if (!parsed) {
      process.stderr.write(`Warning: could not read ${srcPath}\n`);
      return 'error';
    }
    const enriched = enrichFrontmatter(parsed.frontmatter, sourceDomain);
    writeMarkdownFile(srcPath, enriched, parsed.body);
    return 'enriched';
  }

  // If source domain === target domain, also in-place enrichment only
  if (targetDomain === sourceDomain) {
    const parsed = readMarkdownWithFrontmatter(srcPath);
    if (!parsed) {
      process.stderr.write(`Warning: could not read ${srcPath}\n`);
      return 'error';
    }
    const enriched = enrichFrontmatter(parsed.frontmatter, targetDomain);
    writeMarkdownFile(srcPath, enriched, parsed.body);
    return 'enriched';
  }

  const destDir = path.join(profileDir, targetDomain);
  const destPath = path.join(destDir, `${conceptId}.md`);

  // Idempotent: skip if destination already exists
  if (fs.existsSync(destPath)) {
    return 'skipped';
  }

  const parsed = readMarkdownWithFrontmatter(srcPath);
  if (!parsed) {
    process.stderr.write(`Warning: could not read ${srcPath}\n`);
    return 'error';
  }

  const enriched = enrichFrontmatter(parsed.frontmatter, targetDomain);
  ensureDir(destDir);
  writeMarkdownFile(destPath, enriched, parsed.body);
  try {
    fs.unlinkSync(srcPath);
  } catch (err) {
    process.stderr.write(`Warning: moved ${conceptId} to ${destPath} but could not delete source: ${err.message}\n`);
  }
  return 'moved';
}

/**
 * Main migration function.
 * @param {string} profileDir - Path to the concepts directory.
 * @returns {{ moved: number, skipped: number, enriched: number, errors: number }}
 */
function migrate(profileDir) {
  const stats = { moved: 0, skipped: 0, enriched: 0, errors: 0 };

  let domains;
  try {
    domains = fs.readdirSync(profileDir).filter(entry => {
      const fullPath = path.join(profileDir, entry);
      return fs.statSync(fullPath).isDirectory();
    });
  } catch (err) {
    if (err.code === 'ENOENT') return stats;
    throw err;
  }

  for (const domain of domains) {
    const domainDir = path.join(profileDir, domain);
    const files = listMarkdownFiles(domainDir);

    for (const file of files) {
      const conceptId = path.basename(file, '.md');
      const srcPath = path.join(domainDir, file);

      try {
        const result = migrateFile(srcPath, profileDir, domain, conceptId);
        if (result === 'moved') {
          stats.moved++;
          stats.enriched++;
        } else if (result === 'skipped') {
          stats.skipped++;
        } else if (result === 'enriched') {
          stats.enriched++;
        } else {
          stats.errors++;
        }
      } catch (err) {
        process.stderr.write(`Error migrating ${srcPath}: ${err.message}\n`);
        stats.errors++;
      }
    }

    // Remove source directory if now empty (and it was a migration source)
    const targetDomain = resolveTargetDomain(domain, null);
    const shouldRemoveIfEmpty = targetDomain !== null && targetDomain !== domain;
    if (shouldRemoveIfEmpty) {
      try {
        const remaining = fs.readdirSync(domainDir);
        if (remaining.length === 0) {
          fs.rmdirSync(domainDir);
        }
      } catch (err) {
        process.stderr.write(`Warning: could not remove directory ${domainDir}: ${err.message}\n`);
      }
    }
  }

  return stats;
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const profileDir = expandHome(args['profile-dir'] || '~/.claude/professor/concepts');

  try {
    const stats = migrate(profileDir);
    process.stdout.write(
      `Migration complete. Moved: ${stats.moved}, Skipped: ${stats.skipped}, Enriched: ${stats.enriched}, Errors: ${stats.errors}\n`
    );
    if (stats.errors > 0) process.exit(1);
  } catch (err) {
    process.stderr.write(`Migration failed: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { migrate };
