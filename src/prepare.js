'use strict';

// Checks the inputs before anything is uploaded and writes step outputs
// that tell action.yml which upload steps to run.

const fs = require('node:fs');
const { InputError, resolvePlan, commitCommentBody } = require('./lib');

const INPUTS = [
  'version',
  'archive-file',
  'nexus-api-key',
  'nexus-file-id',
  'nexus-mod-id',
  'nexus-category',
  'nexus-changelog',
  'thunderstore-token',
  'thunderstore-config',
  'thunderstore-build',
];

function readInputs(env) {
  const inputs = {};
  for (const name of INPUTS) {
    inputs[name] = env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] ?? '';
  }
  return inputs;
}

function main(env = process.env) {
  let plan;
  try {
    plan = resolvePlan(readInputs(env));
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    console.log(`::error::${error.message}`);
    return 1;
  }

  const outputs = {
    nexus: String(plan.nexus),
    'nexus-category': plan.nexusCategory,
    thunderstore: String(plan.thunderstore),
    'comment-body': commitCommentBody(plan),
  };
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join('');
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, lines);
  else process.stdout.write(lines);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { main, readInputs };
