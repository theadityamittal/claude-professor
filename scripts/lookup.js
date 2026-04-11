'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { readJSON, ensureDir, parseArgs, daysBetween, isoNow, readMarkdownWithFrontmatter, listMarkdownFiles, expandHome, envelope, envelopeError } = require('./utils.js');
const { computeRetrievability, determineAction } = require('./fsrs.js');

function search(registryPath, domainsPath, query) {
  const registry = readJSON(registryPath) || [];
  const domains = readJSON(domainsPath) || [];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const allDomainIds = domains.map(d => d.id);

  const matchedConcepts = registry.filter(concept =>
    words.some(word =>
      concept.concept_id.toLowerCase().includes(word) ||
      concept.domain.toLowerCase().includes(word)
    )
  );

  const matchedDomains = [...new Set([
    ...matchedConcepts.map(c => c.domain),
    ...allDomainIds.filter(d => words.some(w => d.includes(w))),
  ])];

  return {
    matched_concepts: matchedConcepts.map(c => ({ concept_id: c.concept_id, domain: c.domain })),
    matched_domains: matchedDomains,
    all_domains: allDomainIds,
  };
}

function status(conceptIds, profileDir, domainsPath, registryPath) {
  ensureDir(profileDir);
  const registry = readJSON(registryPath) || [];
  const now = isoNow();

  const concepts = conceptIds.map(conceptId => {
    const registryEntry = registry.find(c => c.concept_id === conceptId);
    let domain = registryEntry ? registryEntry.domain : null;

    if (!domain) {
      const domains = readJSON(domainsPath) || [];
      for (const d of domains) {
        const conceptPath = path.join(profileDir, d.id, `${conceptId}.md`);
        if (fs.existsSync(conceptPath)) {
          domain = d.id;
          break;
        }
      }
    }

    if (!domain) {
      return { concept_id: conceptId, domain: null, status: 'new', retrievability: null };
    }

    const conceptPath = path.join(profileDir, domain, `${conceptId}.md`);
    const result = readMarkdownWithFrontmatter(conceptPath);

    if (!result) {
      return { concept_id: conceptId, domain, status: 'new', retrievability: null };
    }

    const entry = result.frontmatter;
    const elapsed = daysBetween(entry.last_reviewed, now);
    const retrievability = computeRetrievability(entry.fsrs_stability, elapsed);
    const action = determineAction(retrievability);

    return {
      concept_id: conceptId,
      domain,
      status: action,
      retrievability: Math.round(retrievability * 1000) / 1000,
    };
  });

  return { concepts };
}

/**
 * Build a merged concept map from seed registry + user profile files.
 * Profile entries override seed entries with the same concept_id.
 * Returns a Map keyed by concept_id with { concept_id, domain, aliases, scope_note, source }.
 */
