'use strict';

const path = require('node:path');
const { ensureDir, isoNow, daysBetween, parseArgs,
        readMarkdownWithFrontmatter, writeMarkdownFile, expandHome } = require('./utils.js');
const {
  computeNewStability, computeNewDifficulty, computeRetrievability,
  getInitialStability, getInitialDifficulty,
} = require('./fsrs.js');

function parseList(str) {
  if (!str || str === '') return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function update(options) {
  const {
    concept, domain, grade,
    isRegistryConcept, isSeedConcept, difficultyTier,
    profileDir, documentationUrl, notes,
    level, parentConcept, aliases, scopeNote, relatedConcepts,
    createParent, addAlias, body,
  } = options;

  ensureDir(profileDir);
  const conceptPath = path.join(profileDir, domain, `${concept}.md`);
  const resolved = path.resolve(conceptPath);
  if (!resolved.startsWith(path.resolve(profileDir))) {
    throw new Error(`Invalid path: ${resolved} is outside profile directory`);
  }
  const existing = readMarkdownWithFrontmatter(conceptPath);
  const now = isoNow();

  // --- --add-alias path ---
  if (addAlias !== undefined) {
    if (!existing) {
      throw new Error(`Concept not found: ${concept} in domain ${domain}`);
    }
    const entry = existing.frontmatter;
    const currentAliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    const updatedAliases = currentAliases.includes(addAlias)
      ? currentAliases
      : [...currentAliases, addAlias];

    const updatedFrontmatter = { ...entry, aliases: updatedAliases };
    writeMarkdownFile(conceptPath, updatedFrontmatter, existing.body);
    return { success: true, concept_id: concept, domain, action: 'alias_added' };
  }

  // --- --body path ---
  if (body !== undefined) {
    if (!existing) {
      throw new Error(`Concept not found: ${concept} in domain ${domain}`);
    }
    writeMarkdownFile(conceptPath, existing.frontmatter, body);
    return { success: true, concept_id: concept, domain, action: 'body_updated' };
  }

  // --- --create-parent path (no grade needed) ---
  if (createParent) {
    if (existing) {
      return { success: true, concept_id: concept, domain, action: 'already_exists' };
    }
    const frontmatter = {
      concept_id: concept,
      domain,
      level: level !== undefined ? parseInt(level, 10) : 1,
      parent_concept: parentConcept || null,
      is_seed_concept: isSeedConcept === true || isSeedConcept === 'true',
      difficulty_tier: difficultyTier || 'intermediate',
      aliases: aliases ? parseList(aliases) : [],
      related_concepts: relatedConcepts ? parseList(relatedConcepts) : [],
      scope_note: scopeNote || '',
      first_encountered: now,
      last_reviewed: null,
      review_history: [],
      fsrs_stability: 0,
      fsrs_difficulty: 0,
    };
    const title = concept.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const bodyContent = `\n# ${title}\n\n## Notes\n${notes || 'No notes yet.'}\n`;
    writeMarkdownFile(conceptPath, frontmatter, bodyContent);

    return {
      success: true,
      concept_id: concept,
      domain,
      new_stability: 0,
      new_difficulty: 0,
      action: 'created',
    };
  }

  // --- grade-based create / update path ---
  const gradeNum = parseInt(grade, 10);
  if (![1, 2, 3, 4].includes(gradeNum)) {
    throw new Error(`Invalid grade: ${grade}. Must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
  }

  if (!existing) {
    const newStability = getInitialStability(gradeNum);
    const newDifficulty = getInitialDifficulty(gradeNum);

    const frontmatter = {
      concept_id: concept,
      domain,
      level: level !== undefined ? parseInt(level, 10) : 1,
      parent_concept: parentConcept || null,
      is_seed_concept: isSeedConcept === true || isSeedConcept === 'true',
      difficulty_tier: difficultyTier || 'intermediate',
      aliases: aliases ? parseList(aliases) : [],
      related_concepts: relatedConcepts ? parseList(relatedConcepts) : [],
      scope_note: scopeNote || '',
      first_encountered: now,
      last_reviewed: now,
      review_history: [{ date: now, grade: gradeNum }],
      fsrs_stability: newStability,
      fsrs_difficulty: Math.round(newDifficulty * 1000) / 1000,
      // Keep documentation_url for backward compatibility with existing tests
      documentation_url: documentationUrl || null,
    };
    const title = concept.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const bodyContent = `\n# ${title}\n\n## Notes\n${notes || 'No notes yet.'}\n`;
    writeMarkdownFile(conceptPath, frontmatter, bodyContent);

    return {
      success: true,
      concept_id: concept,
      domain,
      new_stability: Math.round(newStability * 10000) / 10000,
      new_difficulty: Math.round(newDifficulty * 1000) / 1000,
      action: 'created',
    };
  }

  const entry = existing.frontmatter;
  const elapsed = daysBetween(entry.last_reviewed, now);
  const retrievability = computeRetrievability(entry.fsrs_stability, Math.max(elapsed, 0.001));

  const newStability = computeNewStability(
    entry.fsrs_stability, entry.fsrs_difficulty, gradeNum, retrievability
  );
  const newDifficulty = computeNewDifficulty(entry.fsrs_difficulty, gradeNum);

  const updatedFrontmatter = {
    ...entry,
    last_reviewed: now,
    review_history: [...entry.review_history, { date: now, grade: gradeNum }],
    fsrs_stability: Math.round(newStability * 10000) / 10000,
    fsrs_difficulty: Math.round(newDifficulty * 1000) / 1000,
    documentation_url: documentationUrl || entry.documentation_url,
  };

  writeMarkdownFile(conceptPath, updatedFrontmatter, existing.body);

  return {
    success: true,
    concept_id: concept,
    domain,
    new_stability: updatedFrontmatter.fsrs_stability,
    new_difficulty: updatedFrontmatter.fsrs_difficulty,
    action: 'updated',
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  const isCreateParent = args['create-parent'] === true;
  const isAddAlias = args['add-alias'] !== undefined;
  const isBodyUpdate = args['body'] !== undefined;

  // Determine required args based on operation mode
  if (!isCreateParent && !isAddAlias && !isBodyUpdate) {
    const required = ['concept', 'domain', 'grade', 'profile-dir'];
    const missing = required.filter(k => !args[k]);
    if (missing.length > 0) {
      process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
      process.stderr.write('Usage: node update.js --concept ID --domain DOMAIN --grade 1-4 --profile-dir PATH\n');
      process.exit(1);
    }
  } else {
    const required = ['concept', 'domain', 'profile-dir'];
    const missing = required.filter(k => !args[k]);
    if (missing.length > 0) {
      process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
      process.exit(1);
    }
  }

  try {
    const result = update({
      concept: args.concept,
      domain: args.domain,
      grade: args.grade,
      isRegistryConcept: args['is-registry-concept'] || 'false',
      isSeedConcept: args['is-seed-concept'] === true || args['is-seed-concept'] === 'true'
        || args['is-registry-concept'] === true || args['is-registry-concept'] === 'true',
      difficultyTier: args['difficulty-tier'] || 'intermediate',
      profileDir: expandHome(args['profile-dir']),
      documentationUrl: args['documentation-url'],
      notes: args.notes,
      level: args.level,
      parentConcept: args['parent-concept'],
      aliases: args.aliases,
      scopeNote: args['scope-note'],
      relatedConcepts: args['related-concepts'],
      createParent: isCreateParent,
      addAlias: args['add-alias'],
      body: args.body,
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
