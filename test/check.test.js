'use strict';

// Runs check.js (the dry-run checks) as a separate process against a local
// HTTP server that stands in for the Nexus Mods and Thunderstore APIs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const zip = require('../src/zip');

const CHECK = path.join(__dirname, '..', 'src', 'check.js');

// --- helpers -----------------------------------------------------------------

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

/** Writes a zip from { name: content }; deflates entries unless `store`. */
function makeZip(files, { store = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const packed = store ? data : zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-mod-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Starts a fake API. `routes` maps "METHOD /path" to (req, body) => [status, json]. */
async function fakeApi(t, routes) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const key = `${req.method} ${req.url}`;
      calls.push({ key, headers: req.headers, body });
      const handler = Object.hasOwn(routes, key) ? routes[key] : null;
      const [status, json] = handler ? handler(req, body) : [404, { detail: 'Not found.' }];
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, calls };
}

function run(args, env, cwd) {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('INPUT_') && !k.startsWith('TCLI_'))
  );
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHECK, ...args], { cwd, env: { ...clean, ...env } });
    let stdout = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stdout += c));
    child.on('close', (status) => resolve({ status, stdout }));
  });
}

const MANIFEST = JSON.stringify({
  name: 'QuickPing',
  version_number: '1.2.3',
  website_url: '',
  description: 'test',
  dependencies: [],
});

const PACKAGE = { 'manifest.json': MANIFEST, 'icon.png': 'png', 'README.md': '# hi', 'plugins/a.dll': 'x' };

// --- zip ---------------------------------------------------------------------

test('zip reads stored and deflated entries', () => {
  for (const store of [true, false]) {
    const buf = makeZip({ 'a.txt': 'hello', 'dir/b.txt': 'world' }, { store });
    assert.deepEqual(zip.listEntries(buf), ['a.txt', 'dir/b.txt']);
    assert.equal(zip.readEntry(buf, 'dir/b.txt').toString(), 'world');
    assert.equal(zip.readEntry(buf, 'missing'), null);
  }
});

test('zip rejects non-zip data', () => {
  assert.throws(() => zip.listEntries(Buffer.from('not a zip at all, definitely not')), /Not a zip/);
});

// --- nexus -------------------------------------------------------------------

function nexusEnv(api, extra = {}) {
  return {
    NEXUSMODS_API_V1_BASE: `${api.url}/v1`,
    NEXUSMODS_API_BASE: `${api.url}/v3`,
    INPUT_NEXUS_API_KEY: 'good-key',
    INPUT_NEXUS_FILE_ID: '42',
    ...extra,
  };
}

const nexusOk = {
  'GET /v1/users/validate.json': (req) =>
    req.headers.apikey === 'good-key'
      ? [200, { user_id: 7, name: 'Atopy' }]
      : [401, { message: 'Please provide a valid API Key' }],
  'GET /v3/mod-files/42': () => [200, { data: { id: '42', name: 'QuickPing', versions_count: 3 } }],
  'GET /v3/mods/99/files': () => [200, { data: [{ id: '41' }, { id: '42' }] }],
};

test('nexus check passes with a valid key and file', async (t) => {
  const api = await fakeApi(t, nexusOk);
  const r = await run(['nexus'], nexusEnv(api), tempDir(t));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /valid for user "Atopy"/);
  assert.match(r.stdout, /file 42 "QuickPing" found/);
  assert.equal(api.calls.find((c) => c.key.startsWith('GET /v3')).headers.apikey, 'good-key');
  assert.ok(!r.stdout.includes('good-key'));
  assert.ok(api.calls.every((c) => c.key.startsWith('GET ')), 'dry run must only read');
});

test('nexus check fails on a bad key', async (t) => {
  const api = await fakeApi(t, nexusOk);
  const r = await run(['nexus'], nexusEnv(api, { INPUT_NEXUS_API_KEY: 'bad' }), tempDir(t));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::Nexus Mods rejected the API key \(401\)/);
});

test('nexus check fails on an unknown file id', async (t) => {
  const api = await fakeApi(t, nexusOk);
  const r = await run(['nexus'], nexusEnv(api, { INPUT_NEXUS_FILE_ID: '5' }), tempDir(t));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::Nexus Mods file 5 was not found/);
});

test('nexus check verifies the file belongs to the mod', async (t) => {
  const api = await fakeApi(t, nexusOk);
  const ok = await run(['nexus'], nexusEnv(api, { INPUT_NEXUS_MOD_ID: '99' }), tempDir(t));
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /belongs to mod 99/);

  const api2 = await fakeApi(t, {
    ...nexusOk,
    'GET /v3/mods/99/files': () => [200, { data: [{ id: '41' }] }],
  });
  const bad = await run(['nexus'], nexusEnv(api2, { INPUT_NEXUS_MOD_ID: '99' }), tempDir(t));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /does not belong to mod 99/);
});

// --- thunderstore ------------------------------------------------------------

const VALIDATE = 'POST /api/experimental/submission/validate/manifest-v1/';

function thunderstoreSetup(t, files = PACKAGE) {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'mod.zip'), makeZip(files));
  fs.writeFileSync(
    path.join(dir, 'thunderstore.toml'),
    '[config]\nschemaVersion = "0.0.1"\n\n[package]\nnamespace = "Atopy" # team\nname = "QuickPing"\n'
  );
  return dir;
}

