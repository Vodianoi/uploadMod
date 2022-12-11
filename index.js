const core = require('@actions/core');
const github = require('@actions/github');

try {
  // Install OdinPlus Mod Uploader
  core.exec('dotnet tool install -g Digitalroot.OdinPlusModUploader');
  core.exec('wget https://github.com/thunderstore-io/thunderstore-cli/releases/download/0.1.7/tcli-0.1.7-linux-x64.tar.gz')
  core.exec('tar -xf tcli-0.1.7-linux-x64.tar.gz')
  core.exec('mv ./tcli-0.1.7-linux-x64/tcli tcli')
  // Get inputs
  const modId = core.getInput('mod-id');
  const archiveFile = core.getInput('archive-file');
  const fileName = core.getInput('file-name');
  const version = core.getInput('version');
  const category = core.getInput('category');
  const description = core.getInput('description');
  const game = core.getInput('game');
  const namespace = core.getInput('namespace');
  const tomlConfigPath = core.getInput('tomlConfigPath');
  // Set environment variables from repository secrets
  const apiKey = core.getInput('NEXUSMOD_API_KEY');
  const cookieNexusId = core.getInput('NEXUSMOD_COOKIE_NEXUSID');
  const cookieSidDevelop = core.getInput('NEXUSMOD_COOKIE_SID_DEVELOP');
  core.exportVariable('NEXUSMOD_API_KEY', apiKey);
  core.exportVariable('NEXUSMOD_COOKIE_NEXUSID', cookieNexusId);
  core.exportVariable('NEXUSMOD_COOKIE_SID_DEVELOP', cookieSidDevelop);

  // Upload mod to NexusMods
  // Replace <mod-id>, <archive-file>, <file-name>, <version>, <category>, and <description> with the appropriate values
  // The <game> parameter is optional and defaults to 'valheim'
  const nexusUploadCommand = `opmu nexusmods upload ${modId} ${archiveFile} -f ${fileName} -v ${version} -t ${category} -d ${description} -g ${game} -dmfu -ddwm -dvu -dmv -drpu`;
  core.exec(nexusUploadCommand);



  // Upload mod to Thunderstore
  // Replace <mod-id>, <archive-file>, and <file-name> with the appropriate values
  // The <version> and <description> parameters are optional

  if(tomlConfigPath != null)
  {
    const thunderstoreUploadCommand = `./tcli publish --config-path ${tomlConfigPath} --token core.getInput('THUNDERSTORE_TOKEN');`;
    core.exec(thunderstoreUploadCommand);
  }
  else
  {  
    const thunderstoreInitCommand = `./tcli init --package-name ${fileName} --package-namespace ${namespace} --package-version ${version}`;
    core.exec(thunderstoreInitCommand);
    const thunderstoreUploadCommand = `./tcli publish --token core.getInput('THUNDERSTORE_TOKEN');`;
    core.exec(thunderstoreUploadCommand);
  }

  // Upload mod to ModVault
  // Replace <mod-id>, <archive-file>, and <file-name> with the appropriate values
  // The <version> and <description> parameters are optional
  // const modvaultUploadCommand = `opmu modvault upload ${modId} ${archiveFile} -f ${fileName} -v ${version} -d ${description}`;
  // core.exec(modvaultUploadCommand);

  // Create a new comment on the commit with the upload result
  const octokit = github.getOctokit(core.getInput('github_token'));
  const { owner, repo } = github.context.repo;
  const { sha } = github.context.payload.head_commit;
  const comment = `Successfully uploaded mod to NexusMods and Thunderstore: ${modId}`;
  octokit.repos.createCommitComment({ owner, repo, sha, body: comment });
} catch (error) {
  core.setFailed(error.message);
}
