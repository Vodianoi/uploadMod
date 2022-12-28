# ___WORK IN PROGRESS___
Does not currently work, will be working on Release 1.0.0 !


# Upload mod to NexusMods and Thunderstore

This GitHub Action allows you to automate the process of uploading and publishing a mod to NexusMods and Thunderstore.

## Prerequisites

Before using this action, you will need to have the following:

- A mod file that you want to upload.
- An account on [NexusMods](https://www.nexusmods.com/) and [Thunderstore](https://www.thunderstore.io/).
- An API key and session cookies for your NexusMods account (you can find instructions on how to obtain these [here](https://github.com/Digitalroot-Valheim/Digitalroot.OdinPlusModUploader/)).
- A token for your Thunderstore account.

## Inputs

| Input                    | Description                                                                                                                                      | Required | Default |
|--------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|----------|---------|
| `mod-id`                 | The mod ID on NexusMods.                                                                                                                        | Yes      |         |
| `archive-file`           | The file to upload.                                                                                                                             | Yes      |         |
| `file-name`              | The name of the file on NexusMods and Thunderstore.                                                                                              | Yes      |         |
| `version`                | The version of the uploaded file.                                                                                                              | Yes      |         |
| `category`               | The mod file category on NexusMods.                                                                                                             | No       | `Main`  |
| `description`            | A description of the mod.                                                                                                                        | No       |         |
| `game`                   | The game the mod is for.                                                                                                                        | Yes      |         |
| `namespace`              | The namespace of the mod on Thunderstore.                                                                                                        | No       |         |
| `tomlConfigPath`         | The path to the TOML configuration file for Thunderstore.                                                                                         | No       |         |
| `NEXUSMOD_API_KEY`       | The API key for your NexusMods account.                                                                                                          | Yes      |         |
| `NEXUSMOD_COOKIE_NEXUSID`| The session cookie for your NexusMods account.                                                                                                     | Yes      |         |
| `NEXUSMOD_COOKIE_SID_DEVELOP` | The session cookie for your NexusMods account.                                                                                                    | Yes      |         |
| `THUNDERSTORE_TOKEN`     | The token for your Thunderstore account.                                                                                                          | Yes      |         |
| `GITHUB_TOKEN`           | The token for your Thunderstore account.                                                                                                          | Yes      |         |

## Outputs

This action does not have any outputs.

## Example usage

To use this action, you will need to create a workflow file in your repository. Here is an example workflow file that demonstrates how to use this action:

```
name: Upload mod
on:
  push:
    branches: [ master ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: Upload mod to NexusMods and Thunderstore
      uses: ./
      with:
        mod-id: '123456'
        archive-file: 'mod.zip'
        file-name: 'My Mod'
        version: '1.0.0'
        category: 'Main'
        description: 'This is a description of my mod.'
        game: 'Rimworld'
        namespace: 'my-namespace'
        tomlConfigPath: './thunderstore.toml'
        NEXUSMOD_API_KEY: ${{ secrets.NEXUSMOD_API_KEY }}
        NEXUSMOD_COOKIE_NEXUSID: ${{ secrets.NEXUSMOD_COOKIE_NEXUSID }}
        NEXUSMOD_COOKIE_SID_DEVELOP: ${{ secrets.NEXUSMOD_COOKIE_SID_DEVELOP }}
        THUNDERSTORE_TOKEN: ${{ secrets.THUNDERSTORE_TOKEN }}
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

```

## Credits

This action is built using the following open-source tools:

- [Digitalroot.OdinPlusModUploader](https://github.com/Digitalroot-Valheim/Digitalroot.OdinPlusModUploader/)
- [thunderstore-cli](https://github.com/thunderstore-io/thunderstore-cli)
