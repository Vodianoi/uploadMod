const core = require('@actions/core');
const exec = require('@actions/exec').exec;
const github = require('@actions/github');


// Install OdinPlus Mod Uploader
async function run(){
  try{
    await exec('dotnet tool install -g Digitalroot.OdinPlusModUploader')
    .then(() => exec('wget https://github.com/thunderstore-io/thunderstore-cli/releases/download/0.1.7/tcli-0.1.7-linux-x64.tar.gz'))
    .then(() => exec('tar -xf tcli-0.1.7-linux-x64.tar.gz'))
    .then(() => exec('mv ./tcli-0.1.7-linux-x64/tcli tcli'))
    .catch((error) => core.setFailed(error));


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
    await exec('opmu', ['nexusmods', 'check', `-k`, `${apiKey}`, `-cnxid`, `${cookieNexusId}`, `-csid`, `${cookieSidDevelop}`])
          .catch((error) => core.setFailed(error));

    await exec('opmu', ['nexusmods', 'upload', `${modId}`, `${archiveFile}`, 
                      `-f`, `${fileName}-${version}`,
                       `-v`, `${version}`,
                       `-g`, `${game}`,
                        `-t`, `${category}`,
                        `-d`, `"${description}"`,
                        `-k`, `${apiKey}`,
                        `-cnxid`, `${cookieNexusId}`,
                        `-csid`, `${cookieSidDevelop}`
                        ])
                        .catch((error) => core.setFailed(error));
                      
  

    // Upload mod to Thunderstore
    // Replace <mod-id>, <archive-file>, and <file-name> with the appropriate values
    // The <version> and <description> parameters are optional

    //If archiveFile is not null, then publish the mod using the archiveFile
    if(archiveFile != null)
    {
      await exec('./tcli', ['init', `--package-name`, `${fileName}`, `--package-namespace`, `${namespace}`, `--package-version`, `${version}`]).catch((error) => core.setFailed(error));
      await exec('./tcli', ['publish', `--token`, `${thunderstore_token}`, `--file`, `${archiveFile}`]).catch((error) => core.setFailed(error));
    }
    else 
    if(tomlConfigPath != null)
    {
      const fs = require('fs');


      //Copy tcli to the directory of tomlConfigPath file
      const tomlConfigPathDir = tomlConfigPath.substring(0, tomlConfigPath.lastIndexOf("/"));
      await exec('cp tcli', `${tomlConfigPathDir}`)
      .catch((error) => core.setFailed(error));

      //cd to the directory of tomlConfigPath file
      await exec('cd', `${tomlConfigPathDir}`)
      .catch((error) => core.setFailed(error));

      //rename tomlConfigPath file to thunderstore.toml
      await exec('mv', `${tomlConfigPath}`, 'thunderstore.toml')
      .catch((error) => core.setFailed(error));
      

      //Edit thunderstore.toml file to change the version for the current version using @iarna/toml
      const toml = require('@iarna/toml');
      const thunderstoreToml = fs.readFileSync('thunderstore.toml', 'utf8');
      const thunderstoreTomlObj = toml.parse(thunderstoreToml);
      thunderstoreTomlObj.package.versionNumber = version;
      const thunderstoreTomlString = toml.stringify(thunderstoreTomlObj);
      fs.writeFileSync('thunderstore.toml', thunderstoreTomlString, 'utf8');


      await exec('./tcli', ['publish', `--token`, `${thunderstore_token}`])
      .catch((error) => core.setFailed(error));
    
    }
    else
    {  
      await exec('./tcli', ['init', `--package-name`, `${fileName}`, `--package-namespace`, `${namespace}`, `--package-version`, `${version}`]).catch((error) => core.setFailed(error));
      exec('./tcli', ['publish', `--token`, `${thunderstore_token}`]).catch((error) => core.setFailed(error));
    
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

    await octokit.rest.repos.createCommitComment({ owner, repo, sha, body: comment })
          .catch((error) => core.setFailed(error))

  } catch (error){
    core.setFailed(error);
  }
}

run();
