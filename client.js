window.__ModuleLoader__.load({
  id: 'dsh-health-management',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef } = React

    const API = '/api/dsh-health'
    const HERO_ART = `${API}/hero-art?v=4`

    // ---------------------------------------------------------------- palette
    // Chart line colors (artwork colors, readable in both light and dark).
    // High-contrast, saturated palette tuned for small multi-series charts.
    const SERIES_COLORS = ['#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#6366f1']

    const STATUS_STYLE = {
      high: 'var(--dsw-alias-state-warn-primary)',
      low: 'var(--dsw-alias-state-warn-primary)',
      normal: 'var(--dsw-alias-state-success-primary)',
      unknown: 'var(--dsw-alias-state-idle-primary)',
    }

    const CONDITION_SOURCE_LABEL = { report: '报告诊断', manual: '手动添加', recognized: '确认' }
    const GOAL_STATUS_LABEL = { active: '进行中', paused: '已暂停', achieved: '已达成' }
    const RECORD_SOURCE_LABEL = { text: '文字', image: '图片', form: '表单' }

    const CONTEXT_FALLBACK = [
      { code: 'fasting', name: '空腹' },
      { code: 'postprandial', name: '餐后' },
      { code: 'morning', name: '晨起' },
      { code: 'evening', name: '睡前' },
      { code: 'random', name: '随机' },
    ]

    const TABS = [
      { code: 'overview', name: '概览' },
      { code: 'season', name: '赛季' },
      { code: 'archive', name: '档案' },
      { code: 'discover', name: '发现' },
    ]

    const RECORDS_SHOWN = 8
    const TOAST_MS = 2600

    // ---------------------------------------------------------------- cut mode
    // Fixed dark hero palette (independent of the light/dark app theme).
    const CUT_ACCENT = '#D7FF3F'
    const CUT_HOT = '#FF5A2A'
    const CUT_BG_FROM = '#0B0D12'
    const CUT_BG_TO = '#151A22'

    const PHOTO_MAX_EDGE = 1400
    const PHOTO_QUALITY = 0.82
    const PHOTO_KINDS = { progress: 'progress', inspiration: 'inspiration' }

    const TONE_KEY = 'dsh-health.tone.'
    const TONE_SEEN_KEY = 'dsh-health.toneSeen.'
    const TONE_MODES = [
      { code: 'gentle', name: '温和' },
      { code: 'hard', name: '硬核' },
      { code: 'off', name: '关闭' },
    ]

    // ---------------------------------------------------------------- styles
    const CSS = `
/* ---------- shell ---------- */
.dshh-root { display:flex; flex-direction:column; height:100%; overflow-y:auto;
  background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary);
  font-size:13px; line-height:1.55;
  --cut-accent:${CUT_ACCENT}; --cut-hot:${CUT_HOT}; }

/* ---------- sticky top bar ---------- */
.dshh-topbar { position:sticky; top:0; z-index:30; display:flex; flex-direction:column; gap:9px;
  padding:13px 20px 0; background:var(--dsw-alias-bg-base);
  border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshh-toprow { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.dshh-brand { min-width:0; }
.dshh-title { font-size:19px; font-weight:650; margin:0; }
.dshh-sub { color:var(--dsw-alias-label-secondary); font-size:11.5px; margin-top:1px; }
.dshh-topactions { position:relative; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dshh-iconbtn { min-width:34px; text-align:center; font-weight:700; }
.dshh-menu-layer { position:absolute; top:calc(100% + 6px); right:0; z-index:60; }
.dshh-menu-mask { position:fixed; inset:0; z-index:-1; }
.dshh-menu { min-width:176px; display:flex; flex-direction:column; gap:2px; padding:6px;
  background:var(--dsw-alias-bg-overlay); border:1px solid var(--dsw-alias-border-l2);
  border-radius:10px; box-shadow:0 12px 32px rgba(0,0,0,.22); }
.dshh-menu-item { text-align:left; padding:8px 10px; border:none; border-radius:8px; background:transparent;
  color:var(--dsw-alias-label-primary); font:inherit; font-size:12.5px; cursor:pointer; }
.dshh-menu-item:hover { background:var(--dsw-alias-bg-layer-2); }

/* member switcher */
.dshh-memrow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dshh-mempills { display:flex; flex-wrap:wrap; gap:6px; min-width:0; }
.dshh-mempill { padding:4px 12px; border-radius:999px; cursor:pointer; font:inherit; font-size:12px;
  border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-secondary); }
.dshh-mempill:hover { border-color:var(--dsw-alias-brand-primary); }
.dshh-mempill[data-active='true'] { border-color:var(--dsw-alias-brand-primary);
  color:var(--dsw-alias-brand-primary); background:var(--dsw-alias-bg-layer-2); font-weight:600; }
.dshh-memadd { padding:4px 10px; border-radius:999px; cursor:pointer; font:inherit; font-size:12px;
  border:1px dashed var(--dsw-alias-border-l2); background:transparent;
  color:var(--dsw-alias-label-secondary); }
.dshh-memadd:hover { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); }
.dshh-memselect { width:auto; min-width:150px; max-width:62%; }

/* tabs */
.dshh-tabbar { display:flex; gap:18px; }
.dshh-tabbtn { padding:8px 2px 9px; border:none; border-bottom:2px solid transparent; background:transparent;
  color:var(--dsw-alias-label-secondary); font:inherit; font-size:13px; cursor:pointer; }
.dshh-tabbtn:hover { color:var(--dsw-alias-label-primary); }
.dshh-tabbtn[data-active='true'] { color:var(--dsw-alias-brand-primary);
  border-bottom-color:var(--dsw-alias-brand-primary); font-weight:600; }

/* body */
.dshh-body { width:100%; max-width:1080px; margin:0 auto; padding:16px 20px 36px;
  display:flex; flex-direction:column; gap:14px; }
.dshh-section { display:flex; flex-direction:column; gap:10px; }
.dshh-sectionhead { display:flex; align-items:center; justify-content:space-between; gap:10px; }

/* ---------- buttons ---------- */
.dshh-btn { padding:5px 12px; border-radius:8px; cursor:pointer; font:inherit; font-size:12px;
  border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary); }
.dshh-btn:hover { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); }
.dshh-btn:disabled { opacity:.55; cursor:not-allowed; }
.dshh-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary);
  color:#fff; font-weight:600; }
.dshh-btn-primary:hover { opacity:0.9; color:#fff; }
.dshh-btn-danger { border-color:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); }
.dshh-btn-danger:hover { background:var(--dsw-alias-state-error-primary); color:#fff; }
.dshh-btn-ghost { border:none; background:transparent; color:var(--dsw-alias-label-secondary); padding:4px 8px; }
.dshh-btn-ghost:hover { color:var(--dsw-alias-brand-primary); }
.dshh-btn-sm { padding:3px 9px; font-size:11.5px; }

/* ---------- cards ---------- */
.dshh-card { border:1px solid var(--dsw-alias-border-l1); border-radius:12px;
  background:var(--dsw-alias-bg-layer-1); padding:14px 16px; }
.dshh-cardhead { display:flex; align-items:center; justify-content:space-between; gap:10px;
  margin-bottom:10px; flex-wrap:wrap; }
.dshh-cardtitle { font-weight:620; font-size:13px; }
.dshh-muted { color:var(--dsw-alias-label-secondary); }
.dshh-small { font-size:11px; }

/* ---------- goal cards ---------- */
.dshh-goalcards { display:flex; flex-direction:column; gap:12px; }
.dshh-goalname { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-weight:650; font-size:13.5px; }
.dshh-goalchip { font-size:10.5px; font-weight:600; padding:1px 8px; border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-label-secondary); }
.dshh-goalchip[data-status='active'] { color:var(--dsw-alias-brand-primary);
  border-color:var(--dsw-alias-brand-primary); }
.dshh-goalchip[data-status='paused'] { color:var(--dsw-alias-state-warn-primary);
  border-color:var(--dsw-alias-state-warn-primary); }
.dshh-goalchip[data-status='achieved'] { color:var(--dsw-alias-state-success-primary);
  border-color:var(--dsw-alias-state-success-primary); }
.dshh-goalmeta { font-size:11px; color:var(--dsw-alias-label-secondary); margin-top:2px; }
.dshh-goalstats { display:flex; flex-wrap:wrap; gap:12px; margin:8px 0 10px; font-size:11.5px;
  color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
.dshh-goalnote { margin-top:10px; font-size:10.5px; line-height:1.6; color:var(--dsw-alias-label-secondary); }

/* target rows inside a goal card (compact) */
.dshh-trows { display:flex; flex-direction:column; border-top:1px solid var(--dsw-alias-border-l1); }
.dshh-trow { display:grid; gap:8px; align-items:baseline; padding:6px 2px; font-size:12px;
  grid-template-columns:minmax(64px,1fr) minmax(64px,.9fr) minmax(84px,1.2fr) minmax(76px,.8fr);
  border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshh-trow:last-child { border-bottom:none; }
.dshh-trow-name { color:var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; }
.dshh-trow-cur { font-weight:650; font-variant-numeric:tabular-nums; }
.dshh-trow-target { color:var(--dsw-alias-label-secondary); font-size:11px;
  font-variant-numeric:tabular-nums; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshh-trow-status { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; }
.dshh-dot { width:7px; height:7px; border-radius:50%; flex:none;
  background:var(--dsw-alias-state-idle-primary); }
.dshh-dot[data-status='normal'] { background:var(--dsw-alias-state-success-primary); }
.dshh-dot[data-status='high'], .dshh-dot[data-status='low'] {
  background:var(--dsw-alias-state-warn-primary); }
.dshh-dot[data-status='pending'] { background:var(--dsw-alias-state-warn-primary); opacity:.6; }
.dshh-dot[data-status='trend'] { background:var(--dsw-alias-label-secondary); }
.dshh-trow-status[data-status='normal'] { color:var(--dsw-alias-state-success-primary); }
.dshh-trow-status[data-status='high'], .dshh-trow-status[data-status='low'] {
  color:var(--dsw-alias-state-warn-primary); }
.dshh-trow-status[data-status='pending'], .dshh-trow-status[data-status='unknown'],
.dshh-trow-status[data-status='trend'] { color:var(--dsw-alias-label-secondary); }

/* tracking dimensions */
.dshh-dims { display:grid; grid-template-columns:repeat(auto-fill,minmax(196px,1fr)); gap:10px;
  margin-top:10px; }
.dshh-dim { border:1px dashed var(--dsw-alias-border-l2); border-radius:10px; padding:8px 10px; }
.dshh-dimname { font-size:11.5px; font-weight:620; margin-bottom:5px; }
.dshh-dimrow { display:flex; align-items:baseline; gap:6px; font-size:11px; padding:1px 0; }
.dshh-dimrow-name { color:var(--dsw-alias-label-secondary); min-width:46px; }
.dshh-dimrow-val { font-weight:600; font-variant-numeric:tabular-nums; }
.dshh-dimrow-meta { margin-left:auto; color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums; }

/* ---------- quick log ---------- */
.dshh-quickcard { background:var(--dsw-alias-bg-layer-2); }
.dshh-quickhead { display:flex; align-items:center; justify-content:space-between; gap:10px;
  margin-bottom:10px; flex-wrap:wrap; }
.dshh-seg { display:inline-flex; border:1px solid var(--dsw-alias-border-l1); border-radius:999px;
  padding:2px; background:var(--dsw-alias-bg-layer-1); }
.dshh-segbtn { padding:3px 12px; border:none; border-radius:999px; background:transparent;
  font:inherit; font-size:11.5px; cursor:pointer; color:var(--dsw-alias-label-secondary); }
.dshh-segbtn[data-active='true'] { background:var(--dsw-alias-brand-primary); color:#fff; font-weight:600; }
.dshh-quickfields { display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:10px; }
.dshh-qfield { display:flex; flex-direction:column; gap:4px; min-width:0; }
.dshh-qname { font-size:11.5px; color:var(--dsw-alias-label-secondary); }
.dshh-qwrap { display:flex; align-items:center; gap:6px; }
.dshh-quickmeta { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-top:12px; }
.dshh-quickmeta .dshh-qfield { flex-direction:row; align-items:center; gap:8px; }
.dshh-quickmeta .dshh-input, .dshh-quickmeta .dshh-select { width:auto; }
.dshh-quickfoot { display:flex; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap; }
.dshh-switch { display:inline-flex; align-items:center; gap:6px; font-size:11.5px;
  color:var(--dsw-alias-label-secondary); cursor:pointer; }

/* ---------- latest chips ---------- */
.dshh-chips { display:flex; flex-wrap:wrap; gap:8px; }
.dshh-chip { display:inline-flex; flex-direction:column; gap:2px; min-width:104px;
  padding:8px 12px; border-radius:10px; border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2); color:inherit; font:inherit; text-align:left; }
.dshh-chipname { font-size:11.5px; color:var(--dsw-alias-label-secondary); }
.dshh-chiprow { display:flex; align-items:baseline; gap:4px; }
.dshh-chipval { font-size:16px; font-weight:650; font-variant-numeric:tabular-nums; }
.dshh-chipunit { font-size:10.5px; color:var(--dsw-alias-label-secondary); }
.dshh-chipmeta { font-size:10.5px; color:var(--dsw-alias-label-secondary); }
.dshh-chip[data-status='high'] .dshh-chipval, .dshh-chip[data-status='low'] .dshh-chipval {
  color:var(--dsw-alias-state-warn-primary); }
.dshh-chip[data-status='normal'] .dshh-chipval { color:var(--dsw-alias-state-success-primary); }
.dshh-chip-clickable { cursor:pointer; transition:border-color .12s; }
.dshh-chip-clickable:hover { border-color:var(--dsw-alias-brand-primary); }

/* ---------- recent records ---------- */
.dshh-records { display:flex; flex-direction:column; }
.dshh-rec { display:grid; gap:10px; align-items:center; padding:8px 2px;
  grid-template-columns:minmax(78px,auto) minmax(0,1fr) auto;
  border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshh-rec:last-child { border-bottom:none; }
.dshh-rec-time { font-size:11.5px; color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.dshh-rec-main { min-width:0; }
.dshh-rec-vals { font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshh-rec-meta { font-size:10.5px; color:var(--dsw-alias-label-secondary); margin-top:1px; }
.dshh-rec-actions { display:flex; gap:6px; }

/* ---------- archive ---------- */
.dshh-archsub { font-size:11.5px; font-weight:620; color:var(--dsw-alias-label-secondary);
  margin:14px 0 8px; padding-top:12px; border-top:1px solid var(--dsw-alias-border-l1); }
.dshh-archsub:first-of-type { margin-top:0; padding-top:0; border-top:none; }
.dshh-condchip { display:inline-flex; align-items:center; gap:6px; padding:4px 11px;
  border-radius:999px; font-size:12px; border:1px solid var(--dsw-alias-brand-primary);
  color:var(--dsw-alias-brand-primary); background:var(--dsw-alias-bg-layer-2); }
.dshh-condchip .src { color:var(--dsw-alias-label-secondary); font-size:10.5px; }
.dshh-condchip-remove { cursor:pointer; opacity:0.7; font-weight:700; }
.dshh-condchip-remove:hover { opacity:1; }

.dshh-suggest { border:1px solid var(--dsw-alias-state-warn-primary); border-radius:12px;
  padding:13px 15px; background:var(--dsw-alias-bg-layer-2); }
.dshh-suggest-title { font-weight:620; color:var(--dsw-alias-state-warn-primary);
  font-size:12.5px; margin-bottom:8px; }
.dshh-suggest-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0; }
.dshh-suggest-note { color:var(--dsw-alias-label-secondary); font-size:11.5px; margin-top:2px; }

.dshh-gapgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:10px; }
.dshh-gap { border:1px solid var(--dsw-alias-border-l1); border-radius:10px; padding:11px 13px; }
.dshh-gap-top { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.dshh-gap-name { font-size:12px; color:var(--dsw-alias-label-secondary); }
.dshh-gap-vals { display:flex; align-items:baseline; gap:8px; margin-top:5px; }
.dshh-gap-cur { font-size:20px; font-weight:650; font-variant-numeric:tabular-nums; }
.dshh-gap-target { font-size:11.5px; color:var(--dsw-alias-label-secondary); }
.dshh-gap-status { font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px; }
.dshh-gap-status[data-status='high'], .dshh-gap-status[data-status='low'] {
  color:var(--dsw-alias-state-warn-primary);
  background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent); }
.dshh-gap-status[data-status='normal'] {
  color:var(--dsw-alias-state-success-primary);
  background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }
.dshh-gap-status[data-status='unknown'], .dshh-gap-status[data-status='pending'],
.dshh-gap-status[data-status='trend'] {
  color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }

.dshh-condgroup { margin-bottom:14px; }
.dshh-condgroup:last-child { margin-bottom:0; }
.dshh-condgroup-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.dshh-condgroup-name { font-weight:620; font-size:13px; }
.dshh-condgroup-src { font-size:10.5px; color:var(--dsw-alias-label-secondary);
  border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:1px 8px; }

/* ---------- empty / loading ---------- */
.dshh-empty { padding:28px 20px; text-align:center; }
.dshh-empty-icon { font-size:30px; margin-bottom:8px; opacity:0.6; }
.dshh-empty-title { font-weight:620; font-size:14px; margin-bottom:6px; }
.dshh-empty-desc { color:var(--dsw-alias-label-secondary); font-size:12.5px; max-width:460px;
  margin:0 auto 14px; }
.dshh-empty-actions { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }

/* ---------- forms ---------- */
.dshh-input { padding:6px 10px; border-radius:8px; font:inherit; font-size:12.5px;
  border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base);
  color:var(--dsw-alias-label-primary); width:100%; }
.dshh-input:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.dshh-unit { font-size:11px; color:var(--dsw-alias-label-secondary); white-space:nowrap; }
.dshh-select { font:inherit; font-size:12.5px; padding:6px 10px; border-radius:8px;
  border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base);
  color:var(--dsw-alias-label-primary); width:100%; }
.dshh-field { margin-bottom:13px; }
.dshh-field-label { display:block; font-size:12px; color:var(--dsw-alias-label-secondary);
  margin-bottom:5px; }
.dshh-field-row { display:flex; gap:10px; }
.dshh-field-row > * { flex:1; min-width:0; }

/* ---------- entry accordion ---------- */
.dshh-acc { border:1px solid var(--dsw-alias-border-l1); border-radius:10px;
  margin-bottom:8px; overflow:hidden; }
.dshh-acchead { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;
  padding:9px 12px; border:none; background:var(--dsw-alias-bg-layer-2); color:inherit;
  font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; text-align:left; }
.dshh-acchead-right { display:inline-flex; align-items:center; gap:8px; }
.dshh-acccount { font-size:10.5px; font-weight:600; color:var(--dsw-alias-brand-primary);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
  border-radius:999px; padding:1px 8px; }
.dshh-accbody { padding:10px 12px; }
.dshh-entry-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; }
.dshh-entry-cell { display:flex; align-items:center; gap:6px; }
.dshh-entry-name { font-size:12px; white-space:nowrap; color:var(--dsw-alias-label-primary); min-width:44px; }
.dshh-entry-input { width:72px; text-align:right; font-variant-numeric:tabular-nums; padding:5px 8px; }

/* ---------- tables ---------- */
.dshh-table { width:100%; border-collapse:collapse; font-size:12px; }
.dshh-table th { text-align:left; font-weight:600; font-size:11px;
  color:var(--dsw-alias-label-secondary); padding:7px 8px;
  border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshh-table td { padding:8px; border-bottom:1px solid var(--dsw-alias-border-l1); vertical-align:top; }
.dshh-table tr:last-child td { border-bottom:none; }
.dshh-num { font-variant-numeric:tabular-nums; }

/* ---------- documents ---------- */
.dshh-doc { display:flex; align-items:center; gap:12px; padding:11px 13px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:10px;
  background:var(--dsw-alias-bg-layer-2); }
.dshh-doc-icon { font-size:22px; }
.dshh-doc-body { flex:1; min-width:0; }
.dshh-doc-title { font-weight:600; font-size:12.5px; }
.dshh-doc-meta { color:var(--dsw-alias-label-secondary); font-size:11px; margin-top:2px; }
.dshh-upload { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }

/* ---------- notes / footer ---------- */
.dshh-note { border-radius:10px; padding:12px 14px; font-size:11.5px; line-height:1.65;
  color:var(--dsw-alias-label-secondary); border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2); }
.dshh-notetitle { display:block; margin-bottom:4px; font-weight:600;
  color:var(--dsw-alias-label-primary); }
.dshh-error { color:var(--dsw-alias-state-error-primary); font-size:12px; }
.dshh-warn { color:var(--dsw-alias-state-warn-primary); font-size:11.5px; line-height:1.6; margin-top:10px; }
.dshh-footer { display:flex; align-items:center; gap:10px; padding-top:10px;
  border-top:1px solid var(--dsw-alias-border-l1); }
.dshh-clamp { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }

/* ---------- toast ---------- */
.dshh-toast { position:fixed; right:20px; bottom:20px; z-index:2000;
  max-width:min(420px, calc(100vw - 40px)); padding:10px 14px; border-radius:10px;
  font-size:12.5px; line-height:1.5; background:var(--dsw-alias-bg-overlay);
  border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary);
  box-shadow:0 8px 24px rgba(0,0,0,.24); }

/* ---------- modals ---------- */
.dshh-modal-mask { position:fixed; inset:0; background:color-mix(in srgb, #000 40%, transparent);
  display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px; }
.dshh-modal { width:min(560px, calc(100vw - 40px)); max-height:calc(100vh - 80px); overflow-y:auto;
  background:var(--dsw-alias-bg-overlay); border:1px solid var(--dsw-alias-border-l2);
  border-radius:14px; padding:20px 22px; }
.dshh-modal-wide { width:min(680px, calc(100vw - 40px)); }
.dshh-modal-title { font-size:15px; font-weight:650; margin:0 0 16px; }
.dshh-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:20px;
  flex-wrap:wrap; }
.dshh-modal-note { margin-top:12px; font-size:11.5px; color:var(--dsw-alias-label-secondary);
  line-height:1.65; }

/* goal picker (GoalModal) */
.dshh-goalpick { display:flex; flex-direction:column; gap:8px; }
.dshh-goalpick-card { cursor:pointer; text-align:left; font:inherit; color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l1); border-radius:10px; padding:10px 12px;
  background:var(--dsw-alias-bg-layer-2); }
.dshh-goalpick-card:hover { border-color:var(--dsw-alias-brand-primary); }
.dshh-goalpick-card[data-active='true'] { border-color:var(--dsw-alias-brand-primary);
  box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary); }
.dshh-goalpick-name { font-weight:620; font-size:12.5px; }
.dshh-goalpick-tag { font-size:11px; color:var(--dsw-alias-label-secondary); margin-top:2px; }

/* goal templates (empty state) */
.dshh-tplgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:10px; }
.dshh-tpl { display:flex; flex-direction:column; gap:6px; border:1px solid var(--dsw-alias-border-l1);
  border-radius:10px; padding:12px 14px; background:var(--dsw-alias-bg-layer-2); }
.dshh-tpl-name { font-weight:620; font-size:12.5px; }
.dshh-tpl-tag { font-size:11.5px; color:var(--dsw-alias-label-secondary); }
.dshh-tpl-aud { font-size:11px; color:var(--dsw-alias-label-secondary); line-height:1.55; }
.dshh-tpl-actions { margin-top:auto; display:flex; justify-content:flex-end; }

/* member manager */
.dshh-memberlist { display:flex; flex-direction:column; }
.dshh-memberrow { display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:9px 2px; border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshh-memberrow:last-child { border-bottom:none; }
.dshh-memberrow-name { font-weight:600; font-size:12.5px; }

/* ---------- charts ---------- */
.dshh-chart-legend { display:flex; flex-wrap:wrap; gap:12px; font-size:11px;
  color:var(--dsw-alias-label-secondary); }
.dshh-chart-legend-item { display:flex; align-items:center; gap:5px; }
.dshh-chart-swatch { width:10px; height:10px; border-radius:3px; }
.dshh-trend-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:18px 16px; }
.dshh-trend-cell { min-width:0; border:1px solid var(--dsw-alias-border-l1); border-radius:10px;
  padding:12px 14px; background:var(--dsw-alias-bg-layer-2); }
.dshh-trend-head { display:flex; align-items:center; justify-content:space-between; gap:8px;
  margin-bottom:8px; flex-wrap:wrap; }
.dshh-trend-title { font-weight:620; font-size:13px; }
.dshh-chart-wrap { position:relative; }
.dshh-chart-tooltip { position:absolute; pointer-events:none; z-index:5;
  background:var(--dsw-alias-bg-overlay); border:1px solid var(--dsw-alias-border-l2);
  border-radius:8px; padding:7px 10px; font-size:11px; box-shadow:0 4px 14px rgba(0,0,0,0.18); }
.dshh-chart-tooltip-row { display:flex; align-items:center; gap:6px; white-space:nowrap; }

/* ---------- CUT MODE hero ---------- */
.dshh-overview { display:flex; flex-direction:column; gap:14px; }
.dshh-hero { position:relative; overflow:hidden; border-radius:16px; isolation:isolate;
  padding:22px 24px 20px; color:#F3F4F6; --cut-accent:${CUT_ACCENT}; --cut-hot:${CUT_HOT};
  background:linear-gradient(135deg, ${CUT_BG_FROM} 0%, ${CUT_BG_TO} 100%);
  box-shadow:0 18px 40px rgba(0,0,0,.34); animation:dshhRise .24s ease-out; }
.dshh-hero::before { content:''; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background-image:repeating-linear-gradient(115deg,
    rgba(255,255,255,.04) 0 1px, rgba(255,255,255,0) 1px 14px); }
.dshh-hero-media { position:absolute; inset:0; z-index:-3; width:100%; height:100%;
  object-fit:cover; object-position:center; filter:blur(2px) saturate(.92);
  transform:scale(1.03); opacity:.5; }
.dshh-hero-scrim { position:absolute; inset:0; z-index:-2; pointer-events:none;
  background:linear-gradient(180deg, rgba(11,13,18,.35) 0%, rgba(11,13,18,.82) 62%, ${CUT_BG_FROM} 100%); }
.dshh-hero-art { position:absolute; right:-6px; bottom:-12px; width:min(46%,340px);
  z-index:-1; opacity:.92; pointer-events:none; }
.dshh-hero-art-img { position:absolute; right:-10px; bottom:16px; width:min(58%,470px);
  height:auto; max-height:min(90%,460px); object-fit:contain; z-index:-1; opacity:.97;
  pointer-events:none;
  filter:contrast(1.03) saturate(1.04) drop-shadow(0 20px 34px rgba(0,0,0,.55)) drop-shadow(0 0 22px rgba(215,255,63,.18)); }
.dshh-hero-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.dshh-hero-badge { display:inline-flex; align-items:center; padding:3px 12px; transform:skewX(-12deg);
  font-size:10px; font-weight:800; letter-spacing:.18em; text-transform:uppercase;
  color:${CUT_BG_FROM}; background:var(--cut-accent); }
.dshh-hero-badge > span { transform:skewX(12deg); }
.dshh-hero-badge[data-hot='true'] { background:var(--cut-hot); color:#fff; }
.dshh-hero-status { padding:2px 9px; border-radius:999px; border:1px solid rgba(255,255,255,.2);
  font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:rgba(243,244,246,.72); }
.dshh-hero-title { margin:14px 0 2px; font-size:clamp(26px,4vw,38px); font-weight:800;
  letter-spacing:.01em; line-height:1.08; }
.dshh-hero-tag { color:rgba(243,244,246,.66); font-size:12px; }
.dshh-hero-stats { display:flex; flex-wrap:wrap; gap:26px; margin:18px 0 4px; }
.dshh-hero-stat { min-width:96px; }
.dshh-hero-num { display:block; font-size:clamp(34px,6vw,52px); font-weight:800; line-height:1;
  letter-spacing:-.02em; font-variant-numeric:tabular-nums; color:#fff; }
.dshh-hero-num small { font-size:.4em; font-weight:700; letter-spacing:.02em;
  color:var(--cut-accent); margin-left:4px; }
.dshh-hero-label { display:block; margin-top:6px; font-size:10.5px; letter-spacing:.14em;
  text-transform:uppercase; color:rgba(243,244,246,.55); }
.dshh-hero-cta { position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
.dshh-hero-btn { padding:9px 16px; border-radius:999px; font:inherit; font-size:12.5px;
  font-weight:700; cursor:pointer; border:1px solid transparent; }
.dshh-hero-btn-primary { background:var(--cut-accent); color:${CUT_BG_FROM}; }
.dshh-hero-btn-primary:hover { filter:brightness(1.07); }
.dshh-hero-btn-ghost { background:transparent; color:#F3F4F6; border-color:rgba(255,255,255,.3); }
.dshh-hero-btn-ghost:hover { color:var(--cut-accent); border-color:var(--cut-accent); }
.dshh-hero-note { margin-top:10px; font-size:10.5px; color:rgba(243,244,246,.5); }

/* ---------- coach tone ---------- */
.dshh-tone { display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:12px; padding:11px 14px;
  background:var(--dsw-alias-bg-layer-2); }
.dshh-tone[data-tone='hard'] { border-left:3px solid var(--cut-hot);
  background:linear-gradient(90deg, rgba(255,90,42,.09), transparent 58%),
    var(--dsw-alias-bg-layer-2); }
.dshh-tone[data-tone='gentle'] { border-left:3px solid var(--cut-accent); }
.dshh-tone[data-tone='off'] { border-left:3px solid var(--dsw-alias-border-l2); }
.dshh-tone-tag { font-size:10px; font-weight:800; letter-spacing:.16em; text-transform:uppercase;
  color:var(--dsw-alias-label-secondary); white-space:nowrap; }
.dshh-tone-line { flex:1; min-width:200px; margin:0; font-size:12.5px; font-weight:600; }
.dshh-tone[data-tone='hard'] .dshh-tone-line { font-size:14px; font-weight:750;
  letter-spacing:.01em; color:var(--dsw-alias-label-primary); }
.dshh-tone[data-tone='off'] .dshh-tone-line { font-weight:400; color:var(--dsw-alias-label-secondary); }
.dshh-tone-actions { display:flex; align-items:center; gap:8px; margin-left:auto; }
.dshh-tone-seg { display:inline-flex; border:1px solid var(--dsw-alias-border-l1);
  border-radius:999px; padding:2px; }
.dshh-tone-btn { border:none; background:transparent; border-radius:999px; padding:3px 10px;
  font:inherit; font-size:11px; cursor:pointer; color:var(--dsw-alias-label-secondary); }
.dshh-tone-btn[data-active='true'] { background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary); font-weight:700; }
.dshh-tone-intro { flex-basis:100%; display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  padding-top:8px; border-top:1px dashed var(--dsw-alias-border-l1);
  font-size:11px; color:var(--dsw-alias-label-secondary); }

/* ---------- progress photos ---------- */
.dshh-photohead { display:flex; align-items:flex-start; justify-content:space-between;
  gap:12px; flex-wrap:wrap; }
.dshh-privacy { margin-top:3px; font-size:11px; color:var(--dsw-alias-label-secondary); }
.dshh-photo-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:12px; }
.dshh-photowall { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:12px; }
.dshh-photo { position:relative; padding:0; overflow:hidden; cursor:pointer; text-align:left;
  font:inherit; color:inherit; border:1px solid var(--dsw-alias-border-l1);
  border-radius:12px; background:var(--dsw-alias-bg-layer-2); }
.dshh-photo[data-picked='true'] { outline:2px solid var(--cut-accent); outline-offset:1px; }
.dshh-photo-frame { position:relative; aspect-ratio:3/4; overflow:hidden; background:${CUT_BG_FROM}; }
.dshh-photo-img { display:block; width:100%; height:100%; object-fit:cover;
  transition:transform .25s ease; }
.dshh-photo:hover .dshh-photo-img { transform:scale(1.03); }
.dshh-photo-fallback { position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; color:rgba(243,244,246,.45); font-size:11px; letter-spacing:.1em; }
.dshh-photo-date { position:absolute; left:8px; top:8px; padding:2px 7px; border-radius:6px;
  background:rgba(11,13,18,.72); color:var(--cut-accent); font-size:10px; font-weight:700;
  letter-spacing:.08em; font-variant-numeric:tabular-nums; }
.dshh-photo-check { position:absolute; right:8px; top:8px; width:20px; height:20px;
  border-radius:50%; background:var(--cut-accent); color:${CUT_BG_FROM}; font-size:12px;
  font-weight:800; display:flex; align-items:center; justify-content:center; }
.dshh-photo-note { padding:8px 10px; font-size:11px; color:var(--dsw-alias-label-secondary);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshh-photo-empty { padding:26px 18px; text-align:center; }
.dshh-inspiration { display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  margin-top:12px; padding:10px 12px; border:1px dashed var(--dsw-alias-border-l2);
  border-radius:10px; background:var(--dsw-alias-bg-layer-2); }
.dshh-inspiration-thumb { width:64px; height:80px; object-fit:cover; border-radius:8px;
  background:${CUT_BG_FROM}; display:block; }
.dshh-inspiration-body { flex:1; min-width:160px; }
.dshh-inspiration-title { font-size:12px; font-weight:620; }
.dshh-inspiration-meta { font-size:11px; color:var(--dsw-alias-label-secondary); margin-top:2px; }
.dshh-inspiration-actions { display:flex; gap:8px; }
.dshh-photoview-img { display:block; width:100%; max-height:62vh; object-fit:contain;
  border-radius:10px; background:${CUT_BG_FROM}; }
.dshh-compare { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.dshh-compare-side { min-width:0; }
.dshh-compare-img { display:block; width:100%; aspect-ratio:3/4; object-fit:cover;
  border-radius:10px; background:${CUT_BG_FROM}; }
.dshh-compare-meta { margin-top:6px; font-size:11.5px; color:var(--dsw-alias-label-secondary);
  word-break:break-word; }
.dshh-capture-preview { display:block; width:100%; max-height:44vh; object-fit:contain;
  border-radius:10px; background:${CUT_BG_FROM}; }

/* ---------- lean account (season / deposits / ledger) ---------- */
.dshh-hero-sub { margin-top:2px; font-size:12px; color:rgba(243,244,246,.66); }
.dshh-seasonbar { position:relative; margin-top:16px; max-width:520px; }
.dshh-seasonbar-track { height:6px; border-radius:999px; overflow:hidden;
  background:rgba(255,255,255,.16); }
.dshh-seasonbar-fill { height:100%; border-radius:999px;
  background:linear-gradient(90deg, var(--cut-accent), var(--cut-hot));
  transition:width .4s ease; }
.dshh-seasonbar-ticks { position:relative; height:20px; margin-top:2px; }
.dshh-seasonbar-tick { position:absolute; top:4px; transform:translateX(-50%);
  font-size:9.5px; letter-spacing:.06em; color:rgba(243,244,246,.45);
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.dshh-seasonbar-tick::before { content:''; position:absolute; left:50%; top:-10px;
  width:1px; height:6px; background:rgba(255,255,255,.3); }
.dshh-seasonbar-tick[data-reached='true'] { color:var(--cut-accent); }
.dshh-seasonbar-tick[data-reached='true']::before { background:var(--cut-accent); }
.dshh-seasonbar-tick[data-last='true'] { transform:translateX(-100%); }
.dshh-seasonbar-tick[data-last='true']::before { left:auto; right:0; }

.dshh-accountgrid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
.dshh-account { display:flex; flex-direction:column; gap:4px; min-width:0; text-align:left;
  font:inherit; color:inherit; cursor:pointer; padding:10px 12px; border-radius:12px;
  border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); }
.dshh-account:hover { border-color:var(--cut-accent); }
.dshh-account:focus-visible { outline:2px solid var(--cut-accent); outline-offset:1px; }
.dshh-account[data-met='true'] { border-color:color-mix(in srgb, var(--cut-accent) 55%, var(--dsw-alias-border-l1));
  box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--cut-accent) 40%, transparent); }
.dshh-account-top { display:flex; align-items:center; gap:6px; min-width:0; flex-wrap:wrap; }
.dshh-account-name { font-weight:660; font-size:13px; }
.dshh-account-role { font-size:9.5px; font-weight:600; color:var(--dsw-alias-label-secondary);
  border:1px solid var(--dsw-alias-border-l2); border-radius:999px; padding:0 6px; }
.dshh-account-target { font-size:10.5px; color:var(--dsw-alias-label-secondary);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-height:15px; }
.dshh-account-value { font-size:14.5px; font-weight:700; font-variant-numeric:tabular-nums;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshh-account-state { display:inline-flex; align-items:center; gap:5px; font-size:10.5px;
  color:var(--dsw-alias-label-secondary); }
.dshh-account-dot { width:7px; height:7px; border-radius:50%; flex:none;
  border:1px solid var(--dsw-alias-label-secondary); background:transparent; }
.dshh-account[data-met='true'] .dshh-account-dot { border-color:var(--cut-accent);
  background:var(--cut-accent); }
.dshh-account[data-met='false'][data-record='true'] .dshh-account-dot {
  border-color:var(--cut-accent); background:color-mix(in srgb, var(--cut-accent) 30%, transparent); }
.dshh-account-photo .dshh-account-role { color:var(--cut-hot); border-color:var(--cut-hot); }

.dshh-ledger-summary { font-size:11.5px; color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums; margin-bottom:8px; }
.dshh-ledger-scroll { overflow-x:auto; padding-bottom:2px; }
.dshh-ledger { display:flex; flex-direction:column; gap:6px; min-width:430px; }
.dshh-ledger-head, .dshh-ledger-row { display:grid; align-items:center; gap:5px;
  grid-template-columns:74px repeat(7, minmax(26px, 1fr)); }
.dshh-ledger-colhead { text-align:center; font-size:9.5px; line-height:1.35;
  color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
.dshh-ledger-colhead b { display:block; font-weight:650; font-size:10px;
  color:var(--dsw-alias-label-primary); }
.dshh-ledger-acct { font-size:11.5px; font-weight:620; min-width:0; }
.dshh-ledger-acct small { display:block; font-size:9.5px; font-weight:400;
  color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
.dshh-ledger-cell { width:100%; height:26px; padding:0; cursor:pointer; border-radius:7px;
  border:1px solid var(--dsw-alias-border-l1); background:transparent; }
.dshh-ledger-cell[data-state='met'] { background:var(--cut-accent); border-color:var(--cut-accent); }
.dshh-ledger-cell[data-state='record'] { border-color:var(--cut-accent);
  background:color-mix(in srgb, var(--cut-accent) 16%, transparent); }
.dshh-ledger-cell[data-state='empty'] { opacity:.55; }
.dshh-ledger-cell:hover { border-color:var(--cut-accent); }
.dshh-ledger-cell:focus-visible { outline:2px solid var(--cut-accent); outline-offset:1px; }

.dshh-observe-list { display:flex; flex-direction:column; }
.dshh-observe-row { display:grid; gap:8px; align-items:center; padding:8px 2px;
  grid-template-columns:minmax(88px,1fr) minmax(96px,1.1fr) minmax(88px,1fr) minmax(100px,1.2fr);
  border:none; border-bottom:1px solid var(--dsw-alias-border-l1); width:100%;
  text-align:left; font:inherit; color:inherit; background:transparent; cursor:pointer; }
.dshh-observe-row:last-child { border-bottom:none; }
.dshh-observe-row:hover { background:var(--dsw-alias-bg-layer-2); }
.dshh-observe-name { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:620;
  min-width:0; flex-wrap:wrap; }
.dshh-observe-tag { display:inline-block; font-size:9.5px; font-weight:600;
  color:var(--dsw-alias-label-secondary); border:1px solid var(--dsw-alias-border-l2);
  border-radius:999px; padding:0 6px; }
.dshh-observe-value { font-size:12.5px; font-variant-numeric:tabular-nums; min-width:0; }
.dshh-observe-value small { display:block; font-size:9.5px; color:var(--dsw-alias-label-secondary); }
.dshh-observe-delta { font-size:12.5px; font-weight:650; font-variant-numeric:tabular-nums; }
.dshh-observe-band { display:block; margin-top:2px; font-size:10.5px; color:var(--dsw-alias-label-secondary); line-height:1.5; }

.dshh-seasoncard { display:flex; flex-direction:column; gap:10px; }
.dshh-checkpoints { display:flex; flex-wrap:wrap; gap:8px; }
.dshh-checkpoint { font-size:10.5px; font-weight:600; color:var(--dsw-alias-label-secondary);
  border:1px solid var(--dsw-alias-border-l2); border-radius:999px; padding:1px 9px;
  font-variant-numeric:tabular-nums; }
.dshh-checkpoint[data-reached='true'] { color:var(--dsw-alias-brand-primary);
  border-color:var(--dsw-alias-brand-primary); }
.dshh-seasonstat { font-size:11.5px; color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums; }

.dshh-handbook { display:flex; flex-direction:column; gap:10px; }
.dshh-handbook-card { border:1px solid var(--dsw-alias-border-l1); border-radius:12px;
  padding:12px 14px; background:var(--dsw-alias-bg-layer-2); }
.dshh-handbook-title { font-weight:650; font-size:13px; margin-bottom:6px; }
.dshh-handbook-row { font-size:11.5px; line-height:1.65; margin-top:4px; }
.dshh-handbook-label { display:inline-block; margin-right:5px; padding:0 6px; border-radius:5px;
  font-size:9.5px; font-weight:700; letter-spacing:.06em; color:var(--dsw-alias-label-secondary);
  background:var(--dsw-alias-bg-layer-1); }
.dshh-handbook-source { margin-top:6px; font-size:10px; color:var(--dsw-alias-label-secondary);
  word-break:break-word; }
.dshh-handbook-sources { display:flex; flex-direction:column; gap:3px; font-size:11px;
  color:var(--dsw-alias-label-secondary); }
.dshh-handbook-sources a { color:var(--dsw-alias-brand-primary); text-decoration:none; }
.dshh-handbook-sources a:hover { text-decoration:underline; }

.dshh-review-grid { display:grid; gap:10px; margin-bottom:6px;
  grid-template-columns:repeat(auto-fit,minmax(118px,1fr)); }
.dshh-review-stat { border:1px solid var(--dsw-alias-border-l1); border-radius:10px;
  padding:9px 11px; background:var(--dsw-alias-bg-layer-2); }
.dshh-review-num { font-size:18px; font-weight:700; line-height:1.2;
  font-variant-numeric:tabular-nums; }
.dshh-review-label { font-size:10.5px; color:var(--dsw-alias-label-secondary); margin-top:2px; }
.dshh-review-sub { font-weight:620; font-size:12px; margin:16px 0 6px; }
.dshh-review-line { display:flex; justify-content:space-between; gap:10px; font-size:11.5px;
  padding:4px 2px; border-bottom:1px solid var(--dsw-alias-border-l1);
  font-variant-numeric:tabular-nums; }
.dshh-review-line:last-child { border-bottom:none; }
.dshh-review-line span:last-child { color:var(--dsw-alias-label-secondary); text-align:right; }
.dshh-copybox { white-space:pre-wrap; font-size:11px; line-height:1.65; padding:10px 12px;
  border-radius:10px; border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2); max-height:180px; overflow:auto;
  font-variant-numeric:tabular-nums; }

/* observe rows never use pass/fail colours */
.dshh-dot[data-status='observe'] { background:var(--dsw-alias-label-secondary); opacity:.7; }
.dshh-trow-status[data-status='observe'] { color:var(--dsw-alias-label-secondary); }

/* ---------- dark dashboard theme ---------- */
/* Scope the Harness tokens to this panel so the hero and the content below it
   read as one surface, regardless of the host app's light/dark preference. */
.dshh-root {
  color-scheme: dark;
  --dsw-alias-bg-base:#0B0D12;
  --dsw-alias-bg-layer-1:#12151C;
  --dsw-alias-bg-layer-2:#171B24;
  --dsw-alias-bg-overlay:#12151C;
  --dsw-alias-label-primary:#F2F4F8;
  --dsw-alias-label-secondary:rgba(242,244,248,.64);
  --dsw-alias-border-l1:rgba(255,255,255,.085);
  --dsw-alias-border-l2:rgba(255,255,255,.15);
  --dsw-alias-brand-primary:#D7FF3F;
  --dsw-alias-state-success-primary:#7BE495;
  --dsw-alias-state-warn-primary:#FFB020;
  --dsw-alias-state-error-primary:#FF6B6B;
  --dsw-alias-state-idle-primary:rgba(242,244,248,.38);
  background:
    radial-gradient(circle at 1px 1px, rgba(255,255,255,.05) 1px, transparent 0) 0 0/22px 22px,
    radial-gradient(900px 420px at 78% -10%, rgba(215,255,63,.075), transparent 62%),
    radial-gradient(620px 320px at 6% 12%, rgba(255,90,42,.045), transparent 60%),
    #0B0D12;
}
.dshh-root ::selection { background:rgba(215,255,63,.28); color:#fff; }
.dshh-root::-webkit-scrollbar { width:9px; height:9px; }
.dshh-root::-webkit-scrollbar-thumb { background:rgba(255,255,255,.14); border-radius:6px; }
.dshh-root::-webkit-scrollbar-track { background:transparent; }
.dshh-root .dshh-topbar {
  background:linear-gradient(180deg, rgba(11,13,18,.98), rgba(11,13,18,.90));
  border-bottom-color:rgba(255,255,255,.075);
  backdrop-filter:blur(18px) saturate(1.1);
  box-shadow:0 10px 30px rgba(0,0,0,.22);
}
.dshh-root .dshh-title { color:#F7F8FA; letter-spacing:.02em; }
.dshh-root .dshh-sub { color:rgba(242,244,248,.55); }
.dshh-root .dshh-tabbtn { color:rgba(242,244,248,.55); }
.dshh-root .dshh-tabbtn[data-active='true'] {
  color:#D7FF3F; border-bottom-color:#D7FF3F;
  text-shadow:0 0 16px rgba(215,255,63,.35);
}
.dshh-root .dshh-mempill {
  background:rgba(255,255,255,.028); border-color:rgba(255,255,255,.10);
  color:rgba(242,244,248,.66);
}
.dshh-root .dshh-mempill[data-active='true'] {
  color:#D7FF3F; border-color:rgba(215,255,63,.55);
  background:rgba(215,255,63,.08);
  box-shadow:0 0 18px rgba(215,255,63,.08);
}
.dshh-root .dshh-btn {
  background:rgba(255,255,255,.035); border-color:rgba(255,255,255,.12);
  color:#EDEFF3;
}
.dshh-root .dshh-btn:hover {
  border-color:rgba(215,255,63,.65); color:#D7FF3F;
  background:rgba(215,255,63,.055);
}
.dshh-root .dshh-btn-primary {
  background:#D7FF3F; border-color:#D7FF3F; color:#0B0D12; font-weight:700;
  box-shadow:0 0 22px rgba(215,255,63,.18);
}
.dshh-root .dshh-btn-primary:hover { background:#E5FF72; color:#0B0D12; }
.dshh-root .dshh-btn-danger { background:transparent; border-color:rgba(255,107,107,.5); color:#FF8A8A; }
.dshh-root .dshh-btn-danger:hover { background:rgba(255,107,107,.12); color:#FFB3B3; }
.dshh-root .dshh-card {
  background:linear-gradient(180deg, #141821 0%, #0F1218 100%);
  border-color:rgba(255,255,255,.075);
  border-radius:14px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.045), 0 18px 42px rgba(0,0,0,.22);
}
.dshh-root .dshh-hero {
  box-shadow:0 30px 80px rgba(0,0,0,.38), inset 0 0 0 1px rgba(255,255,255,.045);
}
.dshh-root .dshh-quickcard {
  background:linear-gradient(180deg, #181D27 0%, #11151D 100%);
  border-color:rgba(215,255,63,.16);
}
.dshh-root .dshh-cardtitle {
  display:inline-flex; align-items:center; gap:8px;
  color:#F5F6F8; font-size:12.5px; letter-spacing:.02em;
}
.dshh-root .dshh-cardtitle::before {
  content:''; width:3px; height:13px; border-radius:2px;
  background:linear-gradient(180deg,#D7FF3F,#7BE495);
  box-shadow:0 0 10px rgba(215,255,63,.35);
}
.dshh-root .dshh-cardhead { padding-bottom:2px; flex-wrap:wrap; row-gap:6px; }
.dshh-root .dshh-cardhead > :first-child { flex:1 1 240px; min-width:0; }
.dshh-root .dshh-cardhead > :last-child { flex:0 0 auto; max-width:100%; }
.dshh-root .dshh-quickhead { flex-wrap:wrap; row-gap:6px; }
.dshh-root .dshh-input,
.dshh-root .dshh-select,
.dshh-root textarea {
  background:#0B0F15; border-color:rgba(255,255,255,.12); color:#F2F4F8;
  color-scheme:dark;
}
.dshh-root .dshh-input::placeholder { color:rgba(242,244,248,.32); }
.dshh-root .dshh-input:focus,
.dshh-root .dshh-select:focus,
.dshh-root textarea:focus {
  border-color:rgba(215,255,63,.68);
  box-shadow:0 0 0 3px rgba(215,255,63,.12);
  outline:none;
}
.dshh-root .dshh-account,
.dshh-root .dshh-review-stat,
.dshh-root .dshh-handbook-card,
.dshh-root .dshh-tpl,
.dshh-root .dshh-goalpick-card,
.dshh-root .dshh-trend-cell,
.dshh-root .dshh-doc,
.dshh-root .dshh-copybox,
.dshh-root .dshh-dim {
  background:rgba(255,255,255,.028);
  border-color:rgba(255,255,255,.09);
}
.dshh-root .dshh-chip { background:rgba(255,255,255,.03); }
.dshh-root .dshh-chip:hover,
.dshh-root .dshh-account:hover,
.dshh-root .dshh-goalpick-card:hover {
  border-color:rgba(215,255,63,.45);
  background:rgba(215,255,63,.045);
}
.dshh-root .dshh-chipval,
.dshh-root .dshh-review-num,
.dshh-root .dshh-account-value,
.dshh-root .dshh-observe-value { color:#F4F6FA; }
.dshh-root .dshh-tone {
  background:linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.012));
  border-color:rgba(255,255,255,.08);
}
.dshh-root .dshh-tone[data-tone='hard'] { border-left-color:#FF5A2A; }
.dshh-root .dshh-tone[data-tone='gentle'] { border-left-color:#D7FF3F; }
.dshh-root .dshh-tone-btn[data-active='true'] {
  background:rgba(255,255,255,.07); color:#F2F4F8;
}
.dshh-root .dshh-segbtn[data-active='true'] { color:#0B0D12; }
.dshh-root .dshh-modal {
  background:linear-gradient(180deg, #171C25 0%, #0E1117 100%);
  border-color:rgba(255,255,255,.12);
  box-shadow:0 40px 100px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.05);
}
.dshh-root .dshh-modal-mask {
  background:rgba(0,0,0,.68); backdrop-filter:blur(5px);
}
.dshh-root .dshh-modal-title { color:#F7F8FA; letter-spacing:.01em; }
.dshh-root .dshh-footer {
  border-top-color:rgba(255,255,255,.07);
  color:rgba(242,244,248,.55);
}
.dshh-root .dshh-empty-title { color:#F2F4F8; }
.dshh-root .dshh-empty-desc { color:rgba(242,244,248,.58); }
.dshh-root .dshh-photo { background:#0B0E14; border-color:rgba(255,255,255,.09); }
.dshh-root .dshh-photo-note { color:rgba(242,244,248,.55); }
.dshh-root .dshh-ledger-cell[data-state='empty'] {
  background:rgba(255,255,255,.02); border-color:rgba(255,255,255,.10);
}
.dshh-root .dshh-ledger-cell[data-state='record'] {
  background:rgba(215,255,63,.05); border-color:rgba(215,255,63,.35);
}
.dshh-root .dshh-ledger-cell[data-state='met'] {
  background:#D7FF3F; border-color:#D7FF3F;
  box-shadow:0 0 12px rgba(215,255,63,.22);
}
.dshh-root .dshh-account[data-met='true'] {
  background:linear-gradient(180deg, rgba(215,255,63,.10), rgba(215,255,63,.035));
  border-color:rgba(215,255,63,.38);
  box-shadow:inset 0 0 24px rgba(215,255,63,.05);
}
.dshh-root .dshh-observe-row { border-bottom-color:rgba(255,255,255,.07); }
.dshh-root .dshh-observe-row:hover { background:rgba(255,255,255,.035); }
.dshh-root .dshh-a,
.dshh-root a { color:#D7FF3F; }
.dshh-root .dshh-muted,
.dshh-root .dshh-small { color:rgba(242,244,248,.60); }

/* ---------- responsive ---------- */
@media (max-width: 900px) {
  .dshh-trend-grid { grid-template-columns:1fr; }
  .dshh-accountgrid { grid-template-columns:repeat(3,minmax(0,1fr)); }
}
@media (max-width: 720px) {
  .dshh-topbar { padding:12px 14px 0; }
  .dshh-body { padding:14px 14px 28px; }
  .dshh-trow { grid-template-columns:minmax(60px,1fr) minmax(60px,.8fr) minmax(76px,1fr);
    grid-auto-rows:auto; row-gap:2px; }
  .dshh-trow-target { grid-column:1 / -1; white-space:normal; }
  .dshh-rec { grid-template-columns:auto minmax(0,1fr); }
  .dshh-rec-actions { grid-column:2; justify-content:flex-end; }
  .dshh-tabbar { gap:12px; }
  .dshh-memselect { max-width:100%; }
  .dshh-hero { padding:18px 16px 16px; }
  .dshh-hero-stats { gap:16px; }
  .dshh-hero-num { font-size:34px; }
  .dshh-hero-art { position:relative; right:auto; bottom:auto; display:block;
    width:160px; margin:14px auto 0; }
  .dshh-hero-art-img { position:relative; right:auto; bottom:auto; display:block;
    height:auto; width:min(64%,230px); max-width:100%; margin:8px auto 0; }
  .dshh-photowall { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .dshh-compare { gap:8px; }
  .dshh-tone-actions { margin-left:0; }
  .dshh-accountgrid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .dshh-ledger { min-width:360px; }
  .dshh-observe-row { grid-template-columns:minmax(0,1fr) minmax(0,1fr);
    row-gap:2px; }
  .dshh-observe-band { grid-column:1 / -1; }
  .dshh-review-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .dshh-hero-sub { font-size:11.5px; }
}

  .dshh-brandline { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
  .dshh-preview-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
  .dshh-preview-tag { display:inline-flex; align-items:center; border-radius:999px; padding:3px 9px;
    background:#D7FF3F; color:#0B0D12; font-size:10px; font-weight:750; letter-spacing:.08em; }
  .dshh-share-preview { display:flex; justify-content:center; padding:8px;
    border:1px solid var(--dsw-alias-border-l1); border-radius:16px; background:#080A0E; }
  .dshh-share-canvas { display:block; width:min(100%,340px); height:auto; border-radius:12px; }
  .dshh-consent { border:1px solid var(--dsw-alias-border-l1); border-radius:14px;
    background:rgba(255,255,255,.025); padding:12px; margin:12px 0; }
  .dshh-consent-head { font-size:13px; font-weight:650; margin-bottom:8px; }
  .dshh-consent-cols { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .dshh-consent-cols ul { margin:4px 0 0; padding-left:16px; font-size:11.5px;
    color:var(--dsw-alias-label-secondary); line-height:1.7; }
  .dshh-consent-label { font-size:11px; font-weight:700; color:var(--dsw-alias-brand-primary); }
  .dshh-checkline { display:flex; align-items:flex-start; gap:8px; margin-top:10px;
    font-size:11.5px; color:var(--dsw-alias-label-primary); cursor:pointer; }
  .dshh-checkline input { margin-top:2px; accent-color:var(--dsw-alias-brand-primary); }
  .dshh-form-error { border:1px solid rgba(255,107,107,.45); background:rgba(255,107,107,.08);
    color:#FF9B9B; border-radius:10px; padding:8px 10px; font-size:11.5px; margin:8px 0; }
  .dshh-squad-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .dshh-squad-title { font-size:14px; font-weight:700; letter-spacing:.02em; }
  .dshh-squad-list { display:flex; flex-direction:column; gap:8px; margin:12px 0; }
  .dshh-squad-row { display:grid; grid-template-columns:34px minmax(0,1fr) auto;
    gap:6px 8px; align-items:center; padding:10px 11px; border-radius:12px;
    border:1px solid var(--dsw-alias-border-l1); background:rgba(255,255,255,.025); }
  .dshh-squad-row[data-self='true'] { border-color:rgba(215,255,63,.45);
    background:linear-gradient(180deg,rgba(215,255,63,.07),rgba(215,255,63,.02)); }
  .dshh-squad-rank { color:var(--dsw-alias-label-secondary); font-size:11px; font-variant-numeric:tabular-nums; }
  .dshh-squad-person { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .dshh-squad-name { font-size:12px; font-weight:650; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dshh-squad-total { font-size:14px; font-weight:750; color:var(--dsw-alias-brand-primary);
    font-variant-numeric:tabular-nums; }
  .dshh-squad-cells { grid-column:2 / 4; display:flex; flex-wrap:wrap; gap:5px; }
  .dshh-squad-cell { font-size:10px; color:var(--dsw-alias-label-secondary);
    border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:2px 7px; }
  .dshh-squad-note { font-size:11px; color:var(--dsw-alias-label-secondary); line-height:1.65;
    border-top:1px dashed var(--dsw-alias-border-l1); padding-top:8px; }
  .dshh-squad-empty { font-size:11.5px; color:var(--dsw-alias-label-secondary); padding:16px 4px; }
  .dshh-placelinks { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; }
  .dshh-placefilters { display:flex; flex-wrap:wrap; gap:7px; margin:4px 0 10px; }
  .dshh-place-search { margin:10px 0 2px; }
  .dshh-place-source { color:var(--dsw-alias-label-secondary); font-size:10px; line-height:1.5; }
  .dshh-place-source a { color:var(--dsw-alias-brand-primary); text-decoration:none; }
  .dshh-placefilter { border:1px solid var(--dsw-alias-border-l1); background:transparent;
    color:var(--dsw-alias-label-secondary); border-radius:999px; padding:4px 11px; font-size:11px;
    cursor:pointer; }
  .dshh-placefilter[data-active='true'] { border-color:var(--dsw-alias-brand-primary);
    color:var(--dsw-alias-brand-primary); background:rgba(215,255,63,.07); }
  .dshh-placegrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:12px 0; }
  .dshh-placecard { border:1px solid var(--dsw-alias-border-l1); border-radius:14px;
    background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));
    padding:12px; display:flex; flex-direction:column; gap:9px; }
  .dshh-placehead { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
  .dshh-placename { font-size:13px; font-weight:700; }
  .dshh-placefee { font-size:10px; color:var(--dsw-alias-brand-primary);
    border:1px solid rgba(215,255,63,.3); border-radius:999px; padding:2px 7px; white-space:nowrap; }
  .dshh-placetags { display:flex; flex-wrap:wrap; gap:5px; }
  .dshh-placetag { font-size:10px; color:var(--dsw-alias-label-secondary);
    background:rgba(255,255,255,.04); border-radius:6px; padding:2px 6px; }
  .dshh-placemeta { display:flex; flex-direction:column; gap:2px; font-size:10.5px;
    color:var(--dsw-alias-label-secondary); }
  .dshh-placeactions { display:flex; flex-wrap:wrap; gap:6px; margin-top:auto; }
  @media (max-width:720px) {
    .dshh-placegrid, .dshh-consent-cols { grid-template-columns:1fr; }
  }

  .dshh-seasonpane { display:flex; flex-direction:column; gap:14px; }
  .dshh-seasonhero { position:relative; overflow:hidden; border:1px solid rgba(215,255,63,.20);
    border-radius:20px; padding:20px; background:#141821;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.04), 0 0 32px rgba(215,255,63,.045); }
  .dshh-seasonhero > * { position:relative; z-index:1; }
  .dshh-seasonhero-top { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
  .dshh-season-kicker { font-size:10px; letter-spacing:.18em; font-weight:800; color:#D7FF3F; }
  .dshh-season-status { font-size:10.5px; color:#B6BECC; border:1px solid rgba(255,255,255,.14);
    border-radius:999px; padding:3px 9px; }
  .dshh-seasonhero-title { margin:12px 0 5px; font-size:28px; letter-spacing:-.025em; line-height:1.15; }
  .dshh-seasonhero-sub { margin:0; max-width:620px; font-size:12px; color:#9AA3B2; line-height:1.7; }
  .dshh-seasonhero-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:18px 0 14px; }
  .dshh-seasonhero-stat { display:flex; flex-direction:column; gap:2px; border-left:2px solid rgba(215,255,63,.28); padding-left:10px; }
  .dshh-seasonhero-stat b { font-size:22px; line-height:1.1; color:#F2F4F8; font-variant-numeric:tabular-nums; }
  .dshh-seasonhero-stat span { font-size:10px; color:#8C94A3; }
  .dshh-seasonprogress { position:relative; height:8px; border-radius:999px; background:rgba(255,255,255,.08); margin:8px 0 4px; }
  .dshh-seasonprogress-fill { height:100%; border-radius:999px; background:#D7FF3F; }
  .dshh-seasonprogress-label { position:absolute; right:0; top:-18px; font-size:10px; color:#B6BECC; }
  .dshh-seasonhero-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:18px; }
  .dshh-seasontimeline { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:12px; }
  .dshh-seasontimeline-step { display:flex; flex-direction:column; gap:3px; padding:12px;
    border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:rgba(255,255,255,.025); }
  .dshh-seasontimeline-step[data-reached='true'] { border-color:rgba(215,255,63,.40);
    background:rgba(215,255,63,.07); }
  .dshh-seasontimeline-dot { width:22px; height:22px; border-radius:50%; display:flex; align-items:center;
    justify-content:center; font-size:11px; color:#0B0D12; background:rgba(255,255,255,.14); }
  .dshh-seasontimeline-step[data-reached='true'] .dshh-seasontimeline-dot { background:#D7FF3F; }
  .dshh-seasontimeline-step b { font-size:13px; }
  .dshh-seasontimeline-step small { font-size:10px; color:#8C94A3; }
  .dshh-seasonrules ul { margin:8px 0 0; padding-left:18px; font-size:11.5px;
    color:var(--dsw-alias-label-secondary); line-height:1.8; }
  .dshh-season-empty { padding:22px; }
  .dshh-discover-hero { background:#141821; }
  .dshh-discovertiles { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:14px 0 8px; }
  .dshh-discovertile { display:flex; flex-direction:column; gap:5px; text-align:left; padding:12px;
    border:1px solid var(--dsw-alias-border-l1); border-radius:14px; background:rgba(255,255,255,.025);
    color:var(--dsw-alias-label-primary); text-decoration:none; cursor:pointer; font:inherit; }
  .dshh-discovertile:hover { border-color:rgba(215,255,63,.40); background:rgba(215,255,63,.04); }
  .dshh-discovertile[data-disabled='true'] { opacity:.48; cursor:default; }
  .dshh-discovertile-title { font-size:12px; font-weight:700; }
  .dshh-discovertile-desc { font-size:10.5px; color:var(--dsw-alias-label-secondary); line-height:1.55; }
  .dshh-discovertile-cta { margin-top:auto; padding-top:6px; font-size:10px; font-weight:650; color:var(--dsw-alias-brand-primary); }
  .dshh-discover-note { font-size:10.5px; color:var(--dsw-alias-label-secondary); line-height:1.6; }
  .dshh-root .dshh-tabbar { flex-wrap:wrap; row-gap:4px; }
  @media (max-width:720px) {
    .dshh-seasonhero-stats, .dshh-seasontimeline { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .dshh-discovertiles { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }

  .dshh-archivehub { display:flex; flex-direction:column; gap:14px; }
  .dshh-archivehead { background:#141821; }
  .dshh-archive-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr));
    gap:8px; margin:12px 0; }
  .dshh-archive-stat { display:flex; flex-direction:column; align-items:flex-start; gap:2px;
    text-align:left; border:1px solid var(--dsw-alias-border-l1); border-radius:12px;
    background:rgba(255,255,255,.025); color:var(--dsw-alias-label-primary);
    padding:10px 11px; font:inherit; cursor:pointer; }
  .dshh-archive-stat:hover { border-color:rgba(215,255,63,.35); background:rgba(215,255,63,.04); }
  .dshh-archive-stat b { font-size:20px; line-height:1.1; font-variant-numeric:tabular-nums; }
  .dshh-archive-stat span { font-size:10px; color:var(--dsw-alias-label-secondary); }
  .dshh-archive-actions { display:flex; flex-wrap:wrap; gap:8px; }
  .dshh-archivenav { display:flex; flex-wrap:wrap; gap:8px; padding:4px 0 0;
    border-bottom:1px solid var(--dsw-alias-border-l1); }
  .dshh-archivenav-btn { display:flex; flex-direction:column; align-items:flex-start; gap:1px;
    border:none; background:transparent; color:var(--dsw-alias-label-secondary);
    padding:8px 12px 10px; font:inherit; cursor:pointer; border-bottom:2px solid transparent; }
  .dshh-archivenav-btn span { font-size:13px; font-weight:650; }
  .dshh-archivenav-btn small { font-size:10px; opacity:.75; }
  .dshh-archivenav-btn[data-active='true'] { color:var(--dsw-alias-brand-primary);
    border-bottom-color:var(--dsw-alias-brand-primary); }
  @media (max-width:720px) {
    .dshh-archive-stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }

@keyframes dshhRise {
  from { opacity:0; transform:translateY(8px); }
  to { opacity:1; transform:none; }
}
@media (prefers-reduced-motion: reduce) {
  .dshh-hero { animation:none; }
  .dshh-photo-img { transition:none; }
  .dshh-photo:hover .dshh-photo-img { transform:none; }
  .dshh-seasonbar-fill { transition:none; }
}
`

    function Styles() {
      return h('style', { 'data-dsh-health': 'styles' }, CSS)
    }

    // ---------------------------------------------------------------- helpers
    async function getJSON(url) {
      const response = await fetch(url, { credentials: 'same-origin' })
      return response.json()
    }

    async function postAction(action, args) {
      const response = await fetch(`${API}/action`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, args }),
      })
      return response.json()
    }

    function fmtTime(iso) {
      if (!iso) return ''
      return iso.length >= 16 ? iso.slice(5, 16) : iso.slice(5, 10)
    }

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    /** Date -> value for <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"). */
    function toLocalInput(date = new Date()) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
        + `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    }

    /** datetime-local value -> API timestamp ("YYYY-MM-DD HH:mm"). */
    function toApiTime(local) {
      if (!local) return undefined
      const text = String(local).replace('T', ' ').slice(0, 16)
      return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text) ? text : undefined
    }

    /** Infer the measurement context from the clock time. */
    function inferContext(local) {
      const text = String(local ?? '')
      if (text.length < 16) return 'random'
      const hour = Number(text.slice(11, 13))
      if (!Number.isFinite(hour) || Number.isNaN(hour)) return 'random'
      if (hour >= 5 && hour < 11) return 'morning'
      if (hour >= 19) return 'evening'
      return 'random'
    }

    function formatMetricValue(metric, value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return value.toFixed(metric?.decimals ?? 0)
    }

    /** Up to `max` "name value unit" pairs plus a "等 N 项" tail. */
    function recordValueSummary(values, max = 3) {
      const list = values ?? []
      const shown = list.slice(0, max).map((item) => {
        const unit = item.unit ? ` ${item.unit}` : ''
        return `${item.name} ${item.display}${unit}`
      })
      const rest = list.length - shown.length
      return shown.join('、') + (rest > 0 ? ` 等 ${rest} 项` : '')
    }

    function goalTemplateOf(templates, code) {
      return (templates ?? []).find((item) => item.code === code) ?? null
    }

    /** High-frequency metrics for quick logging (host catalog, else template targets). */
    function quickMetricCodes(template) {
      const codes = template?.quickMetrics
      if (Array.isArray(codes) && codes.length > 0) return codes
      return (template?.targets ?? [])
        .filter((target) => target.kind !== 'trend')
        .slice(0, 4)
        .map((target) => target.metric)
    }

    /** Every metric a goal touches: targets + tracking dimensions + quick fields. */
    function goalMetricCodeSet(goals, templates) {
      const set = new Set()
      for (const goal of goals ?? []) {
        const template = goalTemplateOf(templates, goal.code)
        for (const code of quickMetricCodes(template)) set.add(code)
        for (const target of goal.targets ?? []) set.add(target.metric)
        for (const dimension of goal.dimensions ?? []) {
          for (const metric of dimension.metrics ?? []) set.add(metric.code)
        }
      }
      return set
    }

    // ---------------------------------------------------------------- cut mode helpers

    /** Same-origin read route for one stored photo. */
    function photoUrl(id) {
      return `${API}/photo?id=${encodeURIComponent(id)}`
    }

    function photoKind(photo) {
      return photo?.kind === 'inspiration' ? PHOTO_KINDS.inspiration : PHOTO_KINDS.progress
    }

    /** 'YYYY-MM-DD HH:mm' | 'YYYY-MM-DDTHH:mm' | ISO -> local calendar day. */
    function localDateOf(value) {
      if (!value) return ''
      return String(value).slice(0, 10)
    }

    function todayKey() {
      return toLocalInput().slice(0, 10)
    }

    /** Short day badge for the photo wall ("11-09"). */
    function fmtDay(value) {
      const day = localDateOf(value)
      return day.length >= 10 ? day.slice(5) : day
    }

    function splitPhotos(photos) {
      const progress = []
      const inspiration = []
      for (const photo of photos ?? []) {
        if (photoKind(photo) === PHOTO_KINDS.inspiration) inspiration.push(photo)
        else progress.push(photo)
      }
      return { progress, inspiration }
    }

    /** Today's progress photo (inspiration uploads do not count as the daily shot). */
    function findTodayPhoto(photos) {
      const today = todayKey()
      return (photos ?? []).find((photo) =>
        photoKind(photo) === PHOTO_KINDS.progress && localDateOf(photo.takenAt) === today) ?? null
    }

    /**
     * Consecutive calendar days (ending today, or yesterday when today is empty)
     * that have at least one measurement record or one progress photo.
     */
    function recordStreak({ recent, photos }) {
      const days = new Set()
      for (const record of recent ?? []) {
        const key = localDateOf(record.measuredAt)
        if (key) days.add(key)
      }
      for (const photo of photos ?? []) {
        if (photoKind(photo) !== PHOTO_KINDS.progress) continue
        const key = localDateOf(photo.takenAt)
        if (key) days.add(key)
      }
      if (days.size === 0) return 0
      const keyOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
      const cursor = new Date()
      cursor.setHours(0, 0, 0, 0)
      if (!days.has(keyOf(cursor))) cursor.setDate(cursor.getDate() - 1)
      let streak = 0
      while (days.has(keyOf(cursor))) {
        streak += 1
        cursor.setDate(cursor.getDate() - 1)
      }
      return streak
    }

    /** Distinct training days in the last 7 days (goal dimension first). */
    function goalWeekTrainingDays(goal, recent) {
      const dimension = (goal?.dimensions ?? []).find((item) => item.code === 'training')
      const metric = (dimension?.metrics ?? []).find((item) => item.code === 'training')
      if (metric && typeof metric.days7 === 'number') return metric.days7
      const days = new Set()
      const now = Date.now()
      for (const record of recent ?? []) {
        const at = new Date(String(record.measuredAt).replace(' ', 'T')).getTime()
        if (!Number.isFinite(at)) continue
        if (now - at > 7 * 24 * 60 * 60 * 1000) continue
        const entry = (record.values ?? []).find((item) =>
          item.code === 'training' && Number(item.display) > 0)
        if (entry) days.add(localDateOf(record.measuredAt))
      }
      return days.size
    }

    /** Behaviour-only facts used to pick a coach line (never a body judgement). */
    function coachContext({ goals, photos, recent }) {
      const activeGoals = (goals ?? []).filter((goal) => goal.status === 'active')
      const leanGoal = activeGoals.find((goal) => goal.code === 'lean_muscle') ?? null
      const goal = leanGoal ?? activeGoals[0] ?? null
      const lean = Boolean(leanGoal)
      const today = todayKey()
      const recordToday = (recent ?? []).some((item) => localDateOf(item.measuredAt) === today)
      // Daily photos belong to the physique (lean-muscle) goal only; a metabolic
      // member must not be nudged to photograph their body.
      const photoToday = lean ? Boolean(findTodayPhoto(photos)) : true
      const streak = recordStreak({ recent, photos: lean ? photos : [] })
      const accounts = lean ? leanAccounts(leanGoal) : []
      const accountOf = (code) => accounts.find((account) => account?.code === code) ?? null
      const training = accountOf('training')
      const protein = accountOf('protein')
      const sleep = accountOf('sleep')
      const water = accountOf('water')
      const trainingDays = training?.week?.met
        ?? (goal ? goalWeekTrainingDays(goal, recent) : 0)
      const trainingTarget = Number(
        training?.week?.target
        ?? (goal?.targets ?? []).find((target) => target.metric === 'training')?.days
        ?? 0,
      )
      const proteinLow = lean
        ? Boolean(protein?.today && protein.today.hasRecord && !protein.today.met)
        : Boolean((goal?.targets ?? []).find((target) => target.metric === 'protein')?.status === 'low')
      const accountMet = accounts.filter((account) => account?.today?.met).length
      const accountTotal = accounts.length
      const trainingMet = Boolean(training?.today?.met)
      const proteinMet = Boolean(protein?.today?.met)
      const sleepMet = Boolean(sleep?.today?.met)
      const waterMet = Boolean(water?.today?.met)
      const allDone = lean
        ? recordToday && photoToday && accountTotal > 0 && accountMet === accountTotal
        : recordToday && (trainingTarget === 0 || trainingDays >= trainingTarget) && !proteinLow
      return {
        goal, lean, recordToday, photoToday, trainingDays, trainingTarget,
        proteinLow, proteinMet, sleepMet, waterMet, trainingMet,
        accountMet, accountTotal, streak, allDone,
        season: lean ? seasonMeta(leanGoal) : null,
      }
    }

    /**
     * Tone lines. Hard mode only attacks inaction (deposits / records / photos),
     * never the body, weight or appearance; no extreme diet, dehydration,
     * over-training or supplement advice.
     */
    function coachLines(mode, ctx) {
      if (mode === 'off') return []
      const hard = mode === 'hard'
      const lines = []

      if (ctx.lean) {
        if (!ctx.recordToday && ctx.accountMet === 0) {
          lines.push(hard
            ? '账户今天还是空的。存一笔，哪怕 20 分钟。'
            : '今天还没有存入。先存一笔，哪怕很短。')
          lines.push(hard
            ? '四个账户都空着。先挑一个，存进去再说。'
            : '挑一个账户先记一笔，今天的进展就开始了。')
        }
        if (!ctx.trainingMet) {
          lines.push(hard
            ? `大练今天还没存。本周 ${ctx.trainingDays}/${ctx.trainingTarget || 2} 天，账户不会自己生利息。`
            : `大练今天还空着。本周 ${ctx.trainingDays}/${ctx.trainingTarget || 2} 天，练一次短一点也算存入。`)
        }
        if (ctx.proteinLow || (ctx.accountTotal > 0 && !ctx.proteinMet && ctx.recordToday)) {
          lines.push(hard
            ? '蛋白还没存够。肌肉要的是原料，不是情绪。'
            : '蛋白今天还没到参考区间，下一餐留意一下。')
        }
        if (!ctx.sleepMet && (ctx.recordToday || ctx.accountMet > 0)) {
          lines.push(hard
            ? '睡眠账户是负的。今晚先把它补回来。'
            : '睡眠今天还没入账，今晚早点休息也算一次存入。')
        }
        if (!ctx.waterMet && (ctx.recordToday || ctx.accountMet > 0)) {
          lines.push(hard
            ? '大水还没喝够。先灌一杯，再谈别的。'
            : '大水还没存够，先补一杯水。')
        }
        if (!ctx.photoToday) {
          lines.push(hard
            ? '今天还没拍。给以后留一张证据。'
            : '今天可以拍一张，留作以后对比。')
        }
        if (ctx.streak >= 2) {
          lines.push(hard
            ? `连续 ${ctx.streak} 天。别在第 ${ctx.streak + 1} 天松手。`
            : `连续 ${ctx.streak} 天记录，保持这个节奏。`)
        }
        if (ctx.season?.hasSeason) {
          const checkpoint = (ctx.season.checkpoints ?? []).find((mark) =>
            mark?.reached && Number(mark?.week) === Number(ctx.season.week))
          if (ctx.season.ended) {
            lines.push(hard
              ? '赛季结束了。去结算看看存了多少。'
              : '这个赛季结束了，可以查看结算，再决定要不要开新赛季。')
          } else if (checkpoint) {
            lines.push(hard
              ? `${checkpoint.label ?? `W${checkpoint.week}`} 检查点到了。打开对账单看一眼。`
              : `到 ${checkpoint.label ?? `W${checkpoint.week}`} 检查点了，可以看看本周对账单。`)
          }
        }
        if (ctx.allDone) {
          lines.push(hard
            ? '今天四笔都存进去了。明天照这个来。'
            : '今天四笔都存进去了，保持节奏。')
          lines.push(hard ? '账户有余额了。继续。' : '今天存得挺完整，明天见。')
        }
      } else {
        if (!ctx.recordToday) {
          lines.push(hard
            ? '今天还没有数据。先记一条，再谈别的。'
            : '今天还没有记录。用 30 秒记一条，就能看到今天的进展。')
          lines.push(hard
            ? '记录还是空的。先把今天记下来。'
            : '补一条今天的记录，趋势才接得上。')
        }
        if (ctx.trainingTarget > 0 && ctx.trainingDays < ctx.trainingTarget) {
          lines.push(hard
            ? `本周训练 ${ctx.trainingDays}/${ctx.trainingTarget} 天。今天补一次。`
            : `本周训练 ${ctx.trainingDays}/${ctx.trainingTarget} 天，时间短一点也可以记下来。`)
        }
        if (ctx.proteinLow) {
          lines.push(hard
            ? '蛋白记录还空着。下一餐把它记上。'
            : '今天的蛋白质记录还没到参考区间，下一餐可以留意一下。')
        }
        if (ctx.streak >= 2) {
          lines.push(hard
            ? `连续 ${ctx.streak} 天。今天也别断。`
            : `连续 ${ctx.streak} 天记录，保持这个节奏。`)
        }
        if (ctx.allDone) {
          lines.push(hard ? '今天的指标记录齐了。保持住。' : '今天的记录完成了，保持节奏。')
          lines.push(hard ? '今天没给「明天」留借口。继续。' : '完成得不错，明天见。')
        }
      }

      if (lines.length === 0) {
        lines.push(hard ? '账户不撒谎。今天再存一笔。' : '保持记录，就能看到变化。')
        lines.push(hard ? '今天还没交作业。记一条，再谈别的。' : '记一条数据，今天是新的起点。')
      }
      return lines
    }

    // Tone preference lives in localStorage, keyed per member; storage failures
    // (private mode, stub runtime) fall back to the default without crashing.
    function readTone(memberId) {
      if (!memberId) return 'hard'
      try {
        const stored = window.localStorage?.getItem(TONE_KEY + memberId)
        if (stored === 'hard' || stored === 'gentle' || stored === 'off') return stored
      } catch (error) {
        // ignore: storage unavailable
      }
      return 'hard'
    }

    function writeTone(memberId, mode) {
      if (!memberId) return
      try {
        window.localStorage?.setItem(TONE_KEY + memberId, mode)
      } catch (error) {
        // ignore: storage unavailable
      }
    }

    function readToneSeen(memberId) {      if (!memberId) return false
      try {
        return window.localStorage?.getItem(TONE_SEEN_KEY + memberId) === '1'
      } catch (error) {
        return false
      }
    }

    function writeToneSeen(memberId) {
      if (!memberId) return
      try {
        window.localStorage?.setItem(TONE_SEEN_KEY + memberId, '1')
      } catch (error) {
        // ignore: storage unavailable
      }
    }

    // Remember the last selected member so a refresh does not jump back to the
    // first tab (family members care that the dashboard stays on their profile).
    // v2 intentionally ignores old selections and opens on "我" by default.
    const SELECTED_MEMBER_KEY = 'dsh-health.selectedMember.v2'

    function readSelectedMember() {
      try {
        return window.localStorage?.getItem(SELECTED_MEMBER_KEY) || null
      } catch {
        return null
      }
    }

    function writeSelectedMember(memberId) {
      try {
        if (memberId) window.localStorage?.setItem(SELECTED_MEMBER_KEY, memberId)
        else window.localStorage?.removeItem(SELECTED_MEMBER_KEY)
      } catch {
        // ignore: storage unavailable
      }
    }

    function pickDefaultMember(members) {
      const list = members ?? []
      return list.find((item) => item.name === '我')
        ?? list.find((item) => item.relation === 'self')
        ?? list[0]
        ?? null
    }

    // ---------------------------------------------------------------- preview: squad / places

    const SQUAD_MEMBERSHIP_KEY = 'dsh-health.squad.v1'
    const PLACE_FAVORITES_KEY = 'dsh-health.places.v1'
    const SQUAD_ACCOUNTS = [
      { code: 'training', name: '大练' },
      { code: 'protein', name: '蛋白' },
      { code: 'sleep', name: '大睡' },
      { code: 'water', name: '大水' },
    ]

    function readLocalJSON(key, fallback) {
      try {
        const raw = window.localStorage?.getItem(key)
        return raw ? JSON.parse(raw) : fallback
      } catch {
        return fallback
      }
    }

    function writeLocalJSON(key, value) {
      try {
        if (value === null || value === undefined) window.localStorage?.removeItem(key)
        else window.localStorage?.setItem(key, JSON.stringify(value))
      } catch {
        // ignore: storage unavailable
      }
    }

    /** Aggregate behaviour snapshot only; never body-composition or notes. */
    function squadSnapshot(goal, { recent = [], photos = [] } = {}) {
      const season = seasonMeta(goal)
      const deposits = { training: 0, protein: 0, sleep: 0, water: 0 }
      for (const account of leanAccounts(goal)) {
        const code = SQUAD_ACCOUNTS.some((item) => item.code === account?.metric)
          ? account.metric
          : account?.code
        if (!(code in deposits)) continue
        const met = Number(account?.week?.met)
        deposits[code] = Math.max(0, Math.min(7, Number.isFinite(met) ? met : 0))
      }
      return {
        seasonId: String(goal?.season?.id ?? goal?.season?.startedAt ?? 'local').slice(0, 64),
        seasonNumber: Number(season.no) || 1,
        week: Math.max(1, Math.min(12, Number(season.week) || 1)),
        deposits,
        streak: recordStreak({ recent, photos }),
      }
    }

    function shareAliasOf(member) {
      return member?.relation === 'self' ? '我' : '家人'
    }

    function mapSearchUrl(provider, keyword) {
      const query = encodeURIComponent(keyword)
      if (provider === 'baidu') return `https://map.baidu.com/search?query=${query}`
      if (provider === 'google') return `https://www.google.com/maps/search/?api=1&query=${query}`
      return `https://uri.amap.com/search?keyword=${query}&callnative=1`
    }

    // ---------------------------------------------------------------- lean accounts

    const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

    // Fallbacks cover the window where the host has not returned the new
    // lean_muscle payload yet; the page must render without crashing.
    const LEAN_ACCOUNT_FALLBACKS = [
      { code: 'training', name: '大练', role: '本金', metric: 'training', unit: 'min',
        kind: 'weeklyDays', targetDisplay: '近 7 天 ≥ 2 天' },
      { code: 'protein', name: '蛋白', role: '原料', metric: 'protein', unit: 'g',
        kind: 'perKg', targetDisplay: '按体重换算（待补体重）' },
      { code: 'sleep', name: '大睡', role: '修复', metric: 'sleep', unit: 'h',
        kind: 'range', targetDisplay: '目标 7–9 h' },
      { code: 'water', name: '大水', role: '基础', metric: 'water', unit: 'ml',
        kind: 'range', targetDisplay: '目标 ≥1500 ml' },
    ]

    const LEAN_BODY_NOTE = '体成分受设备、饮水、进食等影响，变化仅供记录参考，不构成效果承诺；建议固定设备、固定时间比较。'
    const LEAN_DISCLAIMER = '本工具仅用于记录和展示你自行测量的健康数据，并基于数据做统计性描述。所有内容不构成医疗诊断、治疗建议或用药指导。参考区间为人群通用参考值，不代表个人目标值。薄肌等体态目标的参考区间来自运动/营养公开共识，非医学标准，不构成训练、营养或用药处方。请以医生的实际诊断和处方为准。'

    const LEAN_SOURCES = [
      { label: '17173：学会过日子的年轻人，终于读懂薄肌理论和大水理论',
        url: 'https://news.17173.com/content/10212026/093409961.shtml' },
      { label: '投资界 / 远川研究所：我熟读薄肌圣经',
        url: 'https://news.pedaily.cn/202611/571297.shtml' },
      { label: 'ChainCatcher：孙宇晨最新访谈',
        url: 'https://www.chaincatcher.com/zh-tw/article/2295496' },
      { label: 'Bitpush：孙宇晨 × 邵艾伦 4 小时对谈精编',
        url: 'https://www.bitpush.news/zh/articles/7689715' },
      { label: '知乎：全网都在追捧的「薄肌」，但很多人第一步就练错了',
        url: 'https://zhuanlan.zhihu.com/p/2098364676681871685' },
      { label: '科普中国：「薄肌」火遍全网！普通人该如何锻炼？',
        url: 'https://cloud.kepuchina.cn/h5/detail?id=7515497458667225088' },
    ]

    function leanGoalOf(goals) {
      return (goals ?? []).find((goal) => goal && goal.code === 'lean_muscle') ?? null
    }

    function leanActiveGoalOf(goals) {
      return (goals ?? []).find((goal) =>
        goal && goal.code === 'lean_muscle' && goal.status === 'active') ?? null
    }

    /** The four accounts, normalised against the PRD defaults. */
    function leanAccounts(goal) {
      const list = Array.isArray(goal?.accounts) ? goal.accounts.filter(Boolean) : []
      if (list.length > 0) {
        return list.map((account) => {
          const fallback = LEAN_ACCOUNT_FALLBACKS.find((item) =>
            item.code === account.code || item.metric === account.metric) ?? {}
          return { ...fallback, ...account }
        })
      }
      return LEAN_ACCOUNT_FALLBACKS.map((account) => {
        const target = (goal?.targets ?? []).find((item) => item.metric === account.metric)
        return {
          ...account,
          targetDisplay: target?.targetDisplay ?? account.targetDisplay,
          today: null,
          week: null,
          season: null,
        }
      })
    }

    /** Seven empty placeholder days ending today (no server data yet). */
    function leanPlaceholderDays() {
      const out = []
      const cursor = new Date()
      cursor.setHours(0, 0, 0, 0)
      for (let i = 6; i >= 0; i -= 1) {
        const date = new Date(cursor)
        date.setDate(cursor.getDate() - i)
        const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
        out.push({ date: key, weekday: WEEKDAY_LABELS[date.getDay()],
          value: 0, display: null, met: false, hasRecord: false })
      }
      return out
    }

    function leanWeekdayOf(dateKey) {
      const date = new Date(`${String(dateKey).slice(0, 10)}T00:00:00`)
      if (Number.isNaN(date.getTime())) return ''
      return WEEKDAY_LABELS[date.getDay()]
    }

    /** Ledger columns: prefer a full 7-day row, else seven placeholders. */
    function leanWeekColumns(accounts) {
      const full = (accounts ?? []).find((account) => {
        const days = account?.week?.days
        return Array.isArray(days) && days.length === 7
      })
      const days = full?.week?.days ?? []
      if (days.length === 7) {
        return days.map((day) => ({
          date: localDateOf(day?.date),
          weekday: day?.weekday ?? leanWeekdayOf(day?.date),
        }))
      }
      return leanPlaceholderDays().map((day) => ({ date: day.date, weekday: day.weekday }))
    }

    function leanDayOf(account, date) {
      const days = account?.week?.days
      if (!Array.isArray(days) || days.length === 0) return null
      return days.find((day) => localDateOf(day?.date) === date) ?? null
    }

    function leanWeeklyTotals(goal, accounts) {
      const weekly = goal?.weekly ?? {}
      let deposits = typeof weekly.deposits === 'number' ? weekly.deposits : null
      let max = typeof weekly.max === 'number' ? weekly.max : null
      if (deposits === null || max === null) {
        let sum = 0
        let capacity = 0
        for (const account of accounts ?? []) {
          const week = account?.week
          if (typeof week?.met === 'number') sum += week.met
          capacity += typeof week?.max === 'number' ? week.max : 7
        }
        if (deposits === null) deposits = sum
        if (max === null) max = capacity || (accounts?.length ?? 0) * 7 || 28
      }
      return {
        start: weekly.start ?? null,
        end: weekly.end ?? null,
        deposits,
        max,
        photoDays: typeof weekly.photoDays === 'number' ? weekly.photoDays : 0,
        recordDays: typeof weekly.recordDays === 'number' ? weekly.recordDays : 0,
      }
    }

    /** Season fields with local fallbacks when the host lags behind. */
    function seasonMeta(goal) {
      const season = goal?.season ?? null
      const weeks = Number(season?.weeks ?? 12) || 12
      const week = Number(season?.week ?? 0) || 0
      const progress = typeof season?.progress === 'number'
        ? season.progress
        : Math.min(1, Math.max(0, week / weeks))
      const checkpoints = Array.isArray(season?.checkpoints) && season.checkpoints.length > 0
        ? season.checkpoints
        : [4, 8, 12].map((mark) => ({ week: mark, label: `W${mark}`, reached: week >= mark }))
      return {
        hasSeason: Boolean(season),
        no: season?.no ?? 1,
        weeks,
        week,
        day: season?.day ?? 0,
        days: season?.days ?? weeks * 7,
        daysLeft: season?.daysLeft ?? null,
        progress: Math.min(1, Math.max(0, progress)),
        startedAt: season?.startedAt ?? null,
        endsAt: season?.endsAt ?? null,
        ended: Boolean(season?.ended),
        label: season?.label
          ?? (week > 0 ? `第 ${season?.no ?? 1} 赛季 · 第 ${Math.min(week, weeks)} 周 / ${weeks} 周` : ''),
        checkpoints,
      }
    }

    /** Body-composition rows: observed only, never scored. */
    function observeTargets(goal) {
      return (goal?.targets ?? []).filter((target) =>
        target && (target.kind === 'observe' || target.status === 'observe'))
    }

    function observeDeltaText(target) {
      if (target?.deltaDisplay) return target.deltaDisplay
      const delta = target?.deltaSinceBaseline
      if (typeof delta !== 'number' || !Number.isFinite(delta)) return '—'
      const sign = delta > 0 ? '+' : ''
      const unit = target?.unit ? ` ${target.unit}` : ''
      return `${sign}${fmtNumber(delta, 1)}${unit}`
    }

    function fmtNumber(value, digits = 1) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      const factor = 10 ** digits
      return String(Math.round(value * factor) / factor)
    }

    function fmtPercent(rate) {
      if (typeof rate !== 'number' || !Number.isFinite(rate)) return '—'
      return `${Math.round(rate * 100)}%`
    }

    /** First / latest progress photo inside the current season (sorted by date). */
    function leanSeasonPhotos(season, photos) {
      const start = season?.startedAt ? localDateOf(season.startedAt) : ''
      const list = splitPhotos(photos).progress
        .filter((photo) => !start || localDateOf(photo.takenAt) >= start)
        .slice()
        .sort((a, b) => String(a.takenAt ?? '').localeCompare(String(b.takenAt ?? '')))
      const first = list[0] ?? null
      const latest = list[list.length - 1] ?? null
      return {
        first,
        latest,
        count: list.length,
        pair: Boolean(first && latest && first.id !== latest.id),
      }
    }

    /** Clipboard with a hidden-textarea fallback for older webviews. */
    async function leanCopyText(text) {
      const value = String(text ?? '')
      // Run the synchronous textarea path first so the user activation from
      // the click is still alive. Clipboard API failures often arrive after
      // activation has expired, which made the old fallback unreliable.
      try {
        const area = document.createElement('textarea')
        area.value = value
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.top = '-1000px'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.focus()
        area.select()
        const ok = typeof document.execCommand === 'function'
          ? document.execCommand('copy')
          : false
        document.body.removeChild(area)
        if (ok) return true
      } catch (error) {
        // fall through
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value)
          return true
        }
      } catch (error) {
        // fall through
      }
      return false
    }

    /** Copy an ASCII invite code through the Host clipboard first. */
    async function copyInviteCode(code) {
      const text = String(code ?? '')
      if (!text) return false
      // On the local Windows preview the Host bridge is the reliable path:
      // the embedded WebView may block navigator.clipboard entirely.
      try {
        const response = await fetch(`${API}/clipboard`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const body = await response.json().catch(() => ({}))
        if (body?.ok) return true
      } catch {
        // fall through to the browser paths
      }
      return leanCopyText(text)
    }

    function weeklyReviewText({ memberName, goal, accounts, totals }) {
      const season = seasonMeta(goal)
      const lines = ['薄肌账户 · 本周对账单']
      if (memberName) lines.push(`成员：${memberName}`)
      if (season.label) lines.push(season.label)
      if (totals.start || totals.end) {
        lines.push(`近 7 天：${totals.start ?? '—'} 至 ${totals.end ?? '—'}`)
      }
      lines.push(`已存入：${totals.deposits}/${totals.max} 笔 · 完成度 ${fmtPercent(
        totals.max > 0 ? totals.deposits / totals.max : null)}`)
      for (const account of accounts) {
        const week = account?.week ?? {}
        const label = week.label ?? `${week.met ?? 0}/${week.max ?? 7} 天`
        lines.push(`${account?.name ?? account?.metric ?? '账户'}：${label}`)
      }
      lines.push(`照片天数：${totals.photoDays} 天 · 记录天数：${totals.recordDays} 天`)
      lines.push('说明：以上只是记录统计；参考区间非医学标准，不构成训练、营养或用药处方。')
      return lines.join('\n')
    }

    /** Season review payload, derived from accounts/targets when absent. */
    function seasonReviewModel(goal) {
      const season = seasonMeta(goal)
      const accounts = leanAccounts(goal)
      const review = goal?.seasonReview ?? null
      const byAccount = Array.isArray(review?.byAccount) && review.byAccount.length > 0
        ? review.byAccount
        : accounts.map((account) => {
            const stat = account?.season ?? {}
            return {
              code: account?.code,
              name: account?.name ?? account?.metric ?? '账户',
              deposits: stat.deposits ?? 0,
              max: stat.max ?? 0,
              rate: stat.rate ?? null,
              label: stat.label ?? `${stat.deposits ?? 0}/${stat.max ?? 0} 笔`,
            }
          })
      const body = Array.isArray(review?.body) && review.body.length > 0
        ? review.body
        : observeTargets(goal).map((target) => ({
            metric: target.metric,
            name: target.name,
            unit: target.unit,
            baseline: target.baseline?.value ?? null,
            baselineAt: target.baseline?.measuredAt ?? null,
            latest: null,
            latestAt: target.measuredAt ?? null,
            delta: typeof target.deltaSinceBaseline === 'number' ? target.deltaSinceBaseline : null,
            deltaDisplay: target.deltaDisplay ?? null,
            band: target.band ?? null,
            currentDisplay: target.currentDisplay ?? null,
          }))
      const deposits = typeof review?.deposits === 'number'
        ? review.deposits
        : byAccount.reduce((sum, item) => sum + (Number(item?.deposits) || 0), 0)
      const max = typeof review?.max === 'number'
        ? review.max
        : byAccount.reduce((sum, item) => sum + (Number(item?.max) || 0), 0)
      return {
        ended: review?.ended ?? season.ended,
        week: review?.week ?? season.week,
        weeks: review?.weeks ?? season.weeks,
        days: review?.days ?? season.day,
        deposits,
        max,
        rate: typeof review?.rate === 'number'
          ? review.rate
          : (max > 0 ? deposits / max : null),
        byAccount,
        trainingDays: typeof review?.trainingDays === 'number' ? review.trainingDays : null,
        trainingTarget: typeof review?.trainingTarget === 'number' ? review.trainingTarget : null,
        photoCount: typeof review?.photoCount === 'number' ? review.photoCount : 0,
        photoDays: typeof review?.photoDays === 'number' ? review.photoDays : 0,
        recordDays: typeof review?.recordDays === 'number' ? review.recordDays : 0,
        body,
        note: review?.note ?? LEAN_BODY_NOTE,
      }
    }

    function seasonReviewText({ memberName, review }) {
      const lines = [`薄肌账户 · ${review.ended ? '赛季结算' : '赛季预览'}`]
      if (memberName) lines.push(`成员：${memberName}`)
      lines.push(`赛季：第 ${review.week}/${review.weeks} 周 · 已过 ${review.days} 天`)
      lines.push(`累计存入：${review.deposits} 笔（截至第 ${review.week} 周）`)
      for (const item of review.byAccount ?? []) {
        const label = `${item?.deposits ?? 0} 笔`
        lines.push(`${item?.name ?? '账户'}：${label}`)
      }
      if (review.trainingDays != null) {
        lines.push(`训练天数：${review.trainingDays} 天`
          + (review.trainingTarget != null ? `（赛季目标 ${review.trainingTarget} 天）` : ''))
      }
      lines.push(`照片：${review.photoCount} 张 · 覆盖 ${review.photoDays} 天 · 记录天数：${review.recordDays} 天`)
      for (const row of review.body ?? []) {
        const unit = row?.unit ? ` ${row.unit}` : ''
        const base = row?.baseline == null ? '—' : `${row.baseline}${unit}`
        const latestValue = row?.latest ?? row?.currentDisplay
        const latest = latestValue == null ? '—' : `${latestValue}${unit}`
        const delta = row?.deltaDisplay
          ?? observeDeltaText({ deltaSinceBaseline: row?.delta, unit: row?.unit })
        lines.push(`${row?.name ?? '体成分'}：${base} → ${latest}（${delta}）`)
      }
      lines.push(`说明：${review.note}`)
      lines.push(LEAN_DISCLAIMER)
      return lines.join('\n')
    }

    /** File -> ImageBitmap/Image, honouring EXIF orientation when supported. */
    async function loadPhotoSource(file) {
      if (typeof createImageBitmap === 'function') {
        try {
          return await createImageBitmap(file, { imageOrientation: 'from-image' })
        } catch (error) {
          // fall back to an <img> decode below
        }
      }
      const dataUrl = await readFileAsBase64(file)
      return await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('图片读取失败'))
        image.src = dataUrl
      })
    }

    /** Downscale to a 1400px longest edge and re-encode as JPEG 0.82. */
    async function compressPhoto(file) {
      if (!file) throw new Error('没有选择图片文件')
      if (!/^image\//.test(String(file.type ?? ''))) throw new Error('只支持图片文件（JPEG / PNG / WebP）')
      const source = await loadPhotoSource(file)
      const width = source.width ?? source.naturalWidth ?? 0
      const height = source.height ?? source.naturalHeight ?? 0
      if (!width || !height) throw new Error('无法读取图片尺寸')
      const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前浏览器不支持图片压缩')
      context.imageSmoothingQuality = 'high'
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      if (typeof source.close === 'function') source.close()
      return canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
    }

    // ---------------------------------------------------------------- chart

    /** Catmull-Rom -> cubic Bezier smooth path through the given points. */
    function smoothPath(pts) {
      if (pts.length < 2) return ''
      let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p0 = pts[Math.max(0, i - 1)]
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const p3 = pts[Math.min(pts.length - 1, i + 2)]
        const c1x = p1.x + (p2.x - p0.x) / 6
        const c1y = p1.y + (p2.y - p0.y) / 6
        const c2x = p2.x - (p3.x - p1.x) / 6
        const c2y = p2.y - (p3.y - p1.y) / 6
        d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
      }
      return d
    }

    /**
     * A polished multi-series line chart with reference band, smooth curves,
     * area fill (single series), hover crosshair and tooltip.
     *
     * @param {Array<{ code: string, name: string, unit: string, points: Array<{at:string,value:number}> }>} seriesList
     * @param {{ low?: number, high?: number, label?: string }} band
     */
    function LineChart({ seriesList, band, onClick }) {
      const wrapRef = useRef(null)
      const [hover, setHover] = useState(null)

      const W = 720
      const H = 220
      const padL = 42
      const padR = 12
      const padT = 14
      const padB = 24
      const innerW = W - padL - padR
      const innerH = H - padT - padB

      const model = useMemo(() => {
        const active = seriesList.filter((s) => s.points.length > 0)
        if (active.length === 0) return null
        const allVals = []
        active.forEach((s) => s.points.forEach((p) => allVals.push(p.value)))
        if (typeof band.low === 'number') allVals.push(band.low)
        if (typeof band.high === 'number') allVals.push(band.high)
        let min = Math.min(...allVals)
        let max = Math.max(...allVals)
        if (min === max) { min -= 1; max += 1 }
        const span = max - min
        min -= span * 0.08
        max += span * 0.08
        const y = (v) => padT + innerH - ((v - min) / (max - min)) * innerH
        // Shared x domain across series (they share timestamps in practice).
        const allTimes = []
        active.forEach((s) => s.points.forEach((p) => allTimes.push(p.at)))
        const tMin = allTimes[0]
        const tMax = allTimes[allTimes.length - 1]
        const x = (at) => {
          if (tMin === tMax) return padL + innerW / 2
          const t = new Date(at.replace(' ', 'T')).getTime()
          const t0 = new Date(tMin.replace(' ', 'T')).getTime()
          const t1 = new Date(tMax.replace(' ', 'T')).getTime()
          return padL + ((t - t0) / (t1 - t0)) * innerW
        }
        const lines = active.map((s, idx) => ({
          ...s,
          color: SERIES_COLORS[idx % SERIES_COLORS.length],
          pts: s.points.map((p) => ({ x: x(p.at), y: y(p.value), at: p.at, value: p.value })),
        }))
        const bandTop = typeof band.high === 'number' ? y(band.high) : undefined
        const bandBottom = typeof band.low === 'number' ? y(band.low) : undefined
        const ticks = 4
        const tickVals = []
        for (let i = 0; i <= ticks; i += 1) {
          tickVals.push(min + ((max - min) / ticks) * i)
        }
        return { active, lines, y, x, bandTop, bandBottom, tickVals, tMin, tMax, padL, padR, padT, padB, innerW, innerH, W, H }
      }, [seriesList, band])

      function onMove(event) {
        if (!model) return
        const rect = wrapRef.current.getBoundingClientRect()
        const px = ((event.clientX - rect.left) / rect.width) * model.W
        const gx = Math.min(Math.max(px, model.padL), model.padL + model.innerW)
        // Find nearest sample index on the first series' time axis.
        let nearest = null
        let bestDist = Infinity
        for (const line of model.lines) {
          for (const p of line.pts) {
            const dist = Math.abs(p.x - gx)
            if (dist < bestDist) { bestDist = dist; nearest = { line, p } }
          }
        }
        if (!nearest) return
        // Collect values at the same timestamp across all lines.
        const at = nearest.p.at
        const rows = model.lines.map((line) => {
          const pt = line.pts.find((p) => p.at === at)
          return pt ? { name: line.name, unit: line.unit, value: pt.value, color: line.color, x: pt.x, y: pt.y } : null
        }).filter(Boolean)
        setHover({ at, rows, gx, gy: nearest.p.y })
      }

      if (!model) {
        return h('div', { className: 'dshh-empty', style: { padding: '18px' } }, '暂无数据')
      }

      const tickFmt = (v) => {
        const abs = Math.abs(v)
        if (abs >= 100) return v.toFixed(0)
        return v.toFixed(1)
      }

      return h(
        'div',
        { className: 'dshh-chart-wrap', ref: wrapRef, onMouseMove: onMove, onMouseLeave: () => setHover(null),
          onClick: onClick ? () => onClick() : undefined, style: onClick ? { cursor: 'pointer' } : undefined },
        h(
          'svg',
          { viewBox: `0 0 ${model.W} ${model.H}`, width: '100%', preserveAspectRatio: 'none', role: 'img' },
          // grid + y ticks
          model.tickVals.map((tv, i) =>
            h(
              'g',
              { key: `t${i}` },
              h('line', { x1: model.padL, x2: model.W - model.padR, y1: model.y(tv), y2: model.y(tv),
                stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 1, strokeDasharray: i === 0 ? undefined : '2 5' }),
              h('text', { x: model.padL - 7, y: model.y(tv) + 3.5, textAnchor: 'end', fontSize: 10.5,
                fill: 'var(--dsw-alias-label-secondary)', fontWeight: 500 }, tickFmt(tv)),
            ),
          ),
          // reference band
          (model.bandTop !== undefined || model.bandBottom !== undefined) &&
            h('rect', {
              x: model.padL,
              y: model.bandTop ?? model.padT,
              width: model.innerW,
              height: Math.max(0, (model.bandBottom ?? (model.padT + model.innerH)) - (model.bandTop ?? model.padT)),
              fill: 'var(--dsw-alias-state-success-primary)',
              opacity: 0.07,
            }),
          // lines + area
          model.lines.map((line) => {
            const single = model.lines.length === 1
            const area = single && line.pts.length > 1
              ? `${smoothPath(line.pts)} L${line.pts[line.pts.length - 1].x},${model.padT + model.innerH} L${line.pts[0].x},${model.padT + model.innerH} Z`
              : null
            return h(
              'g',
              { key: line.code },
              area && h(
                'path',
                { d: area, fill: line.color, opacity: 0.09, stroke: 'none' },
              ),
              h('path', {
                d: smoothPath(line.pts), fill: 'none', stroke: line.color, strokeWidth: 2.6,
                strokeLinejoin: 'round', strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke',
              }),
              line.pts.map((p, i) =>
                h('circle', { key: `p${i}`, cx: p.x, cy: p.y, r: 2.8, fill: line.color,
                  stroke: 'var(--dsw-alias-bg-layer-1)', strokeWidth: 1 }),
              ),
            )
          }),
          // crosshair
          hover && h(
            'line',
            { x1: hover.gx, x2: hover.gx, y1: model.padT, y2: model.padT + model.innerH,
              stroke: 'var(--dsw-alias-label-secondary)', strokeWidth: 1, strokeDasharray: '3 3' },
          ),
          hover && hover.rows.map((r) =>
            h('circle', { key: r.name, cx: r.x, cy: r.y, r: 4.2, fill: 'none', stroke: r.color, strokeWidth: 1.8 }),
          ),
          // x-axis labels
          h('text', { x: model.padL, y: model.H - 8, fontSize: 10.5, fontWeight: 500,
            fill: 'var(--dsw-alias-label-secondary)' }, fmtTime(model.tMin)),
          h('text', { x: model.W - model.padR, y: model.H - 8, textAnchor: 'end', fontSize: 10.5, fontWeight: 500,
            fill: 'var(--dsw-alias-label-secondary)' }, fmtTime(model.tMax)),
        ),
        hover && h(
          'div',
          {
            className: 'dshh-chart-tooltip',
            style: {
              left: `${Math.min((hover.gx / model.W) * 100, 76)}%`,
              top: '8px',
            },
          },
          h('div', { style: { fontWeight: 600, marginBottom: 4 } }, hover.at),
          hover.rows.map((r) =>
            h(
              'div',
              { key: r.name, className: 'dshh-chart-tooltip-row' },
              h('span', { className: 'dshh-chart-swatch', style: { background: r.color } }),
              `${r.name} ${r.value}${r.unit}`,
            ),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------- icon
    function HealthIcon() {
      return h(
        'svg',
        { viewBox: '0 0 64 64', width: 20, height: 20, 'aria-hidden': true },
        h('path', { d: 'M6 34h10l5-13 7 26 7-20 5 7h18', fill: 'none', stroke: 'currentColor',
          strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    // ---------------------------------------------------------------- modal frame

    /**
     * Shared modal shell: overlay/Esc close, focus the first control on open.
     * All panel modals go through this so their close behaviour stays uniform.
     */
    function ModalFrame({ title, onClose, children, footer, wide }) {
      const boxRef = useRef(null)

      useEffect(() => {
        function onKeyDown(event) {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [onClose])

      useEffect(() => {
        const first = boxRef.current?.querySelector('input, select, textarea, button')
        if (first && typeof first.focus === 'function') first.focus()
      }, [])

      return h(
        'div',
        { className: 'dshh-modal-mask', onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() } },
        h(
          'div',
          { className: wide ? 'dshh-modal dshh-modal-wide' : 'dshh-modal', ref: boxRef,
            role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          h('h2', { className: 'dshh-modal-title' }, title),
          ...(Array.isArray(children) ? children : [children]),
          footer,
        ),
      )
    }

    // ---------------------------------------------------------------- panel
    class PaneBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        try {
          window.__dshHealthLastError = {
            message: String(error?.message ?? error),
            stack: String(error?.stack ?? ''),
            componentStack: String(info?.componentStack ?? ''),
          }
        } catch {
          // ignore
        }
        console.error('[dsh-health] pane error', error, info)
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'dshh-root' }, h(Styles),
            h('div', { className: 'dshh-body' },
              h('div', { className: 'dshh-card dshh-empty' },
                h('div', { className: 'dshh-empty-title' }, '这个页面加载失败'),
                h('div', { className: 'dshh-muted dshh-small' },
                  String(this.state.error?.message ?? this.state.error)),
                h('div', { className: 'dshh-modal-actions' },
                  h('button', {
                    type: 'button', className: 'dshh-btn dshh-btn-primary',
                    onClick: this.props.onReset,
                  }, '返回概览')))))
        }
        return this.props.children
      }
    }

    function HealthPanel() {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [selectedId, setSelectedId] = useState(() => readSelectedMember())
      const [busy, setBusy] = useState(false)
      const [modal, setModal] = useState(null) // null | {kind, ...}
      const [tab, setTab] = useState('overview')
      const [archiveSection, setArchiveSection] = useState('trends')
      const [toast, setToast] = useState(null)
      const toastTimer = useRef(null)

      const showToast = useCallback((text) => {
        setToast(String(text ?? ''))
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
      }, [])

      useEffect(() => () => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
      }, [])

      const load = useCallback(async () => {
        try {
          const query = selectedId ? `?member=${encodeURIComponent(selectedId)}` : ''
          const body = await getJSON(`${API}/overview${query}`)
          if (!body.ok) { setError(body.error ?? '读取失败'); return }
          setError(null)
          setData(body)
          // A member deleted elsewhere (or a stale stored selection) resolves to
          // null; drop the selection so the panel falls back to the first member.
          if (selectedId && !(body.members ?? []).some((item) => item.id === selectedId)) {
            writeSelectedMember(null)
            setSelectedId(null)
          } else if (!body.member && selectedId) {
            setSelectedId(null)
          }
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        }
      }, [selectedId])

      useEffect(() => {
        load()
        const timer = setInterval(load, 8000)
        return () => clearInterval(timer)
      }, [load])

      // Default to "我" (or the self member). Never auto-jump to another member
      // just because that member has a goal; other members only appear when the
      // user has actually added them.
      useEffect(() => {
        if (selectedId) return
        const preferred = pickDefaultMember(data?.members)
        if (!preferred) return
        setSelectedId(preferred.id)
        writeSelectedMember(preferred.id)
      }, [data, selectedId])

      const run = useCallback(async (action, args) => {
        setBusy(true)
        try {
          const result = await postAction(action, args)
          if (!result.ok) return result
          await load()
          return result
        } finally {
          setBusy(false)
        }
      }, [load])

      if (error) {
        return h('div', { className: 'dshh-root' }, h(Styles),
          h('div', { className: 'dshh-body' },
            h('div', { className: 'dshh-card dshh-empty' },
              h('div', { className: 'dshh-empty-title' }, '读取健康数据失败'),
              h('div', { className: 'dshh-empty-desc' }, error),
              h('div', { className: 'dshh-empty-actions' },
                h('button', { type: 'button', className: 'dshh-btn', onClick: () => load() }, '重试')),
            ),
          ),
        )
      }
      if (!data) {
        return h('div', { className: 'dshh-root' }, h(Styles),
          h('div', { className: 'dshh-body' },
            h('div', { className: 'dshh-empty' }, '加载中…')))
      }

      const members = data.members ?? []
      const member = data.member ?? null
      const catalogs = data.catalogs ?? {}
      const goals = data.goals ?? []
      const templates = data.goalTemplates ?? []
      const contexts = (catalogs.contexts ?? []).length > 0 ? catalogs.contexts : CONTEXT_FALLBACK
      const photos = data.photos ?? []
      const photoError = data.photoError ?? null

      // Empty state: no members at all.
      if (members.length === 0) {
        return h(
          'div',
          { className: 'dshh-root' },
          h(Styles),
          h('div', { className: 'dshh-topbar' },
            h('div', { className: 'dshh-toprow' },
              h('div', { className: 'dshh-brand' },
                h('h1', { className: 'dshh-title' }, '健康管理'),
                h('div', { className: 'dshh-sub' }, '家庭成员 · 健康指标 · 管理目标'),
              ),
            ),
          ),
          h('div', { className: 'dshh-body' },
            h('div', { className: 'dshh-card dshh-empty' },
              h('div', { className: 'dshh-empty-icon' }, '🏠'),
              h('div', { className: 'dshh-empty-title' }, '开始管理家人的健康'),
              h('div', { className: 'dshh-empty-desc' },
                '添加家庭成员后，即可记录血压、血糖、血脂等指标，查看趋势和管理目标差距，并归档病历与检验报告。'),
              h('div', { className: 'dshh-empty-actions' },
                h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
                  onClick: () => setModal({ kind: 'member', member: null }) }, '＋ 添加成员')),
            ),
            h(FooterNote, { text: data.disclaimer, onOpen: () => setModal({ kind: 'disclaimer' }) }),
          ),
          modal && h(ModalHost, {
            modal, data, catalogs, busy, run, onClose: () => setModal(null),
            onOpenMember: (target) => setModal({ kind: 'member', member: target ?? null }),
            onToast: showToast,
            onDeleteMember: (name, cascade) => run('deleteMember', { member: name, cascade }),
          }),
        )
      }

      if (!member) {
        return h('div', { className: 'dshh-root' }, h(Styles),
          h('div', { className: 'dshh-body' },
            h('div', { className: 'dshh-empty' }, '暂无成员数据，请刷新重试。')))
      }

      const goalCodes = goalMetricCodeSet(goals, templates)

      async function removeCondition(code) {
        const result = await run('removeCondition', { member: member.name, code })
        showToast(result?.ok ? '已移除疾病标签' : (result?.error ?? '移除失败'))
      }

      async function addCondition(code) {
        const result = await run('addCondition', { member: member.name, code, source: 'recognized' })
        showToast(result?.ok ? '已添加疾病标签' : (result?.error ?? '添加失败'))
      }

      async function removeDocument(id) {
        const result = await run('removeDocument', { member: member.name, id })
        showToast(result?.ok ? '已删除档案' : (result?.error ?? '删除失败'))
      }

      async function deleteRecord(id) {
        const result = await run('deleteRecord', { id })
        showToast(result?.ok ? '已删除这条记录' : (result?.error ?? '删除失败'))
      }

      async function deleteMember(name, cascade) {
        const result = await run('deleteMember', { member: name, cascade })
        if (result?.ok && name === member.name) {
          setSelectedId(null)
          writeSelectedMember(null)
        }
        return result
      }

      async function removePhoto(photo) {
        const result = await run('removePhoto', { member: member.name, id: photo.id })
        showToast(result?.ok ? '照片已删除' : (result?.error ?? '删除失败'))
      }

      const openEntry = () => setModal({ kind: 'entry' })
      const openPhotoCapture = (photoKind) => setModal({ kind: 'photoCapture', photoKind: photoKind ?? 'progress' })
      const openPhoto = (photo) => setModal({ kind: 'photoView', photo })
      const openPhotoCompare = (a, b) => setModal({ kind: 'photoCompare', photos: [a, b] })
      const openPhotosTab = (photo) => {
        setArchiveSection('photos')
        setTab('archive')
        if (photo) setModal({ kind: 'photoView', photo })
      }

      const leanGoal = leanGoalOf(goals)
      const openDeposit = (account, date) => {
        // No account argument (hero CTA) -> first account, today.
        const target = account ?? leanAccounts(leanGoal)[0] ?? null
        setModal({ kind: 'deposit', account: target, date: date ?? todayKey() })
      }
      const openWeekly = () => setModal({ kind: 'weeklyReview' })
      const openSeason = () => setModal({ kind: 'seasonReview' })
      const openHandbook = () => setModal({ kind: 'handbook' })
      async function startSeason() {
        const result = await run('startSeason', { member: member.name, code: 'lean_muscle' })
        showToast(result?.ok ? '新赛季已开启，历史记录保留' : (result?.error ?? '开启赛季失败'))
        return result
      }

      return h(
        'div',
        { className: 'dshh-root' },
        h(Styles),
        h(TopBar, {
          members,
          member,
          tab,
          onTab: (next) => setTab(next),
          onSelectMember: (id) => { setSelectedId(id); setTab('overview'); writeSelectedMember(id) },
          onAddMember: () => setModal({ kind: 'member', member: null }),
          onRecord: openEntry,
          onGoal: () => {
            const activeOrAll = goals ?? []
            if (activeOrAll.length === 1) setModal({ kind: 'goal', existing: activeOrAll[0], code: null })
            else if (activeOrAll.length > 1) setModal({ kind: 'goalList' })
            else setModal({ kind: 'goal', existing: null, code: null })
          },
          onEditProfile: () => setModal({ kind: 'member', member }),
          onManageMembers: () => setModal({ kind: 'members' }),
          onHandbook: openHandbook,
          onAbout: () => setModal({ kind: 'disclaimer' }),
        }),
        h(
          'div',
          { className: 'dshh-body' },
          tab === 'overview' && h(OverviewPane, {
            member, data, goals, templates, catalogs, contexts, photos, run,
            onToast: showToast,
            onEntry: openEntry,
            onManageGoal: (goal) => setModal({ kind: 'goal', existing: goal, code: null }),
            onSetGoal: (code) => setModal({ kind: 'goal', existing: null, code: code ?? null }),
            onMetric: (code) => setModal({ kind: 'metric', code }),
            onDeleteRecord: deleteRecord,
            onCapturePhoto: () => openPhotoCapture('progress'),
            onOpenPhotosTab: openPhotosTab,
            onDeposit: openDeposit,
            onOpenWeekly: openWeekly,
            onOpenSeason: openSeason,
            onStartSeason: startSeason,
            onOpenHandbook: openHandbook,
            onShareSeason: () => setModal({ kind: 'shareSeason' }),
            onOpenSquad: () => setModal({ kind: 'squad' }),
          }),
          tab === 'season' && h(PaneBoundary, { onReset: () => setTab('overview') },
            h(SeasonPane, {
              member,
              data,
              goal: leanGoal,
              goals,
              recent: data.recent ?? [],
              photos,
              onOpenSeason: openSeason,
              onStartSeason: startSeason,
              onOpenHandbook: openHandbook,
              onShareSeason: () => setModal({ kind: 'shareSeason' }),
              onOpenSquad: () => setModal({ kind: 'squad' }),
              onOpenDeposit: openDeposit,
              onOpenWeekly: openWeekly,
            })),
          tab === 'discover' && h(PaneBoundary, { onReset: () => setTab('overview') },
            h(DiscoverPane, {
              onToast: showToast,
              onOpenSquad: () => setModal({ kind: 'squad' }),
            })),
          tab === 'archive' && h(PaneBoundary, { onReset: () => setTab('overview') },
            h(ArchiveHub, {
              member, data, catalogs, photos, photoError,
              season: leanGoal?.season ?? null,
              series: data.series, goalCodes,
              section: archiveSection,
              onSection: setArchiveSection,
              onRecord: openEntry,
              onMetricClick: (code) => setModal({ kind: 'metric', code }),
              onCapture: () => openPhotoCapture('progress'),
              onCaptureInspiration: () => openPhotoCapture('inspiration'),
              onView: openPhoto,
              onCompare: openPhotoCompare,
              onRemovePhoto: removePhoto,
              onAddDocument: () => setModal({ kind: 'document' }),
              onRemoveDocument: removeDocument,
              onRemoveCondition: removeCondition,
              onAddCondition: addCondition,
              onManageConditions: () => setModal({ kind: 'condition', member }),
            })),
          h(FooterNote, { text: data.disclaimer, onOpen: () => setModal({ kind: 'disclaimer' }) }),
        ),
        toast && h('div', { className: 'dshh-toast', role: 'status', 'aria-live': 'polite' }, toast),
        modal && h(ModalHost, {
          modal,
          data,
          catalogs,
          busy,
          run,
          onClose: () => setModal(null),
          onOpenMember: (target) => setModal({ kind: 'member', member: target ?? null }),
          onOpenGoal: (goal) => setModal({ kind: 'goal', existing: goal ?? null, code: null }),
          onNewGoal: () => setModal({ kind: 'goal', existing: null, code: null }),
          onToast: showToast,
          onDeleteMember: deleteMember,
        }),
      )
    }

    // ---------------------------------------------------------------- top bar

    function TopBar(props) {
      const { members, member, tab, onTab, onSelectMember, onAddMember } = props
      const [menuOpen, setMenuOpen] = useState(false)
      const pills = members.length <= 4

      const menuItem = (label, onClick) => h('button', {
        key: label, type: 'button', role: 'menuitem', className: 'dshh-menu-item',
        onClick: () => { setMenuOpen(false); onClick() },
      }, label)

      return h(
        'header',
        { className: 'dshh-topbar' },
        h(
          'div',
          { className: 'dshh-toprow' },
          h('div', { className: 'dshh-brand' },
            h('div', { className: 'dshh-brandline' },
              h('h1', { className: 'dshh-title' }, '健康管理'),
              h('span', { className: 'dshh-preview-tag' }, '1.3')),
            h('div', { className: 'dshh-sub' },
              `${member.name} · ${member.relation} · ${member.sex} · ${member.riskLevel}`),
          ),
          h(
            'div',
            { className: 'dshh-topactions' },
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: props.onRecord }, '＋ 记录'),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: props.onGoal }, '目标'),
            h('button', { type: 'button', className: 'dshh-btn dshh-iconbtn',
              'aria-label': '更多操作', 'aria-expanded': String(menuOpen),
              onClick: () => setMenuOpen((open) => !open) }, '⋯'),
            menuOpen && h(
              'div',
              { className: 'dshh-menu-layer' },
              h('div', { className: 'dshh-menu-mask', onClick: () => setMenuOpen(false) }),
              h('div', { className: 'dshh-menu', role: 'menu' },
                menuItem('编辑资料', props.onEditProfile),
                menuItem('管理成员', props.onManageMembers),
                props.onHandbook && menuItem('薄肌手册', props.onHandbook),
                menuItem('关于 / 免责声明', props.onAbout),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dshh-memrow' },
          pills
            ? h('div', { className: 'dshh-mempills' }, members.map((item) =>
                h('button', {
                  key: item.id, type: 'button', className: 'dshh-mempill',
                  'data-active': String(member.id === item.id),
                  'aria-pressed': String(member.id === item.id),
                  onClick: () => onSelectMember(item.id),
                }, item.name)))
            : h('select', {
                className: 'dshh-select dshh-memselect',
                value: member.id,
                'aria-label': '选择家庭成员',
                onChange: (e) => onSelectMember(e.target.value),
              }, members.map((item) => h('option', { key: item.id, value: item.id },
                `${item.name}（${item.relation}）`))),
          h('button', { type: 'button', className: 'dshh-memadd', 'aria-label': '添加成员',
            onClick: onAddMember }, '＋'),
        ),
        h('nav', { className: 'dshh-tabbar', role: 'tablist' }, TABS.map((item) =>
          h('button', {
            key: item.code, type: 'button', role: 'tab', className: 'dshh-tabbtn',
            'data-active': String(tab === item.code),
            'aria-selected': String(tab === item.code),
            onClick: () => onTab(item.code),
          }, item.name))),
      )
    }

    // ---------------------------------------------------------------- goal cards

    function goalTargetStatusText(target) {
      if (target.kind === 'observe' || target.status === 'observe') return '参考 · 观察'
      if (target.status === 'normal') return '达标'
      if (target.status === 'high') return '偏高'
      if (target.status === 'low') return target.kind === 'weeklyDays' ? '未达标' : '偏低'
      if (target.status === 'pending') return '待补体重'
      if (target.status === 'trend') return '观察'
      return '暂无数据'
    }

    function goalTargetCurrentText(target) {
      if (target.currentDisplay == null) return '—'
      if (target.kind === 'weeklyDays') return `${target.currentDisplay} 天`
      const unit = target.unit ? ` ${target.unit}` : ''
      return `${target.currentDisplay}${unit}`
    }

    function goalTargetRightText(target) {
      if (target.kind === 'observe') {
        // Body composition is observed, never scored: show the reference band.
        return target.band?.label ?? target.targetDisplay ?? '只观察趋势'
      }
      if (target.kind === 'trend') {
        if (typeof target.delta30 === 'number') {
          const sign = target.delta30 > 0 ? '+' : ''
          const unit = target.unit ? ` ${target.unit}` : ''
          return `近 30 天 ${sign}${target.delta30}${unit}`
        }
        return '观察趋势'
      }
      return target.targetDisplay ?? ''
    }

    function GoalCard({ goal, onManage }) {
      const coverage = goal.coverage ?? {}
      const targets = goal.targets ?? []
      const dimensions = goal.dimensions ?? []
      const [open, setOpen] = useState(false)
      const lean = goal.code === 'lean_muscle'
      const season = lean ? seasonMeta(goal) : null
      const accounts = lean ? leanAccounts(goal) : []
      const hasAccountData = lean && Array.isArray(goal.accounts) && goal.accounts.length > 0
      const accountMet = accounts.filter((account) => account?.today?.met).length
      return h(
        'article',
        { className: 'dshh-card' },
        h(
          'div',
          { className: 'dshh-cardhead', style: { marginBottom: 4 } },
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'dshh-goalname' },
              goal.name,
              h('span', { className: 'dshh-goalchip', 'data-status': goal.status },
                goal.statusName ?? GOAL_STATUS_LABEL[goal.status] ?? goal.status)),
            h('div', { className: 'dshh-goalmeta' },
              [goal.domainName, goal.sourceName ? `来源：${goal.sourceName}` : null]
                .filter(Boolean).join(' · ')),
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 } },
            h('button', {
              type: 'button', className: 'dshh-btn-ghost dshh-small',
              'aria-expanded': String(open),
              onClick: () => setOpen((value) => !value),
            }, open ? '收起' : '详情'),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: () => onManage(goal) }, '管理')),
        ),
        h('div', { className: 'dshh-goalstats' },
          (coverage.measured ?? 0) > 0
            ? [
                h('span', { key: 'met' }, hasAccountData
                  ? `今日存入 ${accountMet}/${accounts.length}`
                  : `达标 ${coverage.met ?? 0}/${coverage.evaluable ?? 0}`),
                h('span', { key: 'measured' }, `已测 ${coverage.measured ?? 0}/${coverage.evaluable ?? 0}`),
              ]
            : h('span', null, `暂无数据 · 目标 ${coverage.evaluable ?? 0} 项`),
          season && season.hasSeason && h('span', { key: 'season' },
            `第 ${season.week}/${season.weeks} 周`),
          h('span', { key: 'last' },
            `最近记录 ${coverage.lastRecordAt ? fmtTime(coverage.lastRecordAt) : '暂无'}`),
        ),
        open && targets.length > 0 && h('div', { className: 'dshh-trows' }, targets.map((target) =>
          h('div', { key: target.metric, className: 'dshh-trow', title: target.note || undefined },
            h('span', { className: 'dshh-trow-name' }, target.name),
            h('span', { className: 'dshh-trow-cur' }, goalTargetCurrentText(target)),
            h('span', { className: 'dshh-trow-target' }, goalTargetRightText(target)),
            h('span', { className: 'dshh-trow-status', 'data-status': target.status },
              h('span', { className: 'dshh-dot', 'data-status': target.status, 'aria-hidden': true }),
              goalTargetStatusText(target)),
          ))),
        open && dimensions.length > 0 && h('div', { className: 'dshh-dims' }, dimensions.map((dimension) =>
          h('div', { key: dimension.code, className: 'dshh-dim' },
            h('div', { className: 'dshh-dimname' }, dimension.name),
            (dimension.metrics ?? []).map((metric) => {
              const value = metric.display != null
                ? `${metric.display}${metric.unit ? ` ${metric.unit}` : ''}`
                : '—'
              const meta = metric.code === 'training'
                ? `近7天 ${metric.days7 ?? 0} 天`
                : metric.code === 'protein' && metric.avg7 != null
                  ? `日均 ${metric.avg7} · 近7天 ${metric.count7 ?? 0} 次`
                  : `近7天 ${metric.count7 ?? 0} 次`
              return h('div', { key: metric.code, className: 'dshh-dimrow' },
                h('span', { className: 'dshh-dimrow-name' }, metric.name),
                h('span', { className: 'dshh-dimrow-val' }, value),
                h('span', { className: 'dshh-dimrow-meta' }, meta),
              )
            }),
          ))),
        open && goal.disclaimer && h('div', { className: 'dshh-goalnote' }, goal.disclaimer),
      )
    }

    function GoalCards({ goals, templates, error, onManage, onSet, onRecord }) {
      const items = goals ?? []
      const tpls = templates ?? []

      const errorNote = error && h('div', { className: 'dshh-suggest', style: { marginBottom: 10 } },
        h('div', { className: 'dshh-suggest-title' }, '⚠ 管理目标数据读取失败'),
        h('div', { className: 'dshh-suggest-note' },
          `${error}——指标记录与趋势仍可正常查看；请检查数据文件或重新加载插件后再试。`))

      if (items.length === 0) {
        return h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('span', { className: 'dshh-cardtitle' }, '管理目标'),
            h('span', { className: 'dshh-muted dshh-small' }, '目标 ≠ 诊断'),
          ),
          errorNote,
          h('div', { className: 'dshh-muted', style: { fontSize: 12, marginBottom: 12 } },
            '管理目标表示「你想管理什么」，用来决定关注哪些指标与参考区间；它只是一种管理意愿，不等于诊断，也不代表患病结论。'),
          tpls.length > 0 && h('div', { className: 'dshh-tplgrid' }, tpls.map((tpl) =>
            h('div', { key: tpl.code, className: 'dshh-tpl' },
              h('div', { className: 'dshh-tpl-name' }, tpl.name),
              h('div', { className: 'dshh-tpl-tag' }, tpl.tagline),
              h('div', { className: 'dshh-tpl-aud' }, tpl.audience),
              h('div', { className: 'dshh-tpl-actions' },
                h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
                  onClick: () => onSet(tpl.code) }, '设定')),
            ))),
          h('div', { className: 'dshh-goalnote' },
            '也可以先直接记录数据，之后再设定目标；个人目标值以医生/专业人士意见为准。'),
          h('div', { className: 'dshh-quickfoot' },
            h('button', { type: 'button', className: 'dshh-btn', onClick: onRecord }, '先记录一次')),
        )
      }

      return h('section', { className: 'dshh-section' },
        h('div', { className: 'dshh-sectionhead' },
          h('span', { className: 'dshh-cardtitle' }, '管理目标'),
          h('button', { type: 'button', className: 'dshh-btn-ghost',
            onClick: () => onSet(null) }, '＋ 设定目标')),
        errorNote,
        h('div', { className: 'dshh-goalcards' }, items.map((goal) =>
          h(GoalCard, { key: goal.id ?? goal.code, goal,
            onManage: () => onManage(goal) }))),
      )
    }

    // ---------------------------------------------------------------- CUT MODE

    /** Original abstract physique line-art (no face, no real person, no photo). */
    function HeroSilhouette() {
      return h(
        'svg',
        { className: 'dshh-hero-art', viewBox: '0 0 260 240', 'aria-hidden': true, fill: 'none',
          strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('defs', null,
          h('linearGradient', { id: 'dshhCutLine', x1: '0', y1: '0', x2: '1', y2: '1' },
            h('stop', { offset: '0%', stopColor: CUT_ACCENT, stopOpacity: '0.75' }),
            h('stop', { offset: '100%', stopColor: CUT_HOT, stopOpacity: '0.35' }),
          ),
        ),
        h('circle', { cx: 130, cy: 122, r: 80, fill: 'url(#dshhCutLine)', opacity: 0.06, stroke: 'none' }),
        h('g', { stroke: 'url(#dshhCutLine)', strokeWidth: 2.4, opacity: 0.9 },
          h('circle', { cx: 130, cy: 26, r: 14 }),
          h('path', { d: 'M122 39 L122 46 M138 39 L138 46' }),
          h('path', { d: 'M62 74 L98 44 L162 44 L198 74' }),
          h('path', { d: 'M78 78 C78 124 66 154 66 204' }),
          h('path', { d: 'M182 78 C182 124 194 154 194 204' }),
          h('path', { d: 'M96 88 C114 106 146 106 164 88' }),
          h('path', { d: 'M100 130 C120 146 140 146 160 130' }),
        ),
        h('g', { stroke: CUT_HOT, strokeWidth: 2, opacity: 0.55 },
          h('path', { d: 'M214 104 C232 126 232 158 214 180' }),
          h('path', { d: 'M46 104 C28 126 28 158 46 180' }),
        ),
        h('g', { stroke: CUT_ACCENT, strokeWidth: 1.4, opacity: 0.35 },
          h('path', { d: 'M84 148 H176' }),
          h('path', { d: 'M88 166 H172' }),
          h('path', { d: 'M92 184 H168' }),
        ),
      )
    }

    /**
     * Lean-muscle hero: 12-week season, weekly deposits and record streak.
     * Falls back to legacy hero numbers (streak / coverage) when the host does
     * not return season / weekly yet, so the panel never breaks.
     */
    function LeanHero({
      goal, photos, recent, todayPhoto,
      onCapturePhoto, onOpenDeposit, onOpenWeekly, onOpenPhotosTab,
    }) {
      const { progress, inspiration } = splitPhotos(photos)
      const heroPhoto = inspiration[0] ?? progress[0] ?? null
      const [mediaFailed, setMediaFailed] = useState(false)
      const [artFailed, setArtFailed] = useState(false)
      const heroPhotoId = heroPhoto?.id ?? null

      useEffect(() => { setMediaFailed(false) }, [heroPhotoId])

      const accounts = leanAccounts(goal)
      const season = seasonMeta(goal)
      const totals = leanWeeklyTotals(goal, accounts)
      const streak = recordStreak({ recent, photos })
      const hasToday = Boolean(todayPhoto)
      const firstEmpty = accounts.find((account) => !account?.today?.met) ?? accounts[0] ?? null
      const deposits = totals.deposits ?? 0
      const capacity = totals.max ?? 28
      const progressWidth = season.hasSeason ? Math.round(season.progress * 100) : 0
      // Legacy hosts without a season payload keep the old CUT hero numbers.
      const stats = season.hasSeason
        ? [
            { key: 'deposits', value: `${deposits}/${capacity}`, label: '本周存入 · 笔' },
            { key: 'streak', value: String(streak), unit: '天', label: '连续记录' },
            { key: 'season', value: `${season.week}/${season.weeks}`, unit: '周', label: '赛季' },
          ]
        : [
            { key: 'streak', value: String(streak), unit: '天', label: '连续记录' },
            { key: 'training', value: String(goalWeekTrainingDays(goal, recent)), unit: '天', label: '本周训练' },
            { key: 'met', value: `${goal.coverage?.met ?? 0}/${goal.coverage?.evaluable ?? 0}`, label: '达标' },
          ]
      const photoNote = (heroPhoto && !mediaFailed)
        ? (photoKind(heroPhoto) === PHOTO_KINDS.inspiration
            ? '背景：你的激励图（仅存本机）'
            : '背景：最新身材照（仅存本机）')
        : artFailed
          ? '背景：原创抽象剪影（无真人素材）'
          : '背景：公版 3D 雕塑主视觉（无真人素材）'

      return h(
        'section',
        { className: 'dshh-hero', 'data-variant': 'lean',
          style: { '--cut-accent': CUT_ACCENT, '--cut-hot': CUT_HOT } },
        heroPhoto && !mediaFailed && h('img', {
          className: 'dshh-hero-media',
          src: photoUrl(heroPhoto.id),
          alt: '',
          onError: () => setMediaFailed(true),
        }),
        h('div', { className: 'dshh-hero-scrim' }),
        h('div', { className: 'dshh-hero-top' },
          h('span', { className: 'dshh-hero-badge' }, h('span', null, 'LEAN ACCOUNT')),
          h('span', { className: 'dshh-hero-status' },
            `${goal.statusName ?? GOAL_STATUS_LABEL[goal.status] ?? goal.status}`
            + (goal.domainName ? ` · ${goal.domainName}` : '')),
        ),
        h('h2', { className: 'dshh-hero-title' }, '薄肌账户'),
        h('div', { className: 'dshh-hero-sub' },
          season.hasSeason
            ? `${season.label || '12 周一个赛季'} · 把可控的存进去`
            : (goal.tagline || '把可控的存进去')),
        h('div', { className: 'dshh-hero-stats' }, stats.map((stat) =>
          h('div', { key: stat.key, className: 'dshh-hero-stat' },
            h('span', { className: 'dshh-hero-num' }, stat.value,
              stat.unit && h('small', null, stat.unit)),
            h('span', { className: 'dshh-hero-label' }, stat.label)))),
        season.hasSeason && h('div', { className: 'dshh-seasonbar' },
          h('div', { className: 'dshh-seasonbar-track' },
            h('div', { className: 'dshh-seasonbar-fill',
              style: { width: `${progressWidth}%` } })),
          h('div', { className: 'dshh-seasonbar-ticks' }, season.checkpoints.map((mark, index) => {
            const week = Number(mark?.week ?? 0)
            const last = week >= season.weeks
            const left = season.weeks > 0
              ? Math.min(100, Math.max(0, (week / season.weeks) * 100))
              : 0
            return h('span', {
              key: `cp-${mark?.week ?? index}`,
              className: 'dshh-seasonbar-tick',
              'data-reached': String(Boolean(mark?.reached)),
              'data-last': String(last),
              style: { left: `${left}%` },
            }, mark?.label ?? `W${week}`)
          })),
        ),
        h('div', { className: 'dshh-hero-cta' },
          h('button', {
            key: 'deposit', type: 'button',
            className: 'dshh-hero-btn dshh-hero-btn-primary',
            onClick: () => onOpenDeposit?.(firstEmpty, todayKey()),
          }, '今日存入'),
          h('button', {
            key: 'photo', type: 'button',
            className: 'dshh-hero-btn dshh-hero-btn-ghost',
            onClick: () => (hasToday ? onOpenPhotosTab(todayPhoto) : onCapturePhoto()),
          }, hasToday ? '今日已拍 · 查看' : '每日一拍'),
          h('button', {
            key: 'ledger', type: 'button',
            className: 'dshh-hero-btn dshh-hero-btn-ghost',
            onClick: onOpenWeekly,
          }, '对账'),
        ),
        (!heroPhoto || mediaFailed) && (
          artFailed
            ? h(HeroSilhouette)
            : h('img', {
                className: 'dshh-hero-art-img',
                src: HERO_ART,
                alt: '',
                onError: () => setArtFailed(true),
              })
        ),
        h('div', { className: 'dshh-hero-note' }, photoNote),
      )
    }

    /** Metabolic hero: unchanged from the previous dashboard. */
    function MetabolicHero({ goals, onRecord, onManageGoal }) {
      const activeGoals = (goals ?? []).filter((goal) => goal.status === 'active')
      const metabolicGoal = activeGoals.find((goal) => goal.code === 'metabolic') ?? null
      const goal = metabolicGoal ?? activeGoals[0] ?? null
      if (!goal) return null
      const coverage = goal.coverage ?? {}
      const stats = [
        { key: 'met', value: `${coverage.met ?? 0}/${coverage.evaluable ?? 0}`, label: '达标' },
        { key: 'measured', value: `${coverage.measured ?? 0}/${coverage.evaluable ?? 0}`, label: '已测' },
        { key: 'last', value: coverage.lastRecordAt ? fmtTime(coverage.lastRecordAt) : '—', label: '最近记录' },
      ]
      return h(
        'section',
        { className: 'dshh-hero', 'data-variant': 'metabolic',
          style: { '--cut-accent': CUT_ACCENT, '--cut-hot': CUT_HOT } },
        h('div', { className: 'dshh-hero-scrim' }),
        h('div', { className: 'dshh-hero-top' },
          h('span', { className: 'dshh-hero-badge', 'data-hot': 'true' },
            h('span', null, 'CONTROL')),
          h('span', { className: 'dshh-hero-status' },
            `${goal.statusName ?? GOAL_STATUS_LABEL[goal.status] ?? goal.status}`
            + (goal.domainName ? ` · ${goal.domainName}` : '')),
        ),
        h('h2', { className: 'dshh-hero-title' }, '代谢面板'),
        goal.tagline && h('div', { className: 'dshh-hero-tag' }, goal.tagline),
        h('div', { className: 'dshh-hero-stats' }, stats.map((stat) =>
          h('div', { key: stat.key, className: 'dshh-hero-stat' },
            h('span', { className: 'dshh-hero-num' }, stat.value),
            h('span', { className: 'dshh-hero-label' }, stat.label)))),
        h('div', { className: 'dshh-hero-cta' },
          h('button', { key: 'record', type: 'button',
            className: 'dshh-hero-btn dshh-hero-btn-primary', onClick: onRecord }, '记录今日'),
          h('button', { key: 'goal', type: 'button',
            className: 'dshh-hero-btn dshh-hero-btn-ghost',
            onClick: () => onManageGoal(goal) }, '管理目标'),
        ),
        h('div', { className: 'dshh-hero-note' },
          '只看自己的指标与目标差距；不出现身材照入口。'),
      )
    }

    /**
     * Hero dispatcher: lean-muscle members get the account hero, everyone else
     * keeps the metabolic dashboard exactly as before.
     */
    function CutHero(props) {
      const leanGoal = leanActiveGoalOf(props.goals)
      if (leanGoal) return h(LeanHero, { ...props, goal: leanGoal })
      return h(MetabolicHero, props)
    }

    /** One-line coach bar: factual, behaviour-only, easily muted. */
    function CoachTone({ mode, line, onMode, onNext, showIntro, onDismissIntro, hidden }) {
      if (hidden) return null
      const seg = h('div', { className: 'dshh-tone-seg', role: 'group', 'aria-label': '教练语气' },
        TONE_MODES.map((item) => h('button', {
          key: item.code, type: 'button', className: 'dshh-tone-btn',
          'data-active': String(mode === item.code),
          'aria-pressed': String(mode === item.code),
          onClick: () => onMode(item.code),
        }, item.name)))
      const tag = h('span', { className: 'dshh-tone-tag' },
        mode === 'off' ? 'COACH · 关闭' : `COACH · ${mode === 'hard' ? '硬核' : '温和'}`)

      if (mode === 'off') {
        return h('section', { className: 'dshh-tone', 'data-tone': 'off' },
          tag,
          h('p', { className: 'dshh-tone-line' }, '教练语气已关闭，只显示数据。'),
          h('div', { className: 'dshh-tone-actions' }, seg),
        )
      }

      return h('section', { className: 'dshh-tone', 'data-tone': mode },
        tag,
        h('p', { className: 'dshh-tone-line' }, line),
        h('div', { className: 'dshh-tone-actions' },
          h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
            onClick: onNext }, '换一句'),
          seg,
        ),
        showIntro && h('div', { className: 'dshh-tone-intro' },
          h('span', null, '硬核模式只针对行动（练 / 蛋白 / 睡 / 水 / 照片），不评价你的身体；不适可切温和或关闭。'),
          h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
            onClick: onDismissIntro }, '知道了')),
      )
    }

    // ----------------------------------------------------------------- lean account UI

    function ReviewStat({ label, value, hint }) {
      return h('div', { className: 'dshh-review-stat' },
        h('div', { className: 'dshh-review-num' }, value),
        h('div', { className: 'dshh-review-label' }, label),
        hint && h('div', { className: 'dshh-review-label' }, hint))
    }

    /** Today's four deposits + the daily photo: the main low-cost entry point. */
    function DepositCard({ goal, todayPhoto, onOpenDeposit, onCapturePhoto, onOpenPhotosTab }) {
      const accounts = leanAccounts(goal)
      const photoDone = Boolean(todayPhoto)
      const done = accounts.filter((account) => account?.today?.met).length
      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('div', null,
            h('span', { className: 'dshh-cardtitle' }, '今日存入'),
            h('div', { className: 'dshh-muted dshh-small' },
              '只给行为计分：大练 / 蛋白 / 大睡 / 大水。体成分只观察，不在这里打分。')),
          h('span', { className: 'dshh-muted dshh-small', style: { fontVariantNumeric: 'tabular-nums' } },
            `已存入 ${done}/${accounts.length} 笔`),
        ),
        h('div', { className: 'dshh-accountgrid' },
          accounts.map((account) => {
            const today = account?.today ?? null
            const met = Boolean(today?.met)
            const hasRecord = Boolean(today?.hasRecord)
            const todayText = today?.display != null
              ? `${today.display}${account.unit ? ` ${account.unit}` : ''}`
              : null
            return h('button', {
              key: account.code ?? account.metric,
              type: 'button',
              className: 'dshh-account',
              'data-met': String(met),
              'data-record': String(hasRecord),
              onClick: () => onOpenDeposit(account, todayKey()),
            },
              h('span', { className: 'dshh-account-top' },
                h('span', { className: 'dshh-account-name' }, account.name ?? account.metric),
                account.role && h('span', { className: 'dshh-account-role' }, account.role)),
              h('span', { className: 'dshh-account-target' }, account.targetDisplay ?? ''),
              h('span', { className: 'dshh-account-value' },
                todayText ?? (hasRecord ? '已记录' : '未存入')),
              h('span', { className: 'dshh-account-state' },
                h('span', { className: 'dshh-account-dot', 'aria-hidden': true }),
                met ? '已存入' : '未存入'),
            )
          }),
          h('button', {
            type: 'button',
            className: 'dshh-account dshh-account-photo',
            'data-met': String(photoDone),
            'data-record': String(photoDone),
            onClick: () => (photoDone ? onOpenPhotosTab(todayPhoto) : onCapturePhoto()),
          },
            h('span', { className: 'dshh-account-top' },
              h('span', { className: 'dshh-account-name' }, '每日一拍'),
              h('span', { className: 'dshh-account-role' }, '证据')),
            h('span', { className: 'dshh-account-target' }, '只存本机'),
            h('span', { className: 'dshh-account-value' }, photoDone ? '已拍' : '未拍'),
            h('span', { className: 'dshh-account-state' },
              h('span', { className: 'dshh-account-dot', 'aria-hidden': true }),
              photoDone ? '已存入' : '未存入'),
          ),
        ),
      )
    }

    /** Rolling 7-day ledger: 7 columns x 4 account rows, click to backfill. */
    function WeeklyLedger({ goal, onOpenDeposit, onOpenWeekly }) {
      const accounts = leanAccounts(goal)
      const totals = leanWeeklyTotals(goal, accounts)
      const columns = leanWeekColumns(accounts)
      const range = totals.start && totals.end
        ? `近 7 天（${fmtDay(totals.start)} – ${fmtDay(totals.end)}）`
        : '近 7 天'
      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('span', { className: 'dshh-cardtitle' }, '本周对账单'),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-sm',
            onClick: onOpenWeekly }, '查看周报')),
        h('div', { className: 'dshh-ledger-summary' },
          `${range} · 已存入 ${totals.deposits}/${totals.max} 笔 · 断更不惩罚，补录即可`),
        h('div', { className: 'dshh-ledger-scroll' },
          h('div', { className: 'dshh-ledger' },
            h('div', { className: 'dshh-ledger-head' },
              h('span', { className: 'dshh-ledger-colhead' }, ''),
              columns.map((day) => h('span', {
                key: `col-${day.date}`,
                className: 'dshh-ledger-colhead',
              },
                h('b', null, day.weekday ? `周${day.weekday}` : ''),
                fmtDay(day.date)))),
            accounts.map((account) => {
              const week = account?.week ?? {}
              const label = week.label ?? `${week.met ?? 0}/${week.target ?? week.max ?? 7} 天`
              return h('div', { key: account.code ?? account.metric, className: 'dshh-ledger-row' },
                h('span', { className: 'dshh-ledger-acct' },
                  account.name ?? account.metric,
                  h('small', null, label)),
                columns.map((day) => {
                  const entry = leanDayOf(account, day.date)
                  const state = entry?.met ? 'met' : entry?.hasRecord ? 'record' : 'empty'
                  const stateText = state === 'met' ? '已存入'
                    : state === 'record' ? '未存入' : '无记录'
                  return h('button', {
                    key: `cell-${account.code ?? account.metric}-${day.date}`,
                    type: 'button',
                    className: 'dshh-ledger-cell',
                    'data-state': state,
                    title: `${account.name ?? ''} ${day.date} ${stateText}`,
                    'aria-label': `${account.name ?? ''} ${day.date} ${stateText}`,
                    onClick: () => onOpenDeposit(account, day.date),
                  })
                }))
            }),
          )),
        h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 10 } },
          '实心 = 已存入 · 空心 = 有记录未存入 · 更浅 = 无记录；点击对应位置可补录当天。参考区间非医学标准。'),
      )
    }

    /** Body-composition statement: observe only, never scored. */
    function BodyStatement({ goal, onMetric }) {
      const targets = observeTargets(goal)
      if (targets.length === 0) return null
      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('div', null,
            h('span', { className: 'dshh-cardtitle' }, '体成分对账单'),
            h('div', { className: 'dshh-muted dshh-small' },
              '只显示最新值、赛季基线与个人 delta；不计分、不排序、不评分。')),
          h('span', { className: 'dshh-observe-tag' }, '只观察')),
        h('div', { className: 'dshh-observe-list' }, targets.map((target) => {
          const unit = target.unit ? ` ${target.unit}` : ''
          const baseline = target.baseline?.value
          return h('button', {
            key: target.metric,
            type: 'button',
            className: 'dshh-observe-row',
            onClick: () => onMetric?.(target.metric),
          },
            h('span', { className: 'dshh-observe-name' },
              target.name,
              h('span', { className: 'dshh-observe-tag' }, '只观察')),
            h('span', { className: 'dshh-observe-value' },
              `${target.currentDisplay ?? '—'}${unit}`,
              h('small', null, target.measuredAt
                ? `最新 ${fmtTime(target.measuredAt)}` : '暂无最新值')),
            h('span', { className: 'dshh-observe-value' },
              baseline == null ? '—' : `${fmtNumber(Number(baseline), 1)}${unit}`,
              h('small', null, target.baseline?.measuredAt
                ? `赛季基线 ${fmtTime(target.baseline.measuredAt)}` : '暂无赛季基线')),
            h('span', null,
              h('span', { className: 'dshh-observe-delta' }, observeDeltaText(target)),
              h('small', { className: 'dshh-observe-band', style: { display: 'block' } },
                target.band?.label ?? target.targetDisplay ?? '只观察趋势')),
          )
        })),
        h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 10 } },
          '参考区间来自健身 / 中国成人公开参考，非医学标准；建议固定设备与时间比较。点击一行查看该指标全部记录。'),
      )
    }

    /** Season card: progress, checkpoints, review preview, new season. */
    function SeasonCard({ goal, onOpenSeason, onStartSeason, onOpenHandbook, onShareSeason, onOpenSquad }) {
      const season = seasonMeta(goal)
      const accounts = leanAccounts(goal)
      const review = seasonReviewModel(goal)
      const [confirm, setConfirm] = useState(false)
      const checkpointText = season.checkpoints
        .map((mark) => mark?.label ?? `W${mark?.week ?? ''}`).join(' / ')

      async function start() {
        setConfirm(false)
        await onStartSeason?.()
      }

      return h('section', { className: 'dshh-card dshh-seasoncard' },
        h('div', { className: 'dshh-cardhead', style: { marginBottom: 2 } },
          h('div', null,
            h('span', { className: 'dshh-cardtitle' }, '赛季'),
            h('div', { className: 'dshh-muted dshh-small' },
              season.hasSeason
                ? `${season.label || `第 ${season.no} 赛季`}`
                  + (season.endsAt ? ` · 截止 ${season.endsAt}` : '')
                : '服务端暂未返回赛季数据；记录、账户与照片不受影响。')),
          h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
            onClick: onOpenHandbook }, '薄肌手册')),
        h('div', { className: 'dshh-seasonstat' },
          `检查点 ${checkpointText} · 赛季进度 ${fmtPercent(season.progress)} · `
          + (season.ended ? '赛季已结束' : `剩余 ${season.daysLeft ?? '—'} 天`)),
        h('div', { className: 'dshh-checkpoints' }, season.checkpoints.map((mark, index) =>
          h('span', {
            key: `checkpoint-${mark?.week ?? index}`,
            className: 'dshh-checkpoint',
            'data-reached': String(Boolean(mark?.reached)),
          }, `${mark?.label ?? `W${mark?.week ?? ''}`}${mark?.reached ? ' ✓' : ''}`))),
        h('div', { className: 'dshh-seasonstat' },
          `赛季累计 ${review.deposits ?? 0} 笔 · 账户 ${accounts.length} 个`),
        h('div', { className: 'dshh-quickfoot' },
          h('button', {
            type: 'button',
            className: season.ended ? 'dshh-btn dshh-btn-primary' : 'dshh-btn',
            onClick: onOpenSeason,
          }, season.ended ? '赛季结算' : '赛季结算预览'),
          h('button', { type: 'button', className: 'dshh-btn',
            onClick: onShareSeason }, '分享赛季卡'),
          h('button', { type: 'button', className: 'dshh-btn',
            onClick: onOpenSquad }, '小队'),
          season.ended && !confirm && h('button', {
            type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: () => setConfirm(true),
          }, '开启新赛季'),
        ),
        confirm && h('div', { className: 'dshh-note', style: { marginTop: 10 } },
          h('div', null,
            `确认开启第 ${(season.no ?? 1) + 1} 赛季吗？只重置赛季计时，`
            + '历史记录、照片和体成分数据都会保留。'),
          h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 } },
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: () => setConfirm(false) }, '再想想'),
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: start }, '确认开启'))),
        h('div', { className: 'dshh-muted dshh-small' },
          '赛季只提供节奏，不承诺任何身体变化；赛季结束后可开启新赛季，旧记录保留。'),
      )
    }

    /** Dedicated season section: progress, checkpoints, weekly ledger and rules. */
    function SeasonPane({
      goal, recent, photos,
      onOpenSeason, onStartSeason, onOpenHandbook, onShareSeason, onOpenSquad,
      onOpenDeposit, onOpenWeekly,
    }) {
      const [confirmStart, setConfirmStart] = useState(false)
      if (!goal) {
        return h('div', { className: 'dshh-seasonpane' },
          h('section', { className: 'dshh-card dshh-season-empty' },
            h('div', { className: 'dshh-cardtitle' }, '还没有薄肌赛季'),
            h('div', { className: 'dshh-muted dshh-small' },
              '先在「目标」里激活薄肌管理。赛季只提供 12 周节奏，不承诺身体变化。'),
          ))
      }
      const season = seasonMeta(goal)
      const review = seasonReviewModel(goal)
      const accounts = leanAccounts(goal)
      const weekly = leanWeeklyTotals(goal, accounts)
      const streak = recordStreak({ recent, photos })
      if (!season.hasSeason) {
        return h('div', { className: 'dshh-seasonpane' },
          h('section', { className: 'dshh-card dshh-season-empty' },
            h('div', { className: 'dshh-cardtitle' }, '薄肌管理已激活'),
            h('div', { className: 'dshh-muted dshh-small' },
              '还没有开始赛季。开始一个 12 周赛季，用 W4 / W8 / W12 三个检查点看节奏；'
              + '历史记录、照片和体成分数据都会保留。'),
            h('div', { className: 'dshh-modal-actions' },
              h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
                onClick: onStartSeason }, '开始第一个赛季')),
          ))
      }

      const progress = Math.max(0, Math.min(100, Math.round(season.progress * 100)))
      return h('div', { className: 'dshh-seasonpane' },
        h('section', { className: 'dshh-seasonhero' },
          h('div', { className: 'dshh-seasonhero-top' },
            h('span', { className: 'dshh-season-kicker' },
              `SEASON ${String(season.no ?? 1).padStart(2, '0')}`),
            h('span', { className: 'dshh-season-status' },
              `${season.ended ? '已结束' : '进行中'} · 第 ${Math.max(1, Math.min(season.week, season.weeks))} / ${season.weeks} 周`)),
          h('h2', { className: 'dshh-seasonhero-title' }, '把 12 周存成一条线'),
          h('p', { className: 'dshh-seasonhero-sub' },
            '不比身体，只看本周有没有把可控的事存进去。补存也算，中断不惩罚。'),
          h('div', { className: 'dshh-seasonhero-stats' },
            h('div', { className: 'dshh-seasonhero-stat' },
              h('b', null, `${weekly.deposits ?? 0}/${weekly.max ?? 28} 笔`),
              h('span', null, '本周存入')),
            h('div', { className: 'dshh-seasonhero-stat' },
              h('b', null, `${review.deposits ?? 0} 笔`),
              h('span', null, '赛季累计')),
            h('div', { className: 'dshh-seasonhero-stat' },
              h('b', null, String(review.trainingDays ?? 0)),
              h('span', null, '训练天数')),
            h('div', { className: 'dshh-seasonhero-stat' },
              h('b', null, String(streak)),
              h('span', null, '连续记录 · 天'))),
          h('div', { className: 'dshh-seasonprogress' },
            h('div', { className: 'dshh-seasonprogress-fill', style: { width: `${progress}%` } }),
            h('span', { className: 'dshh-seasonprogress-label' }, `${progress}%`)),
          h('div', { className: 'dshh-seasonhero-actions' },
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: onShareSeason }, '分享赛季卡'),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: onOpenSquad }, '小队'),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: onOpenSeason }, season.ended ? '赛季结算' : '赛季结算预览'),
            h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
              onClick: onOpenHandbook }, '薄肌手册'),
            season.ended && !confirmStart && h('button', {
              type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: () => setConfirmStart(true),
            }, '开启新赛季')),
          confirmStart && h('div', { className: 'dshh-note', style: { marginTop: 12 } },
            h('div', null,
              `确认开启第 ${(season.no ?? 1) + 1} 赛季吗？只重置赛季计时，`
              + '历史记录、照片和体成分数据都会保留。'),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 } },
              h('button', { type: 'button', className: 'dshh-btn',
                onClick: () => setConfirmStart(false) }, '再想想'),
              h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
                onClick: onStartSeason }, '确认开启')))),
        h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '赛季检查点'),
              h('div', { className: 'dshh-muted dshh-small' },
                'W4 / W8 / W12 只看节奏，不看体重或体型。'))),
          h('div', { className: 'dshh-seasontimeline' }, season.checkpoints.map((mark, index) => {
            const reached = Boolean(mark?.reached)
            const weeksAway = Math.max(0, (mark?.week ?? 0) - season.week)
            return h('div', {
              key: `season-mark-${mark?.week ?? index}`,
              className: 'dshh-seasontimeline-step',
              'data-reached': String(reached),
            },
              h('span', { className: 'dshh-seasontimeline-dot' }, reached ? '✓' : '·'),
              h('b', null, mark?.label ?? `W${mark?.week ?? ''}`),
              h('small', null, reached ? '已到达' : weeksAway > 0 ? `${weeksAway} 周后` : '本周'))
          }))),
        h(WeeklyLedger, { goal, onOpenDeposit, onOpenWeekly }),
        h('section', { className: 'dshh-card dshh-seasonrules' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '赛季规则'),
              h('div', { className: 'dshh-muted dshh-small' },
                '账户记录行为，体成分只在对账单里观察。'))),
          h('ul', null,
            h('li', null, '12 周一个赛季；W4 / W8 / W12 是节奏点，不是考核。'),
            h('li', null, '大练 / 蛋白 / 大睡 / 大水四个账户，每天每个账户最多存 1 笔；补存也算。'),
            h('li', null, '1 笔 = 一个行为账户当天存入 1 次；4 个账户 × 7 天 = 每周最多 28 笔。'),
            h('li', null, '体脂、体重、骨骼肌、腰围不计分、不排名、不做效果承诺。'),
            h('li', null, '赛季结束可开启新赛季；历史记录和照片保留。'))),
      )
    }

    function roundedRect(ctx, x, y, width, height, radius) {
      const r = Math.max(0, Math.min(radius, width / 2, height / 2))
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + width - r, y)
      ctx.quadraticCurveTo(x + width, y, x + width, y + r)
      ctx.lineTo(x + width, y + height - r)
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
      ctx.lineTo(x + r, y + height)
      ctx.quadraticCurveTo(x, y + height, x, y + height - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }

    /** Draw the local-only season poster. No network, no body data. */
    function drawSeasonShare(canvas, { goal, alias }) {
      if (!canvas) return
      const width = 1080
      const height = 1440
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const season = seasonMeta(goal)
      const review = seasonReviewModel(goal)
      const accounts = leanAccounts(goal)
      const weekly = leanWeeklyTotals(goal, accounts)
      const rows = accounts.length > 0 ? accounts : LEAN_ACCOUNT_FALLBACKS

      ctx.fillStyle = '#0B0D12'
      ctx.fillRect(0, 0, width, height)
      const glow = ctx.createRadialGradient(width * 0.8, 210, 0, width * 0.8, 210, 620)
      glow.addColorStop(0, 'rgba(215,255,63,.20)')
      glow.addColorStop(1, 'rgba(215,255,63,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, 780)
      ctx.fillStyle = 'rgba(255,255,255,.055)'
      for (let x = 48; x < width; x += 36) {
        for (let y = 48; y < height; y += 36) {
          ctx.beginPath()
          ctx.arc(x, y, 1.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      ctx.fillStyle = '#D7FF3F'
      ctx.fillRect(72, 72, 96, 8)
      ctx.fillStyle = '#F2F4F8'
      ctx.font = '700 76px "Microsoft YaHei", "Segoe UI", sans-serif'
      ctx.fillText('薄肌账户', 72, 192)
      ctx.fillStyle = '#9AA3B2'
      ctx.font = '400 30px "Microsoft YaHei", "Segoe UI", sans-serif'
      ctx.fillText(
        `第 ${season.no} 赛季 · 第 ${Math.max(1, Math.min(season.week, season.weeks))} 周 / ${season.weeks} 周`,
        72, 246,
      )

      ctx.fillStyle = '#D7FF3F'
      ctx.font = '800 150px "Segoe UI", "Microsoft YaHei", sans-serif'
      const totalText = String(weekly.deposits ?? 0)
      ctx.fillText(totalText, 72, 438)
      const totalWidth = ctx.measureText(totalText).width
      ctx.fillStyle = '#F2F4F8'
      ctx.font = '700 66px "Microsoft YaHei", "Segoe UI", sans-serif'
      ctx.fillText(`/ ${weekly.max ?? 28} 笔`, 72 + totalWidth + 26, 438)
      ctx.fillStyle = '#9AA3B2'
      ctx.font = '400 30px "Microsoft YaHei", "Segoe UI", sans-serif'
      ctx.fillText('本周存入 · 只记录行为账户', 72, 494)

      rows.slice(0, 4).forEach((account, index) => {
        const y = 600 + index * 126
        const met = Math.max(0, Math.min(7, Number(account?.week?.met) || 0))
        ctx.fillStyle = '#F2F4F8'
        ctx.font = '600 34px "Microsoft YaHei", "Segoe UI", sans-serif'
        ctx.fillText(account.name ?? account.metric, 72, y)
        ctx.fillStyle = '#7F8796'
        ctx.font = '400 24px "Microsoft YaHei", "Segoe UI", sans-serif'
        ctx.fillText(account.role ?? '', 72, y + 36)
        ctx.fillStyle = met > 0 ? '#D7FF3F' : '#7F8796'
        ctx.font = '700 42px "Segoe UI", sans-serif'
        ctx.fillText(`${met}/7`, 792, y)
        ctx.fillStyle = 'rgba(255,255,255,.08)'
        roundedRect(ctx, 72, y + 62, 900, 10, 5)
        ctx.fill()
        if (met > 0) {
          ctx.fillStyle = '#D7FF3F'
          roundedRect(ctx, 72, y + 62, 900 * (met / 7), 10, 5)
          ctx.fill()
        }
      })

      const checkpointY = 1148
      ctx.fillStyle = '#F2F4F8'
      ctx.font = '600 34px "Microsoft YaHei", "Segoe UI", sans-serif'
      ctx.fillText('赛季检查点', 72, checkpointY)
      season.checkpoints.forEach((mark, index) => {
        const x = 72 + index * 240
        ctx.fillStyle = mark.reached ? '#D7FF3F' : 'rgba(255,255,255,.12)'
        roundedRect(ctx, x, checkpointY + 38, 180, 76, 16)
        ctx.fill()
        ctx.fillStyle = mark.reached ? '#0B0D12' : '#8A92A1'
        ctx.font = '700 30px "Segoe UI", "Microsoft YaHei", sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${mark.label}${mark.reached ? ' ✓' : ''}`, x + 90, checkpointY + 86)
        ctx.textAlign = 'left'
      })

      ctx.fillStyle = '#F2F4F8'
      ctx.font = '600 30px "Microsoft YaHei", "Segoe UI", sans-serif'
      ctx.fillText(`分享者 · ${String(alias || '我').slice(0, 20)}`, 72, 1324)
      ctx.fillStyle = '#6F7787'
      ctx.font = '400 24px "Microsoft YaHei", "Segoe UI", sans-serif'
      ctx.fillText('仅行为记录 · 不含体成分 / 体重 / 照片 / 健康档案', 72, 1372)
      ctx.fillStyle = '#D7FF3F'
      ctx.fillRect(72, 1398, 86, 4)
    }

    function ShareSeasonModal({ member, goal, onClose, onToast }) {
      const [alias, setAlias] = useState(() => shareAliasOf(member))
      const canvasRef = useRef(null)
      useEffect(() => {
        drawSeasonShare(canvasRef.current, { goal, alias })
      }, [goal, alias])
      const season = seasonMeta(goal)
      const review = seasonReviewModel(goal)

      function save() {
        const canvas = canvasRef.current
        if (!canvas) return
        const link = document.createElement('a')
        link.href = canvas.toDataURL('image/png')
        link.download = `dsh-thin-season-${season.no || 1}-w${season.week || 1}.png`
        document.body.appendChild(link)
        link.click()
        link.remove()
        onToast?.('赛季卡已生成，保存后由你自行分享')
      }

      async function copy() {
        const accounts = leanAccounts(goal)
          .map((account) => `${account.name ?? account.metric} ${account?.week?.met ?? 0}/7`)
          .join(' · ')
        const text = `薄肌账户 · 第 ${season.no} 赛季 · 第 ${season.week}/${season.weeks} 周\n`
          + `本周存入 ${weekly.deposits ?? 0}/${weekly.max ?? 28} 笔\n${accounts}\n`
          + '只记录行为，不比较身体。'
        const ok = await leanCopyText(text)
        onToast?.(ok ? '分享文案已复制' : '复制失败，可手动选择文本')
      }

      return h(ModalFrame, { title: '分享赛季卡', onClose },
        h('div', { className: 'dshh-preview-row' },
          h('span', { className: 'dshh-preview-tag' }, '本地生成'),
          h('span', { className: 'dshh-muted dshh-small' }, '不会上传，图片只保存在你点保存的位置')),
        h('div', { className: 'dshh-share-preview' },
          h('canvas', { ref: canvasRef, className: 'dshh-share-canvas' })),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '分享者别名'),
          h('input', {
            className: 'dshh-input', maxLength: 20, value: alias,
            onChange: (event) => setAlias(event.target.value),
            placeholder: '如：我',
          }),
          h('div', { className: 'dshh-muted dshh-small' },
            '默认「我」；不要填写真实姓名。图片只包含行为账户，不含体成分、体重、照片或健康档案。')),
        h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn', onClick: copy }, '复制文案'),
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭'),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary', onClick: save }, '保存图片')),
      )
    }

    async function communityPost(action, args) {
      const response = await fetch(`${API}/community`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...args }),
      })
      const body = await response.json().catch(() => ({ ok: false, error: '社群服务返回异常。' }))
      if (!body.ok) throw new Error(body.error ?? '社群操作失败。')
      return body.data
    }

    async function communityBoard(code) {
      const response = await fetch(
        `${API}/community/leaderboard?code=${encodeURIComponent(code)}`,
        { credentials: 'same-origin' },
      )
      const body = await response.json().catch(() => ({ ok: false, error: '社群服务返回异常。' }))
      if (!body.ok) throw new Error(body.error ?? '读取排行榜失败。')
      return body.data
    }

    function SquadModal({ member, goal, recent, photos, onClose, onToast }) {
      const [membership, setMembership] = useState(() => {
        const stored = readLocalJSON(SQUAD_MEMBERSHIP_KEY, null)
        return stored?.code && stored?.token && stored?.memberId ? stored : null
      })
      const [squad, setSquad] = useState(null)
      const [alias, setAlias] = useState(() => shareAliasOf(member))
      const [codeInput, setCodeInput] = useState('')
      const [joinMode, setJoinMode] = useState(false)
      const [consent, setConsent] = useState(false)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)

      const snapshot = () => squadSnapshot(goal, { recent, photos })

      function remember(next) {
        setMembership(next)
        writeLocalJSON(SQUAD_MEMBERSHIP_KEY, next)
      }

      async function refresh(code) {
        if (!code) return
        try {
          const board = await communityBoard(code)
          setSquad(board)
          setError(null)
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        }
      }

      useEffect(() => {
        if (!membership?.code) return
        refresh(membership.code)
        // Only re-fetch when the stored squad changes; snapshots update explicitly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [membership?.code])

      async function createSquad() {
        setError(null)
        if (!consent) { setError('请先确认分享范围。'); return }
        setBusy(true)
        try {
          const data = await communityPost('create', { alias, snapshot: snapshot() })
          remember({ code: data.code, token: data.token, memberId: data.memberId })
          setSquad(data.squad)
          onToast?.('小队已创建，把邀请码发给队友')
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setBusy(false)
        }
      }

      async function joinSquad() {
        setError(null)
        if (!consent) { setError('请先确认分享范围。'); return }
        if (!codeInput.trim()) { setError('请输入邀请码。'); return }
        setBusy(true)
        try {
          const data = await communityPost('join', {
            code: codeInput.trim().toUpperCase(), alias, snapshot: snapshot(),
          })
          remember({ code: data.code, token: data.token, memberId: data.memberId })
          setSquad(data.squad)
          onToast?.('已加入小队')
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setBusy(false)
        }
      }

      async function updateSnapshot() {
        if (!membership) return
        setBusy(true)
        setError(null)
        try {
          const data = await communityPost('snapshot', {
            code: membership.code, token: membership.token, snapshot: snapshot(),
          })
          setSquad(data)
          onToast?.('本周存入已同步到小队')
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setBusy(false)
        }
      }

      async function leaveSquad() {
        if (!membership) return
        if (typeof window.confirm === 'function'
          && !window.confirm('退出小队？你的小队成员记录会被删除，健康数据不受影响。')) return
        setBusy(true)
        setError(null)
        try {
          await communityPost('leave', { code: membership.code, token: membership.token })
          remember(null)
          setSquad(null)
          setJoinMode(false)
          onToast?.('已退出小队')
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setBusy(false)
        }
      }

      async function switchSquad() {
        if (!membership) return
        if (typeof window.confirm === 'function'
          && !window.confirm('加入其他小队需要先退出当前小队；你的健康数据不受影响。继续吗？')) return
        setBusy(true)
        setError(null)
        try {
          await communityPost('leave', { code: membership.code, token: membership.token })
          remember(null)
          setSquad(null)
          setCodeInput('')
          setJoinMode(true)
          setConsent(false)
          onToast?.('已退出当前小队，输入新的邀请码加入')
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setBusy(false)
        }
      }

      async function copyCode() {
        const code = membership?.code ?? ''
        const ok = await copyInviteCode(code)
        onToast?.(ok ? '邀请码已复制' : '复制失败，请稍后再试')
      }

      const leaderboard = squad?.members ?? []
      const consentBlock = h('div', { className: 'dshh-consent' },
        h('div', { className: 'dshh-consent-head' }, '授权后才分享，且只分享这些'),
        h('div', { className: 'dshh-consent-cols' },
          h('div', null,
            h('div', { className: 'dshh-consent-label' }, '会分享'),
            h('ul', null,
              h('li', null, '赛季编号 / 周次'),
              h('li', null, '大练 / 蛋白 / 大睡 / 大水 本周存入笔数'),
              h('li', null, '连续记录天数'))),
          h('div', null,
            h('div', { className: 'dshh-consent-label' }, '不会分享'),
            h('ul', null,
              h('li', null, '体成分 / 体重 / 照片'),
              h('li', null, '疾病标签 / 档案 / 备注'),
              h('li', null, '年龄 / 性别 / 精确位置')))),
        h('label', { className: 'dshh-checkline' },
          h('input', {
            type: 'checkbox', checked: consent,
            onChange: (event) => setConsent(event.target.checked),
          }),
          h('span', null, '我已知晓并同意分享上述行为数据')),
        h('div', { className: 'dshh-muted dshh-small' },
          '这是本地预览：数据写在本机 .dsh-health/community.json，不会发到互联网。正式版接入远端服务前会再次征得同意并补齐隐私说明。'))

      return h(ModalFrame, { title: '小队 · 赛季排行', onClose },
        h('div', { className: 'dshh-preview-row' },
          h('span', { className: 'dshh-preview-tag' }, '预览版'),
          h('span', { className: 'dshh-muted dshh-small' }, '本地小队服务 · 验收用')),
        error && h('div', { className: 'dshh-form-error', role: 'alert' }, error),
        !membership ? h('div', { className: 'dshh-squad-onboard' },
          consentBlock,
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '小队昵称'),
            h('input', {
              className: 'dshh-input', maxLength: 20, value: alias,
              onChange: (event) => setAlias(event.target.value),
            }),
            h('div', { className: 'dshh-muted dshh-small' }, '默认「我」；建议使用昵称，不填真实姓名。')),
          joinMode && h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '邀请码'),
            h('input', {
              className: 'dshh-input', maxLength: 6, value: codeInput,
              placeholder: '6 位邀请码',
              onChange: (event) => setCodeInput(event.target.value.toUpperCase()),
            })),
          h('div', { className: 'dshh-modal-actions' },
            h('button', { type: 'button', className: 'dshh-btn', disabled: busy,
              onClick: () => setJoinMode((value) => !value) },
            joinMode ? '改为创建' : '输入邀请码加入'),
            h('button', {
              type: 'button', className: 'dshh-btn dshh-btn-primary', disabled: busy,
              onClick: joinMode ? joinSquad : createSquad,
            }, busy ? '处理中…' : joinMode ? '加入小队' : '创建小队')))
          : h('div', { className: 'dshh-squad-active' },
            h('div', { className: 'dshh-squad-head' },
              h('div', null,
                h('div', { className: 'dshh-squad-title' }, `小队 ${membership.code}`),
                h('div', { className: 'dshh-muted dshh-small' },
                  `${squad?.memberCount ?? 0}/${squad?.maxMembers ?? 8} 人 · 只排行为，不排身体`)),
              h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
                onClick: copyCode }, '复制邀请码')),
            h('div', { className: 'dshh-squad-list' }, leaderboard.length > 0
              ? leaderboard.map((item) => h('div', {
                  key: item.memberId,
                  className: 'dshh-squad-row',
                  'data-self': String(item.memberId === membership.memberId),
                },
                h('span', { className: 'dshh-squad-rank' }, `#${item.rank}`),
                h('div', { className: 'dshh-squad-person' },
                  h('span', { className: 'dshh-squad-name' },
                    item.alias + (item.memberId === membership.memberId ? ' · 我' : '')),
                  h('span', { className: 'dshh-muted dshh-small' },
                    `连续 ${item.snapshot?.streak ?? 0} 天`)),
                h('div', { className: 'dshh-squad-cells' }, SQUAD_ACCOUNTS.map((account) =>
                  h('span', { key: account.code, className: 'dshh-squad-cell' },
                    `${account.name} ${item.snapshot?.deposits?.[account.code] ?? 0}`))),
                h('span', { className: 'dshh-squad-total' }, `${item.total}/28 笔`)))
              : h('div', { className: 'dshh-squad-empty' },
                '还没有排行榜数据，点「更新我的存入」开始。')),
            h('div', { className: 'dshh-squad-note' },
              '排行榜只比较行为账户存入，补存也算；不比较体成分、体重、照片或训练总量。'),
            h('div', { className: 'dshh-modal-actions' },
              h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
                onClick: switchSquad, disabled: busy }, '加入其他小队'),
              h('button', { type: 'button', className: 'dshh-btn', onClick: leaveSquad, disabled: busy }, '退出小队'),
              h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
                onClick: updateSnapshot, disabled: busy }, busy ? '同步中…' : '更新我的存入'))))
    }

    function DiscoverPane({ onToast, onOpenSquad }) {
      const [filter, setFilter] = useState('all')
      const [query, setQuery] = useState('')
      const [venues, setVenues] = useState([])
      const [region, setRegion] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [favorites, setFavorites] = useState(() => {
        const stored = readLocalJSON(PLACE_FAVORITES_KEY, [])
        return Array.isArray(stored) ? stored : []
      })

      useEffect(() => {
        let alive = true
        getJSON(`${API}/venues`)
          .then((body) => {
            if (!alive) return
            if (!body.ok) throw new Error(body.error ?? '读取场馆数据失败。')
            setVenues(Array.isArray(body.data?.venues) ? body.data.venues : [])
            setRegion(body.data?.region ?? null)
            setError(null)
          })
          .catch((cause) => {
            if (alive) setError(String(cause?.message ?? cause))
          })
          .finally(() => {
            if (alive) setLoading(false)
          })
        return () => { alive = false }
      }, [])

      const queryText = query.trim().toLowerCase()
      const visible = venues.filter((place) => {
        if (filter !== 'all' && place.category !== filter) return false
        if (!queryText) return true
        const haystack = [place.name, place.address, place.area, ...(place.tags ?? [])]
          .join(' ')
          .toLowerCase()
        return haystack.includes(queryText)
      })

      function toggleFavorite(id) {
        const next = favorites.includes(id)
          ? favorites.filter((item) => item !== id)
          : [...favorites, id]
        setFavorites(next)
        writeLocalJSON(PLACE_FAVORITES_KEY, next)
        onToast?.(favorites.includes(id) ? '已取消收藏' : '已收藏到本机')
      }

      function placeCard(place) {
        const favorited = favorites.includes(place.id)
        const source = place.source ?? {}
        return h('article', { key: place.id, className: 'dshh-placecard' },
          h('div', { className: 'dshh-placehead' },
            h('div', null,
              h('div', { className: 'dshh-placename' }, place.name),
              h('div', { className: 'dshh-muted dshh-small' },
                `${place.typeName} · ${place.area}`)),
            h('span', { className: 'dshh-placefee' }, place.fee)),
          h('div', { className: 'dshh-placetags' }, (place.tags ?? []).map((tag) =>
            h('span', { key: tag, className: 'dshh-placetag' }, tag))),
          h('div', { className: 'dshh-placemeta' },
            h('span', null, place.address),
            h('span', null, `开放 ${place.hours} · 收费 ${place.fee}`),
            h('span', { className: 'dshh-place-source' },
              `来源 ${source.name ?? '公开信息'} · ${source.date ?? ''} `,
              source.url && h('a', { href: source.url, target: '_blank', rel: 'noreferrer' }, '查看来源'))),
          h('div', { className: 'dshh-placeactions' },
            h('a', {
              className: 'dshh-btn dshh-btn-ghost dshh-small',
              href: mapSearchUrl('amap', place.mapQuery ?? `${place.name} 杭州余杭`),
              target: '_blank', rel: 'noreferrer',
            }, '在高德中查找'),
            h('button', {
              type: 'button', className: 'dshh-btn-ghost dshh-small',
              onClick: () => toggleFavorite(place.id),
            }, favorited ? '已收藏' : '收藏')),
        )
      }

      const discoverTiles = [
        { title: '附近健身房', desc: '高德地图搜索附近场馆', href: mapSearchUrl('amap', '健身房 杭州余杭'), cta: '打开地图' },
        { title: '公共健身场所', desc: '公园、社区健身角与开放场地', href: mapSearchUrl('baidu', '公共健身场所 杭州余杭'), cta: '百度查找' },
        { title: '场馆档案', desc: '余杭区试点：地址、开放与收费', onClick: () => document.getElementById('dshh-discover-venues')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), cta: '浏览余杭场馆' },
        { title: '赛季小队', desc: '邀请制行为排行，不比身体', onClick: onOpenSquad, cta: '打开小队' },
        { title: '活动与赛事', desc: '城市活动、赛季挑战', disabled: true, cta: '即将接入' },
        { title: '装备与服务', desc: '装备、场馆服务与更多内容', disabled: true, cta: '即将接入' },
      ]

      return h('div', { className: 'dshh-discover' },
        h('section', { className: 'dshh-card dshh-discover-hero' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '发现'),
              h('div', { className: 'dshh-muted dshh-small' },
                region
                  ? `${region.name} 试点 · 公开信息整理，可追溯来源`
                  : '场所、活动与服务；所有入口都先由你选择。')),
            h('span', { className: 'dshh-preview-tag' }, '余杭试点')),
          h('div', { className: 'dshh-discovertiles' }, discoverTiles.map((tile) => {
            const disabled = Boolean(tile.disabled)
            const tag = tile.href ? 'a' : 'button'
            return h(tag, {
              key: tile.title,
              className: 'dshh-discovertile',
              href: tile.href,
              target: tile.href ? '_blank' : undefined,
              rel: tile.href ? 'noreferrer' : undefined,
              type: tile.href ? undefined : 'button',
              disabled: disabled || (!tile.href && !tile.onClick),
              'data-disabled': String(disabled),
              onClick: disabled ? undefined : tile.onClick,
            },
              h('span', { className: 'dshh-discovertile-title' }, tile.title),
              h('span', { className: 'dshh-discovertile-desc' }, tile.desc),
              h('span', { className: 'dshh-discovertile-cta' }, tile.cta))
          })),
          h('div', { className: 'dshh-discover-note' },
            '当前只做余杭区试点；活动、装备与更多服务会在验收后逐步接入。')),
        h('section', { id: 'dshh-discover-venues', className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '余杭区场馆'),
              h('div', { className: 'dshh-muted dshh-small' },
                region?.note ?? '公开信息整理；开放时间、收费与入场规则可能调整，以现场/官方最新公告为准。')),
            h('span', { className: 'dshh-preview-tag' }, `${venues.length} 个`)),
          h('div', { className: 'dshh-place-search' },
            h('input', {
              className: 'dshh-input', value: query,
              placeholder: '搜索场馆名、街道或器械，如「良渚」「篮球」',
              onChange: (event) => setQuery(event.target.value),
            })),
          h('div', { className: 'dshh-placelinks' },
            h('a', { className: 'dshh-btn dshh-btn-primary dshh-small',
              href: mapSearchUrl('amap', '健身房 杭州余杭'), target: '_blank', rel: 'noreferrer' }, '高德找健身房'),
            h('a', { className: 'dshh-btn dshh-small',
              href: mapSearchUrl('baidu', '公共健身场所 杭州余杭'), target: '_blank', rel: 'noreferrer' }, '百度找公共场地'),
            h('a', { className: 'dshh-btn dshh-small',
              href: mapSearchUrl('google', 'gym Yuhang Hangzhou'), target: '_blank', rel: 'noreferrer' }, 'Google Maps')),
          h('div', { className: 'dshh-placefilters' },
            [['all', '全部'], ['public', '公共场地'], ['gym', '健身房'], ['specialty', '特色场馆']]
              .map(([code, label]) =>
                h('button', {
                  key: code, type: 'button',
                  className: 'dshh-placefilter', 'data-active': String(filter === code),
                  onClick: () => setFilter(code),
                }, label))),
          loading && h('div', { className: 'dshh-note dshh-small' }, '正在读取余杭区场馆…'),
          error && h('div', { className: 'dshh-form-error' },
            `场馆数据读取失败：${error}。仍可点上方地图按钮查找实时结果。`),
          h('div', { className: 'dshh-note dshh-small' },
            '数据来源：杭州市文化广电旅游局 / 余杭文旅、余杭发布、电话邦公开目录；来源日期见每张卡片。开放时间、收费和入场规则以现场/官方最新公告为准。这里不提供训练计划、课程或医疗建议。')),
        h('div', { className: 'dshh-placegrid' }, visible.map(placeCard)),
        !loading && !error && visible.length === 0 && h('div', { className: 'dshh-note dshh-small' },
          '没有匹配的场馆；换个关键词或切到「全部」。'),
        favorites.length > 0 && h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '我的收藏'),
              h('div', { className: 'dshh-muted dshh-small' }, '只保存在本机，不上传。'))),
          h('div', { className: 'dshh-placegrid' },
            venues.filter((place) => favorites.includes(place.id)).map(placeCard))),
      )
    }

    /** Single-metric deposit. Training / water / sleep get quick-value chips. */
    function DepositModal({ member, account, date: initialDate, run, onClose, onToast }) {
      const accountInfo = account ?? LEAN_ACCOUNT_FALLBACKS[0]
      const metric = accountInfo?.metric ?? 'training'
      const unit = accountInfo?.unit ?? ''
      const [value, setValue] = useState('')
      const [date, setDate] = useState(() => {
        const raw = String(initialDate ?? '')
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKey()
      })
      const [error, setError] = useState(null)
      const [saving, setSaving] = useState(false)
      const chips = metric === 'training' ? [30, 40, 60]
        : metric === 'water' ? [500, 1000]
          : metric === 'sleep' ? [7, 8]
            : []
      const hint = metric === 'training'
        ? '只记录力量训练时长；近 7 天训练天数由记录自动统计。'
        : metric === 'protein'
          ? `参考区间：${accountInfo?.targetDisplay ?? '按体重换算'}；体重缺失时显示「待补体重」，不判定。`
          : metric === 'sleep'
            ? '参考 7–9 h；同日多条记录取最大值。'
            : metric === 'water'
              ? '参考 ≥1500 ml；同日多条记录求和。'
              : ''

      async function save() {
        setError(null)
        if (!member) { setError('请先选择一位家庭成员'); return }
        const numeric = Number(value)
        if (!Number.isFinite(numeric) || numeric <= 0) { setError('请填写一个大于 0 的数值'); return }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('请选择日期'); return }
        const clock = toLocalInput().slice(11, 16)
        setSaving(true)
        let result
        try {
          result = await run('record', {
            member: member.name,
            measuredAt: `${date} ${clock}`,
            context: metric === 'sleep' ? 'morning' : 'random',
            values: { [metric]: numeric },
            source: 'form',
          })
        } finally {
          setSaving(false)
        }
        if (!result?.ok) { setError(result?.error ?? '保存失败'); return }
        onToast?.(`已存入：${member.name} · ${accountInfo?.name ?? metric} ${numeric} ${unit}`.trim())
        onClose()
      }

      return h(ModalFrame, {
        title: `${date === todayKey() ? '今日存入' : '补录存入'} · ${accountInfo?.name ?? metric}`,
        onClose,
        footer: h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: save, disabled: saving }, saving ? '保存中…' : '存入')),
      },
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' },
            `${accountInfo?.name ?? metric}${unit ? `（${unit}）` : ''}`),
          h('div', { className: 'dshh-qwrap' },
            h('input', {
              className: 'dshh-input',
              type: 'text',
              inputMode: 'decimal',
              autoComplete: 'off',
              placeholder: '—',
              'aria-label': accountInfo?.name ?? metric,
              value,
              onChange: (e) => setValue(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') save() },
            }),
            unit && h('span', { className: 'dshh-unit' }, unit)),
          chips.length > 0 && h('div', { className: 'dshh-quickfoot' }, chips.map((chip) =>
            h('button', {
              key: `chip-${chip}`,
              type: 'button',
              className: 'dshh-btn dshh-btn-sm',
              onClick: () => setValue(String(chip)),
            }, `${chip} ${unit}`))),
          h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 6 } },
            `目标：${accountInfo?.targetDisplay ?? '—'}`
            + (accountInfo?.depositLine && metric !== 'training'
              ? ` · 存入阈值 ${accountInfo.depositLine}` : '')),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '日期（默认今天，可补录历史）'),
          h('input', {
            className: 'dshh-input', type: 'date', value: date, max: todayKey(),
            'aria-label': '存入日期',
            onChange: (e) => setDate(e.target.value),
          }),
        ),
        hint && h('div', { className: 'dshh-modal-note' }, hint),
        h('div', { className: 'dshh-modal-note' },
          '训练 / 蛋白 / 水同日多条会求和，睡眠取最大值；本工具只记录行为，不提供动作、食谱或补剂建议。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
      )
    }

    /** Weekly reconciliation report with a copyable plain-text block. */
    function WeeklyReviewModal({ member, goal, onClose, onToast }) {
      const accounts = leanAccounts(goal)
      const totals = leanWeeklyTotals(goal, accounts)
      const text = weeklyReviewText({ memberName: member?.name, goal, accounts, totals })
      const rate = totals.max > 0 ? totals.deposits / totals.max : null

      async function copy() {
        const ok = await leanCopyText(text)
        onToast?.(ok ? '周报已复制为纯文本' : '复制失败，可手动选择文本')
      }

      return h(ModalFrame, { title: '本周对账单', onClose, wide: true },
        h('div', { className: 'dshh-review-grid' },
          h(ReviewStat, { label: '已存入', value: `${totals.deposits}/${totals.max} 笔` }),
          h(ReviewStat, { label: '完成度', value: fmtPercent(rate) }),
          h(ReviewStat, { label: '照片天数', value: `${totals.photoDays} 天` }),
          h(ReviewStat, { label: '记录天数', value: `${totals.recordDays} 天` })),
        h('div', { className: 'dshh-muted dshh-small' },
          `近 7 天你存入了 ${totals.deposits}/${totals.max} 笔，照片覆盖 ${totals.photoDays} 天，`
          + `有记录 ${totals.recordDays} 天。`),
        h('div', { className: 'dshh-review-sub' }, '四账户'),
        h('div', null, accounts.map((account) => {
          const week = account?.week ?? {}
          const label = week.label ?? `${week.met ?? 0}/${week.max ?? 7} 天`
          return h('div', { key: account.code ?? account.metric, className: 'dshh-review-line' },
            h('span', null, account.name ?? account.metric),
            h('span', null, label))
        })),
        h('div', { className: 'dshh-review-sub' }, '可复制文本'),
        h('div', { className: 'dshh-copybox' }, text),
        h('div', { className: 'dshh-modal-note' },
          '以上只是记录统计；断更不惩罚，下周补上即可。参考区间非医学标准，不构成诊断、训练或营养处方。'),
        h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: copy }, '复制周报'),
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭')),
      )
    }

    /** Season review: deposits, behaviour, body baseline delta, photo pair. */
    function SeasonReviewModal({ member, goal, photos, onClose, onToast }) {
      const review = seasonReviewModel(goal)
      const season = seasonMeta(goal)
      const weekly = leanWeeklyTotals(goal, leanAccounts(goal))
      // seasonReview.weeks may mean "elapsed weeks" or "season length"; keep the
      // larger value so the 12-week frame survives either contract reading.
      const totalWeeks = Math.max(
        Number(review.weeks) || 0, Number(season.weeks) || 0, 1)
      const pair = leanSeasonPhotos(season, photos)
      const text = seasonReviewText({
        memberName: member?.name,
        review: { ...review, weeks: totalWeeks },
      })

      async function copy() {
        const ok = await leanCopyText(text)
        onToast?.(ok ? '战绩已复制为纯文本（不含照片）' : '复制失败，可手动选择文本')
      }

      return h(ModalFrame, {
        title: review.ended
          ? `第 ${season.no ?? 1} 赛季结算`
          : `第 ${season.no ?? 1} 赛季预览 · 第 ${review.week}/${totalWeeks} 周`,
        onClose,
        wide: true,
      },
        h('div', { className: 'dshh-review-grid' },
          h(ReviewStat, { label: '赛季周数', value: `${review.week}/${totalWeeks}` }),
          h(ReviewStat, { label: '已过天数', value: `${review.days} 天` }),
          h(ReviewStat, { label: '本周存入', value: `${weekly.deposits}/${weekly.max} 笔` }),
          h(ReviewStat, { label: '累计存入', value: `${review.deposits} 笔` })),
        h('div', { className: 'dshh-review-sub' }, '四账户累计存入'),
        h('div', null, (review.byAccount ?? []).map((item, index) =>
          h('div', { key: item?.code ?? `account-${index}`, className: 'dshh-review-line' },
            h('span', null, item?.name ?? '账户'),
            h('span', null, `${item?.deposits ?? 0} 笔`)))),
        h('div', { className: 'dshh-review-sub' }, '行为与证据'),
        h('div', { className: 'dshh-review-grid' },
          h(ReviewStat, {
            label: '训练天数',
            value: review.trainingDays == null ? '—' : `${review.trainingDays} 天`,
            hint: review.trainingTarget == null ? null : `赛季目标 ${review.trainingTarget} 天`,
          }),
          h(ReviewStat, { label: '照片张数', value: `${review.photoCount} 张` }),
          h(ReviewStat, { label: '照片覆盖', value: `${review.photoDays} 天` }),
          h(ReviewStat, { label: '记录天数', value: `${review.recordDays} 天` })),
        h('div', { className: 'dshh-review-sub' }, '体成分基线 → 最新（只观察）'),
        (review.body ?? []).length === 0
          ? h('div', { className: 'dshh-muted dshh-small' }, '本赛季还没有可对照的体成分记录。')
          : h('div', null, review.body.map((row, index) => {
              const unit = row?.unit ? ` ${row.unit}` : ''
              const baseline = row?.baseline == null ? '—' : `${row.baseline}${unit}`
              const latestValue = row?.latest ?? row?.currentDisplay
              const latest = latestValue == null ? '—' : `${latestValue}${unit}`
              const delta = row?.deltaDisplay
                ?? observeDeltaText({ deltaSinceBaseline: row?.delta, unit: row?.unit })
              return h('div', { key: row?.metric ?? `body-${index}`, className: 'dshh-review-line' },
                h('span', null, `${row?.name ?? '体成分'}：${baseline} → ${latest}`),
                h('span', null, `${delta}${row?.band?.label ? ` · ${row.band.label}` : ''} · 只观察`))
            })),
        h('div', { className: 'dshh-review-sub' }, '本赛季照片'),
        pair.pair
          ? h('div', { className: 'dshh-compare' },
              h(CompareSide, { photo: pair.first }),
              h(CompareSide, { photo: pair.latest }))
          : h('div', { className: 'dshh-muted dshh-small' },
              '本赛季还不足两张进度照片，无法并排对比；日常「每日一拍」会留在这里。'),
        h('div', { className: 'dshh-review-sub' }, '可复制战绩'),
        h('div', { className: 'dshh-copybox' }, text),
        h('div', { className: 'dshh-modal-note' },
          `${review.note} ${LEAN_DISCLAIMER}`),
        h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: copy }, '复制战绩'),
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭')),
      )
    }

    /** Theory handbook: claim -> product mechanism -> boundary, plus sources. */
    function HandbookModal({ templates, playbook: goalPlaybook, onClose }) {
      const template = goalTemplateOf(templates, 'lean_muscle')
      const templateCards = Array.isArray(template?.playbook)
        ? template.playbook.filter(Boolean)
        : []
      // Older hosts expose the playbook on the goal progress payload instead.
      const playbook = templateCards.length > 0
        ? templateCards
        : (Array.isArray(goalPlaybook) ? goalPlaybook.filter(Boolean) : [])
      return h(ModalFrame, { title: '薄肌手册', onClose, wide: true },
        h('div', { className: 'dshh-muted dshh-small', style: { marginBottom: 12 } },
          '这里解释「为什么这样设计」：只做记录、参考区间与趋势，不提供动作、组数、食谱或补剂。网络主张是主张，不是事实。'),
        playbook.length === 0
          ? h('div', { className: 'dshh-empty', style: { padding: '18px' } },
              h('div', { className: 'dshh-empty-title' }, '手册内容暂未返回'),
              h('div', { className: 'dshh-empty-desc' },
                '当前模板没有 playbook 字段；刷新或等服务端更新后再看。这不影响记录、对账与结算。'))
          : h('div', { className: 'dshh-handbook' }, playbook.map((card, index) =>
              h('div', { key: card.id ?? `card-${index}`, className: 'dshh-handbook-card' },
                h('div', { className: 'dshh-handbook-title' },
                  `${index + 1}. ${card.title ?? '未命名'}`),
                card.claim && h('div', { className: 'dshh-handbook-row' },
                  h('span', { className: 'dshh-handbook-label' }, '网络主张'), card.claim),
                card.takeaway && h('div', { className: 'dshh-handbook-row' },
                  h('span', { className: 'dshh-handbook-label' }, '本工具怎么用'), card.takeaway),
                card.boundary && h('div', { className: 'dshh-handbook-row' },
                  h('span', { className: 'dshh-handbook-label' }, '边界'), card.boundary),
                card.source && h('div', { className: 'dshh-handbook-source' },
                  `出处：${card.source}`)))),
        h('div', { className: 'dshh-review-sub' }, '参考来源（外部链接，非本工具观点）'),
        h('div', { className: 'dshh-handbook-sources' }, LEAN_SOURCES.map((source) =>
          h('a', { key: source.url, href: source.url, target: '_blank',
            rel: 'noreferrer noopener' }, source.label))),
        h('div', { className: 'dshh-modal-note' },
          `非医学、非训练、非营养处方。${LEAN_DISCLAIMER}`),
        h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭')),
      )
    }

    /** Overview tab: hero -> coach tone -> deposits -> body -> goals. */
    function OverviewPane(props) {
      const {
        member, data, goals, templates, catalogs, contexts, photos, run,
        onToast, onEntry, onManageGoal, onSetGoal, onMetric, onDeleteRecord,
        onCapturePhoto, onOpenPhotosTab,
        onDeposit, onOpenWeekly, onOpenSeason,
      } = props
      const [tone, setTone] = useState(() => readTone(member.id))
      const [toneSeen, setToneSeen] = useState(() => readToneSeen(member.id))
      const [lineIndex, setLineIndex] = useState(0)

      useEffect(() => {
        setTone(readTone(member.id))
        setToneSeen(readToneSeen(member.id))
        setLineIndex(0)
      }, [member.id])

      const recent = data.recent ?? []
      const todayPhoto = findTodayPhoto(photos)
      const ctx = coachContext({ goals, photos, recent })
      const leanGoal = leanActiveGoalOf(goals)
      // New payloads carry accounts + season; without them (older/partial host)
      // fall back to the legacy quick-log layout instead of showing empty boards.
      const leanReady = Boolean(leanGoal
        && Array.isArray(leanGoal.accounts) && leanGoal.accounts.length > 0)
      // On an active lean dashboard the goal card and the generic "latest
      // metrics" block duplicate the accounts / body statement. Keep them for
      // the metabolic view, and keep the goal card when goals data is broken so
      // the error stays visible.
      const leanDashboard = leanReady && leanGoal?.status === 'active'
      const showGoalCards = !leanDashboard || Boolean(data.goalError)
      const hasActiveGoal = goals.some((goal) => goal.status === 'active')
      const lines = coachLines(tone, ctx)
      const line = lines.length > 0 ? lines[lineIndex % lines.length] : ''

      function chooseTone(next) {
        setTone(next)
        setLineIndex(0)
        writeTone(member.id, next)
        // The hard-mode disclosure is marked seen only when the user reads it
        // (dismissIntro); switching to gentle first must not suppress it later.
      }

      function dismissIntro() {
        setToneSeen(true)
        writeToneSeen(member.id)
      }

      return h('div', { className: 'dshh-overview' },
        h(CutHero, {
          goals, photos, recent, todayPhoto,
          onCapturePhoto, onRecord: onEntry, onOpenPhotosTab, onManageGoal,
          onOpenDeposit: onDeposit, onOpenWeekly, onOpenSeason,
        }),
        h(CoachTone, {
          mode: tone,
          line,
          onMode: chooseTone,
          onNext: () => setLineIndex((index) => index + 1),
          showIntro: tone === 'hard' && !toneSeen,
          onDismissIntro: dismissIntro,
          hidden: !hasActiveGoal,
        }),
        leanReady
          ? h(DepositCard, {
              goal: leanGoal, todayPhoto,
              onOpenDeposit: onDeposit,
              onCapturePhoto,
              onOpenPhotosTab,
            })
          : goals.length > 0 && h(QuickLog, {
              member, goals, templates, catalogs, contexts, run,
              onToast, onMore: onEntry, onSetGoal, onManageGoal,
            }),
        leanGoal && h(BodyStatement, { goal: leanGoal, onMetric }),
        showGoalCards && h(GoalCards, {
          goals, templates, error: data.goalError,
          onManage: onManageGoal, onSet: onSetGoal, onRecord: onEntry,
        }),
        !leanDashboard && h(LatestMetrics, { latest: data.latest, catalogs, onMetricClick: onMetric }),
        recent.length > 0 && h(RecentRecords, {
          records: recent, onDelete: onDeleteRecord, onRecord: onEntry,
        }),
      )
    }

    // ---------------------------------------------------------------- photos

    function PhotoCard({ photo, picked, onToggle }) {
      const [broken, setBroken] = useState(false)
      return h('button', {
        type: 'button', className: 'dshh-photo',
        'data-picked': String(Boolean(picked)),
        'aria-pressed': String(Boolean(picked)),
        onClick: onToggle,
      },
        h('div', { className: 'dshh-photo-frame' },
          broken
            ? h('div', { className: 'dshh-photo-fallback' }, '图片加载失败')
            : h('img', { className: 'dshh-photo-img', src: photoUrl(photo.id), alt: '',
                loading: 'lazy', onError: () => setBroken(true) }),
          h('span', { className: 'dshh-photo-date' }, fmtDay(photo.takenAt)),
          picked && h('span', { className: 'dshh-photo-check', 'aria-hidden': true }, '✓'),
        ),
        h('div', { className: 'dshh-photo-note' }, photo.note || '无备注'),
      )
    }

    function InspirationThumb({ photo }) {
      const [broken, setBroken] = useState(false)
      if (broken) {
        return h('div', { className: 'dshh-inspiration-thumb dshh-photo-fallback' }, '失败')
      }
      return h('img', { className: 'dshh-inspiration-thumb', src: photoUrl(photo.id), alt: '',
        onError: () => setBroken(true) })
    }

    function PhotosPane({ member, photos, photoError, season, onCapture, onCaptureInspiration, onView, onCompare, onRemovePhoto }) {
      const { progress, inspiration } = splitPhotos(photos)
      const seasonPair = leanSeasonPhotos(season, progress)
      const currentInspiration = inspiration[0] ?? null
      const [compareMode, setCompareMode] = useState(false)
      const [picked, setPicked] = useState([])
      const [confirmRemoveId, setConfirmRemoveId] = useState(null)
      const timerRef = useRef(null)

      useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current)
      }, [])

      function armRemove(id) {
        setConfirmRemoveId(id)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setConfirmRemoveId(null), 3000)
      }

      async function removeInspiration(photo) {
        if (timerRef.current) clearTimeout(timerRef.current)
        setConfirmRemoveId(null)
        await onRemovePhoto(photo)
      }

      function togglePick(photo) {
        if (!compareMode) { onView(photo); return }
        if (picked.some((item) => item.id === photo.id)) {
          setPicked(picked.filter((item) => item.id !== photo.id))
          return
        }
        const next = picked.length >= 2 ? [picked[1], photo] : [...picked, photo]
        if (next.length === 2) {
          setPicked([])
          onCompare(next[0], next[1])
        } else {
          setPicked(next)
        }
      }

      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-photohead' },
          h('div', null,
            h('span', { className: 'dshh-cardtitle' }, '每日一拍'),
            h('div', { className: 'dshh-privacy' },
              '照片只存本机，删除即删文件；不与他人比较，只看自己的变化。如记录让你焦虑，可以暂停拍摄或关闭教练语气。'),
          ),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: onCapture }, '＋ 今日一拍'),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: onCaptureInspiration }, currentInspiration ? '更换激励图' : '上传激励图'),
          ),
        ),
        photoError && h('div', { className: 'dshh-suggest', style: { marginTop: 12 } },
          h('div', { className: 'dshh-suggest-title' }, '⚠ 照片数据读取失败'),
          h('div', { className: 'dshh-suggest-note' },
            `${photoError}——指标记录与趋势仍可正常查看。`)),
        currentInspiration && h('div', { className: 'dshh-inspiration' },
          h(InspirationThumb, { photo: currentInspiration }),
          h('div', { className: 'dshh-inspiration-body' },
            h('div', { className: 'dshh-inspiration-title' }, '当前激励图'),
            h('div', { className: 'dshh-inspiration-meta' },
              `${currentInspiration.takenAt}`
              + (currentInspiration.note ? ` · ${currentInspiration.note}` : '')
              + ' · 不参与身材对比'),
          ),
          h('div', { className: 'dshh-inspiration-actions' },
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-sm',
              onClick: onCaptureInspiration }, '更换'),
            confirmRemoveId === currentInspiration.id
              ? [
                  h('button', { key: 'cancel', type: 'button', className: 'dshh-btn dshh-btn-sm',
                    onClick: () => setConfirmRemoveId(null) }, '取消'),
                  h('button', { key: 'confirm', type: 'button',
                    className: 'dshh-btn dshh-btn-sm dshh-btn-danger',
                    onClick: () => removeInspiration(currentInspiration) }, '确认移除'),
                ]
              : h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
                  onClick: () => armRemove(currentInspiration.id) }, '移除'),
          ),
        ),
        progress.length === 0
          ? h('div', { className: 'dshh-photo-empty' },
              h('div', { className: 'dshh-empty-title' }, '第一张照片，是以后对比的起点'),
              h('div', { className: 'dshh-empty-desc' },
                '记录今天，之后才有得比。照片只存本机，删除即删文件。'),
              h('div', { className: 'dshh-empty-actions' },
                h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
                  onClick: onCapture }, '＋ 现在拍一张')))
          : h('div', null,
              h('div', { className: 'dshh-photo-toolbar' },
                season && h('button', { type: 'button', className: 'dshh-btn',
                  disabled: !seasonPair.pair,
                  title: seasonPair.pair
                    ? '用本赛季第一张与最新一张并排对比'
                    : '本赛季至少需要两张进度照片',
                  onClick: () => {
                    if (seasonPair.pair) onCompare(seasonPair.first, seasonPair.latest)
                  } }, '赛季对比'),
                h('button', { type: 'button',
                  className: compareMode ? 'dshh-btn dshh-btn-primary' : 'dshh-btn',
                  onClick: () => { setCompareMode(!compareMode); setPicked([]) } },
                  compareMode ? '退出对比' : '对比模式'),
                season && !seasonPair.pair && h('span', { className: 'dshh-muted dshh-small' },
                  '赛季对比需要本赛季两张照片'),
                compareMode && h('span', { className: 'dshh-muted dshh-small' },
                  `选择两张照片对比 · 已选 ${picked.length}/2`),
                compareMode && picked.length > 0 && h('button', {
                  type: 'button', className: 'dshh-btn dshh-btn-sm',
                  onClick: () => setPicked([]),
                }, '清除选择'),
              ),
              h('div', { className: 'dshh-photowall' }, progress.map((photo) =>
                h(PhotoCard, {
                  key: photo.id, photo,
                  picked: picked.some((item) => item.id === photo.id),
                  onToggle: () => togglePick(photo),
                })))),
        h('div', { className: 'dshh-privacy', style: { marginTop: 12 } },
          '隐私：照片只保存在本机数据目录，不上传云端；删除照片会同时删除文件。'),
      )
    }

    function PhotoCaptureModal({ member, photoKind: initialKind, run, onClose, onToast }) {
      const kind = initialKind === PHOTO_KINDS.inspiration ? PHOTO_KINDS.inspiration : PHOTO_KINDS.progress
      const inspiration = kind === PHOTO_KINDS.inspiration
      const fileRef = useRef(null)
      const [preview, setPreview] = useState(null)
      const [fileName, setFileName] = useState(null)
      const [date, setDate] = useState(() => todayKey())
      const [note, setNote] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)

      async function onPick(event) {
        const file = event.target.files?.[0] ?? null
        event.target.value = ''
        if (!file) return
        setError(null)
        setBusy(true)
        try {
          const dataUrl = await compressPhoto(file)
          setPreview(dataUrl)
          setFileName(file.name || `photo-${Date.now()}.jpg`)
        } catch (cause) {
          setError(`照片处理失败：${String(cause?.message ?? cause)}`)
        } finally {
          setBusy(false)
        }
      }

      async function save() {
        setError(null)
        if (!member) { setError('请先选择一位家庭成员'); return }
        if (!preview) { setError('请先拍照或选择一张图片'); return }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('请选择照片日期'); return }
        setBusy(true)
        try {
          const result = await run('uploadPhoto', {
            member: member.name,
            dataBase64: preview,
            takenAt: date,
            note,
            fileName,
            kind,
          })
          if (!result?.ok) { setError(result?.error ?? '上传失败，请重试'); return }
          onToast(inspiration ? '激励图已保存' : '照片已保存')
          onClose()
        } catch (cause) {
          setError(`上传失败：${String(cause?.message ?? cause)}`)
        } finally {
          setBusy(false)
        }
      }

      return h(ModalFrame, {
        title: inspiration ? '上传激励图' : '今日身材照', onClose,
        footer: h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: save, disabled: busy || !preview },
            busy ? '上传中…' : inspiration ? '保存激励图' : '保存照片'),
        ),
      },
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' },
            inspiration ? '选择激励图' : '拍照 / 选择照片'),
          h('div', { className: 'dshh-upload' },
            h('input', {
              ref: fileRef, type: 'file', accept: 'image/*',
              capture: inspiration ? undefined : 'environment',
              onChange: onPick, style: { display: 'none' },
            }),
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: () => fileRef.current?.click() },
              preview ? '重新选择' : inspiration ? '选择图片' : '拍照 / 选择照片'),
            h('span', { className: 'dshh-privacy' }, '最长边压缩至 1400px · JPEG 0.82 · 仅存本机'),
          ),
        ),
        preview && h('div', { className: 'dshh-field' },
          h('img', { className: 'dshh-capture-preview', src: preview, alt: '照片预览' })),
        h('div', { className: 'dshh-field-row' },
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '日期'),
            h('input', { className: 'dshh-input', type: 'date', value: date,
              max: todayKey(), onChange: (e) => setDate(e.target.value) }),
          ),
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '备注（可选）'),
            h('input', { className: 'dshh-input',
              placeholder: inspiration ? '如：目标状态' : '如：晨起空腹',
              value: note, onChange: (e) => setNote(e.target.value) }),
          ),
        ),
        h('div', { className: 'dshh-muted dshh-small' }, inspiration
          ? '激励图只用于首页背景，不参与身材对比；真人类图片请确认你拥有使用权，本工具不内置任何真人素材。'
          : '照片只保存在本机，不上传云端；删除即删除文件。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
      )
    }

    function PhotoViewModal({ member, photo, run, onClose, onToast }) {
      const [broken, setBroken] = useState(false)
      const [confirm, setConfirm] = useState(false)
      const timerRef = useRef(null)

      useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current)
      }, [])

      function arm() {
        setConfirm(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setConfirm(false), 3000)
      }

      async function remove() {
        if (timerRef.current) clearTimeout(timerRef.current)
        setConfirm(false)
        const result = await run('removePhoto', { member: member.name, id: photo.id })
        if (result?.ok) {
          onToast('照片已删除')
          onClose()
        } else {
          onToast(result?.error ?? '删除失败')
        }
      }

      return h(ModalFrame, { title: photoKind(photo) === PHOTO_KINDS.inspiration ? '激励图' : '身材照', onClose, wide: true },
        broken
          ? h('div', { className: 'dshh-empty', style: { padding: '24px' } }, '图片加载失败，请稍后重试')
          : h('img', { className: 'dshh-photoview-img', src: photoUrl(photo.id), alt: '照片',
              onError: () => setBroken(true) }),
        h('div', { className: 'dshh-compare-meta' },
          `${photo.takenAt}${photo.note ? ` · ${photo.note}` : ''}`),
        h('div', { className: 'dshh-modal-note' }, '照片只存本机；删除会同时删除文件，不可恢复。'),
        h('div', { className: 'dshh-modal-actions' },
          confirm
            ? [
                h('button', { key: 'cancel', type: 'button', className: 'dshh-btn',
                  onClick: () => setConfirm(false) }, '取消'),
                h('button', { key: 'confirm', type: 'button', className: 'dshh-btn dshh-btn-danger',
                  onClick: remove }, '确认删除'),
              ]
            : h('button', { type: 'button', className: 'dshh-btn dshh-btn-danger',
                style: { marginRight: 'auto' }, onClick: arm }, '删除'),
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭'),
        ),
      )
    }

    function CompareSide({ photo }) {
      const [broken, setBroken] = useState(false)
      return h('div', { className: 'dshh-compare-side' },
        broken
          ? h('div', { className: 'dshh-compare-img dshh-photo-fallback' }, '图片加载失败')
          : h('img', { className: 'dshh-compare-img', src: photoUrl(photo.id), alt: '对比照片',
              onError: () => setBroken(true) }),
        h('div', { className: 'dshh-compare-meta' },
          `${photo.takenAt}${photo.note ? ` · ${photo.note}` : ''}`),
      )
    }

    function PhotoCompareModal({ photos, onClose }) {
      const pair = (photos ?? []).filter(Boolean).slice(0, 2)
      return h(ModalFrame, { title: '对比两张照片', onClose, wide: true },
        pair.length < 2
          ? h('div', { className: 'dshh-empty', style: { padding: '20px' } }, '需要选择两张照片')
          : h('div', { className: 'dshh-compare' },
              pair.map((photo) => h(CompareSide, { key: photo.id, photo }))),
        h('div', { className: 'dshh-modal-note' },
          '只看自己的变化，不评价好坏；照片只存本机，删除即删文件。'),
        h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭')),
      )
    }

    // ---------------------------------------------------------------- quick log

    function QuickLog({ member, goals, templates, catalogs, contexts, run, onToast, onMore, onSetGoal, onManageGoal }) {
      const activeGoals = (goals ?? []).filter((goal) => goal.status === 'active')
      const [goalCode, setGoalCode] = useState(activeGoals[0]?.code ?? '')
      const [vals, setVals] = useState({})
      const [time, setTime] = useState(() => toLocalInput())
      const [context, setContext] = useState(() => inferContext(toLocalInput()))
      const [contextTouched, setContextTouched] = useState(false)
      const [saving, setSaving] = useState(false)
      const [error, setError] = useState(null)
      const [info, setInfo] = useState(null)

      const metricOf = (code) => (catalogs?.metrics ?? []).find((item) => item.code === code)
        ?? { code, name: code, unit: '', decimals: 0 }

      if (activeGoals.length === 0) {
        const hasGoals = (goals ?? []).length > 0
        return h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('span', { className: 'dshh-cardtitle' }, '快速记录'),
            h('button', { type: 'button', className: 'dshh-btn-ghost', onClick: onMore }, '更多指标'),
          ),
          h('div', { className: 'dshh-muted', style: { fontSize: 12 } },
            hasGoals
              ? '当前没有进行中的管理目标，快速记录暂不可用；可点击「目标」恢复或新增目标，或直接使用「更多指标」全量录入。'
              : '先设定一个管理目标，这里会按目标给出 3–5 个高频字段；也可以先直接记录数据。'),
          h('div', { className: 'dshh-quickfoot' },
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: () => (hasGoals ? onManageGoal(goals.find((g) => g.status !== 'active') ?? goals[0]) : onSetGoal(null)) },
              hasGoals ? '管理目标' : '设定管理目标'),
            h('button', { type: 'button', className: 'dshh-btn', onClick: onMore }, '全量录入'),
          ),
        )
      }

      const current = activeGoals.find((goal) => goal.code === goalCode) ?? activeGoals[0]
      const template = goalTemplateOf(templates, current.code)
      const codes = quickMetricCodes(template)

      function updateTime(next) {
        setTime(next)
        if (!contextTouched) setContext(inferContext(next))
      }

      function setNow() {
        const now = toLocalInput()
        updateTime(now)
      }

      async function save() {
        setError(null)
        setInfo(null)
        const values = {}
        for (const code of codes) {
          const raw = vals[code]
          if (raw === '' || raw == null) continue
          const value = Number(raw)
          if (!Number.isFinite(value)) {
            setError(`「${metricOf(code).name}」不是有效数字`)
            return
          }
          values[code] = value
        }
        if (Object.keys(values).length === 0) { setError('请至少填写一个数值'); return }
        setSaving(true)
        let result
        try {
          result = await run('record', {
            member: member.name,
            measuredAt: toApiTime(time),
            context,
            values,
            source: 'form',
          })
        } finally {
          setSaving(false)
        }
        if (!result?.ok) { setError(result?.error ?? '保存失败'); return }

        const parts = Object.entries(values).map(([code, value]) => {
          const metric = metricOf(code)
          const unit = metric.unit ? ` ${metric.unit}` : ''
          return `${metric.name} ${formatMetricValue(metric, value)}${unit}`
        })
        const summary = parts.join('、')
        const warnings = result.warnings ?? []
        setVals({})
        const fresh = toLocalInput()
        setTime(fresh)
        if (!contextTouched) setContext(inferContext(fresh))
        setInfo(warnings.length > 0
          ? `已保存 ${summary}；${warnings.join('；')}`
          : `已记录：${member.name} · ${summary}`)
        onToast(warnings.length > 0
          ? `部分已记录：${member.name} · ${summary}`
          : `已记录：${member.name} · ${summary}`)
      }

      return h('section', { className: 'dshh-card dshh-quickcard' },
        h('div', { className: 'dshh-quickhead' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h('span', { className: 'dshh-cardtitle' }, '快速记录'),
            activeGoals.length > 1 && h('div', { className: 'dshh-seg', role: 'group', 'aria-label': '选择目标' },
              activeGoals.map((goal) => h('button', {
                key: goal.code, type: 'button', className: 'dshh-segbtn',
                'data-active': String(goal.code === current.code),
                'aria-pressed': String(goal.code === current.code),
                onClick: () => { setGoalCode(goal.code); setError(null) },
              }, goal.shortName ?? goal.name))),
            activeGoals.length === 1 && h('span', { className: 'dshh-muted dshh-small' },
              `按「${current.name}」`),
          ),
          h('button', { type: 'button', className: 'dshh-btn-ghost', onClick: onMore }, '更多指标'),
        ),
        h('div', { className: 'dshh-quickfields' }, codes.map((code) => {
          const metric = metricOf(code)
          return h('label', { key: code, className: 'dshh-qfield' },
            h('span', { className: 'dshh-qname' }, metric.name),
            h('span', { className: 'dshh-qwrap' },
              h('input', {
                className: 'dshh-input',
                type: 'text',
                inputMode: 'decimal',
                autoComplete: 'off',
                placeholder: '—',
                'aria-label': metric.name,
                value: vals[code] ?? '',
                onChange: (e) => setVals({ ...vals, [code]: e.target.value }),
              }),
              metric.unit && h('span', { className: 'dshh-unit' }, metric.unit),
            ),
          )
        })),
        h('div', { className: 'dshh-quickmeta' },
          h('label', { className: 'dshh-qfield', style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
            h('span', { className: 'dshh-qname' }, '时间'),
            h('input', {
              className: 'dshh-input', type: 'datetime-local', value: time,
              'aria-label': '测量时间',
              onChange: (e) => updateTime(e.target.value),
            }),
          ),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-sm',
            onClick: setNow }, '现在'),
          h('label', { className: 'dshh-qfield', style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
            h('span', { className: 'dshh-qname' }, '情境'),
            h('select', {
              className: 'dshh-select', style: { width: 'auto' }, value: context,
              'aria-label': '测量情境',
              onChange: (e) => { setContext(e.target.value); setContextTouched(true) },
            }, contexts.map((item) => h('option', { key: item.code, value: item.code }, item.name))),
          ),
        ),
        h('div', { className: 'dshh-quickfoot' },
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: save, disabled: saving }, saving ? '保存中…' : '保存记录'),
          h('span', { className: 'dshh-muted dshh-small' }, '时间可补录历史；情境已按时间自动推断，可手动修改'),
        ),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
        info && h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 8 } }, info),
      )
    }

    // ---------------------------------------------------------------- latest metrics

    function LatestMetrics({ latest, catalogs, onMetricClick }) {
      const rows = latest ?? []
      if (rows.length === 0) return null
      const order = new Map((catalogs?.categories ?? []).map((item, index) => [item.code, index]))
      const sorted = rows.slice().sort((a, b) =>
        (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99))
      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('span', { className: 'dshh-cardtitle' }, '最新指标'),
          h('span', { className: 'dshh-muted dshh-small' }, '点击查看全部记录'),
        ),
        h('div', { className: 'dshh-chips' }, sorted.map((item) =>
          h('button', {
            key: item.code, type: 'button', className: 'dshh-chip dshh-chip-clickable',
            'data-status': item.status,
            onClick: () => onMetricClick(item.code),
          },
            h('span', { className: 'dshh-chipname' }, item.name),
            h('span', { className: 'dshh-chiprow' },
              h('span', { className: 'dshh-chipval' }, item.display),
              h('span', { className: 'dshh-chipunit' }, item.unit)),
            h('span', { className: 'dshh-chipmeta' },
              `${fmtTime(item.measuredAt)} · ${item.context}`),
          ))),
      )
    }

    // ---------------------------------------------------------------- recent records

    function RecentRecords({ records, onDelete, onRecord }) {
      const rows = (records ?? []).slice(0, RECORDS_SHOWN)
      const [confirmId, setConfirmId] = useState(null)
      const timerRef = useRef(null)

      useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current)
      }, [])

      function arm(id) {
        setConfirmId(id)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setConfirmId(null), 3000)
      }

      async function confirm(id) {
        if (timerRef.current) clearTimeout(timerRef.current)
        setConfirmId(null)
        await onDelete(id)
      }

      if (rows.length === 0) {
        return h('section', { className: 'dshh-card dshh-empty' },
          h('div', { className: 'dshh-empty-title' }, '还没有记录'),
          h('div', { className: 'dshh-empty-desc' }, '记录一条今天的指标，就能看到趋势和目标差距。'),
          h('div', { className: 'dshh-empty-actions' },
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: onRecord }, '＋ 记录')),
        )
      }

      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('span', { className: 'dshh-cardtitle' }, '最近记录'),
          h('span', { className: 'dshh-muted dshh-small' },
            `最近 ${rows.length} 条`),
        ),
        h('div', { className: 'dshh-records' }, rows.map((record) =>
          h('div', { key: record.id, className: 'dshh-rec', title: record.note || undefined },
            h('div', { className: 'dshh-rec-time' }, fmtTime(record.measuredAt)),
            h('div', { className: 'dshh-rec-main' },
              h('div', { className: 'dshh-rec-vals' }, recordValueSummary(record.values)),
              h('div', { className: 'dshh-rec-meta' },
                `${record.context} · ${RECORD_SOURCE_LABEL[record.source] ?? record.source}`
                + (record.note ? ` · ${record.note}` : '')),
            ),
            h('div', { className: 'dshh-rec-actions' },
              confirmId === record.id
                ? [
                  h('button', { key: 'cancel', type: 'button', className: 'dshh-btn dshh-btn-sm',
                    onClick: () => setConfirmId(null) }, '取消'),
                  h('button', { key: 'confirm', type: 'button', className: 'dshh-btn dshh-btn-sm dshh-btn-danger',
                    onClick: () => confirm(record.id) }, '确认删除'),
                ]
                : h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
                    onClick: () => arm(record.id) }, '删除'),
            ),
          ))),
      )
    }

    // ---------------------------------------------------------------- trends

    function TrendsPane({ series, goalCodes, catalogs, onMetricClick, onRecord }) {
      const [onlyGoal, setOnlyGoal] = useState(true)
      const all = series ?? {}
      const goalSet = goalCodes ?? new Set()
      const hasGoalMetrics = goalSet.size > 0
      const withData = Object.keys(all).filter((code) => (all[code]?.points ?? []).length > 0)
      const categoryOrder = new Map((catalogs?.categories ?? []).map((item, index) => [item.code, index]))
      const metricCategory = (code) => (catalogs?.metrics ?? []).find((item) => item.code === code)?.category

      const selected = (onlyGoal && hasGoalMetrics)
        ? withData.filter((code) => goalSet.has(code))
        : withData
      const ordered = selected.slice().sort((a, b) => {
        const goalRank = (code) => (goalSet.has(code) ? 0 : 1)
        const rankDiff = goalRank(a) - goalRank(b)
        if (rankDiff !== 0) return rankDiff
        const catDiff = (categoryOrder.get(metricCategory(a)) ?? 99)
          - (categoryOrder.get(metricCategory(b)) ?? 99)
        if (catDiff !== 0) return catDiff
        return a < b ? -1 : 1
      })

      const groups = []
      const consumed = new Set()
      if (ordered.includes('sbp') || ordered.includes('dbp')) {
        const list = [all.sbp, all.dbp].filter((item) => item && (item.points ?? []).length > 0)
        if (list.length > 0) {
          groups.push({ key: 'bp', title: '血压', seriesList: list,
            band: list[0]?.band ?? {}, clickCode: list[0].code })
        }
        consumed.add('sbp')
        consumed.add('dbp')
      }
      const lipidCodes = ['tc', 'tg', 'ldl', 'hdl'].filter((code) =>
        ordered.includes(code) && !consumed.has(code))
      if (lipidCodes.length > 0) {
        groups.push({ key: 'lipid', title: '血脂',
          seriesList: lipidCodes.map((code) => all[code]),
          band: all[lipidCodes[0]]?.band ?? {}, clickCode: lipidCodes[0] })
        lipidCodes.forEach((code) => consumed.add(code))
      }
      ordered.forEach((code) => {
        if (consumed.has(code)) return
        groups.push({ key: code, title: all[code].name, seriesList: [all[code]],
          band: all[code].band ?? {}, clickCode: code })
      })

      const showToggle = hasGoalMetrics
      const emptyText = withData.length === 0
        ? '还没有可用于绘图的记录。'
        : '目标相关指标还没有记录；可关闭「仅看目标指标」查看全部指标。'

      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('span', { className: 'dshh-cardtitle' }, '趋势'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
            showToggle && h('label', { className: 'dshh-switch' },
              h('input', { type: 'checkbox', checked: onlyGoal,
                onChange: (e) => setOnlyGoal(e.target.checked) }),
              '仅看目标指标'),
            h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
              onClick: onRecord }, '＋ 记录'),
          ),
        ),
        groups.length === 0
          ? h('div', { className: 'dshh-empty', style: { padding: '20px' } },
              h('div', { className: 'dshh-empty-desc' }, emptyText),
              h('div', { className: 'dshh-empty-actions' },
                h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
                  onClick: onRecord }, '＋ 记录')))
          : h('div', { className: 'dshh-trend-grid' }, groups.map((group) =>
              h('div', { key: group.key, className: 'dshh-trend-cell' },
                h('div', { className: 'dshh-trend-head' },
                  h('span', { className: 'dshh-trend-title' }, group.title),
                  h('div', { className: 'dshh-chart-legend' },
                    group.seriesList.map((item, index) =>
                      h('span', { key: item.code, className: 'dshh-chart-legend-item' },
                        h('span', { className: 'dshh-chart-swatch',
                          style: { background: SERIES_COLORS[index % SERIES_COLORS.length] } }),
                        item.name)),
                  ),
                ),
                h(LineChart, { seriesList: group.seriesList, band: group.band,
                  onClick: () => onMetricClick?.(group.clickCode) }),
                group.band?.label && h('div', { className: 'dshh-muted',
                  style: { fontSize: '10.5px', marginTop: 4 } }, `参考：${group.band.label}`),
              ))),
        h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 10 } },
          '点击图表查看该指标的全部记录。'),
      )
    }

    // ---------------------------------------------------------------- archive

    function ConditionChips({ conditions, onRemove, onManage }) {
      const items = conditions ?? []
      if (items.length === 0) {
        return h('div', { className: 'dshh-muted', style: { fontSize: 12 } },
          '还没有疾病标签。标签只来自医生诊断或你的确认；如需添加，点击右上角「管理标签」。',
          onManage && h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
            style: { marginLeft: 6 }, onClick: onManage }, '添加标签'))
      }
      return h('div', { className: 'dshh-chips' }, items.map((item) =>
        h('span', { key: item.id, className: 'dshh-condchip' },
          item.name,
          h('span', { className: 'src' }, CONDITION_SOURCE_LABEL[item.source] ?? item.source),
          h('span', { className: 'dshh-condchip-remove', title: '移除标签', role: 'button',
            'aria-label': `移除 ${item.name}`,
            onClick: () => onRemove(item.code) }, '×'),
        )))
    }

    function Suggestions({ suggestions, onConfirm }) {
      if (!suggestions || suggestions.length === 0) return null
      return h('div', { className: 'dshh-suggest' },
        h('div', { className: 'dshh-suggest-title' }, '⚠ 部分指标达到提示切点'),
        suggestions.map((s) =>
          h('div', { key: s.code, className: 'dshh-suggest-row' },
            h('div', null,
              h('div', null, s.name),
              h('div', { className: 'dshh-suggest-note' }, s.note),
            ),
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: () => onConfirm(s.code) }, '医生已诊断，添加标签'),
          )),
        h('div', { className: 'dshh-suggest-note', style: { marginTop: 8 } },
          '以上只是录入数值达到公开切点的提示，不构成诊断；是否添加疾病标签请以医生诊断为准。'),
      )
    }

    function TargetGaps({ conditions, onManage }) {
      if (!conditions || conditions.length === 0) return null
      return h('div', null,
        h('div', { className: 'dshh-cardhead', style: { marginBottom: 10 } },
          h('span', { className: 'dshh-muted dshh-small' }, '医生诊断相关的指标目标'),
          h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
            onClick: onManage }, '管理标签'),
        ),
        conditions.map((group) =>
          h('div', { key: group.code, className: 'dshh-condgroup' },
            h('div', { className: 'dshh-condgroup-head' },
              h('span', { className: 'dshh-condgroup-name' }, group.name),
              h('span', { className: 'dshh-condgroup-src' },
                CONDITION_SOURCE_LABEL[group.source] ?? group.source),
            ),
            h('div', { className: 'dshh-gapgrid' }, group.targets.map((target) =>
              h('div', { key: target.metric, className: 'dshh-gap' },
                h('div', { className: 'dshh-gap-top' },
                  h('span', { className: 'dshh-gap-name' },
                    `${target.name}（${target.unit}）`),
                  h('span', { className: 'dshh-gap-status', 'data-status': target.status },
                    target.status === 'high' ? '偏高'
                      : target.status === 'low' ? '偏低'
                        : target.status === 'normal' ? '达标' : '—'),
                ),
                h('div', { className: 'dshh-gap-vals' },
                  h('span', { className: 'dshh-gap-cur',
                    style: { color: STATUS_STYLE[target.status] } }, target.currentDisplay ?? '—'),
                  h('span', { className: 'dshh-gap-target' },
                    target.kind === 'range'
                      ? (target.low !== null && target.high !== null
                          ? `目标 ${target.low}–${target.high}`
                          : target.high !== null
                            ? `目标 <${target.high}`
                            : target.low !== null
                              ? `目标 ≥${target.low}`
                              : '观察趋势')
                      : target.high !== null
                        ? `目标 <${target.high}`
                        : '观察趋势'),
                ),
                h('div', { className: 'dshh-muted', style: { fontSize: '10.5px', marginTop: 4 } },
                  target.measuredAt ? `最近 ${fmtTime(target.measuredAt)}` : '暂无数据'),
              ))),
          )),
      )
    }

    function DocumentSection({ documents, catalogs, onAdd, onRemove }) {
      const types = catalogs?.documentTypes ?? []
      const [filter, setFilter] = useState(null)
      const rows = documents ?? []
      const shown = filter ? rows.filter((item) => item.type === filter) : rows
      const typeName = (code) => types.find((item) => item.code === code)?.name ?? code
      const icons = { medical_record: '📄', prescription: '💊', lab_report: '🧪', imaging: '🩻', other: '📎' }

      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('span', { className: 'dshh-cardtitle' }, '健康档案'),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            types.length > 0 && h('select', {
              className: 'dshh-select', style: { width: 'auto' }, value: filter ?? '',
              'aria-label': '按类型筛选档案',
              onChange: (e) => setFilter(e.target.value || null),
            },
              h('option', { value: '' }, '全部类型'),
              types.map((item) => h('option', { key: item.code, value: item.code }, item.name)),
            ),
            h('button', { type: 'button', className: 'dshh-btn', onClick: onAdd }, '＋ 登记档案'),
          ),
        ),
        rows.length === 0
          ? h('div', { className: 'dshh-muted', style: { fontSize: 12 } },
              '还没有档案。上传的病历、处方、检验报告可在此登记管理；文件上传请在对话中发送，助手会帮你归档。')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              shown.map((item) =>
                h('div', { key: item.id, className: 'dshh-doc' },
                  h('span', { className: 'dshh-doc-icon', 'aria-hidden': true },
                    icons[item.type] ?? '📎'),
                  h('div', { className: 'dshh-doc-body' },
                    h('div', { className: 'dshh-doc-title' }, item.title),
                    h('div', { className: 'dshh-doc-meta' },
                      `${typeName(item.type)} · ${item.docDate}`
                      + (item.fileName ? ` · ${item.fileName}` : '')
                      + (item.note ? ` · ${item.note}` : '')),
                  ),
                  h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
                    onClick: () => onRemove(item.id), title: '删除' }, '删除'),
                )),
              shown.length === 0 && h('div', { className: 'dshh-muted dshh-small' },
                '该类型暂无档案'),
            ),
      )
    }

    function ArchiveHub({
      member, data, catalogs, photos, photoError, season, series, goalCodes,
      section, onSection, onRecord, onMetricClick, onCapture, onCaptureInspiration,
      onView, onCompare, onRemovePhoto, onAddDocument, onRemoveDocument,
      onRemoveCondition, onAddCondition, onManageConditions,
    }) {
      const sections = [
        { code: 'trends', name: '趋势', hint: '指标变化' },
        { code: 'photos', name: '照片', hint: '进度与激励' },
        { code: 'documents', name: '资料', hint: '病历与标签' },
      ]
      const current = sections.some((item) => item.code === section) ? section : 'trends'
      const photoCount = photos?.length ?? 0
      const documentCount = Array.isArray(data?.documents) ? data.documents.length : 0
      const conditionCount = Array.isArray(data?.conditions) ? data.conditions.length : 0
      const trendCount = Array.isArray(series)
        ? series.length
        : Object.keys(series ?? {}).length

      const stat = (value, label, target) => h('button', {
        type: 'button', className: 'dshh-archive-stat',
        onClick: () => onSection(target),
      },
        h('b', null, String(value)),
        h('span', null, label))

      return h('div', { className: 'dshh-archivehub' },
        h('section', { className: 'dshh-card dshh-archivehead' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '健康档案'),
              h('div', { className: 'dshh-muted dshh-small' },
                '趋势、照片与医疗资料放在同一个地方；它们都是档案的一部分。'))),
          h('div', { className: 'dshh-archive-stats' },
            stat(photoCount, '张照片', 'photos'),
            stat(documentCount, '份医疗档案', 'documents'),
            stat(conditionCount, '个健康标签', 'documents'),
            stat(trendCount, '项趋势指标', 'trends')),
          h('div', { className: 'dshh-archive-actions' },
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: onRecord }, '记录指标'),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: onAddDocument }, '上传档案'),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: onCapture }, '拍一张'))),
        h('nav', { className: 'dshh-archivenav', role: 'tablist' },
          sections.map((item) => h('button', {
            key: item.code,
            type: 'button',
            role: 'tab',
            className: 'dshh-archivenav-btn',
            'data-active': String(current === item.code),
            'aria-selected': String(current === item.code),
            onClick: () => onSection(item.code),
          },
            h('span', null, item.name),
            h('small', null, item.hint)))),
        current === 'trends' && h(TrendsPane, {
          series, goalCodes, catalogs, onMetricClick, onRecord,
        }),
        current === 'photos' && h(PhotosPane, {
          member, photos, photoError, season,
          onCapture, onCaptureInspiration, onView, onCompare, onRemovePhoto,
        }),
        current === 'documents' && h(ArchivePane, {
          member, data, catalogs,
          onAddDocument, onRemoveDocument, onRemoveCondition, onAddCondition, onManageConditions,
        }),
      )
    }

    function ArchivePane({ member, data, catalogs, onAddDocument, onRemoveDocument, onRemoveCondition, onAddCondition, onManageConditions }) {
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h(DocumentSection, {
          documents: data.documents, catalogs,
          onAdd: onAddDocument, onRemove: onRemoveDocument,
        }),
        h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('span', { className: 'dshh-cardtitle' }, '健康资料'),
            h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
              onClick: onManageConditions }, '管理标签'),
          ),
          h('div', { className: 'dshh-archsub' }, '疾病标签'),
          h(ConditionChips, {
            conditions: data.conditions,
            onRemove: onRemoveCondition,
            onManage: onManageConditions,
          }),
          h(Suggestions, { suggestions: data.suggestions, onConfirm: onAddCondition }),
          (data.conditionTargets ?? []).length > 0
            ? h(TargetGaps, { conditions: data.conditionTargets, onManage: onManageConditions })
            : h('div', null,
                h('div', { className: 'dshh-archsub' }, '医生诊断相关的指标目标'),
                h('div', { className: 'dshh-muted', style: { fontSize: 12 } },
                  '还没有疾病标签目标。疾病标签只记录医生诊断或你确认的情况，与「管理目标」相互独立。')),
        ),
      )
    }

    // ---------------------------------------------------------------- footer

    function FooterNote({ text, onOpen }) {
      return h('div', { className: 'dshh-footer' },
        h('span', { className: 'dshh-muted dshh-small', style: { whiteSpace: 'nowrap' } }, '免责声明'),
        h('span', { className: 'dshh-muted dshh-small dshh-clamp', title: text }, text),
        h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
          onClick: onOpen }, '全文'),
      )
    }

    // ------------------------------------------------------------- modals

    function ModalHost({ modal, data, catalogs, busy, run, onClose, onOpenMember, onOpenGoal, onNewGoal, onToast, onDeleteMember }) {
      const member = data?.member ?? null

      if (modal.kind === 'member') {
        return h(MemberModal, { member: modal.member, catalogs, busy, run, onClose, onDeleteMember })
      }
      if (modal.kind === 'members') {
        return h(MembersModal, {
          members: data?.members ?? [], onEdit: (item) => onOpenMember(item),
          onAdd: () => onOpenMember(null), onClose,
        })
      }
      if (modal.kind === 'goalList') {
        return h(GoalListModal, {
          goals: data?.goals ?? [],
          onManage: (goal) => onOpenGoal(goal),
          onAdd: onNewGoal,
          onClose,
        })
      }
      if (modal.kind === 'entry') {
        return h(EntryModal, {
          member, catalogs, contexts: catalogs?.contexts ?? CONTEXT_FALLBACK,
          busy, run, onClose, onToast,
          goalCodes: goalMetricCodeSet(data?.goals, data?.goalTemplates),
        })
      }
      if (modal.kind === 'document') {
        return h(DocumentModal, { member, catalogs, busy, run, onClose, onToast })
      }
      if (modal.kind === 'condition') {
        return h(ConditionModal, { member, data, busy, run, onClose, onToast })
      }
      if (modal.kind === 'goal') {
        return h(GoalModal, {
          member, data, busy, run, onClose,
          existing: modal.existing ?? null, initialCode: modal.code ?? null, onToast,
        })
      }
      if (modal.kind === 'photoCapture') {
        return h(PhotoCaptureModal, {
          member,
          photoKind: modal.photoKind === 'inspiration' ? 'inspiration' : 'progress',
          run, onClose, onToast,
        })
      }
      if (modal.kind === 'photoView') {
        return h(PhotoViewModal, { member, photo: modal.photo, run, onClose, onToast })
      }
      if (modal.kind === 'photoCompare') {
        return h(PhotoCompareModal, { photos: modal.photos ?? [], onClose })
      }
      if (modal.kind === 'deposit') {
        return h(DepositModal, {
          member,
          account: modal.account ?? leanAccounts(leanGoalOf(data?.goals))[0] ?? null,
          date: modal.date ?? todayKey(),
          run, onClose, onToast,
        })
      }
      if (modal.kind === 'weeklyReview') {
        return h(WeeklyReviewModal, {
          member,
          goal: leanGoalOf(data?.goals),
          onClose, onToast,
        })
      }
      if (modal.kind === 'seasonReview') {
        return h(SeasonReviewModal, {
          member,
          goal: leanGoalOf(data?.goals),
          photos: data?.photos ?? [],
          onClose, onToast,
        })
      }
      if (modal.kind === 'shareSeason') {
        return h(ShareSeasonModal, {
          member,
          goal: leanGoalOf(data?.goals),
          onClose, onToast,
        })
      }
      if (modal.kind === 'squad') {
        return h(SquadModal, {
          member,
          goal: leanGoalOf(data?.goals),
          recent: data?.recent ?? [],
          photos: data?.photos ?? [],
          onClose, onToast,
        })
      }
      if (modal.kind === 'handbook') {
        return h(HandbookModal, {
          templates: data?.goalTemplates ?? [],
          playbook: leanGoalOf(data?.goals)?.playbook ?? null,
          onClose,
        })
      }
      if (modal.kind === 'metric') {
        return h(MetricDetailModal, { code: modal.code, data, onClose })
      }
      if (modal.kind === 'disclaimer') {
        return h(ModalFrame, { title: '免责声明与使用边界', onClose },
          h('div', { className: 'dshh-note', style: { border: 'none', background: 'transparent', padding: 0 } },
            data?.disclaimer),
          h('div', { className: 'dshh-modal-note' },
            '管理目标表示你想管理什么，不代表诊断或患病结论；目标值来自通用参考区间，个人目标与是否患病请以医生意见为准。薄肌等体态目标的参考区间来自运动/营养公开共识，非医学标准，不构成训练、营养或用药处方。'),
          h('div', { className: 'dshh-modal-actions' },
            h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭')),
        )
      }
      return null
    }

    function MembersModal({ members, onEdit, onAdd, onClose }) {
      return h(ModalFrame, { title: '管理成员', onClose },
        h('div', { className: 'dshh-memberlist' }, members.map((item) =>
          h('div', { key: item.id, className: 'dshh-memberrow' },
            h('div', null,
              h('div', { className: 'dshh-memberrow-name' }, item.name),
              h('div', { className: 'dshh-muted dshh-small' },
                `${item.relation} · ${item.sex} · ${item.riskLevel}`),
            ),
            h('button', { type: 'button', className: 'dshh-btn', onClick: () => onEdit(item) }, '编辑'),
          ))),
        h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn',
            style: { marginRight: 'auto' }, onClick: onAdd }, '＋ 添加成员'),
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭'),
        ),
      )
    }

    /** Compact goal switcher: manage one goal or add another without leaving the panel. */
    function GoalListModal({ goals, onManage, onAdd, onClose }) {
      return h(ModalFrame, { title: '管理目标', onClose,
        footer: h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn',
            style: { marginRight: 'auto' }, onClick: onAdd }, '＋ 设定新目标'),
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭'),
        ),
      },
        goals.length === 0
          ? h('div', { className: 'dshh-empty', style: { padding: '20px' } }, '还没有管理目标')
          : h('div', { className: 'dshh-memberlist' }, goals.map((goal) =>
              h('div', { key: goal.id ?? goal.code, className: 'dshh-memberrow' },
                h('div', { style: { minWidth: 0 } },
                  h('div', { className: 'dshh-memberrow-name' },
                    goal.name,
                    h('span', { className: 'dshh-goalchip', 'data-status': goal.status },
                      goal.statusName ?? GOAL_STATUS_LABEL[goal.status] ?? goal.status)),
                  h('div', { className: 'dshh-muted dshh-small' },
                    `达标 ${goal.coverage?.met ?? 0}/${goal.coverage?.evaluable ?? 0}`
                    + ` · 最近记录 ${goal.coverage?.lastRecordAt ? fmtTime(goal.coverage.lastRecordAt) : '暂无'}`),
                ),
                h('button', { type: 'button', className: 'dshh-btn', onClick: () => onManage(goal) }, '管理'),
              ))),
      )
    }

    /** Full record list for one metric, opened from a chart or a latest chip. */
    function MetricDetailModal({ code, data, onClose }) {
      const rows = data?.recordsByMetric?.[code] ?? []
      const metric = data?.latest?.find((item) => item.code === code)
      const seriesMeta = data?.series?.[code]
      const name = metric?.name ?? seriesMeta?.name ?? code
      const unit = metric?.unit ?? seriesMeta?.unit ?? ''

      const stats = useMemo(() => {
        if (rows.length === 0) return null
        const vals = rows.map((row) => row.value)
        const sum = vals.reduce((a, b) => a + b, 0)
        return {
          count: vals.length,
          mean: (sum / vals.length).toFixed(1),
          min: Math.min(...vals),
          max: Math.max(...vals),
        }
      }, [rows])

      return h(ModalFrame, { title: `${name}（${unit}）记录`, onClose },
        stats && h('div', { className: 'dshh-muted', style: { fontSize: '11.5px', marginBottom: 12 } },
          `共 ${stats.count} 条 · 均值 ${stats.mean} · 最低 ${stats.min} · 最高 ${stats.max}`),
        rows.length === 0
          ? h('div', { className: 'dshh-empty', style: { padding: '20px' } }, '暂无该指标记录')
          : h('div', { style: { maxHeight: '52vh', overflowY: 'auto' } },
              h('table', { className: 'dshh-table' },
                h('thead', null, h('tr', null,
                  h('th', { style: { width: 130 } }, '时间'),
                  h('th', { style: { width: 90 } }, '数值'),
                  h('th', { style: { width: 62 } }, '情境'),
                  h('th', { style: { width: 52 } }, '来源'),
                )),
                h('tbody', null, rows.map((row) =>
                  h('tr', { key: row.id },
                    h('td', { className: 'dshh-num dshh-muted' }, row.measuredAt),
                    h('td', { className: 'dshh-num', style: { fontWeight: 600 } },
                      `${row.display} ${unit}`),
                    h('td', { className: 'dshh-muted' }, row.context),
                    h('td', { className: 'dshh-muted' },
                      RECORD_SOURCE_LABEL[row.source] ?? row.source),
                  ))),
              ),
            ),
        h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭')),
      )
    }

    function MemberModal({ member, catalogs, busy, run, onClose, onDeleteMember }) {
      const editing = Boolean(member)
      const [name, setName] = useState(member?.name ?? '')
      const [sex, setSex] = useState(member?.sexCode ?? 'male')
      const [relation, setRelation] = useState(member?.relationCode ?? 'self')
      const [riskLevel, setRiskLevel] = useState(member?.riskCode ?? 'low')
      const [birthYear, setBirthYear] = useState(member?.birthYear ?? '')
      const [note, setNote] = useState(member?.note ?? '')
      const [error, setError] = useState(null)
      const [confirmDelete, setConfirmDelete] = useState(false)

      async function save() {
        setError(null)
        if (!name.trim()) { setError('请填写称呼'); return }
        const patch = { name, sex, relation, riskLevel }
        patch.birthYear = birthYear === '' ? undefined : Number(birthYear)
        patch.note = note
        const result = editing
          ? await run('updateMember', { member: member.name, patch })
          : await run('createMember', { name, sex, relation, riskLevel, birthYear: patch.birthYear, note })
        if (result?.ok) onClose()
        else setError(result?.error ?? '保存失败')
      }

      return h(ModalFrame, { title: editing ? '编辑成员' : '添加成员', onClose },
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '称呼（必填）'),
          h('input', { className: 'dshh-input', placeholder: '如：我',
            value: name, onChange: (e) => setName(e.target.value) }),
        ),
        h('div', { className: 'dshh-field-row' },
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '性别（必填）'),
            h('select', { className: 'dshh-select', value: sex,
              onChange: (e) => setSex(e.target.value) },
              h('option', { value: 'male' }, '男'), h('option', { value: 'female' }, '女')),
          ),
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '与本人关系'),
            h('select', { className: 'dshh-select', value: relation,
              onChange: (e) => setRelation(e.target.value) },
              (catalogs?.relations ?? []).map((item) =>
                h('option', { key: item.code, value: item.code }, item.name))),
          ),
        ),
        h('div', { className: 'dshh-field-row' },
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '心血管风险分层'),
            h('select', { className: 'dshh-select', value: riskLevel,
              onChange: (e) => setRiskLevel(e.target.value) },
              (catalogs?.riskLevels ?? []).map((item) =>
                h('option', { key: item.code, value: item.code }, item.name))),
          ),
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '出生年份'),
            h('input', { className: 'dshh-input', placeholder: '如 1965',
              inputMode: 'numeric', value: birthYear,
              onChange: (e) => setBirthYear(e.target.value) }),
          ),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '备注（如既往病史，仅记录不作判断）'),
          h('input', { className: 'dshh-input', value: note,
            onChange: (e) => setNote(e.target.value) }),
        ),
        h('div', { className: 'dshh-muted', style: { fontSize: '11px' } },
          '性别用于尿酸与 HDL 的参考区间；风险分层影响 LDL 目标值。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
        h('div', { className: 'dshh-modal-actions' },
          editing && h('button', { type: 'button', className: 'dshh-btn dshh-btn-danger',
            style: { marginRight: 'auto' }, onClick: () => setConfirmDelete(true) }, '删除'),
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: save, disabled: busy }, busy ? '保存中…' : '保存'),
        ),
        confirmDelete && h('div', {
          style: { marginTop: 14, padding: 12, border: '1px solid var(--dsw-alias-state-error-primary)', borderRadius: 10 },
        },
          h('div', { style: { fontSize: 12.5, marginBottom: 8 } },
            `确定删除「${member.name}」吗？其全部测量记录、疾病标签、档案和管理目标将被一并删除，不可恢复。`),
          h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: () => setConfirmDelete(false) }, '再想想'),
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-danger',
              onClick: async () => { const result = await onDeleteMember(member.name, true); if (result?.ok) onClose() } },
              '确认删除'),
          ),
        ),
      )
    }

    function EntryModal({ member, catalogs, contexts, busy, run, onClose, onToast, goalCodes }) {
      const metrics = catalogs?.metrics ?? []
      const [vals, setVals] = useState({})
      const [time, setTime] = useState(() => toLocalInput())
      const [context, setContext] = useState(() => inferContext(toLocalInput()))
      const [contextTouched, setContextTouched] = useState(false)
      const [error, setError] = useState(null)
      const [warnings, setWarnings] = useState([])
      const [saving, setSaving] = useState(false)

      // Categories and metric membership come from the host catalog, so new
      // metrics (body composition / diet / activity) appear without a code change.
      // Fallback grouping is kept for an older host that omits catalogs.categories.
      const FALLBACK_CATEGORIES = [
        { code: 'vital', name: '血压 / 心率 / 尿酸', codes: ['sbp', 'dbp', 'hr', 'ua'] },
        { code: 'glucose', name: '血糖', codes: ['fpg', 'ppg', 'hba1c'] },
        { code: 'lipid', name: '血脂', codes: ['tc', 'tg', 'ldl', 'hdl'] },
        { code: 'body', name: '体重 / 体成分', codes: ['weight', 'bmi', 'bodyfat', 'muscle', 'waist'] },
        { code: 'diet', name: '饮食 / 睡眠 / 饮水', codes: ['protein', 'water', 'sleep'] },
        { code: 'activity', name: '运动', codes: ['training'] },
      ]
      const categories = (catalogs?.categories ?? []).length > 0
        ? catalogs.categories.map((category) => ({ code: category.code, name: category.name, codes: null }))
        : FALLBACK_CATEGORIES
      const groups = categories
        .map((category) => ({
          code: category.code,
          name: category.name,
          metrics: category.codes
            ? category.codes.map((code) => metrics.find((item) => item.code === code)).filter(Boolean)
            : metrics.filter((item) => item.category === category.code),
        }))
        .filter((group) => group.metrics.length > 0)

      const related = goalCodes ?? new Set()
      const initialOpen = () => {
        const open = new Set()
        for (const group of groups) {
          if (group.metrics.some((metric) => related.has(metric.code))) open.add(group.code)
        }
        if (open.size === 0 && groups.length > 0) open.add(groups[0].code)
        return open
      }
      const [openCats, setOpenCats] = useState(initialOpen)

      function toggleCat(code) {
        const next = new Set(openCats)
        if (next.has(code)) next.delete(code)
        else next.add(code)
        setOpenCats(next)
      }

      function updateTime(next) {
        setTime(next)
        if (!contextTouched) setContext(inferContext(next))
      }

      const filledIn = (group) => group.metrics.filter((metric) => {
        const raw = vals[metric.code]
        return raw !== '' && raw != null
      }).length

      async function save() {
        setError(null)
        setWarnings([])
        const values = {}
        for (const [code, raw] of Object.entries(vals)) {
          if (raw === '' || raw == null) continue
          const value = Number(raw)
          if (!Number.isFinite(value)) {
            const metric = metrics.find((item) => item.code === code)
            setError(`「${metric?.name ?? code}」不是有效数字`)
            return
          }
          values[code] = value
        }
        if (Object.keys(values).length === 0) { setError('请至少填写一个指标数值'); return }
        setSaving(true)
        let result
        try {
          result = await run('record', {
            member: member.name,
            measuredAt: toApiTime(time),
            context,
            values,
            source: 'form',
          })
        } finally {
          setSaving(false)
        }
        if (!result?.ok) { setError(result?.error ?? '保存失败'); return }
        const pending = result.warnings ?? []
        if (pending.length > 0) {
          // Partially saved: keep the modal open so the rejected values stay visible.
          setWarnings(pending)
          const parts = Object.entries(values).map(([code, value]) => {
            const metric = metrics.find((item) => item.code === code) ?? { name: code, decimals: 1, unit: '' }
            return `${metric.name} ${formatMetricValue(metric, value)} ${metric.unit}`.trim()
          })
          onToast(`部分已记录：${member.name} · ${parts.join('、')}`)
          return
        }
        onToast(`已记录：${member.name} · ${Object.keys(values).length} 项指标`)
        onClose()
      }

      function onKeyDown(event) {
        if (event.key === 'Enter' && event.target?.tagName === 'INPUT') {
          event.preventDefault()
          save()
        }
      }

      const footer = h('div', { className: 'dshh-modal-actions' },
        h('span', { className: 'dshh-muted dshh-small', style: { marginRight: 'auto' } },
          '回车保存 · Esc 关闭'),
        h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
        h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
          onClick: save, disabled: busy || saving }, saving ? '保存中…' : '保存'),
      )

      return h(ModalFrame, { title: '录入指标（全部指标）', onClose, footer, wide: true },
        h('div', { className: 'dshh-field-row' },
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '测量时间'),
            h('input', { className: 'dshh-input', type: 'datetime-local', value: time,
              'aria-label': '测量时间', onChange: (e) => updateTime(e.target.value) }),
          ),
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '情境'),
            h('select', { className: 'dshh-select', value: context,
              onChange: (e) => { setContext(e.target.value); setContextTouched(true) } },
              contexts.map((item) => h('option', { key: item.code, value: item.code }, item.name))),
          ),
        ),
        h('div', { onKeyDown },
          groups.map((group) => {
            const open = openCats.has(group.code)
            const count = filledIn(group)
            return h('div', { key: group.code, className: 'dshh-acc' },
              h('button', { type: 'button', className: 'dshh-acchead',
                'aria-expanded': String(open), onClick: () => toggleCat(group.code) },
                h('span', null, group.name),
                h('span', { className: 'dshh-acchead-right' },
                  count > 0 && h('span', { className: 'dshh-acccount' }, `已填 ${count}`),
                  h('span', { 'aria-hidden': true }, open ? '▾' : '▸'),
                ),
              ),
              open && h('div', { className: 'dshh-accbody' },
                h('div', { className: 'dshh-entry-grid' }, group.metrics.map((metric) =>
                  h('div', { key: metric.code, className: 'dshh-entry-cell' },
                    h('span', { className: 'dshh-entry-name' }, metric.name),
                    h('input', {
                      className: 'dshh-input dshh-entry-input',
                      type: 'text',
                      inputMode: 'decimal',
                      autoComplete: 'off',
                      placeholder: '—',
                      'aria-label': metric.name,
                      value: vals[metric.code] ?? '',
                      onChange: (e) => setVals({ ...vals, [metric.code]: e.target.value }),
                    }),
                    h('span', { className: 'dshh-unit' }, metric.unit),
                  ))),
              ),
            )
          }),
        ),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
        warnings.length > 0 && h('div', { className: 'dshh-warn' },
          warnings.join('；'),
          h('div', { style: { marginTop: 4 } }, '可修正后再次保存，或关闭窗口稍后补录。'),
        ),
      )
    }

    function DocumentModal({ member, catalogs, busy, run, onClose, onToast }) {
      const [title, setTitle] = useState('')
      const [type, setType] = useState('lab_report')
      const [docDate, setDocDate] = useState('')
      const [note, setNote] = useState('')
      const [file, setFile] = useState(null)
      const [error, setError] = useState(null)
      const [saving, setSaving] = useState(false)
      const fileRef = useRef(null)

      function onPick(event) {
        const picked = event.target.files?.[0] ?? null
        setFile(picked)
        if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, ''))
      }

      async function save() {
        setError(null)
        if (!title.trim()) { setError('请填写档案标题'); return }
        setSaving(true)
        try {
          if (file) {
            // Read the file and post it as base64 alongside the metadata.
            const dataBase64 = await readFileAsBase64(file)
            const result = await run('uploadDocument', {
              member: member.name, type, title, docDate: docDate || undefined, note,
              fileName: file.name, dataBase64,
            })
            if (result?.ok) { onToast('档案已上传并登记'); onClose() }
            else setError(result?.error ?? '上传失败')
          } else {
            const result = await run('addDocument', {
              member: member.name, type, title, docDate: docDate || undefined, note,
            })
            if (result?.ok) { onToast('档案已登记'); onClose() }
            else setError(result?.error ?? '保存失败')
          }
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setSaving(false)
        }
      }

      return h(ModalFrame, { title: '登记档案', onClose,
        footer: h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: save, disabled: busy || saving },
            saving ? '处理中…' : file ? '上传并登记' : '保存'),
        ),
      },
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '上传报告文件（可选）'),
          h('div', { className: 'dshh-upload' },
            h('input', { ref: fileRef, type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt',
              onChange: onPick, style: { display: 'none' } }),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: () => fileRef.current?.click() }, file ? '重新选择' : '选择文件'),
            file
              ? h('span', { className: 'dshh-muted dshh-small' },
                  `${file.name}（${(file.size / 1024).toFixed(0)} KB）`)
              : h('span', { className: 'dshh-muted dshh-small' }, '支持 PDF / 图片 / 文本'),
          ),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '档案类型'),
          h('select', { className: 'dshh-select', value: type,
            onChange: (e) => setType(e.target.value) },
            (catalogs?.documentTypes ?? []).map((item) =>
              h('option', { key: item.code, value: item.code }, item.name))),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '标题'),
          h('input', { className: 'dshh-input', placeholder: '如：2026-11 体检报告',
            value: title, onChange: (e) => setTitle(e.target.value) }),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '档案日期'),
          h('input', { className: 'dshh-input', placeholder: '如 2026-11-10',
            value: docDate, onChange: (e) => setDocDate(e.target.value) }),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '备注'),
          h('input', { className: 'dshh-input', value: note,
            onChange: (e) => setNote(e.target.value) }),
        ),
        h('div', { className: 'dshh-muted dshh-small' },
          '上传后文件会保存在本机档案目录。若需要从报告中提取诊断与关键指标，请在对话中发送该文件让助手协助识别，识别结果会先向你确认再记录。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
      )
    }

    /** Read a File into a base64 data string. */
    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'))
        reader.readAsDataURL(file)
      })
    }

    function ConditionModal({ member, data, busy, run, onClose, onToast }) {
      const allConditions = data?.catalogs?.conditions ?? []
      const existing = new Set((data?.conditions ?? []).map((item) => item.code))
      const available = allConditions.filter((item) => !existing.has(item.code))
      const [selected, setSelected] = useState(() => new Set())
      const [source, setSource] = useState('manual')
      const [error, setError] = useState(null)
      const [saving, setSaving] = useState(false)

      function toggle(code) {
        const next = new Set(selected)
        if (next.has(code)) next.delete(code)
        else next.add(code)
        setSelected(next)
      }

      async function add() {
        setError(null)
        if (selected.size === 0) { setError('请至少选择一个疾病'); return }
        setSaving(true)
        const failed = []
        for (const code of selected) {
          const result = await run('addCondition', { member: member.name, code, source })
          if (!result?.ok) failed.push(result?.error ?? code)
        }
        setSaving(false)
        if (failed.length === 0) {
          onToast('疾病标签已添加')
          onClose()
        } else {
          setError(failed.join('；'))
        }
      }

      return h(ModalFrame, { title: '添加疾病标签', onClose,
        footer: h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: add,
            disabled: busy || saving || available.length === 0 || selected.size === 0 },
            saving ? '添加中…' : `添加${selected.size > 0 ? ` (${selected.size})` : ''}`),
        ),
      },
        available.length === 0
          ? h('div', { className: 'dshh-empty', style: { padding: '20px' } },
              '所有可用疾病标签都已添加')
          : h('div', { className: 'dshh-field' },
              h('label', { className: 'dshh-field-label' }, '选择疾病（可多选）'),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 } },
                available.map((item) =>
                  h('label', { key: item.code,
                    style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
                    h('input', { type: 'checkbox', checked: selected.has(item.code),
                      onChange: () => toggle(item.code) }),
                    h('span', null, item.name),
                  )),
              ),
            ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '来源'),
          h('select', { className: 'dshh-select', value: source,
            onChange: (e) => setSource(e.target.value) },
            h('option', { value: 'manual' }, '手动添加'),
            h('option', { value: 'report' }, '报告中的医生诊断'),
          ),
        ),
        h('div', { className: 'dshh-muted dshh-small' },
          '标签用于展示与该疾病相关的指标目标，不代表诊断结论。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
      )
    }

    /** Rebuild the editable personal-target inputs from a stored goal's rows. */
    function seedGoalOverrides(goal) {
      const seed = {}
      for (const target of goal?.targets ?? []) {
        if (target.kind === 'observe' || target.kind === 'trend') continue
        if (target.source !== 'goal-override') continue
        if (target.kind === 'weeklyDays') seed[target.metric] = String(target.days ?? '')
        else if (target.kind === 'range' && target.high == null && target.low != null) seed[target.metric] = String(target.low)
        else if (target.high != null) seed[target.metric] = String(target.high)
        else if (target.low != null) seed[target.metric] = String(target.low)
      }
      return seed
    }

    /**
     * Create / update / remove one management goal.
     *
     * A goal only records what the member intends to manage; it is never a
     * diagnosis and this modal never suggests activating a goal from values.
     */
    function GoalModal({ member, data, busy, run, onClose, existing, initialCode, onToast }) {
      const templates = data?.goalTemplates ?? []
      const statuses = data?.goalCatalog?.statuses ?? []
      const sources = data?.goalCatalog?.sources ?? []
      const editing = Boolean(existing)
      const [code, setCode] = useState(existing?.code ?? initialCode ?? templates[0]?.code ?? '')
      const [status, setStatus] = useState(existing?.status ?? 'active')
      const [source, setSource] = useState(existing?.source ?? 'manual')
      const [note, setNote] = useState(existing?.note ?? '')
      const [overrides, setOverrides] = useState(() => seedGoalOverrides(existing))
      const [cleared, setCleared] = useState(() => new Set())
      const [error, setError] = useState(null)
      const [saving, setSaving] = useState(false)
      const [confirmRemove, setConfirmRemove] = useState(false)
      const [showAdvanced, setShowAdvanced] = useState(editing)
      const [showTargets, setShowTargets] = useState(Boolean(existing) && (existing?.targets ?? []).some((t) => t.source === 'goal-override'))

      const template = templates.find((item) => item.code === code)
        ?? (existing
          ? { code: existing.code, name: existing.name, tagline: existing.tagline, targets: existing.targets ?? [] }
          : null)
      const personalTargets = (template?.targets ?? [])
        .filter((item) => item.kind !== 'trend' && item.kind !== 'observe')
      const observeRows = (template?.targets ?? []).filter((item) => item.kind === 'observe')
      const persistedOverride = (metric) =>
        (existing?.targets ?? []).some((item) => item.metric === metric && item.source === 'goal-override')

      async function save() {
        setError(null)
        if (!template) { setError('请选择一个管理目标'); return }
        const targets = {}
        for (const [metric, raw] of Object.entries(overrides)) {
          if (raw === '' || raw == null) continue
          const value = Number(raw)
          if (Number.isFinite(value)) targets[metric] = value
        }
        for (const metric of cleared) targets[metric] = null
        setSaving(true)
        const result = await run('setGoal', {
          member: member.name, code: template.code, status, source, targets, note,
        })
        setSaving(false)
        if (result?.ok) {
          onToast?.(editing ? '目标已更新' : '目标已设定')
          onClose()
        } else {
          setError(result?.error ?? '保存失败')
        }
      }

      async function remove() {
        setError(null)
        if (!template) { setError('请选择一个管理目标'); return }
        setSaving(true)
        const result = await run('removeGoal', { member: member.name, code: template.code })
        setSaving(false)
        if (result?.ok) {
          onToast?.('目标已移除')
          onClose()
        } else {
          setError(result?.error ?? '移除失败')
        }
      }

      if (!member) {
        return h(ModalFrame, { title: '管理目标', onClose,
          footer: h('div', { className: 'dshh-modal-actions' },
            h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭')),
        },
          h('div', { className: 'dshh-empty', style: { padding: '20px' } }, '请先选择一位家庭成员'),
        )
      }

      const statusOptions = statuses.length > 0
        ? statuses
        : [{ code: 'active', name: '进行中' }, { code: 'paused', name: '已暂停' }, { code: 'achieved', name: '已达成' }]
      const sourceOptions = sources.length > 0
        ? sources
        : [{ code: 'manual', name: '自行设定' }, { code: 'report', name: '医生建议/报告' }]

      return h(ModalFrame, { title: editing ? `管理目标：${existing.name}` : '设定管理目标', onClose,
        footer: h('div', { className: 'dshh-modal-actions' },
          editing && h('button', { type: 'button', className: 'dshh-btn dshh-btn-danger',
            style: { marginRight: 'auto' }, onClick: () => setConfirmRemove(true) }, '移除目标'),
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: save, disabled: busy || saving || !template },
            saving ? '保存中…' : editing ? '保存修改' : '设定目标'),
        ),
      },
        editing
          ? h('div', { className: 'dshh-muted', style: { fontSize: '11.5px', marginBottom: 12 } },
              `${existing.domainName ? `${existing.domainName} · ` : ''}`
              + `${existing.tagline ? `${existing.tagline}。` : ''}`
              + '目标模板不可更换，可调整状态、来源与个人目标值。')
          : h('div', { className: 'dshh-field' },
              h('label', { className: 'dshh-field-label' }, '选择管理目标'),
              h('div', { className: 'dshh-goalpick' }, templates.map((item) =>
                h('button', {
                  key: item.code, type: 'button', className: 'dshh-goalpick-card',
                  'data-active': String(item.code === code),
                  onClick: () => { setCode(item.code); setOverrides({}); setCleared(new Set()) },
                },
                  h('div', { className: 'dshh-goalpick-name' },
                    `${item.name}（${item.domainName}）`),
                  h('div', { className: 'dshh-goalpick-tag' }, item.tagline),
                ))),
            ),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 } },
          h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
            'aria-expanded': String(showAdvanced), onClick: () => setShowAdvanced((value) => !value) },
            showAdvanced ? '收起状态/来源/备注' : '更多设置（状态 / 来源 / 备注）'),
          h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
            'aria-expanded': String(showTargets), onClick: () => setShowTargets((value) => !value) },
            showTargets ? '收起个人目标值' : '个人目标值（可选）'),
        ),
        showAdvanced && h('div', { className: 'dshh-field-row' },
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '目标状态'),
            h('select', { className: 'dshh-select', value: status,
              onChange: (e) => setStatus(e.target.value) },
              statusOptions.map((item) => h('option', { key: item.code, value: item.code }, item.name))),
          ),
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '目标来源'),
            h('select', { className: 'dshh-select', value: source,
              onChange: (e) => setSource(e.target.value) },
              sourceOptions.map((item) => h('option', { key: item.code, value: item.code }, item.name))),
          ),
        ),
        showAdvanced && h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '备注'),
          h('input', { className: 'dshh-input', placeholder: '如：医生建议重点控制腰围',
            value: note, onChange: (e) => setNote(e.target.value) }),
        ),
        showTargets && h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '个人目标值（可选）'),
          personalTargets.length === 0
            ? (observeRows.length > 0
                ? h('div', { className: 'dshh-muted dshh-small' },
                    '该目标的体成分项只观察趋势，不设达标目标值。')
                : h('div', { className: 'dshh-muted dshh-small' }, '该目标只看趋势，无需设定数值。'))
            : h('div', { className: 'dshh-entry-grid' }, personalTargets.map((item) =>
                h('div', { key: item.metric, className: 'dshh-entry-cell' },
                  h('span', { className: 'dshh-entry-name', title: item.note || undefined },
                    `${item.name}（${item.unit}）`),
                  h('input', {
                    className: 'dshh-input dshh-entry-input',
                    type: 'text',
                    inputMode: 'decimal',
                    placeholder: item.targetDisplay ?? '—',
                    title: item.targetDisplay ?? undefined,
                    'aria-label': item.name,
                    value: overrides[item.metric] ?? '',
                    onChange: (e) => {
                      setOverrides({ ...overrides, [item.metric]: e.target.value })
                      if (cleared.has(item.metric)) {
                        const next = new Set(cleared)
                        next.delete(item.metric)
                        setCleared(next)
                      }
                    },
                  }),
                  (persistedOverride(item.metric)
                    || (overrides[item.metric] != null && overrides[item.metric] !== ''))
                    && h('button', {
                      type: 'button',
                      className: 'dshh-btn-ghost dshh-small',
                      title: '清除该个人目标值',
                      onClick: () => {
                        setOverrides({ ...overrides, [item.metric]: '' })
                        const next = new Set(cleared)
                        next.add(item.metric)
                        setCleared(next)
                      },
                    }, '清除'),
                ))),
          observeRows.length > 0 && h('div', { style: { marginTop: 10 } },
            h('div', { className: 'dshh-field-label' }, '只观察，不设达标目标值'),
            observeRows.map((item) => h('div', {
              key: `observe-${item.metric}`,
              className: 'dshh-observe-row',
              style: { cursor: 'default', gridTemplateColumns: '1fr auto' },
            },
              h('span', { className: 'dshh-observe-name' },
                `${item.name}（${item.unit}）`,
                h('span', { className: 'dshh-observe-tag' }, '只观察')),
              h('span', { className: 'dshh-observe-band', style: { textAlign: 'right' } },
                item.band?.label ?? item.targetDisplay ?? '只观察趋势'),
            ))),
          h('div', { className: 'dshh-muted', style: { fontSize: '11px', marginTop: 6 } },
            '留空表示使用参考区间；有个人目标值时显示「清除」可恢复参考区间。个人目标值以医生/专业人士意见为准。'),
        ),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
        h('div', { className: 'dshh-modal-note' },
          '管理目标只表示你想管理什么，不等于诊断；本工具不提供诊断、治疗方案或用药建议。'),
        confirmRemove && h('div', {
          style: { marginTop: 14, padding: 12, border: '1px solid var(--dsw-alias-state-error-primary)', borderRadius: 10 },
        },
          h('div', { style: { fontSize: 12.5, marginBottom: 8 } },
            `确定移除「${existing.name}」这个管理目标吗？已记录的指标数据不会被删除。`),
          h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: () => setConfirmRemove(false) }, '再想想'),
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-danger',
              onClick: remove, disabled: busy || saving }, '确认移除'),
          ),
        ),
      )
    }

    // ------------------------------------------------------------- register

    function SafeHealthPanel(props) {
      return h(PaneBoundary, {
        onReset: () => {
          try { window.location.reload() } catch { /* ignore */ }
        },
      }, h(HealthPanel, props))
    }

    // Preview-only debug handle used by local acceptance tooling. It is not
    // used by the panel itself.
    if (typeof window !== 'undefined') {
      window.__dshHealthDebug = { SeasonPane, DiscoverPane, ArchiveHub, WeeklyLedger, SquadModal, ShareSeasonModal }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'dsh-health', order: 20, label: () => '健康管理' },
            HealthIcon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'dsh-health' }, SafeHealthPanel),
        )
      },
    }
  },
})