function thunderstoreEnv(api, extra = {}) {
  return {
    INPUT_THUNDERSTORE_REPOSITORY: api.url,
    TCLI_AUTH_TOKEN: 'tss_good',
    INPUT_VERSION: '1.2.3',
    INPUT_ARCHIVE_FILE: 'mod.zip',
    ...extra,
  };
}

const thunderstoreOk = {
  [VALIDATE]: (req, body) => {
    if (req.headers.authorization !== 'Bearer tss_good') {
      return [401, { detail: 'Invalid Service Account token' }];
    }
    const { namespace } = JSON.parse(body);
    if (namespace !== 'Atopy') return [400, { namespace: ['Object not found.'] }];
    return [200, { success: true }];
  },
};

test('thunderstore check validates the manifest with the token', async (t) => {
  const dir = thunderstoreSetup(t);
  const api = await fakeApi(t, thunderstoreOk);
  const r = await run(['thunderstore'], thunderstoreEnv(api), dir);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /token is valid, can upload to team "Atopy"/);
  const sent = JSON.parse(api.calls[0].body);
  assert.equal(sent.namespace, 'Atopy');
  assert.equal(Buffer.from(sent.manifest_data, 'base64').toString(), MANIFEST);
  assert.ok(!r.stdout.includes('tss_good'));
});

test('thunderstore check fails on a bad token', async (t) => {
  const dir = thunderstoreSetup(t);
  const api = await fakeApi(t, thunderstoreOk);
  const r = await run(['thunderstore'], thunderstoreEnv(api, { TCLI_AUTH_TOKEN: 'tss_bad' }), dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::.*rejected the token \(401\): Invalid Service Account token/);
});

test('thunderstore check reports manifest errors', async (t) => {
  const dir = thunderstoreSetup(t);
  const api = await fakeApi(t, {
    [VALIDATE]: () => [400, { non_field_errors: ['manifest.json: Package of the same version already exists'] }],
  });
  const r = await run(['thunderstore'], thunderstoreEnv(api), dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /rejected the package for team "Atopy": manifest.json: Package of the same version/);
});

test('thunderstore check catches a nested package folder', async (t) => {
  const dir = thunderstoreSetup(t, { 'QuickPing/manifest.json': MANIFEST, 'QuickPing/icon.png': '' });
  const api = await fakeApi(t, thunderstoreOk);
  const r = await run(['thunderstore'], thunderstoreEnv(api), dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no manifest.json at its root \(found QuickPing\/manifest.json/);
  assert.equal(api.calls.length, 0);
});

test('thunderstore check requires icon and readme', async (t) => {
  const dir = thunderstoreSetup(t, { 'manifest.json': MANIFEST, 'icon.png': '' });
  const api = await fakeApi(t, thunderstoreOk);
  const r = await run(['thunderstore'], thunderstoreEnv(api), dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no README.md at its root/);
});

test('thunderstore check warns when the manifest version differs', async (t) => {
  const dir = thunderstoreSetup(t);
  const api = await fakeApi(t, thunderstoreOk);
  const r = await run(['thunderstore'], thunderstoreEnv(api, { INPUT_VERSION: '2.0.0' }), dir);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /::warning::manifest.json says version 1.2.3 but the version input is 2.0.0/);
});

test('thunderstore check builds with tcli in build mode', { skip: process.platform === 'win32' }, async (t) => {
  const dir = thunderstoreSetup(t);
  const built = path.join(dir, 'build', 'Atopy-QuickPing-1.2.3.zip');
  const log = path.join(dir, 'tcli-args.json');
  const stub = path.join(dir, 'tcli-stub.js');
  fs.writeFileSync(
    stub,
    `#!${process.execPath}
const fs = require('fs');
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));
fs.mkdirSync(${JSON.stringify(path.dirname(built))}, { recursive: true });
fs.copyFileSync(${JSON.stringify(path.join(dir, 'mod.zip'))}, ${JSON.stringify(built)});
console.log('Building package\\nOutput path \\x1b[36m${built}\\x1b[0m\\nDone!');
`
  );
  fs.chmodSync(stub, 0o755);
  const api = await fakeApi(t, thunderstoreOk);
  const r = await run(
    ['thunderstore'],
    thunderstoreEnv(api, { TCLI_BIN: stub, INPUT_THUNDERSTORE_BUILD: 'true', INPUT_ARCHIVE_FILE: '' }),
    dir
  );
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(log, 'utf8')), [
    'build',
    '--config-path',
    'thunderstore.toml',
    '--package-version',
    '1.2.3',
  ]);
  assert.equal(api.calls.length, 1);
});

test('unknown platform fails', async (t) => {
  const r = await run(['steam'], {}, tempDir(t));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Unknown platform/);
});

test('inherited object properties are not platforms', async (t) => {
  for (const name of ['constructor', 'toString', '__proto__']) {
    const r = await run([name], {}, tempDir(t));
    assert.equal(r.status, 1, name);
    assert.match(r.stdout, /Unknown platform/);
  }
});
