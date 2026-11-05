'use strict';

// Runs the entry scripts the way action.yml does: as separate processes,
// with inputs in INPUT_* variables and a stub tcli on disk.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SRC = path.join(__dirname, '..', 'src');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-mod-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(script, env, cwd) {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('INPUT_') && k !== 'GITHUB_OUTPUT')
  );
  return spawnSync(process.execPath, [path.join(SRC, script)], {
    cwd,
    env: { ...clean, ...env },
    encoding: 'utf8',
  });
}

function readOutputs(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.split(/=(.*)/s).slice(0, 2))
  );
}

test('prepare.js writes outputs for both platforms', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'mod.zip'), '');
  fs.writeFileSync(path.join(dir, 'thunderstore.toml'), '');
  const output = path.join(dir, 'out');

  const result = run(
    'prepare.js',
    {
      GITHUB_OUTPUT: output,
      INPUT_VERSION: '1.2.3',
      INPUT_ARCHIVE_FILE: 'mod.zip',
      INPUT_NEXUS_API_KEY: 'key',
      INPUT_NEXUS_FILE_ID: '42',
      INPUT_NEXUS_CATEGORY: 'Main',
      INPUT_THUNDERSTORE_TOKEN: 'tok',
    },
    dir
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readOutputs(output), {
    nexus: 'true',
    'nexus-category': 'main',
    thunderstore: 'true',
    'thunderstore-build': 'false',
    'dry-run': 'false',
    'comment-body': 'Uploaded version 1.2.3 to Nexus Mods and Thunderstore.',
  });
});

test('prepare.js dry run: no commit comment', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'mod.zip'), '');
  const output = path.join(dir, 'out');
  const result = run(
    'prepare.js',
    {
      GITHUB_OUTPUT: output,
      INPUT_VERSION: '1.2.3',
      INPUT_ARCHIVE_FILE: 'mod.zip',
      INPUT_NEXUS_API_KEY: 'key',
      INPUT_NEXUS_FILE_ID: '42',
      INPUT_DRY_RUN: 'TRUE',
    },
    dir
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const outputs = readOutputs(output);
  assert.equal(outputs['dry-run'], 'true');
  assert.equal(outputs['comment-body'], '');
});

test('prepare.js fails with an annotation on bad input', (t) => {
  const dir = tempDir(t);
  const result = run('prepare.js', { INPUT_VERSION: '1.0.0' }, dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::Nothing to upload/m);
});

function stubTcli(dir, exitCode = 0) {
  const log = path.join(dir, 'tcli-call.json');
  const stub = path.join(dir, 'tcli-stub.js');
  fs.writeFileSync(
    stub,
    `#!${process.execPath}
require('fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify({
  args: process.argv.slice(2),
  token: process.env.TCLI_AUTH_TOKEN,
}));
process.exit(${exitCode});
`
  );
  fs.chmodSync(stub, 0o755);
  return { stub, read: () => JSON.parse(fs.readFileSync(log, 'utf8')) };
}

test('thunderstore.js passes the token by env, not argv', { skip: process.platform === 'win32' }, (t) => {
  const dir = tempDir(t);
  const tcli = stubTcli(dir);

  const result = run(
    'thunderstore.js',
    {
      TCLI_BIN: tcli.stub,
      TCLI_AUTH_TOKEN: 'secret-token',
      INPUT_VERSION: '1.2.3',
      INPUT_ARCHIVE_FILE: 'mod.zip',
      INPUT_THUNDERSTORE_CONFIG: 'cfg/thunderstore.toml',
    },
    dir
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const call = tcli.read();
  assert.deepEqual(call.args, ['publish', '--config-path', 'cfg/thunderstore.toml', '--file', 'mod.zip']);
  assert.equal(call.token, 'secret-token');
  assert.ok(!result.stdout.includes('secret-token'));
});

test('thunderstore.js build mode sets the package version', { skip: process.platform === 'win32' }, (t) => {
  const dir = tempDir(t);
  const tcli = stubTcli(dir);

  const result = run(
    'thunderstore.js',
    { TCLI_BIN: tcli.stub, INPUT_VERSION: '2.0.0', INPUT_THUNDERSTORE_BUILD: 'true' },
    dir
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(tcli.read().args, [
    'publish',
    '--config-path',
    'thunderstore.toml',
    '--package-version',
    '2.0.0',
  ]);
});

test('thunderstore.js fails when tcli fails', { skip: process.platform === 'win32' }, (t) => {
  const dir = tempDir(t);
  const tcli = stubTcli(dir, 3);
  const result = run(
    'thunderstore.js',
    { TCLI_BIN: tcli.stub, INPUT_VERSION: '1.0.0', INPUT_ARCHIVE_FILE: 'mod.zip' },
    dir
  );
  assert.equal(result.status, 3);
  assert.match(result.stdout, /::error::tcli publish failed with exit code 3/);
});

test('thunderstore.js fails when tcli is missing', (t) => {
  const dir = tempDir(t);
  const result = run(
    'thunderstore.js',
    { TCLI_BIN: path.join(dir, 'nope'), INPUT_VERSION: '1.0.0', INPUT_ARCHIVE_FILE: 'mod.zip' },
    dir
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /::error::Could not run tcli/);
});
