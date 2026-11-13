# Publishing this plugin

Status: **published to GitHub** at
<https://github.com/hebin-cl/dsh-health-management> on `main`, with a public
`v1.2.1` release and a validated format-1 `index.json`.

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

1. Fork `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`.
2. Copy `market/hebin-cl__dsh-health-management.yml` to
   `data/plugins/hebin-cl__dsh-health-management.yml`.
3. Open a PR; use `market/PR-BODY.md` as the description.
4. The repository must be **at least 1 day old**, must declare `dsh.bundle`
   (this one does), and must have the `dsh-plugin` topic (it does).
5. The guide allows at most 3 entries per PR. Keep the description factual; the
   reviewers check it against the code.

Once merged, the plugin is searchable in the **dshmarket** Discover tab and the
site; install works from GitHub source or the release tarball.

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
