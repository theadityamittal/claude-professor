'use strict';

const path = require('node:path');
const { readJSON, ensureDir, parseArgs, daysBetween, isoNow } = require('./utils.js');
const { computeRetrievability, determineAction } = require('./fsrs.js');

function search(registryPath, domainsPath, query) {
  const registry = readJSON(registryPath) || [];
  const domains = readJSON(domainsPath) || [];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const allDomainIds = domains.map(d => d.id);

  const matchedConcepts = registry.filter(concept =>
    words.some(word =>
      concept.id.toLowerCase().includes(word) ||
      concept.domain.toLowerCase().includes(word)
    )
  );

  const matchedDomains = [...new Set([
    ...matchedConcepts.map(c => c.domain),
    ...allDomainIds.filter(d => words.some(w => d.includes(w))),
  ])];

  return { matched_concepts: matchedConcepts, matched_domains: matchedDomains, all_domains: allDomainIds };
}

function status(conceptIds, profileDir, domainsPath, registryPath) {
  ensureDir(profileDir);
  const registry = readJSON(registryPath) || [];
  const now = isoNow();

  const concepts = conceptIds.map(conceptId => {
    const registryEntry = registry.find(c => c.id === conceptId);
    let domain = registryEntry ? registryEntry.domain : null;

    if (!domain) {
      const domains = readJSON(domainsPath) || [];
      for (const d of domains) {
        const profile = readJSON(path.join(profileDir, `${d.id}.json`));
        if (profile && profile.some(c => c.concept_id === conceptId)) {
          domain = d.id;
          break;
        }
      }
    }

    if (!domain) {
      return {
        concept_id: conceptId, domain: null, status: 'new',
        retrievability: null, stability: null, difficulty: null,
        grade_history: [], last_reviewed: null, days_since_review: null,
        documentation_url: null,
      };
    }

    const profile = readJSON(path.join(profileDir, `${domain}.json`)) || [];
    const entry = profile.find(c => c.concept_id === conceptId);

    if (!entry) {
      return {
        concept_id: conceptId, domain, status: 'new',
        retrievability: null, stability: null, difficulty: null,
        grade_history: [], last_reviewed: null, days_since_review: null,
        documentation_url: null,
      };
    }

    const elapsed = daysBetween(entry.last_reviewed, now);
    const retrievability = computeRetrievability(entry.fsrs_stability, elapsed);
    const action = determineAction(retrievability);

    return {
      concept_id: conceptId, domain, status: action,
      retrievability: Math.round(retrievability * 1000) / 1000,
      stability: entry.fsrs_stability,
      difficulty: entry.fsrs_difficulty,
      grade_history: entry.review_history.map(r => r.grade),
      last_reviewed: entry.last_reviewed,
      days_since_review: Math.round(elapsed * 10) / 10,
      documentation_url: entry.documentation_url || null,
    };
  });

  return { concepts };
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
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else if (mode === 'status') {
      const statusRequired = ['concepts', 'profile-dir', 'domains-path', 'registry-path'];
      const missing = statusRequired.filter(k => !args[k]);
      if (missing.length > 0) {
        process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
        process.stderr.write('Usage: node lookup.js status --concepts IDS --profile-dir PATH --domains-path PATH --registry-path PATH\n');
        process.exit(1);
      }
      const conceptIds = args.concepts.split(',').map(s => s.trim());
      const result = status(conceptIds, args['profile-dir'], args['domains-path'], args['registry-path']);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stderr.write(`Unknown mode: ${mode}. Use "search" or "status".\n`);
      process.exit(1);
    }
  } catch (err) {
    if (err.code === 'EACCES') {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

module.exports = { search, status };