function _buildConceptMap(registryPath, profileDir) {
  const registry = readJSON(registryPath) || [];
  const map = new Map();

  // Load seed concepts (Phase 3 concept_id field only)
  for (const entry of registry) {
    const conceptId = entry.concept_id;
    if (!conceptId) continue;
    map.set(conceptId, {
      concept_id: conceptId,
      domain: entry.domain || null,
      aliases: entry.aliases || [],
      scope_note: entry.scope_note || null,
      source: 'seed',
    });
  }

  // Load profile concepts – scan all domain subdirectories
  let domainDirs;
  try {
    domainDirs = fs.readdirSync(profileDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch (err) {
    if (err.code === 'ENOENT') domainDirs = [];
    else throw err;
  }

  for (const domainName of domainDirs) {
    const domainPath = path.join(profileDir, domainName);
    const files = listMarkdownFiles(domainPath);
    for (const file of files) {
      const result = readMarkdownWithFrontmatter(path.join(domainPath, file));
      if (!result || !result.frontmatter) continue;
      const fm = result.frontmatter;
      const conceptId = fm.concept_id;
      if (!conceptId) {
        process.stderr.write(`Warning: ${path.join(domainPath, file)} missing concept_id — skipping\n`);
        continue;
      }
      map.set(conceptId, {
        concept_id: conceptId,
        domain: fm.domain || domainName,
        aliases: fm.aliases || [],
        scope_note: fm.scope_note || null,
        source: 'profile',
      });
    }
  }

  return map;
}

/**
 * List concepts for specified domains, merging seed registry and user profile.
 * @param {string[]} domains - Domain IDs to filter by.
 * @param {string} registryPath - Path to seed registry JSON.
 * @param {string} profileDir - Path to user profile directory.
 * @returns {{ concepts: Array<{concept_id, domain, aliases, scope_note, source}> }}
 */
function listConcepts(domains, registryPath, profileDir) {
  const domainSet = new Set(domains);
  const conceptMap = _buildConceptMap(registryPath, profileDir);
  const concepts = [];
  for (const entry of conceptMap.values()) {
    if (domainSet.has(entry.domain)) {
      concepts.push(entry);
    }
  }
  return { concepts };
}

/**
 * Deterministic matching: checks if a candidate matches an existing concept.
 * mode "exact": match by concept_id only.
 * mode "alias": match by alias (case-insensitive).
 * @param {'exact'|'alias'} mode
 * @param {string} candidate
 * @param {string} registryPath
 * @param {string} profileDir
 * @returns {{ match_type, concept_id?, domain?, source? }}
 */
function reconcile(mode, candidate, registryPath, profileDir) {
  const conceptMap = _buildConceptMap(registryPath, profileDir);

  if (mode === 'exact') {
    const entry = conceptMap.get(candidate);
    if (entry) {
      return { match_type: 'exact', concept_id: entry.concept_id, domain: entry.domain, source: entry.source };
    }
    return { match_type: 'no_match' };
  }

  if (mode === 'alias') {
    const needle = candidate.toLowerCase();
    for (const entry of conceptMap.values()) {
      for (const alias of entry.aliases) {
        if (alias.toLowerCase() === needle) {
          return { match_type: 'alias', concept_id: entry.concept_id, domain: entry.domain, source: entry.source };
        }
      }
    }
    return { match_type: 'no_match' };
  }

  throw new Error(`Unknown reconcile mode: ${mode}. Use "exact" or "alias".`);
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const mode = process.argv[2];

  try {
    if (mode === 'search') {
      const searchRequired = ['registry-path', 'domains-path', 'query'];
      const missing = searchRequired.filter(k => !args[k]);
      if (missing.length > 0) {
        process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
        process.stderr.write('Usage: node lookup.js search --query QUERY --registry-path PATH --domains-path PATH\n');
        process.exit(1);
      }
      const result = search(args['registry-path'], args['domains-path'], args.query);
      process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
    } else if (mode === 'status') {
      const statusRequired = ['concepts', 'profile-dir', 'domains-path', 'registry-path'];
      const missing = statusRequired.filter(k => !args[k]);
      if (missing.length > 0) {
        process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
        process.stderr.write('Usage: node lookup.js status --concepts IDS --profile-dir PATH --domains-path PATH --registry-path PATH\n');
        process.exit(1);
      }
      const conceptIds = args.concepts.split(',').map(s => s.trim());
      const result = status(conceptIds, expandHome(args['profile-dir']), args['domains-path'], args['registry-path']);
      process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
    } else if (mode === 'list-concepts') {
      const required = ['domains', 'registry-path', 'profile-dir'];
      const missing = required.filter(k => !args[k]);
      if (missing.length > 0) {
        process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
        process.stderr.write('Usage: node lookup.js list-concepts --domains DOMAINS --registry-path PATH --profile-dir PATH\n');
        process.exit(1);
      }
      const domains = args.domains.split(',').map(s => s.trim()).filter(Boolean);
      const result = listConcepts(domains, args['registry-path'], expandHome(args['profile-dir']));
      process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
    } else if (mode === 'reconcile') {
      const required = ['mode', 'candidate', 'registry-path', 'profile-dir'];
      const missing = required.filter(k => !args[k]);
      if (missing.length > 0) {
        process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
        process.stderr.write('Usage: node lookup.js reconcile --mode exact|alias --candidate NAME --registry-path PATH --profile-dir PATH\n');
        process.exit(1);
      }
      const result = reconcile(args.mode, args.candidate, args['registry-path'], expandHome(args['profile-dir']));
      process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
    } else {
      process.stderr.write(`Unknown mode: ${mode}. Use "search", "status", "list-concepts", or "reconcile".\n`);
      process.exit(1);
    }
  } catch (err) {
    if (err.code === 'EACCES') {
      process.stderr.write(JSON.stringify(envelopeError('blocking', err.message)) + '\n');
      process.exit(2);
    }
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
}

module.exports = { search, status, listConcepts, reconcile };
