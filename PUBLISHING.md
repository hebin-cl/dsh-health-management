# Publishing this plugin

This repository is ready to push. It is not yet linked to a GitHub remote.

## 1. Create the GitHub repository

Create a **public** repository named `dsh-health-management` under your account
(or organization), with no README, no `.gitignore`, and no license — this
repository already contains all three.

Then fill the owner placeholder:

```sh
cd dsh-health-management
node scripts/configure-repo.mjs --owner YOUR_GITHUB_NAME
```

This replaces `hebin-cl` in `package.json`, both READMEs and the market entry.

## 2. Push the first commit

```sh
git init
git add .
git commit -m "feat: initial public release"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_NAME/dsh-health-management.git
git push -u origin main
```

Add the **`dsh-plugin`** topic to the repository (repo page → About → Topics).

## 3. Verify the package before listing

```sh
node scripts/check.mjs
```

The script runs `node --check` over the host/client sources and executes the
full smoke test in a temporary directory.

## 4. Optional: publish to npm

The package name `dsh-health-management` is unscoped and public. After
`npm login`:

```sh
npm publish
```

The package `repository` field already points at the GitHub repository, so the
curated market can link the two automatically. npm is optional: GitHub source
installs work without it.

## 5. Optional: create a GitHub Release

```sh
git tag v1.2.0
git push origin v1.2.0
```

The `Release` workflow runs the checks, creates `dsh-health-management.tgz`,
and uploads it to the tag. Storefronts can use:

```text
https://github.com/YOUR_GITHUB_NAME/dsh-health-management/releases/latest/download/dsh-health-management.tgz
```

## 6. Native Discover index (format 1)

`index.json` is already generated for the initial release commit and included
in the repository. After the first push, add this source in DSH:
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
2. Copy `market/awesome-dsh-plugin-entry.yml` to
   `data/plugins/YOUR_GITHUB_NAME__dsh-health-management.yml` and replace the
   owner placeholder.
3. Open a PR. The repository must be **at least 1 day old**, must declare
   `dsh.bundle` (this one does), and must have the `dsh-plugin` topic.
4. The guide allows at most 3 entries per PR. Keep the description factual; the
   reviewers check it against the code.

Once merged, the plugin is searchable in the **dshmarket** Discover tab and the
site; install works from npm or GitHub.

## 8. Asset rights

Before pushing publicly, read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The hero photograph is user-provided; the MIT license does **not** cover it.
If you do not have public distribution / portrait rights, replace
`assets/hero-torso.webp` and the screenshots, or use the public-domain
sculpture fallback described there. The plugin code itself can be published
independently of that image.
