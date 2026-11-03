'use strict';

// Publishes to Thunderstore with tcli. The token is passed through the
// TCLI_AUTH_TOKEN environment variable so it never appears in the command line.

const { spawnSync } = require('node:child_process');
const { parseBool, tcliPublishArgs } = require('./lib');

function main(env = process.env) {
  const tcli = env.TCLI_BIN || 'tcli';
  const args = tcliPublishArgs({
    archiveFile: env.INPUT_ARCHIVE_FILE,
    version: env.INPUT_VERSION,
    config: env.INPUT_THUNDERSTORE_CONFIG || 'thunderstore.toml',
    build: parseBool(env.INPUT_THUNDERSTORE_BUILD, 'thunderstore-build'),
    repository: env.INPUT_THUNDERSTORE_REPOSITORY,
  });

  console.log(`Running: ${tcli} ${args.join(' ')}`);
  const result = spawnSync(tcli, args, { stdio: 'inherit', env });
  if (result.error) {
    console.log(`::error::Could not run tcli: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    console.log(`::error::tcli publish failed with exit code ${result.status}`);
    return result.status || 1;
  }
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { main };
