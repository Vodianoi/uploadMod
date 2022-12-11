 # __Upload mod to NexusMods and Thunderstore__
 
 A GitHub Action to upload a mod to NexusMods and Thunderstore. This Action allows you to automate the process of uploading your mod to these popular modding platforms, making it easier to share your work with the community.
 
 ## __Usage__
 
 To use this Action, create a new workflow in your repository and add the following code to the `.yml` file:
 
 ```yaml
 on: [push]
 
 jobs:
   build:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v2
       - uses: Vodianoi/uploadMod@v1
         with:
           mod-id: 'your-mod-id'
           archive-file: 'your-mod-file.zip'
           file-name: 'your-mod-file-name'
           version: '1.0.0'
           category: 'Main'
           description: 'Your mod description'
           game: 'valheim'
           namespace: 'your-namespace'
           tomlConfigPath: './thunderstore.toml'
         secrets:
           NEXUSMOD_API_KEY: ${{ secrets.NEXUSMOD_API_KEY }}
           NEXUSMOD_COOKIE_NEXUSID: ${{ secrets.NEXUSMOD_COOKIE_NEXUSID }}
           NEXUSMOD_COOKIE_SID_DEVELOP: ${{ secrets.NEXUSMOD_COOKIE_SID_DEVELOP }}
           THUNDERSTORE_TOKEN: ${{ secrets.THUNDERSTORE_TOKEN }}` 
 ```
 Replace the placeholder values in the `with` section with the appropriate values for your mod. Make sure to set the secrets in your repository settings as well.
 
## __Inputs__

| Name | Description | Type | Required | Default |
| ---- | ----------- | ---- | -------- | ------- |
| `mod-id` | The mod ID on NexusMods, Thunderstore, and ModVault. | `string` | `true` | N/A |
| `archive-file` | The file to upload. | `string` | `true` | N/A |
| `file-name` | The name of the file on NexusMods, Thunderstore, and ModVault. | `string` | `true` | N/A |
| `version` | The version of the uploaded file. | `string` | `true` | N/A |
| `category` | The mod file category on NexusMods. | `string` | `true` | `Main` |
| `description` | A description of the mod. | `string` | `false` | N/A |
| `game` | The game the mod is for. | `string` | `true` | N/A |
| `namespace` | The namespace of the mod on Thunderstore. | `string` | `false` | N/A |
| `tomlConfigPath` | The path to the toml configuration file for Thunderstore. | `string` | `false` | N/A |
 
 ## __Limitations__
 
 The Action also requires that you have the `dotnet` tool installed on the system where it is running. This is because the Action uses the `Digitalroot.OdinPlusModUploader` tool to upload the mod to NexusMods.
 
 ## __License__
 
 This Action is released under the MIT license. See [LICENSE](https://chat.openai.com/LICENSE) for more information.

 
