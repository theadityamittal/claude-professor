'use strict';

const path = require('node:path');
const { readJSON, ensureDir, isoNow, daysBetween, parseArgs,
        readMarkdownWithFrontmatter, writeMarkdownFile, expandHome,
        envelope, envelopeError } = require('./utils.js');
const {
  computeNewStability, computeNewDifficulty, computeRetrievability,
  getInitialStability, getInitialDifficulty,
} = require('./fsrs.js');

const DEFAULT_REGISTRY_PATH = path.join(__dirname, '..', 'data', 'concepts_registry.json');

const PARENT_PLACEHOLDER_BODY =
  '\n## Description\n\n(Awaiting professor\'s first teaching of this concept.)\n\n' +
  '## Teaching Guide\n\n(No teaching history yet.)\n';

function loadRegistry(registryPath) {
  const arr = readJSON(registryPath);
  if (!Array.isArray(arr)) {
    throw new Error(`Registry at ${registryPath} must be a top-level array`);
  }
  return new Map(arr.map(c => [c.concept_id, c]));
}

function resolveMetadata(registry, concept, args) {
  const reg = registry.get(concept);
  if (reg) {
    return {
      level: 1,
      isSeedConcept: true,
      parentConcept: null,
      domain: reg.domain,
      difficultyTier: reg.difficulty_tier || 'intermediate',
      callerOverrideWarning: (args.level === '2' || args['parent-concept'])
        ? `--level/--parent-concept ignored for registry concept ${concept}` : null,
    };
  }
  if (!args['parent-concept']) {
    return { error: envelopeError('blocking', 'L2 concept requires --parent-concept') };
  }
  const parentReg = registry.get(args['parent-concept']);
  if (!parentReg) {
    return { error: envelopeError('blocking', 'parent_concept must be a registry L1') };
  }
  return {
    level: 2,
    isSeedConcept: false,
    parentConcept: args['parent-concept'],
    domain: parentReg.domain,
    difficultyTier: args['difficulty-tier'] || 'intermediate',
    callerOverrideWarning: null,
  };
}

function buildFrontmatter(concept, meta, opts) {
  return {
    concept_id: concept,
    domain: meta.domain,
    schema_version: 5,
    operation_nonce: opts.nonce || null,
    level: meta.level,
    parent_concept: meta.parentConcept,
    is_seed_concept: meta.isSeedConcept,
    difficulty_tier: meta.difficultyTier,
    first_encountered: opts.firstEncountered,
    last_reviewed: opts.lastReviewed,
    review_history: opts.reviewHistory,
    fsrs_stability: opts.fsrsStability,
    fsrs_difficulty: opts.fsrsDifficulty,
  };
}

function v5Cleanup(entry) {
  const cleaned = { ...entry };
  delete cleaned.aliases;
  delete cleaned.related_concepts;
  delete cleaned.scope_note;
  delete cleaned.documentation_url;
  cleaned.schema_version = 5;
  return cleaned;
}

