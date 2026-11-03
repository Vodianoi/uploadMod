'use strict';

const fs = require('node:fs');

// Categories accepted by the Nexus Mods v3 API for new file versions.
const NEXUS_CATEGORIES = ['main', 'optional', 'miscellaneous'];

// Older versions of this action (and the old uploader) used these names.
const NEXUS_CATEGORY_ALIASES = { misc: 'miscellaneous' };

// Thunderstore only accepts Major.Minor.Patch with plain numbers.
const THUNDERSTORE_VERSION = /^\d+\.\d+\.\d+$/;

class InputError extends Error {}

function parseBool(value, name) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '' || v === 'false') return false;
  if (v === 'true') return true;
  throw new InputError(`Input "${name}" must be "true" or "false", got "${value}".`);
}

function normalizeNexusCategory(value) {
  const v = String(value ?? '').trim().toLowerCase() || 'main';
  const category = NEXUS_CATEGORY_ALIASES[v] ?? v;
  if (!NEXUS_CATEGORIES.includes(category)) {
    throw new InputError(
      `Input "nexus-category" must be one of ${NEXUS_CATEGORIES.join(', ')}, got "${value}".`
    );
  }
  return category;
}

/**
 * Checks the action inputs and decides which platforms to upload to.
 * `inputs` uses the action's input names; `exists` is injectable for tests.
 */
function resolvePlan(inputs, exists = fs.existsSync) {
  const get = (name) => String(inputs[name] ?? '').trim();

  const version = get('version');
  if (!version) throw new InputError('Input "version" is required.');

  const archiveFile = get('archive-file');
  const nexus = get('nexus-api-key') !== '';
  const thunderstore = get('thunderstore-token') !== '';
  const thunderstoreBuild = parseBool(inputs['thunderstore-build'], 'thunderstore-build');

  if (!nexus && !thunderstore) {
    throw new InputError(
      'Nothing to upload: set "nexus-api-key" and/or "thunderstore-token".'
    );
  }

  const needsArchive = nexus || (thunderstore && !thunderstoreBuild);
  if (needsArchive) {
    if (!archiveFile) throw new InputError('Input "archive-file" is required.');
    if (!exists(archiveFile)) {
      throw new InputError(`Archive file not found: ${archiveFile}`);
    }
  }

  let nexusCategory = '';
  if (nexus) {
    if (!/^\d+$/.test(get('nexus-file-id'))) {
      throw new InputError(
        'Input "nexus-file-id" is required for Nexus Mods and must be a number.'
      );
    }
    if (get('nexus-changelog') && !/^\d+$/.test(get('nexus-mod-id'))) {
      throw new InputError('Input "nexus-mod-id" is required when "nexus-changelog" is set.');
    }
    nexusCategory = normalizeNexusCategory(inputs['nexus-category']);
  }

  const thunderstoreConfig = get('thunderstore-config') || 'thunderstore.toml';
  if (thunderstore) {
    if (!THUNDERSTORE_VERSION.test(version)) {
      throw new InputError(
        `Thunderstore needs a version like 1.2.3, got "${version}".`
      );
    }
    if (!exists(thunderstoreConfig)) {
      throw new InputError(`Thunderstore config not found: ${thunderstoreConfig}`);
    }
  }

  return {
    version,
    archiveFile,
    nexus,
    nexusCategory,
    thunderstore,
    thunderstoreBuild,
    thunderstoreConfig,
  };
}

/**
 * Arguments for `tcli publish`. tcli treats --file and --package-* as
 * mutually exclusive, so the version override only applies when building.
 */
function tcliPublishArgs({ archiveFile, version, config, build, repository }) {
  const args = ['publish', '--config-path', config];
  if (build) {
    args.push('--package-version', version);
  } else {
    args.push('--file', archiveFile);
  }
  if (repository) args.push('--repository', repository);
  return args;
}

function commitCommentBody({ version, nexus, thunderstore }) {
  const targets = [nexus && 'Nexus Mods', thunderstore && 'Thunderstore'].filter(Boolean);
  if (targets.length === 0) return '';
  return `Uploaded version ${version} to ${targets.join(' and ')}.`;
}

module.exports = {
  InputError,
  NEXUS_CATEGORIES,
  parseBool,
  normalizeNexusCategory,
  resolvePlan,
  tcliPublishArgs,
  commitCommentBody,
};
