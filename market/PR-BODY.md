# Add dsh-health-management

## Repository

https://github.com/hebin-cl/dsh-health-management

## Category

`tools`

## What it does

Family health records and management goals for DeepSeek Harness:

- Up to 8 family members and 20 metrics (blood pressure, glucose, lipids, uric acid, body composition, protein, water, sleep, training minutes).
- Management goals: metabolic monitoring and a 12-week lean-muscle account (training / protein / sleep / water).
- Weekly 7×4 ledger, season checkpoints W4/W8/W12, season review, new season without deleting history.
- Body-composition statement with reference bands and a season baseline delta — observation-only, never scored.
- Progress photos (daily shot, wall, two-photo compare, season compare); files stay local.
- Health archive with condition tags kept separate from management goals.
- Agent tools share the same data as the Web panel.

## Safety

Records and descriptive statistics only. No diagnosis, treatment, medication advice, personalised training plan, recipe, supplement advice, or effect promises. Reference ranges are population references, not personal targets.

## Checklist

- [x] `package.json` declares `dsh.bundle` and `dsh.client`.
- [x] `cordis.patch.yml` inserts the plugin.
- [x] No build step; source is plain ESM/JS.
- [x] Install sources: GitHub source + release tarball (npm not published in this release).
- [x] Tests: `node scripts/check.mjs` → 248/248 smoke checks.
- [x] Icon: 180×180 PNG.
- [x] Screenshots: `screenshots.json` in the repository.
- [x] Repository has the `dsh-plugin` topic.
- [x] Repository will be at least 1 day old before this PR is opened.

## Install

```sh
dsh plugin --profile <profile> add github:hebin-cl/dsh-health-management
```

Or install the release tarball from
`https://github.com/hebin-cl/dsh-health-management/releases/latest/download/dsh-health-management.tgz`.

## Notes

The hero visual is a user-provided photograph; see `THIRD_PARTY_NOTICES.md`. The
code is MIT-licensed; the image is not covered by the MIT grant.
