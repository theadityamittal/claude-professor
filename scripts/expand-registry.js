'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Merge new concepts into the seed registry.
 *
 * Usage: node scripts/expand-registry.js <new-concepts.json>
 *
 * - Reads the existing registry from data/concepts_registry.json
 * - Reads the new concepts from the provided JSON file
 * - Merges: new concepts override existing entries with the same concept_id
 * - Writes the merged result back to data/concepts_registry.json
 */

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const REGISTRY_PATH = path.join(DATA_DIR, 'concepts_registry.json');

function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

// Domain remapping tables from migrate-v3.js
const DOMAIN_RENAMES = {
  systems: 'operating_systems',
  ml_ai: 'machine_learning',
  languages: 'programming_languages',
  cloud_infrastructure: 'devops_infrastructure',
  devops: 'devops_infrastructure',
  tools: 'software_construction',
  custom: '_unmapped',
};

const DOMAIN_MERGES = {
  algorithms: 'algorithms_data_structures',
  data_structures: 'algorithms_data_structures',
};

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

const DIFFICULTY_MAP = {
  foundational: 'beginner',
};

function remapDomain(domain, conceptId) {
  if (domain === 'backend') {
    return BACKEND_MAP[conceptId] || BACKEND_FALLBACK;
  }
  if (DOMAIN_RENAMES[domain]) {
    return DOMAIN_RENAMES[domain];
  }
  if (DOMAIN_MERGES[domain]) {
    return DOMAIN_MERGES[domain];
  }
  return domain;
}

function normalizeEntry(entry) {
  // Support both legacy (id) and Phase 3 (concept_id) formats
  const conceptId = entry.concept_id || entry.id;
  const rawDomain = entry.domain;
  const domain = remapDomain(rawDomain, conceptId);
  const rawDiff = entry.difficulty_tier || entry.difficulty || 'intermediate';
  const difficultyTier = DIFFICULTY_MAP[rawDiff] || rawDiff;

  return {
    concept_id: conceptId,
    domain,
    difficulty_tier: difficultyTier,
    level: entry.level !== undefined ? entry.level : 1,
    parent_concept: entry.parent_concept !== undefined ? entry.parent_concept : null,
    is_seed_concept: entry.is_seed_concept !== undefined ? entry.is_seed_concept : true,
    aliases: entry.aliases || [],
    related_concepts: entry.related_concepts || [],
    scope_note: entry.scope_note || '',
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    process.stderr.write('Usage: node scripts/expand-registry.js <new-concepts.json>\n');
    process.exit(1);
  }

  const newConceptsPath = path.resolve(args[0]);

  // Read existing registry
  let existing = [];
  if (fs.existsSync(REGISTRY_PATH)) {
    existing = readJSON(REGISTRY_PATH);
  }

  // Read new concepts
  const newConcepts = readJSON(newConceptsPath);

  // Build a map from concept_id → entry (existing first, then override with new)
  const map = new Map();

  for (const entry of existing) {
    const normalized = normalizeEntry(entry);
    map.set(normalized.concept_id, normalized);
  }

  let added = 0;
  let updated = 0;

  for (const entry of newConcepts) {
    const normalized = normalizeEntry(entry);
    if (map.has(normalized.concept_id)) {
      updated++;
    } else {
      added++;
    }
    map.set(normalized.concept_id, normalized);
  }

  // Sort by domain, then by concept_id for deterministic output
  const merged = Array.from(map.values()).sort((a, b) => {
    const domainCmp = a.domain.localeCompare(b.domain);
    if (domainCmp !== 0) return domainCmp;
    return a.concept_id.localeCompare(b.concept_id);
  });

  // Write merged registry
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(merged, null, 2) + '\n');

  const summary = {
    total: merged.length,
    added,
    updated,
    kept_from_existing: existing.length - updated,
    domains: [...new Set(merged.map(c => c.domain))].sort(),
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main();
