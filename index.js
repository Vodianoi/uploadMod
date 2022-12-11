const core = require('@actions/core');
const exec = require('@actions/exec').exec;
const github = require('@actions/github');


// Install OdinPlus Mod Uploader
exec('dotnet tool install -g Digitalroot.OdinPlusModUploader')
  .then(() => exec('wget https://github.com/thunderstore-io/thunderstore-cli/releases/download/0.1.7/tcli-0.1.7-linux-x64.tar.gz'))
  .then(() => exec('tar -xf tcli-0.1.7-linux-x64.tar.gz'))
  .then(() => exec('mv ./tcli-0.1.7-linux-x64/tcli tcli'));


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
const thunderstore_token = core.getInput('THUNDERSTORE_TOKEN');
const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');

// Upload mod to NexusMods
// Replace <mod-id>, <archive-file>, <file-name>, <version>, <category>, and <description> with the appropriate values
// The <game> parameter is optional and defaults to 'valheim'
const nexusUploadCommand = `opmu nexusmods upload ${modId} ${archiveFile} -f ${fileName} -v ${version} -t ${category} -d ${description} -g ${game} -dmfu -ddwm -dvu -dmv -drpu`;
exec(nexusUploadCommand);



// Upload mod to Thunderstore
// Replace <mod-id>, <archive-file>, and <file-name> with the appropriate values
// The <version> and <description> parameters are optional

if(tomlConfigPath != null)
{
  const thunderstoreUploadCommand = `./tcli publish --config-path ${tomlConfigPath} --token ${thunderstore_token}`;
  exec(thunderstoreUploadCommand);
}
else
{  
  const thunderstoreInitCommand = `./tcli init --package-name ${fileName} --package-namespace ${namespace} --package-version ${version}`;
  exec(thunderstoreInitCommand);
  const thunderstoreUploadCommand = `./tcli publish --token ${thunderstore_token}`;
  exec(thunderstoreUploadCommand);
}

// Upload mod to ModVault
// Replace <mod-id>, <archive-file>, and <file-name> with the appropriate values
// The <version> and <description> parameters are optional
// const modvaultUploadCommand = `opmu modvault upload ${modId} ${archiveFile} -f ${fileName} -v ${version} -d ${description}`;
// core.exec(modvaultUploadCommand);

// Create a new comment on the commit with the upload result
const octokit = github.getOctokit(GITHUB_TOKEN);
const { owner, repo } = github.context.repo;
const { sha } = github.context.payload.head_commit;
const comment = `Successfully uploaded mod to NexusMods and Thunderstore: ${modId}`;
octokit.rest.repos.createCommitComment({ owner, repo, sha, body: comment });
