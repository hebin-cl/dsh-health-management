Adds one entry, `data/plugins/hebin-cl__dsh-health-management.yml`.

- [x] `package.json` declares `dsh.bundle` (`./cordis.patch.yml` inserts `dsh-health`) plus `dsh.client` for the browser panel.
- [x] Repository created 2026-11-13 — over 1 day old.
- [x] `dsh-plugin` topic is set.
- [x] `category: tools` — it ships a Web panel and a family of `health_*` agent tools over one shared store.
- [x] Descriptions state what it does; no superlatives.
- [x] `tarball:` is a version-free asset name on `latest/download/`, so it will not rot on the next release.
- [x] `icon:` is the repository's 180×180 PNG; `screenshots.json` declares four relative screenshots.
- [x] npm is not published for this release — optional per the guide, so installs go through the GitHub source or the release tarball.
- [x] `node scripts/check.mjs` → 259/259 checks pass; plain ESM, no build step.

**What it does.** Family health records for up to 8 members: vitals, labs, body composition, meals, water, sleep and training minutes. Two management-goal templates — `metabolic` (core indicators with reference bands and target gaps) and `lean_muscle` (a 12-week season with a weekly ledger and a reference-band/trend statement); a health archive with condition tags, progress photos and medical-document records; a local-only invite squad; and a Discover tab with a Hangzhou Yuhang venue pilot taken from public sources. The agent tools and the Web panel read and write the same local store.

**Scope.** Records and descriptive statistics only. No diagnosis, treatment, medication advice, personalised training plans, recipes or effect claims; reference ranges are population values, not personal targets. Data stays in the local DSH profile, and the plugin makes no outbound requests — its external links (map search, source citations) are opened by the user.

**Rights.** Code is MIT. The dashboard's hero photograph is the repository owner's own image, declared in `THIRD_PARTY_NOTICES.md`, and is not covered by the MIT grant.