function update(options) {
  const { concept, profileDir, args, registry } = options;

  // Reject removed v5 flags upfront
  if (args['add-alias'] !== undefined) {
    return { error: envelopeError('blocking', '--add-alias is removed in v5') };
  }
  if (args.notes !== undefined) {
    return { error: envelopeError('blocking', '--notes is removed in v5; use --body to write Teaching Guide') };
  }

  const meta = resolveMetadata(registry, concept, args);
  if (meta.error) return { error: meta.error };

  ensureDir(profileDir);
  const conceptPath = path.join(profileDir, meta.domain, `${concept}.md`);
  const resolved = path.resolve(conceptPath);
  if (!resolved.startsWith(path.resolve(profileDir))) {
    throw new Error(`Invalid path: ${resolved} is outside profile directory`);
  }
  const existing = readMarkdownWithFrontmatter(conceptPath);
  const now = isoNow();

  // --- --body path ---
  if (args.body !== undefined) {
    if (!existing) {
      return { error: envelopeError('blocking', `Concept not found: ${concept} in domain ${meta.domain}`) };
    }
    writeMarkdownFile(conceptPath, v5Cleanup(existing.frontmatter), args.body);
    return {
      result: { success: true, concept_id: concept, domain: meta.domain, action: 'body_updated' },
      warning: meta.callerOverrideWarning,
    };
  }

  // --- --create-parent path (placeholder L2 parent; no grade needed) ---
  if (args['create-parent'] === true) {
    if (existing) {
      return {
        result: { success: true, concept_id: concept, domain: meta.domain, action: 'already_exists' },
        warning: meta.callerOverrideWarning,
      };
    }
    const frontmatter = buildFrontmatter(concept, meta, {
      nonce: args.nonce || null,
      firstEncountered: now,
      lastReviewed: null,
      reviewHistory: [],
      fsrsStability: 0,
      fsrsDifficulty: 0,
    });
    writeMarkdownFile(conceptPath, frontmatter, PARENT_PLACEHOLDER_BODY);
    return {
      result: {
        success: true, concept_id: concept, domain: meta.domain,
        new_stability: 0, new_difficulty: 0, action: 'created',
      },
      warning: meta.callerOverrideWarning,
    };
  }

  // --- nonce idempotency check (grade path only) ---
  if (args.nonce !== undefined && existing && existing.frontmatter.operation_nonce === args.nonce) {
    return {
      result: { success: true, concept_id: concept, domain: meta.domain, action: 'idempotent_skip' },
      warning: meta.callerOverrideWarning,
    };
  }

  // --- grade-based create / update path ---
  const gradeNum = parseInt(args.grade, 10);
  if (![1, 2, 3, 4].includes(gradeNum)) {
    throw new Error(`Invalid grade: ${args.grade}. Must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
  }

  if (!existing) {
    const newStability = getInitialStability(gradeNum);
    const newDifficulty = getInitialDifficulty(gradeNum);
    const frontmatter = buildFrontmatter(concept, meta, {
      nonce: args.nonce || null,
      firstEncountered: now,
      lastReviewed: now,
      reviewHistory: [{ date: now, grade: gradeNum }],
      fsrsStability: newStability,
      fsrsDifficulty: Math.round(newDifficulty * 1000) / 1000,
    });
    writeMarkdownFile(conceptPath, frontmatter, PARENT_PLACEHOLDER_BODY);
    return {
      result: {
        success: true, concept_id: concept, domain: meta.domain,
        new_stability: Math.round(newStability * 10000) / 10000,
        new_difficulty: Math.round(newDifficulty * 1000) / 1000,
        action: 'created',
      },
      warning: meta.callerOverrideWarning,
    };
  }

  const entry = existing.frontmatter;
  const elapsed = daysBetween(entry.last_reviewed, now);
  const retrievability = computeRetrievability(entry.fsrs_stability, Math.max(elapsed, 0.001));
  const newStability = computeNewStability(
    entry.fsrs_stability, entry.fsrs_difficulty, gradeNum, retrievability
  );
  const newDifficulty = computeNewDifficulty(entry.fsrs_difficulty, gradeNum);

  const updatedFrontmatter = v5Cleanup({
    ...entry,
    // Registry-driven override of identity fields
    domain: meta.domain,
    level: meta.level,
    parent_concept: meta.parentConcept,
    is_seed_concept: meta.isSeedConcept,
    difficulty_tier: meta.difficultyTier,
    // FSRS progression
    operation_nonce: args.nonce || entry.operation_nonce || null,
    last_reviewed: now,
    review_history: [...(entry.review_history || []), { date: now, grade: gradeNum }],
    fsrs_stability: Math.round(newStability * 10000) / 10000,
    fsrs_difficulty: Math.round(newDifficulty * 1000) / 1000,
  });

  writeMarkdownFile(conceptPath, updatedFrontmatter, existing.body);

  return {
    result: {
      success: true, concept_id: concept, domain: meta.domain,
      new_stability: updatedFrontmatter.fsrs_stability,
      new_difficulty: updatedFrontmatter.fsrs_difficulty,
      action: 'updated',
    },
    warning: meta.callerOverrideWarning,
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  const required = ['concept', 'profile-dir'];
  const missing = required.filter(k => !args[k]);
  if (missing.length > 0) {
    process.stderr.write(JSON.stringify(envelopeError('blocking', `Missing required arguments: ${missing.join(', ')}`)) + '\n');
    process.exit(2);
  }

  let registry;
  try {
    registry = loadRegistry(args['registry-path'] || DEFAULT_REGISTRY_PATH);
  } catch (err) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }

  try {
    const out = update({
      concept: args.concept,
      profileDir: expandHome(args['profile-dir']),
      args,
      registry,
    });
    if (out.error) {
      process.stderr.write(JSON.stringify(out.error) + '\n');
      process.exit(2);
    }
    if (out.warning) process.stderr.write(`Warning: ${out.warning}\n`);
    process.stdout.write(JSON.stringify(envelope(out.result), null, 2) + '\n');
  } catch (err) {
    if (err.code === 'EACCES') {
      process.stderr.write(JSON.stringify(envelopeError('blocking', err.message)) + '\n');
      process.exit(2);
    }
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
}

module.exports = { update, loadRegistry };
