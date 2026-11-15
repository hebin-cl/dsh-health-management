# Publishing this plugin

Status: **published to GitHub** at
<https://github.com/hebin-cl/dsh-health-management> on `main`, with a public
`v1.3.0` release and a validated format-1 `index.json`.

npm is intentionally **not published** for this release. GitHub source and the
release tarball are the supported install sources. The npm package name stays
`dsh-health-management` for a future release.

## 1. Install sources

```sh
# GitHub source
dsh plugin --profile <profile> add github:hebin-cl/dsh-health-management

# release tarball
dsh plugin --profile <profile> add ./dsh-health-management.tgz
```

Release asset:

```text
https://github.com/hebin-cl/dsh-health-management/releases/latest/download/dsh-health-management.tgz
```

## 2. Verify before changing the listing

```sh
node scripts/check.mjs
```

The script runs `node --check` over the host/client sources and executes the
full smoke test in a temporary directory.

## 3. Native Discover index (format 1)

`index.json` is committed and pinned to the current release commit. Add this
source in DSH: **Plugins → Discover → Index sources**:

```text
https://raw.githubusercontent.com/hebin-cl/dsh-health-management/main/index.json
```

If you rewrite history or publish a new tag, regenerate it:

```sh
node scripts/build-market-index.mjs --owner hebin-cl --source git
git add index.json
git commit -m "chore: refresh plugin market index"
git push
```

## 4. Curated awesome-dsh-plugin listing

Status: **submission PR opened** —
<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/15394>.

The submission is **one file**: `data/plugins/hebin-cl__dsh-health-management.yml`,
kept here as `market/hebin-cl__dsh-health-management.yml`. The PR body is
`market/PR-BODY.md`. The branch lives on the `hebin-cl/awesome-dsh-plugin` fork as
`add-dsh-health-management` and is a single commit on top of upstream `main`, so a
maintainer can rebase or merge it directly.

Rules the entry has to satisfy (`contributing.md` in that repository):

1. One PR adds at most 3 entries; this one adds 1.
2. The repo declares `dsh.bundle` (it does) and carries the `dsh-plugin` topic
   (it does), and is at least 1 day old (created 2026-11-13).
3. `description.en` states what the plugin does and must match the code; the
   `zh` line is optional.
4. `icon:` must be a GitHub-hosted raster image — here `assets/icon-180.png`.
5. `tarball:` must be an `https` `.tgz` on GitHub release hosting; the asset name
   is version-free so `latest/download/` does not rot on the next release.
6. Screenshots are declared in **this** repository via `screenshots.json`
   (relative paths, 1-8 images).

Once merged, the catalog rebuilds automatically and the plugin becomes
searchable in the **dshmarket** Discover tab and installable with one click
(GitHub source or the release tarball).

## 5. Optional future npm release

If you later publish to npm:

```sh
npm login
npm publish
node scripts/build-market-index.mjs --owner hebin-cl --source npm
git add index.json
git commit -m "chore: switch market index to npm"
git push
```

Keep `package.json.repository` pointed at the GitHub repository so the curated
catalog can link npm and GitHub automatically.

## 6. Asset rights

The user confirmed public distribution/portrait rights for the hero photograph.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the MIT license covers the
source code, not that image. If the scope of publication changes, re-confirm or
replace the image (the public-domain sculpture fallback is documented there).
