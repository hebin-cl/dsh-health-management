# Changelog

## 1.4.1 — 2026-11-18

- **Member-aware key metrics in the quick card** — click Little Muscle King to see the current member's latest key values without opening the panel: weight / body fat / skeletal muscle / waist for a lean-muscle member, or a 7-day blood-pressure average plus fasting glucose / waist / triglycerides / HDL-C for a metabolic member. Values and reference bands only; never a diagnosis.
- **Goal-aware reminders** — an active lean-muscle goal alternates water and 大练 prompts; an active metabolic goal prompts 测 / 吃 / 动 / 睡. The reminder uses record counts, goal codes and last water/training timestamps, never a measurement value.
- **Lean account / menu cleanup** — 蛋白 is now 大餐 (internal metric stays `protein`); the top-level Diet tab is removed, and clicking 大餐 opens the diet manager instead.
- **Default identity** — default name 小肌霸, default portrait from the supplied image, and the same portrait is the plugin icon; name and avatar remain configurable.
- **Report AI interpretation** — an archived image (PNG / JPEG / WebP) or text
  (`.txt`) report can be read by an image-capable model chosen in the panel.
  The result shows the report original on the left and the abnormal indicators
  on the right, with three layers per item (what it reflects, what an abnormal
  value may relate to, general non-prescription suggestions), one shared
  disclaimer, the provider/model label, and one question summary at the end.
  Nothing is written; a prescription is refused and a PDF gets a
  screenshot/photo instruction. The report-model preference is stored
  separately from the meal-estimate model.
- **Body-composition statement** — added a quick entry button, column headers,
  derived BMI on read (including records saved before the height was known and
  recomputation after a height correction), no fake `0` delta for a single
  season record, and consistent units/empty values.

## 1.4.0 — 2026-11-17

- **Little Muscle King (小肌霸)** — a draggable floating health buddy on the Web
  panel with its own DSH Settings page: display name, built-in avatar or an
  uploaded image, show/hide, size, saved position, reminder interval, quiet
  hours, bubble duration and optional desktop notifications. It reads only
  aggregate counts (records today, active goals) and never evaluates a value,
  labels a disease or proposes treatment; its settings live in `float.json` and
  are shared by every DSH Web window on this machine.
- **Meal photos and vision estimation** — record breakfast / lunch / dinner /
  snack with a photo; an image-capable model can propose kcal, protein and the
  item list, and nothing is saved until the user confirms it. The estimate route
  is automatic (agent default when it accepts images) or pinned to one
  image-capable provider/model in the panel; the choice is stored in
  `estimate.json`.
- **Metabolic management redesign (代谢对账簿)** — behaviour accounts
  (测 / 吃 / 动 / 睡) counted as deposits, an observation-only indicator
  statement (waist, blood pressure, fasting glucose, TG, HDL-C, ...) against
  population reference bands and doctor-set targets, a 12-week review cycle, a
  weekly ledger and a copyable visit summary. No indicator is scored as a
  diagnosis.
- **Members** gain a height field (BMI derives from weight + height) and an
  `unknown` risk level.
- Carries the 1.3.2 compatibility fix (unknown metric codes and legacy photo
  kinds no longer fail the panel) and the 1.3.1 host request gate.

## 1.3.2 — 2026-11-17

- Reading a stored record whose metric code this build does not ship no longer
  fails the whole panel. A newer build may have written a metric this release
  does not have (the preview build's meal-photo estimate stores `kcal`); the
  value is now shown by its code instead of throwing
  `Cannot read properties of undefined (reading 'name')` from the overview.
- The photo document accepts photo kinds this build does not render. An unknown
  legacy kind (for example the preview build's diet `meal` photos) is kept in
  storage, does not block startup, and is hidden from the photo wall instead of
  being mislabelled as a body shot.
- A personal goal target that references a metric no longer in the catalog is
  rejected with a clear message instead of crashing.

## 1.3.1 — 2026-11-16

- Panel HTTP routes now ask the host's own request gate (`ctx.connection.requestRejection`)
  before answering: the Host/Origin fence and browser login that DSH applies to its own API
  also apply to `/api/dsh-health/*`. Bare `webServer` routes never passed through it, so a page
  open in the user's browser could call them. Hosts without the service keep the old behaviour,
  so the plugin still loads on DSH versions that predate it.
- Refusals are answered with the host's status (401/403) and no data; nothing else changes in the
  routes, the tool surface or the local storage format.

## 1.3.0 — 2026-11-14

- Four main tabs: overview, season, archive, discover.
- Season is a dedicated section with hero, W4/W8/W12 checkpoints, weekly ledger, share card and squad entry.
- Archive becomes the single home for trends, photos and medical documents, with counts and quick actions.
- Discover ships a Hangzhou Yuhang district pilot with 10 public/community/specialty venues, search, filters, source links and local favourites.
- Local-only invite squad MVP with behavior-only leaderboard; no remote service.
- Deposits now use the unit **笔**; season time is expressed in weeks.
- Invite-code copy uses a local Windows clipboard bridge with browser fallback.

## 1.2.1 — 2026-11-13

- The panel always opens on **我** (self); it no longer auto-selects another member just because that member has a goal.
- Member-name placeholder is neutral (`如：我`); public screenshots show only the default **我** tab, with no other default member labels.
- Public client module id corrected to `dsh-health-management`; GitHub and tarball installs load the panel reliably.

## 1.2.0 — 2026-11-13

First public release.

- Family health records for up to 8 members across 20 metrics.
- Management goals: metabolic monitoring and Lean Account (lean_muscle).
- Lean Account: four behaviour accounts (training/protein/sleep/water), daily deposits, 7×4 weekly ledger, 12-week season with W4/W8/W12 checkpoints, season review, new season without deleting history.
- Body-composition statement: reference bands plus season baseline delta, observation-only (never scored).
- Progress photos: daily shot, photo wall, two-photo compare, season compare; local-only storage.
- Health archive: medical records, prescriptions, lab reports, imaging, other documents; condition tags separate from goals.
- Agent tools for members, records, statistics, goals, seasons, conditions, documents, metrics and storage diagnostics.
- Dark graphite/neon dashboard shared by the hero and the content below; the metabolic view stays restrained.
- Safety boundary: no diagnosis, medication/treatment advice, training plan, recipe, supplement advice, or effect promise.
