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
 */
function _buildConceptMap(registryPath, profileDir) {
  const registry = readJSON(registryPath) || [];
  const map = new Map();

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
 * Deterministic matching. v5: only 'exact' mode is supported.
 */
function reconcile(mode, candidate, registryPath, profileDir) {
  if (mode === 'alias') {
    throw new Error('--mode alias is removed in v5');
  }
  if (mode !== 'exact') {
    throw new Error(`Unknown reconcile mode: ${mode}. Use "exact".`);
  }
  const conceptMap = _buildConceptMap(registryPath, profileDir);
  const entry = conceptMap.get(candidate);
  if (entry) {
    return { match_type: 'exact', concept_id: entry.concept_id, domain: entry.domain, source: entry.source };
  }
  return { match_type: 'no_match' };
}

// --- v5 additions ---

/**
 * Walk a profile directory (top-level then domain subdirs) and yield
 * { filePath, frontmatter, body, domain } for every .md file parsed successfully.
 */
function* _walkProfile(profileDir) {
  let entries;
  try {
    entries = fs.readdirSync(profileDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const e of entries) {
    const full = path.join(profileDir, e.name);
    if (e.isDirectory()) {
      const subFiles = listMarkdownFiles(full);
      for (const file of subFiles) {
        const p = path.join(full, file);
        const result = readMarkdownWithFrontmatter(p);
        if (!result || !result.frontmatter) continue;
        yield { filePath: p, frontmatter: result.frontmatter, body: result.body, domain: e.name };
      }
    } else if (e.isFile() && e.name.endsWith('.md')) {
      const result = readMarkdownWithFrontmatter(full);
      if (!result || !result.frontmatter) continue;
      yield { filePath: full, frontmatter: result.frontmatter, body: result.body, domain: result.frontmatter.domain || null };
    }
  }
}

/**
 * Extract a named markdown section body (e.g. "Teaching Guide"). Returns '' if not found.
 */
function _extractSection(body, sectionName) {
  if (!body) return '';
  const lines = body.split('\n');
  const headingPattern = new RegExp(`^##\\s+${sectionName}\\s*$`, 'i');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingPattern.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

function _firstSentence(text) {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^[^\n.!?]*[.!?]/);
  if (match) return match[0].trim();
  const firstLine = trimmed.split('\n')[0];
  return firstLine.trim();
}

function _teachingGuideSummary(body) {
  const section = _extractSection(body, 'Teaching Guide');
  if (!section) return null;
  return section.slice(0, 200);
}

/**
 * Compute FSRS status per spec §2.6 input vocabulary.
 * @param {object|null} frontmatter - null if no profile file
 * @param {string} now - ISO timestamp
 */
function _computeFsrsStatus(frontmatter, now) {
  if (!frontmatter) return 'new';
  const history = Array.isArray(frontmatter.review_history) ? frontmatter.review_history : [];
  if (history.length === 0) return 'encountered_via_child';
  const stability = frontmatter.fsrs_stability;
  const lastReviewed = frontmatter.last_reviewed;
  if (!lastReviewed || !stability) return 'teach_new';
  const elapsed = daysBetween(lastReviewed, now);
  const R = computeRetrievability(stability, elapsed);
  if (R < 0.3) return 'teach_new';
  if (R > 0.7) return 'skip';
  return 'review';
}

/**
 * 5.2.1 find-l2-children: walk profile dir, match parent_concept === parent.
 */
function findL2Children(parent, profileDir) {
  const now = isoNow();
  const children = [];
  for (const { frontmatter, body, domain } of _walkProfile(profileDir)) {
    if (frontmatter.parent_concept !== parent) continue;
    const fsrsStatus = _computeFsrsStatus(frontmatter, now);
    children.push({
      concept_id: frontmatter.concept_id,
      domain: frontmatter.domain || domain,
      fsrs_status: fsrsStatus,
      fsrs_stability: frontmatter.fsrs_stability ?? null,
      last_reviewed: frontmatter.last_reviewed ?? null,
      teaching_guide_summary: _teachingGuideSummary(body),
    });
  }
  return { parent, children };
}

/**
 * 5.2.2 list-l2-universe
 */
function listL2Universe(profileDir, registryPath, thin, ids) {
  const registry = readJSON(registryPath) || [];
  const l1Entries = registry.filter(e => (e.level === undefined || e.level === 1));

  const l2Profiles = [];
  for (const { frontmatter, body } of _walkProfile(profileDir)) {
    if (frontmatter.level !== 2) continue;
    l2Profiles.push({ frontmatter, body });
  }

  if (thin) {
    const l2s = l2Profiles.map(({ frontmatter, body }) => ({
      id: frontmatter.concept_id,
      parent: frontmatter.parent_concept || null,
      scope_1line: _firstSentence(_extractSection(body, 'Description')),
    }));
    const l1s = l1Entries.map(e => ({
      id: e.concept_id,
      domain: e.domain,
      scope_1line: e.scope_note ? _firstSentence(e.scope_note) : '',
    }));
    return { l2s, l1s };
  }

  // Full mode — requires ids
  const idSet = new Set(ids);
  const l2s = l2Profiles
    .filter(({ frontmatter }) => idSet.has(frontmatter.concept_id))
    .map(({ frontmatter, body }) => ({
      id: frontmatter.concept_id,
      parent: frontmatter.parent_concept || null,
      full_description: _extractSection(body, 'Description'),
      teaching_guide_summary: _teachingGuideSummary(body),
    }));
  const l1s = l1Entries
    .filter(e => idSet.has(e.concept_id))
    .map(e => ({
      id: e.concept_id,
      domain: e.domain,
      full_description: e.scope_note || '',
    }));
  return { l2s, l1s };
}

/**
 * 5.2.3 record-l2-decision
 * Validate decision schema and append l2_decision event to session log.
 * Returns { action, id }.
 * Throws on schema errors with .blocking = true.
 */
function _makeBlockingError(message) {
  const err = new Error(message);
  err.blocking = true;
  return err;
}

function recordL2Decision(sessionDir, proposed, decision) {
  if (!decision || typeof decision !== 'object') {
    throw _makeBlockingError('Matcher output schema invalid: decision must be an object');
  }
  const VALID = new Set(['semantic_l2', 'l1_instead', 'parent_disputed', 'no_match']);
  if (!VALID.has(decision.match)) {
    throw _makeBlockingError(`Matcher output schema invalid: match must be one of ${[...VALID].join(', ')}`);
  }
  if (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1) {
    throw _makeBlockingError('Matcher output schema invalid: confidence must be a number in [0.0, 1.0]');
  }
  if (typeof decision.reasoning !== 'string' || decision.reasoning.trim() === '') {
    throw _makeBlockingError('Matcher output schema invalid: reasoning must be a non-empty string');
  }
  if ((decision.match === 'semantic_l2' || decision.match === 'l1_instead') && !decision.matched_id) {
    throw _makeBlockingError(`Matcher output schema invalid: matched_id required when match=${decision.match}`);
  }
  if (decision.match === 'parent_disputed' && !decision.suggested_parent) {
    throw _makeBlockingError('Matcher output schema invalid: suggested_parent required when match=parent_disputed');
  }

  let action;
  let id;
  switch (decision.match) {
    case 'semantic_l2':
    case 'l1_instead':
      action = 'use_existing';
      id = decision.matched_id;
      break;
    case 'parent_disputed':
      action = 'accept_with_new_parent';
      id = proposed;
      break;
    case 'no_match':
    default:
      action = 'accept_novel';
      id = proposed;
      break;
  }

  ensureDir(sessionDir);
  const logPath = path.join(sessionDir, '.session-log.jsonl');
  const event = {
    type: 'l2_decision',
    timestamp: isoNow(),
    proposed,
    decision: decision.match,
    matched_id: decision.matched_id || null,
    suggested_parent: decision.suggested_parent || null,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
  };
  fs.appendFileSync(logPath, JSON.stringify(event) + '\n', 'utf-8');

  return { action, id };
}

/**
 * 5.2.4 concept-state
 */
function conceptState(conceptId, registryPath, profileDir) {
  const registry = readJSON(registryPath) || [];
  const registryEntry = registry.find(c => c.concept_id === conceptId);

  const registryMeta = registryEntry
    ? {
        level: registryEntry.level || 1,
        domain: registryEntry.domain || null,
        is_seed_concept: registryEntry.is_seed_concept === true,
        difficulty_tier: registryEntry.difficulty_tier || null,
        in_registry: true,
      }
    : {
        level: 2,
        domain: null,
        is_seed_concept: false,
        difficulty_tier: null,
        in_registry: false,
      };

  // Search profile dir for this concept
  let profilePath = null;
  let profileFm = null;
  for (const entry of _walkProfile(profileDir)) {
    if (entry.frontmatter.concept_id === conceptId) {
      profilePath = entry.filePath;
      profileFm = entry.frontmatter;
      if (!registryMeta.domain) registryMeta.domain = entry.frontmatter.domain || entry.domain;
      break;
    }
  }

  const now = isoNow();
  const fsrsStatus = _computeFsrsStatus(profileFm, now);

  const profileMeta = profileFm
    ? {
        fsrs_stability: profileFm.fsrs_stability ?? null,
        fsrs_difficulty: profileFm.fsrs_difficulty ?? null,
        last_reviewed: profileFm.last_reviewed ?? null,
        review_count: Array.isArray(profileFm.review_history) ? profileFm.review_history.length : 0,
      }
    : null;

  return {
    concept_id: conceptId,
    registry_meta: registryMeta,
    fsrs_status: fsrsStatus,
    profile_path: profilePath,
    profile_meta: profileMeta,
  };
}

/**
 * 5.2.5 session-exists
 */
function sessionExists(sessionDir) {
  const statePath = path.join(sessionDir, '.session-state.json');
  const state = readJSON(statePath);
  if (!state) return { exists: false };

  const currentPhase = state.current_phase ?? null;
  const phases = state.phases || {};
  const phaseData = currentPhase ? phases[String(currentPhase)] : null;

  let progressSummary;
  if (currentPhase && phaseData) {
    // Determine units for this phase
    const units = phaseData.components || phaseData.concerns || [];
    const totalUnits = units.length;
    const unitName = phaseData.components ? 'components' : 'concerns';
    let doneCount = 0;
    if (phaseData.components) {
      doneCount = units.filter(u => u.status === 'done').length;
    } else if (phaseData.discussions) {
      // Phase 1: use current_concern_index as a proxy
      const idx = phaseData.current_concern_index;
      doneCount = (typeof idx === 'number') ? idx : (phaseData.discussions || []).length;
    }
    progressSummary = `Phase ${currentPhase} of 4, ${doneCount} of ${totalUnits} ${unitName} done`;
  } else {
    progressSummary = `Phase ${currentPhase || 'not started'}`;
  }

  return {
    exists: true,
    session_id: state.session_id || null,
    task: state.task || null,
    current_phase: currentPhase,
    started_at: state.started_at || null,
    progress_summary: progressSummary,
  };
}

// --- CLI router ---

function _writeOk(result) {
  process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
}

function _writeBlocking(message) {
  process.stderr.write(JSON.stringify(envelopeError('blocking', message)) + '\n');
  process.exit(2);
}

function _writeMissing(missing, usage) {
  _writeBlocking(`Missing required arguments: ${missing.join(', ')}. Usage: ${usage}`);
}

function _requireArgs(args, required, usage) {
  const missing = required.filter(k => !args[k]);
  if (missing.length > 0) _writeMissing(missing, usage);
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const mode = process.argv[2];

  try {
    if (mode === 'search') {
      _requireArgs(args, ['registry-path', 'domains-path', 'query'],
        'node lookup.js search --query QUERY --registry-path PATH --domains-path PATH');
      _writeOk(search(args['registry-path'], args['domains-path'], args.query));
    } else if (mode === 'status') {
      _requireArgs(args, ['concepts', 'profile-dir', 'domains-path', 'registry-path'],
        'node lookup.js status --concepts IDS --profile-dir PATH --domains-path PATH --registry-path PATH');
      const conceptIds = args.concepts.split(',').map(s => s.trim());
      _writeOk(status(conceptIds, expandHome(args['profile-dir']), args['domains-path'], args['registry-path']));
    } else if (mode === 'list-concepts') {
      _requireArgs(args, ['domains', 'registry-path', 'profile-dir'],
        'node lookup.js list-concepts --domains DOMAINS --registry-path PATH --profile-dir PATH');
      const domains = args.domains.split(',').map(s => s.trim()).filter(Boolean);
      _writeOk(listConcepts(domains, args['registry-path'], expandHome(args['profile-dir'])));
    } else if (mode === 'reconcile') {
      if (args.mode === 'alias') {
        _writeBlocking('--mode alias is removed in v5');
      }
      _requireArgs(args, ['mode', 'candidate', 'registry-path', 'profile-dir'],
        'node lookup.js reconcile --mode exact --candidate NAME --registry-path PATH --profile-dir PATH');
      _writeOk(reconcile(args.mode, args.candidate, args['registry-path'], expandHome(args['profile-dir'])));
    } else if (mode === 'find-l2-children') {
      _requireArgs(args, ['parent', 'profile-dir'],
        'node lookup.js find-l2-children --parent L1_ID --profile-dir PATH');
      _writeOk(findL2Children(args.parent, expandHome(args['profile-dir'])));
    } else if (mode === 'list-l2-universe') {
      _requireArgs(args, ['profile-dir', 'registry-path'],
        'node lookup.js list-l2-universe --profile-dir PATH --registry-path PATH [--thin] [--ids id1,id2]');
      // --thin default true. Accept --thin (bare flag) or --thin false explicitly.
      let thin = true;
      if (args.thin === 'false') thin = false;
      else if (args.thin === 'true' || args.thin === true) thin = true;
      let ids = [];
      if (args.ids) ids = args.ids.split(',').map(s => s.trim()).filter(Boolean);
      if (!thin && ids.length === 0) {
        _writeBlocking('full mode requires --ids');
      }
      _writeOk(listL2Universe(expandHome(args['profile-dir']), args['registry-path'], thin, ids));
    } else if (mode === 'record-l2-decision') {
      _requireArgs(args, ['session-dir', 'proposed', 'decision-json'],
        'node lookup.js record-l2-decision --session-dir PATH --proposed ID --decision-json JSON');
      let decision;
      try {
        decision = JSON.parse(args['decision-json']);
      } catch (parseErr) {
        _writeBlocking(`Invalid --decision-json: ${parseErr.message}`);
      }
      try {
        const result = recordL2Decision(expandHome(args['session-dir']), args.proposed, decision);
        _writeOk(result);
      } catch (err) {
        if (err.blocking) _writeBlocking(err.message);
        throw err;
      }
    } else if (mode === 'concept-state') {
      _requireArgs(args, ['concept', 'registry-path', 'profile-dir'],
        'node lookup.js concept-state --concept ID --registry-path PATH --profile-dir PATH');
      _writeOk(conceptState(args.concept, args['registry-path'], expandHome(args['profile-dir'])));
    } else if (mode === 'session-exists') {
      _requireArgs(args, ['session-dir'],
        'node lookup.js session-exists --session-dir PATH');
      _writeOk(sessionExists(expandHome(args['session-dir'])));
    } else {
      process.stderr.write(`Unknown mode: ${mode}. Use search, status, list-concepts, reconcile, find-l2-children, list-l2-universe, record-l2-decision, concept-state, or session-exists.\n`);
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

module.exports = {
  search, status, listConcepts, reconcile,
  findL2Children, listL2Universe, recordL2Decision, conceptState, sessionExists,
};
