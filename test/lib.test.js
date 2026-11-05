'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  InputError,
  parseBool,
  normalizeNexusCategory,
  resolvePlan,
  tcliPublishArgs,
  tomlPackageNamespace,
  commitCommentBody,
} = require('../src/lib');

const allExist = () => true;
const noneExist = () => false;

const nexusInputs = {
  version: '1.2.3',
  'archive-file': 'mod.zip',
  'nexus-api-key': 'key',
  'nexus-file-id': '42',
};

const thunderstoreInputs = {
  version: '1.2.3',
  'archive-file': 'mod.zip',
  'thunderstore-token': 'tok',
};

test('parseBool', async (t) => {
  await t.test('accepts true/false in any case and empty', () => {
    assert.equal(parseBool('true', 'x'), true);
    assert.equal(parseBool('TRUE', 'x'), true);
    assert.equal(parseBool('false', 'x'), false);
    assert.equal(parseBool('', 'x'), false);
    assert.equal(parseBool(undefined, 'x'), false);
  });
  await t.test('rejects anything else', () => {
    assert.throws(() => parseBool('yes', 'x'), InputError);
  });
});

test('normalizeNexusCategory', async (t) => {
  await t.test('defaults to main', () => {
    assert.equal(normalizeNexusCategory(''), 'main');
    assert.equal(normalizeNexusCategory(undefined), 'main');
  });
  await t.test('lowercases old capitalized names', () => {
    assert.equal(normalizeNexusCategory('Main'), 'main');
    assert.equal(normalizeNexusCategory('Optional'), 'optional');
    assert.equal(normalizeNexusCategory('Misc'), 'miscellaneous');
  });
  await t.test('rejects categories the API does not accept', () => {
    assert.throws(() => normalizeNexusCategory('Updates'), /must be one of/);
    assert.throws(() => normalizeNexusCategory('Old'), InputError);
  });
});

test('resolvePlan', async (t) => {
  await t.test('requires a version', () => {
    assert.throws(() => resolvePlan({ ...nexusInputs, version: ' ' }, allExist), /version/);
  });

  await t.test('requires at least one platform', () => {
    assert.throws(
      () => resolvePlan({ version: '1.0.0', 'archive-file': 'mod.zip' }, allExist),
      /Nothing to upload/
    );
  });

  await t.test('Nexus only', () => {
    const plan = resolvePlan({ ...nexusInputs, 'nexus-category': 'Main' }, allExist);
    assert.equal(plan.nexus, true);
    assert.equal(plan.thunderstore, false);
    assert.equal(plan.nexusCategory, 'main');
  });

  await t.test('Nexus accepts versions Thunderstore would reject', () => {
    const plan = resolvePlan({ ...nexusInputs, version: 'v1.0-beta' }, allExist);
    assert.equal(plan.version, 'v1.0-beta');
  });

  await t.test('Nexus needs a numeric file id', () => {
    assert.throws(
      () => resolvePlan({ ...nexusInputs, 'nexus-file-id': '' }, allExist),
      /nexus-file-id/
    );
    assert.throws(
      () => resolvePlan({ ...nexusInputs, 'nexus-file-id': 'abc' }, allExist),
      /nexus-file-id/
    );
  });

  await t.test('Nexus changelog needs a mod id', () => {
    const inputs = { ...nexusInputs, 'nexus-changelog': 'Fixed things' };
    assert.throws(() => resolvePlan(inputs, allExist), /nexus-mod-id/);
    assert.doesNotThrow(() => resolvePlan({ ...inputs, 'nexus-mod-id': '7' }, allExist));
  });

  await t.test('archive file must be set and exist', () => {
    assert.throws(
      () => resolvePlan({ ...nexusInputs, 'archive-file': '' }, allExist),
      /archive-file/
    );
    assert.throws(() => resolvePlan(nexusInputs, noneExist), /Archive file not found/);
  });

  await t.test('Thunderstore defaults the config path', () => {
    const plan = resolvePlan(thunderstoreInputs, allExist);
    assert.equal(plan.thunderstore, true);
    assert.equal(plan.nexus, false);
    assert.equal(plan.thunderstoreConfig, 'thunderstore.toml');
  });

  await t.test('Thunderstore needs Major.Minor.Patch', () => {
    for (const version of ['1.0', 'v1.0.0', '1.0.0-beta']) {
      assert.throws(
        () => resolvePlan({ ...thunderstoreInputs, version }, allExist),
        /version like 1.2.3/,
        version
      );
    }
  });

  await t.test('Thunderstore config must exist', () => {
    const exists = (p) => p === 'mod.zip';
    assert.throws(() => resolvePlan(thunderstoreInputs, exists), /config not found/);
  });

  await t.test('Thunderstore build mode does not need an archive', () => {
    const inputs = {
      version: '1.2.3',
      'thunderstore-token': 'tok',
      'thunderstore-build': 'true',
      'thunderstore-config': 'pkg/thunderstore.toml',
    };
    const plan = resolvePlan(inputs, (p) => p === 'pkg/thunderstore.toml');
    assert.equal(plan.thunderstoreBuild, true);
    assert.equal(plan.thunderstoreConfig, 'pkg/thunderstore.toml');
  });

  await t.test('both platforms', () => {
    const plan = resolvePlan({ ...nexusInputs, ...thunderstoreInputs }, allExist);
    assert.equal(plan.nexus, true);
    assert.equal(plan.thunderstore, true);
    assert.equal(plan.dryRun, false);
  });

  await t.test('dry run', () => {
    assert.equal(resolvePlan({ ...nexusInputs, 'dry-run': 'true' }, allExist).dryRun, true);
    assert.throws(() => resolvePlan({ ...nexusInputs, 'dry-run': 'yes' }, allExist), /dry-run/);
  });

  await t.test('dry run still checks the inputs', () => {
    assert.throws(
      () => resolvePlan({ ...nexusInputs, 'nexus-file-id': '', 'dry-run': 'true' }, allExist),
      /nexus-file-id/
    );
  });
});

