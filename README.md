# Upload mod to Nexus Mods and Thunderstore

A GitHub Action that uploads a new version of your mod to [Nexus Mods](https://www.nexusmods.com/) and/or [Thunderstore](https://thunderstore.io/) using each site's official tooling:

- **Nexus Mods** through [`Nexus-Mods/upload-action`](https://github.com/Nexus-Mods/upload-action) (Nexus Mods v3 API, API key only, no browser cookies)
- **Thunderstore** through [`tcli`](https://github.com/thunderstore-io/thunderstore-cli) 0.2.4

Each platform is optional: leave its key/token empty to skip it.

> [!NOTE]
> `Nexus-Mods/upload-action` is still marked beta by Nexus Mods (`v1.0.0-beta.11` is pinned here).

## Requirements

- A runner with Node.js 20+ and the .NET SDK (both come preinstalled on GitHub-hosted runners). On self-hosted runners, add `actions/setup-dotnet` before this action.
- **Nexus Mods:** an [API key](https://www.nexusmods.com/settings/api-keys) and an existing mod page with at least one uploaded file. The action adds a new version to that file, identified by its **file ID** (shown under "Advanced" on the mod's Files tab, or in the Manage Files edit menu).
- **Thunderstore:** a service account token and a `thunderstore.toml` describing the package (namespace, communities, categories). See the [tcli wiki](https://github.com/thunderstore-io/thunderstore-cli/wiki).

## Inputs

| Input | Description | Default |
|---|---|---|
| `version` | **Required.** Version of the upload. Thunderstore requires `Major.Minor.Patch`. | |
| `archive-file` | Zip to upload. Not needed when only publishing to Thunderstore with `thunderstore-build`. | |
| `file-name` | Display name of the file version on Nexus Mods. | zip file name |
| `description` | Description of the file version on Nexus Mods. | |
| `nexus-api-key` | Nexus Mods API key. Empty = skip Nexus Mods. | |
| `nexus-file-id` | ID of the Nexus Mods file to add this version to. | |
| `nexus-category` | `main`, `optional` or `miscellaneous`. | `main` |
| `nexus-mod-id` | Mod ID, only needed with `nexus-changelog`. | |
| `nexus-changelog` | Changelog text for this version. | |
| `nexus-archive-existing-version` | Archive the previous version. | `false` |
| `nexus-update-mod-version` | Set the mod's version to this file's version. | `false` |
| `thunderstore-token` | Thunderstore token. Empty = skip Thunderstore. | |
| `thunderstore-config` | Path to `thunderstore.toml`. | `thunderstore.toml` |
| `thunderstore-build` | `true`: let tcli build the package from the config (with `version` applied) instead of publishing `archive-file`. | `false` |
| `thunderstore-repository` | Thunderstore repository URL. | thunderstore.io |
| `dry-run` | `true`: upload nothing, only check inputs, credentials and the package (see [Testing without uploading](#testing-without-uploading)). | `false` |
| `commit-comment` | Comment on the commit after a successful upload. | `true` |
| `github-token` | Token for the commit comment. | `github.token` |

## Outputs

| Output | Description |
|---|---|
| `nexus-version-id` | ID of the uploaded file version on Nexus Mods. |

## Example

```yaml
name: Release mod
on:
  release:
    types: [published]

permissions:
  contents: write # only needed for the commit comment

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - name: Build mod
        run: zip -r MyMod.zip ./dist

      - name: Upload to Nexus Mods and Thunderstore
        uses: Vodianoi/uploadMod@v1
        with:
          version: ${{ github.event.release.tag_name }}
          archive-file: MyMod.zip
          file-name: My Mod
          description: ${{ github.event.release.name }}
          nexus-api-key: ${{ secrets.NEXUSMODS_API_KEY }}
          nexus-file-id: '123456'
          thunderstore-token: ${{ secrets.THUNDERSTORE_TOKEN }}
          thunderstore-config: ./thunderstore.toml
```

## Testing without uploading

Set `dry-run: 'true'` to run your whole release workflow without publishing anything. The action then:

| Check | Nexus Mods | Thunderstore |
|---|---|---|
| Inputs (version format, files exist, IDs are numbers) | ✔ | ✔ |
| Credentials | API key is valid (prints the account name) | Token is valid |
| Target | `nexus-file-id` exists; with `nexus-mod-id`, it belongs to that mod | Token may upload to the `thunderstore.toml` namespace (team) |
| Package | | Zip has `manifest.json`, `icon.png` and `README.md` at its root, and Thunderstore's own validator accepts the manifest (name, version not already published, dependencies exist) |

It only calls read-only or validate-only endpoints, skips the commit comment, and in `thunderstore-build` mode runs `tcli build` instead of `tcli publish`.

Nexus Mods has no validate-only upload endpoint, so a dry run cannot prove the key may add versions to the file: it confirms the key works and the file exists. For a real end-to-end Thunderstore test, publish to the staging site with `thunderstore-repository: https://thunderstore.dev` and a thunderstore.dev token.

```yaml
on:
  workflow_dispatch:
    inputs:
      dry-run:
        type: boolean
        default: true

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      # ... build the mod ...
      - uses: Vodianoi/uploadMod@v1
        with:
          dry-run: ${{ inputs.dry-run }}
          # ... same inputs as a real release ...
```

## Migrating from 0.9.x

Version 1.0 replaces the archived Digitalroot.ModUploader (`drmu`), which logged in with browser cookies, with the official Nexus Mods API.

| Old input | New input |
|---|---|
| `NEXUSMOD_API_KEY` | `nexus-api-key` |
| `mod-id` | `nexus-file-id` (the **file** ID, not the mod ID) |
| `category` (`Main`, …) | `nexus-category` (`main`, `optional`, `miscellaneous`) |
| `NEXUSMOD_COOKIE_NEXUSID`, `NEXUSMOD_COOKIE_SID_DEVELOP` | removed, no cookies needed |
| `game` | removed, the file ID identifies the game |
| `THUNDERSTORE_TOKEN` | `thunderstore-token` |
| `tomlConfigPath` | `thunderstore-config` |
| `namespace` | removed, set it in `thunderstore.toml` |
| `GITHUB_TOKEN` | `github-token` (optional) |

## Development

```sh
npm test
```

The tests use Node's built-in test runner; there are no npm dependencies.
