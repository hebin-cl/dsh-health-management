# Publishing this plugin

This directory is already a git repository configured for **hebin-cl**, with
owner placeholders filled, commits on `main`, and a validated `index.json`.
Only the remote, npm login and registry PR remain.

## 1. Create the GitHub repository

Create a **public** repository named `dsh-health-management` under `hebin-cl`,
with no README, no `.gitignore`, and no license — this repository already
contains all three.

Prefilled creation page:

```text
https://github.com/new?name=dsh-health-management&owner=hebin-cl
```

## 2. Push the existing commits

```sh
git remote add origin https://github.com/hebin-cl/dsh-health-management.git
git push -u origin main
```

Add the **`dsh-plugin`** topic to the repository (repo page → About → Topics).

## 3. Verify the package before listing

```sh
node scripts/check.mjs
```

The script runs `node --check` over the host/client sources and executes the
full smoke test in a temporary directory.

## 4. Publish to npm

The package name `dsh-health-management` is unscoped and currently available.
After `npm login`:

```sh
npm publish
```

On this machine npm is not on `PATH`; use:

```powershell
& "C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-6\npm.cmd" login
& "C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-6\npm.cmd" publish
```

The `repository` field already points at the GitHub repository. npm is
optional: the curated registry can install from GitHub source without it.

## 5. Optional: create a GitHub Release

```sh
git tag v1.2.0
git push origin v1.2.0
```

The `Release` workflow creates `dsh-health-management.tgz` and uploads it to
the tag. Storefronts can use:

```text
https://github.com/hebin-cl/dsh-health-management/releases/latest/download/dsh-health-management.tgz
```

## 6. Native Discover index (format 1)

`index.json` is already committed and pinned to the initial release commit.
After the first push, add this source in DSH:
**Plugins → Discover → Index sources**:

```text
https://raw.githubusercontent.com/hebin-cl/dsh-health-management/main/index.json
```

If you rewrite history, publish a new tag, or switch to npm, regenerate it:

```sh
node scripts/build-market-index.mjs --owner hebin-cl --source git
# or: --source npm  (after npm publish)
git add index.json
git commit -m "chore: refresh plugin market index"
git push
```

## 7. Curated awesome-dsh-plugin listing

1. Fork `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`.
2. Copy `market/hebin-cl__dsh-health-management.yml` to
   `data/plugins/hebin-cl__dsh-health-management.yml`.
3. Open a PR; use `market/PR-BODY.md` as the description.
4. The repository must be **at least 1 day old**, must declare `dsh.bundle`
   (this one does), and must have the `dsh-plugin` topic.
5. The guide allows at most 3 entries per PR. Keep the description factual; the
   reviewers check it against the code.

Once merged, the plugin is searchable in the **dshmarket** Discover tab and the
site; install works from npm or GitHub.

## 8. Asset rights

The user confirmed public distribution/portrait rights for the hero photograph.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the MIT license covers the
source code, not that image. If the scope of publication changes, re-confirm or
replace the image (the public-domain sculpture fallback is documented there).
