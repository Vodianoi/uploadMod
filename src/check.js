'use strict';

// Dry-run checks: verify credentials and package contents against the real
// APIs using read-only or validate-only endpoints. Nothing is uploaded.
//
//   node check.js nexus         API key + file ID
//   node check.js thunderstore  token + team permission + manifest.json

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseBool, tomlPackageNamespace } = require('./lib');
const zip = require('./zip');

class CheckError extends Error {}

const USER_AGENT = 'Vodianoi/uploadMod (dry-run)';

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...options.headers },
    });
  } catch (error) {
    throw new CheckError(`Could not reach ${new URL(url).host}: ${error.message}`);
  }
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Keep the raw text for error messages.
  }
  return { status: response.status, body, text };
}

function errorDetail(res) {
  const b = res.body;
  if (b && typeof b === 'object') {
    if (Array.isArray(b.non_field_errors)) return b.non_field_errors.join(' ');
    return b.detail || b.message || b.title || JSON.stringify(b);
  }
  return res.text.slice(0, 300);
}

async function checkNexus(env) {
  const key = env.INPUT_NEXUS_API_KEY;
  const fileId = env.INPUT_NEXUS_FILE_ID;
  const v1 = (env.NEXUSMODS_API_V1_BASE || 'https://api.nexusmods.com/v1').replace(/\/$/, '');
  const v3 = (env.NEXUSMODS_API_BASE || 'https://api.nexusmods.com/v3').replace(/\/$/, '');
  const headers = { apikey: key };

  const user = await request(`${v1}/users/validate.json`, { headers });
  if (user.status === 401 || user.status === 403) {
    throw new CheckError(`Nexus Mods rejected the API key (${user.status}): ${errorDetail(user)}`);
  }
  if (user.status !== 200) {
    throw new CheckError(`Nexus Mods key check failed (${user.status}): ${errorDetail(user)}`);
  }
  console.log(`Nexus Mods API key is valid for user "${user.body?.name}" (id ${user.body?.user_id}).`);

  const file = await request(`${v3}/mod-files/${encodeURIComponent(fileId)}`, { headers });
  if (file.status === 404) {
    throw new CheckError(
      `Nexus Mods file ${fileId} was not found. Use the file ID (not the mod ID) from the mod's Files tab.`
    );
  }
  if (file.status !== 200) {
    throw new CheckError(`Nexus Mods file ${fileId} check failed (${file.status}): ${errorDetail(file)}`);
  }
  const data = file.body?.data ?? {};
  console.log(
    `Nexus Mods file ${fileId} "${data.name}" found (${data.versions_count} versions, ` +
      `last upload ${data.last_file_uploaded_at ?? 'never'}).`
  );

  const modId = env.INPUT_NEXUS_MOD_ID;
  if (modId) {
    const files = await request(`${v3}/mods/${encodeURIComponent(modId)}/files`, { headers });
    if (files.status !== 200) {
      throw new CheckError(`Nexus Mods mod ${modId} check failed (${files.status}): ${errorDetail(files)}`);
    }
    const list = Array.isArray(files.body?.data) ? files.body.data : [];
    if (!list.some((f) => String(f.id) === String(fileId))) {
      throw new CheckError(`Nexus Mods file ${fileId} does not belong to mod ${modId}.`);
    }
    console.log(`Nexus Mods file ${fileId} belongs to mod ${modId}.`);
  }

  console.log(
    'Note: Nexus Mods has no validate-only upload endpoint, so upload permission ' +
      'for this file is only confirmed by a real upload.'
  );
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Builds the package with `tcli build` and returns the path of the zip. */
function tcliBuild(env, config) {
  const tcli = env.TCLI_BIN || 'tcli';
  const args = ['build', '--config-path', config, '--package-version', env.INPUT_VERSION];
  console.log(`Running: ${tcli} ${args.join(' ')}`);
  const result = spawnSync(tcli, args, { encoding: 'utf8', env });
  const out = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(out);
  if (result.error) throw new CheckError(`Could not run tcli: ${result.error.message}`);
  if (result.status !== 0) throw new CheckError(`tcli build failed with exit code ${result.status}`);
  const match = stripAnsi(out).match(/Output path (.+?)\s*$/m);
  if (!match) throw new CheckError('Could not find the package path in the tcli build output.');
  return match[1];
}

async function checkThunderstore(env) {
  const config = env.INPUT_THUNDERSTORE_CONFIG || 'thunderstore.toml';
  const build = parseBool(env.INPUT_THUNDERSTORE_BUILD, 'thunderstore-build');
  const base = (env.INPUT_THUNDERSTORE_REPOSITORY || 'https://thunderstore.io').replace(/\/$/, '');
  const token = env.TCLI_AUTH_TOKEN;

  const namespace = tomlPackageNamespace(fs.readFileSync(config, 'utf8'));
  if (!namespace) throw new CheckError(`No [package] namespace found in ${config}.`);

  const packagePath = build ? tcliBuild(env, config) : env.INPUT_ARCHIVE_FILE;
  let archive;
  try {
    archive = fs.readFileSync(packagePath);
  } catch (error) {
    throw new CheckError(`Could not read package ${packagePath}: ${error.message}`);
  }

  let manifest;
  try {
    manifest = zip.readEntry(archive, 'manifest.json');
  } catch (error) {
    throw new CheckError(`${path.basename(packagePath)}: ${error.message}`);
  }
  if (!manifest) {
    const found = zip.listEntries(archive).find((n) => n.endsWith('/manifest.json'));
    throw new CheckError(
      `${path.basename(packagePath)} has no manifest.json at its root` +
        (found ? ` (found ${found}; zip the package folder's contents, not the folder).` : '.')
    );
  }
  for (const required of ['icon.png', 'README.md']) {
    if (!zip.listEntries(archive).includes(required)) {
      throw new CheckError(`${path.basename(packagePath)} has no ${required} at its root.`);
    }
  }

  try {
    const parsed = JSON.parse(manifest.toString('utf8').replace(/^﻿/, ''));
    if (!build && parsed.version_number !== env.INPUT_VERSION) {
      console.log(
        `::warning::manifest.json says version ${parsed.version_number} but the version input is ` +
          `${env.INPUT_VERSION}. Thunderstore publishes the manifest's version.`
      );
    }
  } catch {
    // Thunderstore reports the parse error below.
  }

  const res = await request(`${base}/api/experimental/submission/validate/manifest-v1/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace, manifest_data: manifest.toString('base64') }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new CheckError(`${new URL(base).host} rejected the token (${res.status}): ${errorDetail(res)}`);
  }
  if (res.status !== 200 || res.body?.success !== true) {
    throw new CheckError(`${new URL(base).host} rejected the package for team "${namespace}": ${errorDetail(res)}`);
  }
  console.log(
    `${new URL(base).host}: token is valid, can upload to team "${namespace}", and ` +
      `manifest.json passes validation.`
  );
}

const CHECKS = { nexus: checkNexus, thunderstore: checkThunderstore };

async function main(platform, env = process.env) {
  const check = Object.hasOwn(CHECKS, platform) ? CHECKS[platform] : null;
  if (!check) {
    console.log(`::error::Unknown platform "${platform}".`);
    return 1;
  }
  try {
    await check(env);
  } catch (error) {
    if (!(error instanceof CheckError)) throw error;
    console.log(`::error::${error.message}`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  main(process.argv[2]).then((code) => {
    process.exitCode = code;
  });
}

module.exports = { main, CheckError };
