'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('./utils.js');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const architecturePath = args['architecture-path'];

  // Read hook input from stdin
  let input;
  try {
    input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf-8'));
  } catch {
    // No stdin or invalid JSON — not a hook invocation, exit silently
    process.exit(0);
  }

  const command = input?.tool_input?.command || '';

  // Check if this is a relevant git operation
  const gitPatterns = [
    /^git\s+push\b/,
    /^git\s+pull\b/,
    /^git\s+fetch\b/,
    /^git\s+merge\b/,
    /^gh\s+pr\s+merge\b/,
  ];

  const isGitOp = gitPatterns.some(p => p.test(command.trim()));
  if (!isGitOp) process.exit(0);

  // Check if architecture doc exists
  if (!architecturePath || !fs.existsSync(architecturePath)) {
    process.exit(0);
  }

  // Read the architecture index to find the base branch
  const indexContent = fs.readFileSync(architecturePath, 'utf-8');
  const branchMatch = indexContent.match(/## Branch\n(.+)/);
  const baseBranch = branchMatch ? branchMatch[1].trim() : 'main';

  // Only warn for base branch operations
  const isBaseBranch = command.includes(baseBranch) ||
    command.includes('origin/' + baseBranch) ||
    (!command.includes('origin/') && /^git\s+(pull|fetch|merge)\b/.test(command.trim()));

  if (!isBaseBranch) process.exit(0);

  // Run detect-changes via graph.js
  try {
    const graphScript = require.resolve('./graph.js');
    const archDir = require('node:path').dirname(architecturePath);
    const result = execFileSync('node', [
      graphScript, 'detect-changes',
      '--architecture-dir', archDir,
      '--scan-dirs', 'src/,lib/,services/,cmd/,pkg/',
    ], { encoding: 'utf-8', timeout: 10000 });

    const changes = JSON.parse(result);
    if (changes.structural_changes_detected) {
      process.stderr.write(
        `\nArchitecture may be outdated. ${changes.summary}. ` +
        'Run `/analyze-architecture --update` to refresh.\n'
      );
    }
  } catch {
    // Detection failed — exit silently, never block
  }

  process.exit(0);
}

main();
