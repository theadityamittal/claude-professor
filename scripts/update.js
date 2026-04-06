'use strict';

const path = require('node:path');
const { readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs } = require('./utils.js');
const {
  computeNewStability, computeNewDifficulty, computeRetrievability,
  getInitialStability, getInitialDifficulty,
} = require('./fsrs.js');

function update(options) {
  const { concept, domain, grade, isRegistryConcept, difficultyTier,
          profileDir, documentationUrl, notes } = options;

  const gradeNum = parseInt(grade, 10);
  if (![1, 2, 3, 4].includes(gradeNum)) {
    throw new Error(`Invalid grade: ${grade}. Must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
  }

  ensureDir(profileDir);
  const filePath = path.join(profileDir, `${domain}.json`);
  const profile = readJSON(filePath) || [];
  const now = isoNow();

  const existingIdx = profile.findIndex(c => c.concept_id === concept);

  if (existingIdx === -1) {
    const newStability = getInitialStability(gradeNum);
    const newDifficulty = getInitialDifficulty(gradeNum);

    profile.push({
      concept_id: concept,
      domain,
      is_registry_concept: isRegistryConcept === 'true',
      difficulty_tier: difficultyTier,
      first_encountered: now,
      last_reviewed: now,
      review_history: [{ date: now, grade: gradeNum }],
      fsrs_stability: newStability,
      fsrs_difficulty: Math.round(newDifficulty * 1000) / 1000,
      documentation_url: documentationUrl || null,
      notes: notes || null,
    });
    writeJSON(filePath, profile);

    return {
      success: true,
      concept_id: concept,
      domain,
      new_stability: Math.round(newStability * 10000) / 10000,
      new_difficulty: Math.round(newDifficulty * 1000) / 1000,
      action: 'created',
    };
  }

  const entry = profile[existingIdx];
  const elapsed = daysBetween(entry.last_reviewed, now);
  const retrievability = computeRetrievability(entry.fsrs_stability, Math.max(elapsed, 0.001));

  const newStability = computeNewStability(
    entry.fsrs_stability, entry.fsrs_difficulty, gradeNum, retrievability
  );
  const newDifficulty = computeNewDifficulty(entry.fsrs_difficulty, gradeNum);

  const updatedEntry = {
    ...entry,
    last_reviewed: now,
    review_history: [...entry.review_history, { date: now, grade: gradeNum }],
    fsrs_stability: Math.round(newStability * 10000) / 10000,
    fsrs_difficulty: Math.round(newDifficulty * 1000) / 1000,
    documentation_url: documentationUrl || entry.documentation_url,
    notes: notes || entry.notes,
  };

  const updatedProfile = profile.map((c, i) => i === existingIdx ? updatedEntry : c);
  writeJSON(filePath, updatedProfile);

  return {
    success: true,
    concept_id: concept,
    domain,
    new_stability: updatedEntry.fsrs_stability,
    new_difficulty: updatedEntry.fsrs_difficulty,
    action: 'updated',
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const required = ['concept', 'domain', 'grade', 'profile-dir'];
  const missing = required.filter(k => !args[k]);
  if (missing.length > 0) {
    process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
    process.stderr.write('Usage: node update.js --concept ID --domain DOMAIN --grade 1-4 --profile-dir PATH\n');
    process.exit(1);
  }

  try {
    const result = update({
      concept: args.concept,
      domain: args.domain,
      grade: args.grade,
      isRegistryConcept: args['is-registry-concept'] || 'false',
      difficultyTier: args['difficulty-tier'] || 'intermediate',
      profileDir: args['profile-dir'],
      documentationUrl: args['documentation-url'],
      notes: args.notes,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    if (err.code === 'EACCES') {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

module.exports = { update };