test('tomlPackageNamespace', async (t) => {
  await t.test('reads the [package] namespace', () => {
    const toml = '[config]\nnamespace = "nope"\n\n[package]\nname = "Mod"\nnamespace = "Atopy" # team\n';
    assert.equal(tomlPackageNamespace(toml), 'Atopy');
  });
  await t.test('accepts single quotes and CRLF', () => {
    assert.equal(tomlPackageNamespace("[package]\r\nnamespace = 'Team'\r\n"), 'Team');
  });
  await t.test('ignores other tables', () => {
    assert.equal(tomlPackageNamespace('[package.dependencies]\nnamespace = "x"\n'), '');
    assert.equal(tomlPackageNamespace(''), '');
  });
});

test('tcliPublishArgs', async (t) => {
  await t.test('publishes an existing archive', () => {
    assert.deepEqual(
      tcliPublishArgs({ archiveFile: 'mod.zip', version: '1.2.3', config: 'ts.toml', build: false }),
      ['publish', '--config-path', 'ts.toml', '--file', 'mod.zip']
    );
  });

  await t.test('build mode overrides the version instead of passing --file', () => {
    const args = tcliPublishArgs({
      archiveFile: 'mod.zip',
      version: '1.2.3',
      config: 'ts.toml',
      build: true,
    });
    assert.deepEqual(args, ['publish', '--config-path', 'ts.toml', '--package-version', '1.2.3']);
    assert.ok(!args.includes('--file'));
  });

  await t.test('adds a custom repository', () => {
    const args = tcliPublishArgs({
      archiveFile: 'mod.zip',
      version: '1.2.3',
      config: 'ts.toml',
      build: false,
      repository: 'https://thunderstore.dev',
    });
    assert.deepEqual(args.slice(-2), ['--repository', 'https://thunderstore.dev']);
  });

  await t.test('never includes the token', () => {
    const args = tcliPublishArgs({ archiveFile: 'a', version: '1.0.0', config: 'c', build: false });
    assert.ok(!args.includes('--token'));
  });
});

test('commitCommentBody names only the platforms used', () => {
  assert.equal(
    commitCommentBody({ version: '1.0.0', nexus: true, thunderstore: true }),
    'Uploaded version 1.0.0 to Nexus Mods and Thunderstore.'
  );
  assert.equal(
    commitCommentBody({ version: '1.0.0', nexus: false, thunderstore: true }),
    'Uploaded version 1.0.0 to Thunderstore.'
  );
  assert.equal(commitCommentBody({ version: '1.0.0', nexus: false, thunderstore: false }), '');
});
