'use strict';

// Light checks on action.yml that catch typos without a YAML parser.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const action = fs.readFileSync(path.join(__dirname, '..', 'action.yml'), 'utf8');

function declaredInputs() {
  const block = action.split(/^inputs:\n/m)[1].split(/^\S/m)[0];
  return new Set([...block.matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]));
}

test('runs as a composite action', () => {
  assert.match(action, /^ {2}using: composite$/m);
});

test('every inputs.* reference is declared', () => {
  const declared = declaredInputs();
  const used = new Set([...action.matchAll(/inputs\.([\w-]+)/g)].map((m) => m[1]));
  for (const name of used) assert.ok(declared.has(name), `inputs.${name} is not declared`);
});

test('every steps.* reference points to a step id', () => {
  const ids = new Set([...action.matchAll(/^\s+id: ([\w-]+)$/gm)].map((m) => m[1]));
  for (const [, id] of action.matchAll(/steps\.([\w-]+)\.outputs/g)) {
    assert.ok(ids.has(id), `steps.${id} has no matching step id`);
  }
});

test('third-party actions are pinned to a full commit SHA', () => {
  for (const [, ref] of action.matchAll(/uses: ([^\s]+)/g)) {
    assert.match(ref, /@[0-9a-f]{40}$/, `${ref} is not pinned to a commit SHA`);
  }
});

test('secrets are not interpolated into run scripts', () => {
  for (const [, script] of action.matchAll(/run: (.*)/g)) {
    assert.doesNotMatch(script, /token|api-key/i, script);
  }
});
