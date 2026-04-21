#!/usr/bin/env node
'use strict';

const { readJSON, parseArgs, envelope, envelopeError } = require('./utils');

const MIN_MAPPED_SEEDS = 3;
const MAX_CONCERNS_PER_L1 = 4;

function main(argv) {
  const args = parseArgs(argv);

  if (!args.concerns || !args.registry) {
    return [envelopeError('blocking', '--concerns and --registry required'), 2];
  }

  const concernsDoc = readJSON(args.concerns);
  if (!concernsDoc) return [envelopeError('fatal', `cannot read ${args.concerns}`), 1];

  const registry = readJSON(args.registry);
  if (!registry) return [envelopeError('fatal', `cannot read ${args.registry}`), 1];
  if (!Array.isArray(registry)) return [envelopeError('fatal', 'registry must be an array'), 1];

  const concerns = concernsDoc.concerns || {};
  const orphans = concernsDoc.orphan_l1s || {};

  const registryIds = new Set();
  for (const entry of registry) {
    if (entry && typeof entry.concept_id === 'string') {
      registryIds.add(entry.concept_id);
    }
  }

  const concernIds = Object.keys(concerns);

  // Invariant 6: unique concern IDs (JSON keys guarantee this, but verify types)
  const seenConcernIds = new Set();
  for (const cid of concernIds) {
    if (seenConcernIds.has(cid)) {
      return [envelopeError('blocking', `Duplicate concern ID '${cid}'`), 2];
    }
    seenConcernIds.add(cid);
  }

  // Invariant 5: each concern has >= 3 mapped_seeds
  for (const cid of concernIds) {
    const concern = concerns[cid];
    const seeds = Array.isArray(concern.mapped_seeds) ? concern.mapped_seeds : [];
    if (seeds.length < MIN_MAPPED_SEEDS) {
      return [envelopeError(
        'blocking',
        `Concern '${cid}' has ${seeds.length} mapped_seeds (minimum ${MIN_MAPPED_SEEDS})`
      ), 2];
    }
  }

  // Invariant 1: every mapped_seeds entry exists in registry
  for (const cid of concernIds) {
    const seeds = concerns[cid].mapped_seeds || [];
    for (const seed of seeds) {
      if (!registryIds.has(seed)) {
        return [envelopeError(
          'blocking',
          `Seed '${seed}' in concern '${cid}' not in registry`
        ), 2];
      }
    }
  }

  // Invariant 7: every orphan_l1s key exists in registry
  for (const orphanId of Object.keys(orphans)) {
    if (!registryIds.has(orphanId)) {
      return [envelopeError(
        'blocking',
        `Orphan L1 '${orphanId}' not in registry`
      ), 2];
    }
  }

  // Build mapped set with counts, and detect disjointness + over-mapping
  const mappedCounts = new Map(); // l1Id -> count of concerns referencing it
  const mappedToConcerns = new Map(); // l1Id -> first concern that claims it (for disjoint messages)

  for (const cid of concernIds) {
    const seeds = concerns[cid].mapped_seeds || [];
    const uniqueSeedsInConcern = new Set(seeds);
    for (const seed of uniqueSeedsInConcern) {
      mappedCounts.set(seed, (mappedCounts.get(seed) || 0) + 1);
      if (!mappedToConcerns.has(seed)) mappedToConcerns.set(seed, cid);
    }
  }

  // Invariant 3: mapped_seeds and orphan_l1s disjoint
  for (const orphanId of Object.keys(orphans)) {
    if (mappedCounts.has(orphanId)) {
      const owningConcern = mappedToConcerns.get(orphanId);
      return [envelopeError(
        'blocking',
        `L1 '${orphanId}' is both in concern '${owningConcern}' mapped_seeds and in orphan_l1s (must be disjoint)`
      ), 2];
    }
  }

  // Invariant 4: no L1 in > MAX_CONCERNS_PER_L1 concerns
  for (const [l1Id, count] of mappedCounts) {
    if (count > MAX_CONCERNS_PER_L1) {
      return [envelopeError(
        'blocking',
        `Over-mapped L1s (>${MAX_CONCERNS_PER_L1} concerns): ${l1Id}(${count})`
      ), 2];
    }
  }

  // Invariant 2: every registry L1 is accounted for (in mapped_seeds OR orphan_l1s)
  const orphanIds = new Set(Object.keys(orphans));
  const uncovered = [];
  for (const id of registryIds) {
    if (!mappedCounts.has(id) && !orphanIds.has(id)) {
      uncovered.push(id);
    }
  }
  if (uncovered.length > 0) {
    return [envelopeError(
      'blocking',
      `Uncovered L1s (not in any concern.mapped_seeds and not in orphan_l1s): ${uncovered.join(', ')}`
    ), 2];
  }

  return [envelope({
    concerns_count: concernIds.length,
    registry_count: registryIds.size,
    mapped_count: mappedCounts.size,
    orphan_count: orphanIds.size,
  }), 0];
}

if (require.main === module) {
  const [out, code] = main(process.argv.slice(2));
  if (code === 0) process.stdout.write(JSON.stringify(out) + '\n');
  else process.stderr.write(JSON.stringify(out) + '\n');
  process.exit(code);
}

module.exports = { main };
