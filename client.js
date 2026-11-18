window.__ModuleLoader__.load({
  id: 'dsh-health-management',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef } = React

    const API = '/api/dsh-health'
    const HERO_ART = `${API}/hero-art?v=4`
    const AVATAR_ART = `${API}/avatar-art?v=1`

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
      { code: 'lab', name: '检验' },
    ]

    const TABS = [
      { code: 'overview', name: '概览' },
      { code: 'season', name: '赛季' },
      { code: 'archive', name: '档案' },
      { code: 'discover', name: '发现' },
    ]

    /**
     * Tab labels depend on the active management goal: the cycle tab is
     * 「赛季」for a lean-muscle member and 「复查」for a metabolic member.
     * With both goals the lean label wins (the metabolic cycle is still
     * reachable from the metabolic hero and from the same tab's content).
     */
    function tabsFor(goals) {
      const list = goals ?? []
      const leanActive = list.some((goal) => goal?.code === 'lean_muscle' && goal?.status === 'active')
      const metabolicActive = list.some((goal) => goal?.code === 'metabolic' && goal?.status === 'active')
      const seasonName = leanActive ? '赛季' : metabolicActive ? '复查' : '赛季'
      return TABS.map((item) => (item.code === 'season' ? { ...item, name: seasonName } : item))
    }

    const MEAL_TYPES = [
      { code: 'breakfast', name: '早餐' },
      { code: 'lunch', name: '午餐' },
      { code: 'dinner', name: '晚餐' },
      { code: 'snack', name: '加餐' },
    ]

    /** Default meal type from the clock: only a convenience, the user can change it. */
    function inferMealType(date = new Date()) {
      const hour = date.getHours()
      if (hour >= 5 && hour < 10) return 'breakfast'
      if (hour >= 10 && hour < 15) return 'lunch'
      if (hour >= 16 && hour < 21) return 'dinner'
      return 'snack'
    }

    function mealTypeName(code) {
      return MEAL_TYPES.find((item) => item.code === code)?.name ?? '用餐'
    }

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

    // ---------------------------------------------------------------- float
    // A draggable health avatar in the frame-wide overlay plus a dedicated
    // Settings section. The avatar only reads aggregate counts and shows
    // general lifestyle reminders; it never derives a reminder from an
    // abnormal measurement, a diagnosis, or a medication rule.

    const FLOAT_CACHE_KEY = 'dsh-health.float.v1'
    const FLOAT_SIZE_PX = { small: 52, medium: 64, large: 80 }
    const FLOAT_SIZE_CODES = ['small', 'medium', 'large']
    const FLOAT_AVATAR_STYLES = ['portrait', 'bean', 'muscle', 'sun']
    const FLOAT_AVATAR_MAX_BYTES = 512 * 1024
    const FLOAT_AVATAR_MAX_LENGTH = 800 * 1024
    const FLOAT_INTERVALS = [15, 30, 45, 60, 90, 120]
    const FLOAT_BUBBLE_SECONDS = [0, 6, 12, 20, 30]
    const FLOAT_DEFAULT_SETTINGS = {
      name: '小肌霸',
      avatarStyle: 'portrait',
      avatarImage: null,
      enabled: true,
      remindersEnabled: true,
      intervalMinutes: 45,
      quietHoursEnabled: true,
      quietStart: '22:00',
      quietEnd: '08:00',
      bubbleSeconds: 12,
      desktopNotifications: false,
      size: 'medium',
      position: { x: 0.972, y: 0.42 },
    }

    // Built-in artwork palettes. Fixed colors belong to the mascot; surrounding
    // surfaces use the host theme tokens.
    const FLOAT_AVATAR_PALETTES = {
      bean: {
        body: ['#7DE8D8', '#2DD4BF', '#0EA5A6'],
        leaf: ['#16A34A', '#86EFAC'],
        arm: '#0F766E',
        headband: false,
        rays: false,
        armWidth: '3.6',
      },
      muscle: {
        body: ['#FFD166', '#FF9F1C', '#EA580C'],
        leaf: ['#65A30D', '#BEF264'],
        arm: '#9A3412',
        headband: true,
        rays: false,
        armWidth: '5',
      },
      sun: {
        body: ['#FFE066', '#FACC15', '#F59E0B'],
        leaf: null,
        arm: '#B45309',
        headband: false,
        rays: true,
        armWidth: '3.6',
      },
    }

    // Each rendered mascot needs its own SVG gradient ids; the main avatar and
    // the small card avatar coexist in the document.
    let floatAvatarSeq = 0

    const FLOAT_I18N = {
      zh: {
        'settings.title': '小肌霸设置',
        'settings.subtitle': '把{name}放在页面角落：拖动换位置，点击看今日记录，提醒你记一笔或歇一会儿。',
        'settings.identity': '名称与形象',
        'settings.name': '名称',
        'settings.nameHint': '显示在卡片、问候与通知里；留空恢复默认「小肌霸」。',
        'settings.nameSave': '保存',
        'settings.avatar': '形象',
        'settings.avatarHint': '选择内置形象，或上传一张图片（仅保存在本机）；自定义图片优先。',
        'settings.avatarStyle': '内置形象',
        'settings.avatarStyle.portrait': '小肌霸',
        'settings.avatarStyle.bean': '健康豆',
        'settings.avatarStyle.muscle': '力量型',
        'settings.avatarStyle.sun': '阳光型',
        'settings.avatarUpload': '上传图片',
        'settings.avatarRemove': '移除自定义图片',
        'settings.avatarCustom': '自定义图片',
        'settings.avatarTooLarge': '图片不能超过 512 KB。',
        'settings.avatarBadType': '请选择 PNG、JPEG、WebP 或 GIF 图片。',
        'settings.avatarReadError': '图片读取失败，请换一张试试。',
        'settings.appearance': '显示与位置',
        'settings.show': '显示{name}',
        'settings.showHint': '关闭后{name}立即隐藏，健康面板与已有记录不受影响。',
        'settings.size': '大小',
        'settings.sizeHint': '{name}在页面上的大小；位置由拖动决定。',
        'settings.size.small': '小',
        'settings.size.medium': '中',
        'settings.size.large': '大',
        'settings.position': '位置',
        'settings.positionHint': '拖动{name}即可换位置；位置会保存，刷新后仍在原处。',
        'settings.resetPosition': '回到默认位置',
        'settings.positionReset': '已回到默认位置',
        'settings.reminders': '健康提醒',
        'settings.remindersEnabled': '开启提醒',
        'settings.remindersHint': '提醒只在页面内以气泡出现；内容为记录提醒与一般生活方式提示。',
        'settings.interval': '提醒间隔',
        'settings.intervalHint': '两次提醒之间的间隔；免打扰时段内会自动跳过。',
        'settings.minutes': '{n} 分钟',
        'settings.bubble': '气泡停留',
        'settings.bubbleHint': '到时间自动收起，也可以手动关闭。',
        'settings.bubble.never': '不自动关闭',
        'settings.seconds': '{n} 秒',
        'settings.notify': '系统通知',
        'settings.notifyHint': '在气泡之外使用浏览器/桌面通知提醒；需要授权。',
        'settings.notifyDenied': '通知权限未开启，仍会使用页面内气泡。',
        'settings.notifyUnsupported': '当前环境不支持系统通知。',
        'settings.quiet': '免打扰时段',
        'settings.quietWindow': '时间范围',
        'settings.quietEnabled': '开启免打扰',
        'settings.quietHint': '这个时段内不弹提醒，{name}会打瞌睡。',
        'settings.quietStart': '开始',
        'settings.quietEnd': '结束',
        'settings.disclaimer': '{name}只做记录提醒与一般生活方式提示，不构成医疗诊断、治疗建议或用药指导。提醒内容不代表你的健康结论；如有不适请咨询医生。',
        'notification.title': '{name} · 健康提醒',
        'settings.save.saving': '保存中…',
        'settings.save.saved': '已保存',
        'settings.save.error': '保存失败',
        'settings.readError': '读取小肌霸设置失败',
        'settings.retry': '重试',
        'settings.loading': '正在读取设置…',
        'card.title': '{name}',
        'card.tip': '我只提醒记录和一般生活方式，不提供诊断或用药建议。',
        'card.keyMetrics': '重点指标',
        'card.metricsTitle': '{name} · 重点指标',
        'card.metricsNote': '最近记录 · 仅参考，不构成诊断',
        'card.noMetrics': '{name} 还没有可展示的重点指标记录；记一笔后这里会显示。',
        'card.open': '打开健康面板',
        'card.snooze': '1 小时后再提醒',
        'card.configHint': '在「设置 → 小肌霸设置」里调整显示与提醒。',
        'card.close': '关闭',
        'bubble.close': '关闭提醒',
        'avatar.label': '{name}：拖动可移动，单击打开快捷卡片，双击打开健康面板',
        'status.noMembers': '还没有家庭成员，先去健康面板添加吧。',
        'status.today': '{name} · 今天已记录 {count} 条',
        'status.memberFallback': '当前成员',
        'status.familyToday': '全家 · 今天已记录 {count} 条',
        'status.unknown': '正在读取今天的记录…',
        'status.goals': '{count} 个管理目标进行中',
        'tip.greeting': '我是{name}，会在这里陪你记健康、提醒你歇一歇。',
        'tip.noMembers': '添加家庭成员后，我会帮你记住每一次健康记录。',
        'tip.record': '今天还没有健康记录，要不要记一笔？',
        'tip.water': '喝口水吧，顺便伸个懒腰。',
        'tip.stretch': '坐了一会儿了，起来走两步。',
        'tip.eyes': '看看远处，让眼睛休息一下。',
        'tip.breath': '慢慢深呼吸几次，放松一下。',
        'tip.recorded': '今天的记录已经存好了。',
        'tip.training': '薄肌账户今天还没有「大练」的存入记录，练过的话记一笔？',
        'tip.leanWater': '大水时间：喝一杯水，顺手记一笔。',
        'tip.leanTraining': '大练时间：起来活动一下，练完记一笔。',
        'tip.leanMove': '坐了一会儿了？站起来走两分钟，顺便看看今天的大练。',
        'tip.measure': '该测血压了？按你的监测计划测一次，记一笔。',
        'tip.meal': '今天还没有饮食记录，记一餐吧。',
        'tip.move': '起来活动几分钟，顺手记一笔。',
        'tip.sleepRecord': '今天睡眠还没记，方便时补一笔。',
        'tip.protein': '今天还没有记录蛋白质摄入，有数据的话补一笔？',
        'tip.sleep': '睡眠时长还没有记，方便时补一笔？',
        'tip.snoozed': '好，我 1 小时后再来。',
        'tip.quiet': '现在是免打扰时段，{name}先打个盹。',
      },
      en: {
        'settings.title': 'Little Muscle King settings',
        'settings.subtitle': 'Keep {name} in a corner of the page: drag to move, click for today\'s records, and get a gentle nudge to log or take a break.',
        'settings.identity': 'Name and avatar',
        'settings.name': 'Name',
        'settings.nameHint': 'Shown in the card, greeting and notifications; leave empty for the default "Little Muscle King".',
        'settings.nameSave': 'Save',
        'settings.avatar': 'Avatar',
        'settings.avatarHint': 'Choose a built-in avatar or upload an image (stored locally); the custom image wins.',
        'settings.avatarStyle': 'Built-in avatar',
        'settings.avatarStyle.portrait': 'Little Muscle King',
        'settings.avatarStyle.bean': 'Health bean',
        'settings.avatarStyle.muscle': 'Power',
        'settings.avatarStyle.sun': 'Sunny',
        'settings.avatarUpload': 'Upload image',
        'settings.avatarRemove': 'Remove custom image',
        'settings.avatarCustom': 'Custom image',
        'settings.avatarTooLarge': 'The image must be 512 KB or smaller.',
        'settings.avatarBadType': 'Choose a PNG, JPEG, WebP or GIF image.',
        'settings.avatarReadError': 'Could not read the image; try another one.',
        'settings.appearance': 'Visibility and position',
        'settings.show': 'Show {name}',
        'settings.showHint': '{name} hides immediately; the health panel and existing records are unchanged.',
        'settings.size': 'Size',
        'settings.sizeHint': 'How large {name} appears; drag it to change position.',
        'settings.size.small': 'Small',
        'settings.size.medium': 'Medium',
        'settings.size.large': 'Large',
        'settings.position': 'Position',
        'settings.positionHint': 'Drag {name} to move it. The position is saved and restored after a reload.',
        'settings.resetPosition': 'Reset position',
        'settings.positionReset': 'Position reset',
        'settings.reminders': 'Health reminders',
        'settings.remindersEnabled': 'Enable reminders',
        'settings.remindersHint': 'Reminders appear as in-page bubbles with logging prompts and general lifestyle tips.',
        'settings.interval': 'Reminder interval',
        'settings.intervalHint': 'Time between reminders; quiet hours are skipped.',
        'settings.minutes': '{n} min',
        'settings.bubble': 'Bubble duration',
        'settings.bubbleHint': 'The bubble closes itself after this time; you can also close it manually.',
        'settings.bubble.never': 'Keep open',
        'settings.seconds': '{n} s',
        'settings.notify': 'System notifications',
        'settings.notifyHint': 'Also use browser/desktop notifications outside the bubble; permission is required.',
        'settings.notifyDenied': 'Notification permission was not granted; in-page bubbles are still used.',
        'settings.notifyUnsupported': 'System notifications are not available in this environment.',
        'settings.quiet': 'Quiet hours',
        'settings.quietWindow': 'Quiet window',
        'settings.quietEnabled': 'Enable quiet hours',
        'settings.quietHint': 'No reminders during this window; {name} dozes off.',
        'settings.quietStart': 'Start',
        'settings.quietEnd': 'End',
        'settings.disclaimer': '{name} only offers logging prompts and general lifestyle tips. It is not medical diagnosis, treatment, or medication guidance, and its reminders are not a conclusion about your health. Consult a doctor if you feel unwell.',
        'notification.title': '{name} · Health reminder',
        'settings.save.saving': 'Saving…',
        'settings.save.saved': 'Saved',
        'settings.save.error': 'Save failed',
        'settings.readError': 'Could not read the Little Muscle King settings',
        'settings.retry': 'Retry',
        'settings.loading': 'Loading settings…',
        'card.title': '{name}',
        'card.tip': 'I only offer logging prompts and general lifestyle tips, never diagnosis or medication advice.',
        'card.keyMetrics': 'Key metrics',
        'card.metricsTitle': '{name} · Key metrics',
        'card.metricsNote': 'Latest records · reference only, not a diagnosis',
        'card.noMetrics': '{name} has no key metric records yet; they will appear after a log.',
        'card.open': 'Open health panel',
        'card.snooze': 'Snooze for 1 hour',
        'card.configHint': 'Adjust visibility and reminders in Settings → Little Muscle King settings.',
        'card.close': 'Close',
        'bubble.close': 'Dismiss reminder',
        'avatar.label': '{name}: drag to move, click for the quick card, double-click for the health panel',
        'status.noMembers': 'No family members yet. Add one in the health panel first.',
        'status.today': '{name} · {count} records today',
        'status.memberFallback': 'Current member',
        'status.familyToday': 'Family · {count} records today',
        'status.unknown': 'Reading today\'s records…',
        'status.goals': '{count} active management goals',
        'tip.greeting': 'I am {name}. I will keep you company while you log health data and take breaks.',
        'tip.noMembers': 'Add a family member and I will help you remember every health record.',
        'tip.record': 'No health records today yet. Want to log one?',
        'tip.water': 'Have some water, and stretch while you are at it.',
        'tip.stretch': 'You have been sitting for a while. Stand up and walk a little.',
        'tip.eyes': 'Look into the distance and give your eyes a rest.',
        'tip.breath': 'Take a few slow breaths and relax.',
        'tip.recorded': 'Today\'s records are saved.',
        'tip.training': 'No training deposit in the lean account today. If you trained, log it.',
        'tip.leanWater': 'Water time: have a glass, and log it while you are at it.',
        'tip.leanTraining': 'Training time: stand up and move a little, then log it when done.',
        'tip.leanMove': 'Been sitting a while? Stand up for two minutes and check today\'s training account.',
        'tip.measure': 'Time to measure blood pressure? Follow your monitoring plan and log it.',
        'tip.meal': 'No meal log today yet. Log one when you can.',
        'tip.move': 'Move for a few minutes, then log it.',
        'tip.sleepRecord': 'Sleep duration is not logged today. Add it when convenient.',
        'tip.protein': 'No protein intake logged today. Add a number if you have one.',
        'tip.sleep': 'Sleep duration is not logged yet. Add it when convenient.',
        'tip.snoozed': 'Okay, I will come back in an hour.',
        'tip.quiet': 'Quiet hours are on. {name} is taking a nap.',
      },
    }

    // Bound in apply() once the locale service is available; until then the
    // Chinese dictionary is the deterministic fallback.
    let floatTranslate = (key) => FLOAT_I18N.zh[key] ?? String(key)
    let floatLocaleSubscribe = () => () => {}
    let openHealthPanel = () => {}

    /** Fill {name}/{count} placeholders without a template engine. */
    function floatText(key, values) {
      let text = floatTranslate(key)
      for (const [name, value] of Object.entries(values ?? {})) {
        text = text.split(`{${name}}`).join(String(value))
      }
      return text
    }

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
.dshh-doc-actions { display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  justify-content:flex-end; }

/* ---------- report interpretation ---------- */
.dshh-report-banner { border:1px solid var(--dsw-alias-state-warn-primary); border-radius:10px;
  padding:10px 12px; font-size:11.5px; line-height:1.65;
  color:var(--dsw-alias-state-warn-primary);
  background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent); }
.dshh-report-layout { display:grid; grid-template-columns:minmax(0,0.92fr) minmax(0,1.08fr);
  gap:16px; align-items:start; margin-top:12px; }
.dshh-report-source { border:1px solid var(--dsw-alias-border-l1); border-radius:14px;
  padding:12px; background:var(--dsw-alias-bg-layer-1); display:flex; flex-direction:column;
  gap:10px; position:sticky; top:0; }
.dshh-report-source-head { display:flex; align-items:flex-start; justify-content:space-between;
  gap:8px; }
.dshh-report-source-title { font-size:13px; font-weight:650; }
.dshh-report-image-link { display:block; }
.dshh-report-image { display:block; width:100%; max-height:64vh; object-fit:contain;
  border-radius:8px; background:rgba(0,0,0,.12); }
.dshh-report-text { margin:0; max-height:64vh; overflow:auto; white-space:pre-wrap;
  word-break:break-word; font-size:11px; line-height:1.65;
  color:var(--dsw-alias-label-secondary); }
.dshh-report-pdf { border:1px dashed var(--dsw-alias-border-l2); border-radius:8px;
  padding:18px 12px; font-size:11.5px; line-height:1.65;
  color:var(--dsw-alias-label-secondary); }
.dshh-report-analysis { min-width:0; display:flex; flex-direction:column; gap:10px; }
.dshh-report-block { display:flex; flex-direction:column; gap:2px; font-size:11.5px;
  line-height:1.65; }
.dshh-report-block b { font-size:11px; color:var(--dsw-alias-label-secondary); font-weight:650; }
.dshh-report-block p { margin:0; }
.dshh-report-block[data-kind='suggestion'] { border-left:2px solid var(--dsw-alias-brand-primary);
  padding-left:8px; }
.dshh-report-others { border:1px solid var(--dsw-alias-border-l1); border-radius:10px;
  padding:8px 10px; }
.dshh-report-others summary { cursor:pointer; font-size:12px; font-weight:600; }
.dshh-report-otherrow { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 10px;
  padding:7px 0; border-top:1px solid var(--dsw-alias-border-l1); font-size:11.5px; }
.dshh-report-otherrow:first-of-type { border-top:none; }
.dshh-report-otherrow small { display:block; font-size:10.5px; color:var(--dsw-alias-label-secondary); }
.dshh-report-questions { border-top:1px solid var(--dsw-alias-border-l1); padding-top:8px; }
@media (max-width: 900px) {
  .dshh-report-layout { grid-template-columns:1fr; }
  .dshh-report-source { position:static; }
  .dshh-report-image, .dshh-report-text { max-height:46vh; }
}
.dshh-report-model { display:flex; flex-wrap:wrap; align-items:center; gap:6px;
  margin:12px 0 8px; font-size:11.5px; color:var(--dsw-alias-label-secondary); }
.dshh-report-badge { display:inline-flex; align-items:center; border-radius:999px;
  padding:2px 8px; background:var(--dsw-alias-brand-primary); color:#fff;
  font-size:10px; font-weight:700; letter-spacing:.04em; }
.dshh-report-disclaimer { border:1px solid var(--dsw-alias-border-l2); border-radius:10px;
  padding:10px 12px; font-size:11.5px; line-height:1.7;
  color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }
.dshh-report-summary { font-size:12.5px; line-height:1.7; margin:10px 0; }
.dshh-report-list { display:flex; flex-direction:column; gap:8px; margin:10px 0; }
.dshh-report-indicator { border:1px solid var(--dsw-alias-border-l1); border-radius:10px;
  padding:10px 12px; background:var(--dsw-alias-bg-layer-1);
  display:flex; flex-direction:column; gap:5px; }
.dshh-report-head { display:flex; align-items:baseline; justify-content:space-between;
  gap:8px; flex-wrap:wrap; }
.dshh-report-name { font-size:12.5px; font-weight:650; }
.dshh-report-flag { font-size:10.5px; font-weight:600; }
.dshh-report-flag[data-flag='high'], .dshh-report-flag[data-flag='low'] {
  color:var(--dsw-alias-state-warn-primary); }
.dshh-report-flag[data-flag='normal'] { color:var(--dsw-alias-state-success-primary); }
.dshh-report-flag[data-flag='unknown'] { color:var(--dsw-alias-label-secondary); }
.dshh-report-values { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
  font-variant-numeric:tabular-nums; }
.dshh-report-value { font-size:13px; font-weight:620; }
.dshh-report-reference { font-size:10.5px; color:var(--dsw-alias-label-secondary); }
.dshh-report-plain { font-size:11.5px; line-height:1.65; }
.dshh-report-sub { font-size:11px; font-weight:650; margin:12px 0 4px; }
.dshh-report-ul { margin:0; padding-left:18px; font-size:11.5px; line-height:1.7;
  color:var(--dsw-alias-label-secondary); }

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
.dshh-modal-report { width:min(1040px, calc(100vw - 32px)); }
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
.dshh-observe-deltaname { display:none; }
.dshh-observe-band { display:block; margin-top:2px; font-size:10.5px; color:var(--dsw-alias-label-secondary); line-height:1.5; }
.dshh-observe-head { display:grid; gap:8px; padding:2px 2px 6px;
  grid-template-columns:minmax(88px,1fr) minmax(96px,1.1fr) minmax(88px,1fr) minmax(100px,1.2fr);
  font-size:10px; letter-spacing:.04em; color:var(--dsw-alias-label-secondary);
  border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshh-observe-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  justify-content:flex-end; }

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
    grid-template-areas:"name name" "latest baseline" "delta delta"; row-gap:6px; }
  .dshh-observe-head { display:none; }
  .dshh-observe-name { grid-area:name; }
  .dshh-observe-row > .dshh-observe-value:nth-child(2) { grid-area:latest; }
  .dshh-observe-row > .dshh-observe-value:nth-child(3) { grid-area:baseline; }
  .dshh-observe-deltacell { grid-area:delta; }
  .dshh-observe-deltaname { display:block; font-size:10px; margin-bottom:2px; }
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

/* ---------- diet ---------- */
/* Calorie figures are records, never a pass/fail signal: no warn colours here. */
.dshh-dietpane { display:flex; flex-direction:column; gap:14px; }
.dshh-dietstats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.dshh-dietstat { display:flex; flex-direction:column; gap:2px; padding:11px 13px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:12px;
  background:var(--dsw-alias-bg-layer-2); }
.dshh-dietstat b { font-size:20px; font-weight:680; line-height:1.2;
  font-variant-numeric:tabular-nums; }
.dshh-dietstat span { font-size:10.5px; color:var(--dsw-alias-label-secondary); }
.dshh-dietnote { margin-top:10px; font-size:11px; line-height:1.6;
  color:var(--dsw-alias-label-secondary); }
.dshh-dietdays { display:flex; flex-direction:column; gap:7px; }
.dshh-dietday { display:grid; grid-template-columns:78px minmax(0,1fr) 124px;
  align-items:center; gap:10px; font-size:11.5px; }
.dshh-dietday-date { color:var(--dsw-alias-label-secondary); white-space:nowrap;
  font-variant-numeric:tabular-nums; }
.dshh-dietday-bar { height:8px; border-radius:999px; overflow:hidden;
  background:var(--dsw-alias-bg-layer-2); }
.dshh-dietday-fill { height:100%; border-radius:999px;
  background:var(--dsw-alias-brand-primary); opacity:.7; }
.dshh-dietday-right { text-align:right; font-variant-numeric:tabular-nums;
  font-weight:600; white-space:nowrap; }
.dshh-dietday-right small { font-weight:400; margin-left:5px;
  color:var(--dsw-alias-label-secondary); font-size:10.5px; }
.dshh-meals { display:flex; flex-direction:column; }
.dshh-meal { display:grid; grid-template-columns:64px minmax(0,1fr) auto;
  gap:11px; padding:10px 2px; align-items:start;
  border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshh-meal:last-child { border-bottom:none; }
.dshh-meal-thumb { width:64px; height:64px; border-radius:10px; object-fit:cover;
  display:flex; align-items:center; justify-content:center; flex:none;
  background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary);
  border:1px solid var(--dsw-alias-border-l1); font-size:17px; }
.dshh-meal-main { min-width:0; }
.dshh-meal-head { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.dshh-meal-type { font-weight:620; font-size:12.5px; }
.dshh-meal-time { font-size:11px; color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums; }
.dshh-meal-nums { font-size:12px; margin-top:1px; font-variant-numeric:tabular-nums; }
.dshh-meal-note { font-size:11px; color:var(--dsw-alias-label-secondary); margin-top:2px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshh-meal-items { margin:5px 0 0; padding-left:16px; font-size:11px; line-height:1.7;
  color:var(--dsw-alias-label-secondary); word-break:break-word; }
.dshh-meal-actions { display:flex; flex-direction:column; gap:6px; align-items:flex-end; }
.dshh-meal-full { display:block; width:100%; max-height:220px; object-fit:cover;
  border-radius:10px; margin-top:8px; }
.dshh-mealestimate { margin:10px 0; padding:10px 12px; font-size:11.5px; line-height:1.65;
  border:1px solid var(--dsw-alias-border-l1); border-radius:10px;
  background:var(--dsw-alias-bg-layer-2); }
.dshh-mealestimate-title { font-weight:620; font-size:12.5px; margin-bottom:4px; }
.dshh-mealquick { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.dshh-mealquick-nums { display:flex; gap:18px; flex-wrap:wrap; font-variant-numeric:tabular-nums; }
.dshh-mealquick-num { display:flex; flex-direction:column; gap:1px; }
.dshh-mealquick-num b { font-size:17px; font-weight:680; line-height:1.2; }
.dshh-mealquick-num span { font-size:10.5px; color:var(--dsw-alias-label-secondary); }
@media (max-width:640px) {
  .dshh-dietstats { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .dshh-dietday { grid-template-columns:64px minmax(0,1fr) 104px; gap:8px; }
  .dshh-meal { grid-template-columns:48px minmax(0,1fr) auto; }
  .dshh-meal-thumb { width:48px; height:48px; font-size:14px; }
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

    // Styles for the floating avatar and its dedicated Settings page. Kept
    // separate from the panel stylesheet so the overlay never depends on the
    // panel being mounted.
    const FLOAT_CSS = `
.dshh-float-root { position:fixed; inset:0; z-index:60; pointer-events:none; }
.dshh-float { position:absolute; pointer-events:auto; user-select:none; -webkit-user-select:none;
  touch-action:none; cursor:grab; outline:none; border-radius:50%; }
.dshh-float:focus-visible { box-shadow:0 0 0 3px var(--dsw-alias-brand-primary); }
.dshh-float.is-dragging { cursor:grabbing; }
.dshh-float-inner { position:relative; width:100%; height:100%; transform-origin:50% 70%;
  animation:dshhFloatBob 4.2s ease-in-out infinite; }
.dshh-float:hover .dshh-float-inner { animation-play-state:paused; }
.dshh-float.is-dragging .dshh-float-inner { animation:none; transform:scale(1.06); }
.dshh-float-art { display:block; width:100%; height:100%; }
.dshh-float-custom { object-fit:cover; border-radius:50%; box-sizing:border-box; }
.dshh-float .dshh-float-custom { border:1px solid rgba(255,255,255,.7);
  box-shadow:0 6px 18px rgba(15,23,42,.22); }
.dshh-float-dot { position:absolute; right:4%; bottom:6%; width:13%; height:13%;
  min-width:9px; min-height:9px; border-radius:50%; border:2px solid var(--dsw-alias-bg-base);
  box-shadow:0 0 0 1px var(--dsw-alias-border-l1); }
.dshh-float-bang { position:absolute; right:-2px; top:-2px; width:20px; height:20px; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:750;
  color:#fff; background:var(--dsw-alias-state-warn-primary);
  box-shadow:0 2px 6px rgba(15,23,42,.22); animation:dshhFloatPop .2s ease-out; }
.dshh-float.is-sleeping .dshh-float-inner { filter:saturate(.65) brightness(.92); }
.dshh-float-sleep { position:absolute; right:-1px; top:-2px; width:20px; height:20px; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:750;
  color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-overlay);
  border:1px solid var(--dsw-alias-border-l1); box-shadow:0 1px 3px rgba(15,23,42,.18); }
.dshh-float-card, .dshh-float-bubble { position:absolute; pointer-events:auto; z-index:61;
  background:var(--dsw-alias-bg-overlay); color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l1); border-radius:16px;
  box-shadow:0 18px 48px rgba(15,23,42,.22); animation:dshhFloatRise .18s ease-out; }
.dshh-float-card { padding:14px; max-height:calc(100vh - 24px); overflow-y:auto; }
.dshh-float-card .dshh-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:8px; padding:6px 10px;
  background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary);
  font:inherit; font-size:12px; cursor:pointer; }
.dshh-float-card .dshh-btn:hover { background:var(--dsw-alias-bg-layer-1); }
.dshh-float-card .dshh-btn-primary { background:var(--dsw-alias-brand-primary);
  border-color:var(--dsw-alias-brand-primary); color:#fff; }
.dshh-float-card .dshh-btn:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.dshh-float-card-head { display:flex; align-items:center; gap:8px; }
.dshh-float-card-avatar { width:30px; height:30px; flex:none; }
.dshh-float-card-title { font-size:13px; font-weight:650; flex:1; min-width:0; }
.dshh-float-card-status { margin-top:8px; font-size:11.5px; color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums; }
.dshh-float-metrics { margin-top:9px; display:flex; flex-direction:column; gap:5px; }
.dshh-float-metrics-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.dshh-float-metrics-title { font-size:11px; font-weight:650; }
.dshh-float-metrics-note { font-size:9.5px; color:var(--dsw-alias-label-secondary); text-align:right; }
.dshh-float-metric { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:2px 10px;
  padding:6px 8px; border:1px solid var(--dsw-alias-border-l1); border-radius:9px;
  background:var(--dsw-alias-bg-layer-2); }
.dshh-float-metric-name { font-size:10.5px; color:var(--dsw-alias-label-secondary); }
.dshh-float-metric-value { grid-row:span 2; align-self:center; text-align:right;
  font-size:14px; font-weight:680; line-height:1.25; font-variant-numeric:tabular-nums; }
.dshh-float-metric-value small { margin-left:3px; font-size:10px; font-weight:400;
  color:var(--dsw-alias-label-secondary); }
.dshh-float-metric-meta { grid-column:1; font-size:9.5px; line-height:1.35;
  color:var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshh-float-metrics-empty { padding:7px 8px; font-size:10.5px; color:var(--dsw-alias-label-secondary);
  border:1px dashed var(--dsw-alias-border-l1); border-radius:9px; }
.dshh-float-card-text { margin-top:6px; font-size:12px; line-height:1.65; }
.dshh-float-card-actions { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
.dshh-float-card-actions .dshh-btn { flex:1; min-width:110px; }
.dshh-float-card-hint { margin-top:10px; padding-top:9px; border-top:1px solid var(--dsw-alias-border-l1);
  font-size:10.5px; color:var(--dsw-alias-label-secondary); line-height:1.55; }
.dshh-float-bubble { padding:11px 12px; display:flex; gap:8px; align-items:flex-start;
  overflow-y:auto; }
.dshh-float-bubble-text { font-size:12.5px; line-height:1.6; flex:1; }
.dshh-float-iconbtn { border:none; background:transparent; color:var(--dsw-alias-label-secondary);
  width:24px; height:24px; border-radius:6px; cursor:pointer; font-size:16px; line-height:1; flex:none; }
.dshh-float-iconbtn:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
.dshh-float-iconbtn:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }

.dshh-set { max-width:760px; padding:2px 2px 28px; display:flex; flex-direction:column; gap:16px; }
.dshh-set-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.dshh-set-title { margin:0; font-size:18px; font-weight:650; }
.dshh-set-sub { margin:5px 0 0; font-size:12px; line-height:1.65;
  color:var(--dsw-alias-label-secondary); max-width:600px; }
.dshh-set-save { font-size:11.5px; color:var(--dsw-alias-label-secondary); white-space:nowrap; padding-top:4px; }
.dshh-set-save.is-saved { color:var(--dsw-alias-state-success-primary); }
.dshh-set-save.is-error { color:var(--dsw-alias-state-error-primary); }
.dshh-set-card { border:1px solid var(--dsw-alias-border-l1); border-radius:14px;
  background:var(--dsw-alias-bg-layer-1); overflow:hidden; }
.dshh-set-cardhead { padding:12px 16px; font-size:12.5px; font-weight:650;
  border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshh-set-row { display:flex; align-items:center; justify-content:space-between; gap:18px;
  padding:13px 16px; border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshh-set-row:last-child { border-bottom:none; }
.dshh-set-copy { min-width:0; }
.dshh-set-label { font-size:12.5px; font-weight:600; }
.dshh-set-desc { margin-top:2px; font-size:11px; line-height:1.55; color:var(--dsw-alias-label-secondary); }
.dshh-set-control { flex:none; display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.dshh-switch { width:40px; height:23px; padding:2px; border-radius:999px;
  border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-2);
  cursor:pointer; transition:background .15s,border-color .15s; }
.dshh-switch.is-on { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); }
.dshh-switch-thumb { display:block; width:17px; height:17px; border-radius:50%; background:#fff;
  box-shadow:0 1px 3px rgba(15,23,42,.25); transition:transform .16s ease; }
.dshh-switch.is-on .dshh-switch-thumb { transform:translateX(17px); }
.dshh-switch:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
.dshh-set-seg { display:inline-flex; padding:2px; gap:2px; border-radius:9px;
  background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1);
  flex-wrap:wrap; }
.dshh-set-segbtn { border:none; background:transparent; color:var(--dsw-alias-label-secondary);
  font:inherit; font-size:11.5px; padding:4px 10px; border-radius:7px; cursor:pointer; }
.dshh-set-segbtn.is-active { background:var(--dsw-alias-bg-overlay); color:var(--dsw-alias-label-primary);
  box-shadow:0 1px 2px rgba(15,23,42,.16); font-weight:600; }
.dshh-set-segbtn:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.dshh-set-input { width:220px; max-width:100%; background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary); border:1px solid var(--dsw-alias-border-l2);
  border-radius:8px; padding:6px 9px; font:inherit; font-size:12px; }
.dshh-set-input:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.dshh-set-avatar-row { align-items:flex-start; }
.dshh-set-avatarpreview { width:64px; height:64px; flex:none; border-radius:50%; overflow:hidden;
  border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2);
  display:flex; align-items:center; justify-content:center; }
.dshh-set-avatarimg { width:100%; height:100%; object-fit:cover; display:block; }
.dshh-set-avatarpreview .dshh-float-art { width:100%; height:100%; }
.dshh-set-avatarmain { display:flex; flex-direction:column; gap:8px; min-width:0; flex:1; }
.dshh-set-avataractions { display:flex; gap:8px; flex-wrap:wrap; }
.dshh-set-avatartag { font-size:10.5px; color:var(--dsw-alias-label-secondary); }
.dshh-set-select, .dshh-set-time { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:5px 7px;
  font:inherit; font-size:12px; }
.dshh-set-select:focus-visible, .dshh-set-time:focus-visible {
  outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.dshh-set-times { display:flex; align-items:center; gap:6px; font-size:11.5px;
  color:var(--dsw-alias-label-secondary); }
.dshh-set-note { margin:2px 2px 0; font-size:11px; line-height:1.7;
  color:var(--dsw-alias-label-secondary); }
.dshh-set-error { padding:10px 12px; border-radius:10px; font-size:12px;
  border:1px solid var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); }
.dshh-set-reset { font-size:11.5px; }
@keyframes dshhFloatBob { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-3px) } }
@keyframes dshhFloatPop { from { transform:scale(.6); opacity:0 } to { transform:scale(1); opacity:1 } }
@keyframes dshhFloatRise { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
@media (prefers-reduced-motion: reduce) {
  .dshh-float-inner { animation:none !important; }
  .dshh-float-card, .dshh-float-bubble { animation:none; }
}
@media (max-width:620px) {
  .dshh-set-row { flex-direction:column; align-items:flex-start; }
  .dshh-set-control { width:100%; justify-content:flex-end; }
  .dshh-set-avatarmain { width:100%; }
}

/* ---------- metabolic ledger (代谢对账簿) ---------- */
/* Coverage-driven surfaces: neutral statuses, never red verdicts. */
.dshh-hero-dual { display:flex; flex-direction:column; gap:8px; }
.dshh-hero-switch { display:inline-flex; align-self:flex-start; gap:3px; padding:3px;
  border:1px solid rgba(255,255,255,.14); border-radius:999px; background:#12151C; }
.dshh-hero-switch-btn { border:none; background:transparent; color:rgba(242,244,248,.62);
  font:inherit; font-size:11.5px; font-weight:650; padding:5px 15px; border-radius:999px;
  cursor:pointer; }
.dshh-hero-switch-btn:hover { color:#F2F4F8; }
.dshh-hero-switch-btn[data-active='true'] { background:${CUT_ACCENT}; color:${CUT_BG_FROM}; }
.dshh-met-heroconfirm { position:relative; z-index:1; margin-top:12px; padding:10px 12px;
  border-radius:10px; font-size:11px; line-height:1.6; color:rgba(243,244,246,.78);
  border:1px solid rgba(215,255,63,.28); background:rgba(215,255,63,.07); }

.dshh-met-accountgrid { grid-template-columns:repeat(5,minmax(0,1fr)); }
.dshh-met-labtile .dshh-account-role { color:${CUT_HOT}; border-color:${CUT_HOT}; }
.dshh-met-crosslink { display:flex; align-items:center; justify-content:space-between;
  gap:12px; flex-wrap:wrap; }

.dshh-met-rows { display:flex; flex-direction:column; }
.dshh-met-row { display:grid; align-items:start; gap:4px 10px; width:100%;
  grid-template-columns:minmax(96px,1fr) minmax(112px,1.05fr) minmax(112px,1.15fr) minmax(96px,1fr);
  padding:10px 2px; border:none; border-bottom:1px solid var(--dsw-alias-border-l1);
  background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.dshh-met-row:last-child { border-bottom:none; }
.dshh-met-row:hover { background:var(--dsw-alias-bg-layer-2); }
.dshh-met-row:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.dshh-met-row-name { display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  min-width:0; font-size:12px; font-weight:650; }
.dshh-met-row-value { font-size:13px; font-weight:640; font-variant-numeric:tabular-nums;
  min-width:0; overflow-wrap:anywhere; }
.dshh-met-row-value small, .dshh-met-row-band small { display:block; margin-top:2px;
  font-size:9.5px; font-weight:400; line-height:1.5; color:var(--dsw-alias-label-secondary); }
.dshh-met-row-band { font-size:10.5px; line-height:1.5; color:var(--dsw-alias-label-secondary);
  min-width:0; }
.dshh-met-row-side { display:flex; flex-direction:column; align-items:flex-start; gap:3px;
  font-size:10.5px; color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
.dshh-met-status { display:inline-block; padding:0 7px; border-radius:999px;
  font-size:10px; font-weight:650; color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l2); background:rgba(255,255,255,.045); }
.dshh-met-status[data-status='unknown'] { color:var(--dsw-alias-label-secondary);
  border-style:dashed; background:transparent; }
/* Above/below stay neutral: no warn colour, no verdict framing. */
.dshh-met-status[data-status='above'], .dshh-met-status[data-status='below'] {
  border-color:rgba(255,255,255,.28); background:rgba(255,255,255,.075); }
.dshh-met-rowmeta { grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:4px 12px;
  font-size:10px; color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
.dshh-met-pill { display:inline-flex; align-items:center; padding:0 6px; border-radius:999px;
  font-size:9.5px; font-weight:600; color:var(--dsw-alias-label-secondary);
  border:1px solid var(--dsw-alias-border-l2); }
.dshh-met-coverage { font-size:11px; font-weight:650; color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.dshh-met-more { margin-top:10px; align-self:flex-start; }
.dshh-met-extra { margin-top:4px; }
.dshh-met-statement-note { margin-top:10px; font-size:10.5px; line-height:1.7;
  color:var(--dsw-alias-label-secondary); }
.dshh-met-hint { margin-top:10px; padding:9px 11px; border-radius:10px; font-size:10.5px;
  line-height:1.7; color:var(--dsw-alias-label-secondary);
  border:1px solid rgba(215,255,63,.16); background:rgba(215,255,63,.05); }

.dshh-met-fieldgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
  gap:8px 10px; }
.dshh-met-fieldcell { display:flex; flex-direction:column; gap:3px; min-width:0; }
.dshh-met-inline { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dshh-met-qlist { display:flex; flex-direction:column; gap:6px; margin:6px 0 10px; }
.dshh-met-qrow { display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  font-size:11.5px; line-height:1.55; }
.dshh-met-visit-section { margin-top:14px; }
.dshh-met-visit-title { font-size:12px; font-weight:650; }
.dshh-met-visit-lines { margin:4px 0 0; padding-left:16px; font-size:11.5px;
  line-height:1.75; color:var(--dsw-alias-label-primary); }
.dshh-met-visit-lines li { margin-bottom:2px; overflow-wrap:anywhere; }

@media (max-width:720px) {
  .dshh-met-accountgrid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .dshh-met-row { grid-template-columns:minmax(78px,1fr) minmax(92px,1.1fr); }
  .dshh-met-row-side { grid-column:2; flex-direction:row; flex-wrap:wrap; align-items:center; }
  .dshh-met-rowmeta { grid-column:1 / -1; }
  .dshh-met-coverage { white-space:normal; text-align:right; }
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

    /** Same-origin read route for one archived document preview. */
    function documentFileUrl(id, member) {
      return `${API}/document-file?id=${encodeURIComponent(id)}&member=${encodeURIComponent(member)}`
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
      // Metabolic ledger context: behaviour accounts only, never the numbers
      // themselves. Present independently so the coach copy switches to
      // 测 / 吃 / 动 / 睡 / 化验 / 复查 when a metabolic goal is active.
      const metabolicGoal = activeGoals.find((item) => item.code === 'metabolic') ?? null
      const metabolic = Boolean(metabolicGoal)
      const metabolicList = metabolic ? metabolicAccounts(metabolicGoal) : []
      const metabolicOf = (code) => metabolicList.find((account) => account?.code === code) ?? null
      const metabolicMet = metabolicList.filter((account) => account?.today?.met).length
      return {
        goal, lean, recordToday, photoToday, trainingDays, trainingTarget,
        proteinLow, proteinMet, sleepMet, waterMet, trainingMet,
        accountMet, accountTotal, streak, allDone,
        season: lean ? seasonMeta(leanGoal) : null,
        metabolic: metabolic
          ? {
              accounts: metabolicList,
              measure: metabolicOf('measure'),
              diet: metabolicOf('diet'),
              move: metabolicOf('move'),
              sleep: metabolicOf('sleep'),
              weekly: metabolicWeekly(metabolicGoal),
              labs: metabolicLabs(metabolicGoal),
              season: metabolicSeasonMeta(metabolicGoal),
              accountMet: metabolicMet,
              accountTotal: metabolicList.length,
              allDone: metabolicList.length > 0 && metabolicMet >= metabolicList.length,
              recordToday,
              streak,
            }
          : null,
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

      if (ctx.lean && !ctx.metabolic) {
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
            ? '大餐的蛋白质还没存够。肌肉要的是原料，不是情绪。'
            : '大餐的蛋白质今天还没到参考区间，下一餐留意一下。')
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
      } else if (ctx.metabolic) {
        // Metabolic accounts: measure / diet / move / sleep + one lab event.
        const meta = ctx.metabolic
        const measureWeek = meta.measure?.week ?? {}
        const dietWeek = meta.diet?.week ?? {}
        const moveWeek = meta.move?.week ?? {}
        const sleepWeek = meta.sleep?.week ?? {}
        const measureTarget = Number(measureWeek.target ?? 3) || 3
        const dietTarget = Number(dietWeek.target ?? 4) || 4
        const moveTarget = Number(moveWeek.target ?? 5) || 5
        const sleepTarget = Number(sleepWeek.target ?? 5) || 5
        const moveMinutes = Number(meta.weekly?.activityMinutes ?? 0) || 0
        if (!ctx.recordToday && meta.accountMet === 0) {
          lines.push(hard
            ? '账户今天还是空的。存一笔，哪怕量一次血压。'
            : '今天还没有存入。先记一笔，量一次也算。')
          lines.push(hard
            ? '测、吃、动、睡都空着。先挑一个，存进去再说。'
            : '挑一个账户先记一笔，今天的进展就开始了。')
        }
        if (Number(measureWeek.met ?? 0) < measureTarget) {
          lines.push(hard
            ? `本周监测 ${measureWeek.met ?? 0}/${measureTarget} 天。复查前 7 天要连续测，平时先存 3 天。`
            : `本周监测 ${measureWeek.met ?? 0}/${measureTarget} 天，先记一次家庭监测。`)
        }
        if (Number(dietWeek.met ?? 0) < dietTarget) {
          lines.push(hard
            ? `饮食记录 ${dietWeek.met ?? 0}/${dietTarget} 天。拍一张也算，不用算到克。`
            : `饮食记录 ${dietWeek.met ?? 0}/${dietTarget} 天，记一餐就行。`)
        }
        if (Number(moveWeek.met ?? 0) < moveTarget) {
          lines.push(hard
            ? `活动 ${moveMinutes}/150 分钟。先走 20 分钟，账户就动起来了。`
            : `活动累计 ${moveMinutes} 分钟；先记一次短的活动。`)
        }
        if (Number(sleepWeek.met ?? 0) < sleepTarget) {
          lines.push(hard
            ? `睡眠 ${sleepWeek.met ?? 0}/${sleepTarget} 天。今晚先把关灯时间提前 30 分钟。`
            : `睡眠 ${sleepWeek.met ?? 0}/${sleepTarget} 天，今晚早点休息。`)
        }
        if (meta.labs && !meta.labs.hasCycleLab) {
          lines.push(hard
            ? '本周期还没有化验记录。有报告就一次录完，别等复诊才翻箱倒柜。'
            : '有化验单就一次录完，之后对账单会更完整。')
        }
        if (ctx.streak >= 2) {
          lines.push(hard
            ? `连续 ${ctx.streak} 天。今天也别断。`
            : `连续 ${ctx.streak} 天记录，保持这个节奏。`)
        }
        if (meta.season?.hasSeason) {
          if (meta.season.ended) {
            lines.push(hard
              ? '本周期结束了。生成就诊摘要，复诊带走一页纸。'
              : '这个复查周期结束了，可以生成就诊摘要。')
          } else {
            const checkpoint = (meta.season.checkpoints ?? []).find((mark) =>
              mark?.reached && Number(mark?.week) === Number(meta.season.week))
            if (checkpoint) {
              lines.push(hard
                ? `${checkpoint.label ?? `W${checkpoint.week}`} 检查点到了。打开对账单看一眼。`
                : `到 ${checkpoint.label ?? `W${checkpoint.week}`} 检查点了，可以看看本周对账单。`)
            } else if (typeof meta.season.daysLeft === 'number' && meta.season.daysLeft <= 7) {
              lines.push(hard
                ? `距复查还有 ${meta.season.daysLeft} 天。复查前 7 天早晚各测 1 次，连续 7 天弃首日。`
                : `距复查还有 ${meta.season.daysLeft} 天，可以开始连续测几天血压。`)
            }
          }
        }
        if (meta.allDone) {
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
            ? '大餐的蛋白质记录还空着。下一餐把它记上。'
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
      { code: 'protein', name: '大餐' },
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
      { code: 'protein', name: '大餐', role: '原料', metric: 'protein', unit: 'g',
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
      if (target?.singleMeasurement === true) return '—'
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

    /** Attach a unit to a display value; percentages stay attached. */
    function withMetricUnit(text, unit) {
      if (text == null || text === '—') return '—'
      if (!unit) return String(text)
      return unit === '%' ? `${text}%` : `${text} ${unit}`
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
        const unit = row?.unit ?? ''
        const base = withMetricUnit(row?.baseline ?? '—', unit)
        const latestValue = row?.latest ?? row?.currentDisplay
        const latest = withMetricUnit(latestValue ?? '—', unit)
        const single = row?.single
          ?? Boolean(row?.baselineAt && row?.latestAt && row.baselineAt === row.latestAt)
        const delta = single
          ? '—'
          : row?.deltaDisplay
            ?? observeDeltaText({ deltaSinceBaseline: row?.delta, unit })
        lines.push(`${row?.name ?? '体成分'}：${base} → ${latest}（${delta}）`)
      }
      lines.push(`说明：${review.note}`)
      lines.push(LEAN_DISCLAIMER)
      return lines.join('\n')
    }

    // ------------------------------------------------------- metabolic ledger
    //
    // 「代谢对账簿」：测 / 吃 / 动 / 睡四个行为账户可计分；腰围、血压、血糖、
    // 血脂只做「对账单」，展示参考区间、均值与变化，不计分、不排名、不下结论。
    // Every helper below tolerates an older host that has not shipped the
    // `metabolic` payload yet: missing fields become neutral defaults instead of
    // crashing the panel, and the caller falls back to the legacy dashboard.

    const METABOLIC_ACCOUNT_FALLBACKS = [
      { code: 'measure', name: '测', role: '证据', metric: 'measure', unit: '次',
        kind: 'monitor', targetDisplay: '每周 ≥3 天', depositLine: '当天有家庭监测记录' },
      { code: 'diet', name: '吃', role: '记录', metric: 'diet', unit: '餐',
        kind: 'diet', targetDisplay: '每周 ≥4 天', depositLine: '当天记录至少一餐' },
      { code: 'move', name: '动', role: '活动', metric: 'activity', unit: 'min',
        kind: 'activity', targetDisplay: '每周 ≥5 天 · 累计 ≥150 分钟', depositLine: '当天 ≥30 分钟' },
      { code: 'sleep', name: '睡', role: '修复', metric: 'sleep', unit: 'h',
        kind: 'range', targetDisplay: '每周 ≥5 天 ≥7 h', depositLine: '≥7 h/日' },
    ]

    const METABOLIC_CORE_FALLBACKS = [
      { code: 'bp', aliases: ['bp', 'sbp'], name: '血压', unit: 'mmHg', role: 'core',
        valueLabel: '近 7 天均值', bandLabel: '代谢组分参考 <130/85', clickCode: 'sbp' },
      { code: 'waist', aliases: ['waist'], name: '腰围', unit: 'cm', role: 'core',
        valueLabel: '最近一次', bandLabel: '参考 <90（男）/ <85（女）' },
      { code: 'fpg', aliases: ['fpg'], name: '空腹血糖', unit: 'mmol/L', role: 'core',
        valueLabel: '最近一次', bandLabel: '参考 3.9–6.1' },
      { code: 'tg', aliases: ['tg'], name: '甘油三酯', unit: 'mmol/L', role: 'core',
        valueLabel: '最近化验', bandLabel: '参考 <1.7' },
      { code: 'hdl', aliases: ['hdl'], name: '高密度脂蛋白胆固醇', unit: 'mmol/L', role: 'core',
        valueLabel: '最近化验', bandLabel: '代谢组分参考 ≥1.04' },
    ]

    const METABOLIC_EXTRA_FALLBACKS = [
      { code: 'ua', aliases: ['ua'], name: '尿酸', unit: 'μmol/L', role: 'extra',
        valueLabel: '最近化验', bandLabel: '参考男 <420 / 女 <360' },
      { code: 'ldl', aliases: ['ldl'], name: '低密度脂蛋白胆固醇', unit: 'mmol/L', role: 'extra',
        valueLabel: '最近化验', bandLabel: '一般参考 <3.4；风险分层目标由医生设定' },
      { code: 'hba1c', aliases: ['hba1c'], name: '糖化血红蛋白', unit: '%', role: 'extra',
        valueLabel: '最近化验', bandLabel: '非糖尿病人群参考 <6.0' },
      { code: 'ppg', aliases: ['ppg'], name: '餐后2小时血糖', unit: 'mmol/L', role: 'extra',
        valueLabel: '最近一次', bandLabel: '参考 <7.8' },
      { code: 'weight', aliases: ['weight', 'bmi'], name: '体重 / BMI', unit: '', role: 'extra',
        valueLabel: '最近一次', bandLabel: '只观察趋势，不设通用目标' },
    ]

    const METABOLIC_STATUS_TEXT = {
      within: '参考内',
      above: '高于参考',
      below: '低于参考',
      // A single reading is a first-class state, never a verdict.
      single: '单次 · 仅参考',
      unknown: '暂无数据',
    }

    const METABOLIC_CONTEXTS = [
      { code: 'morning', name: '晨起' },
      { code: 'evening', name: '睡前' },
      { code: 'fasting', name: '空腹' },
      { code: 'postprandial', name: '餐后' },
      { code: 'random', name: '随机' },
    ]

    /** PRD §10 fixed disclaimer (ledger pages and the cycle pane). */
    const METABOLIC_DISCLAIMER = '本工具仅用于记录和展示你自行测量的健康数据，并基于数据做统计性描述。'
      + '所有内容不构成医疗诊断、治疗建议或用药指导。'
      + '参考区间为人群通用参考值，不代表个人目标值。'
      + '本工具不提供诊断、分期或用药相关内容；是否患病、个人目标与复查安排请以医生意见为准。'

    /** PRD §10 fixed disclaimer for the playbook. */
    const METABOLIC_PLAYBOOK_DISCLAIMER = '本工具不是诊断工具，也不是处方。'
      + '参考区间来自中国指南/国家膳食规范/WHO 公开文件（详见每张卡片来源），只用于记录与对照；'
      + '不构成对任何个人的诊断、治疗、用药、食谱或训练计划。是否患病、目标值与复查安排请以医生意见为准。'

    /** Visit-summary footer (contract `visitSummary.disclaimer`). */
    const METABOLIC_SUMMARY_DISCLAIMER = '本摘要由用户自行记录的数据自动汇总，不含任何诊断、治疗或用药建议；请以医生判断为准。'

    const METABOLIC_VISIT_QUESTIONS = [
      '我的个人目标值应该是多少？',
      '下次复查哪些项目、什么时候？',
      '家庭血压均值与诊室血压不一致时，以哪个为准？',
    ]

    const METABOLIC_QUESTIONS_KEY = 'dsh-health.visitQuestions.'

    // Public references only; the playbook explains the mechanism, not a plan.
    const METABOLIC_SOURCES = [
      { label: '中国营养学会 · 中国居民膳食指南（2022）八准则',
        url: 'http://dg.cnsoc.org/article/04/J4-AsD_DR3OLQMnHG0-jZA.html' },
      { label: '中国高血压防治指南（2024）要点解读（人民日报健康客户端转载）',
        url: 'https://m.163.com/dy/article/J9GJ6BIN052583KJ.html' },
      { label: '家庭血压监测指南（2019）速读：早晚各 1 次 × 2–3 遍，7 天弃首日',
        url: 'https://news.medlive.cn/heart/info-progress/show-157334_129.html' },
      { label: '中国血脂管理指南（2023）题录',
        url: 'https://rs.yiigle.com/cmaid/1449955' },
      { label: '中国糖尿病防治指南（2024）全文转载（山西省疾控中心）',
        url: 'https://www.sxcdc.cn/jkfw/jsbz/art/2025/art_a6322e70d224461f900e02e70b2a937c.html' },
      { label: '中国人群身体活动指南（2021）解读：150–300 分钟/周中等强度',
        url: 'https://www.163.com/dy/article/GSE4IBSP05347DU2.html' },
    ]

    function metabolicGoalOf(goals) {
      return (goals ?? []).find((goal) => goal && goal.code === 'metabolic') ?? null
    }

    function metabolicActiveGoalOf(goals) {
      return (goals ?? []).find((goal) =>
        goal && goal.code === 'metabolic' && goal.status === 'active') ?? null
    }

    /**
     * New payload ready? The contract ships `season` + `accounts` + `metabolic`
     * together; if any is missing we keep the legacy metabolic dashboard rather
     * than render empty ledgers.
     */
    function metabolicLedgerReady(goal) {
      return Boolean(goal
        && goal.season
        && Array.isArray(goal.accounts) && goal.accounts.length > 0
        && goal.metabolic && typeof goal.metabolic === 'object')
    }

    /** The four behaviour accounts, normalised against the PRD defaults. */
    function metabolicAccounts(goal) {
      const list = Array.isArray(goal?.accounts) ? goal.accounts.filter(Boolean) : []
      if (list.length > 0) {
        return list.map((account) => {
          const fallback = METABOLIC_ACCOUNT_FALLBACKS.find((item) =>
            item.code === account.code || item.metric === account.metric) ?? {}
          return { ...fallback, ...account }
        })
      }
      return METABOLIC_ACCOUNT_FALLBACKS.map((account) => ({
        ...account, today: null, week: null, season: null,
      }))
    }

    /** Review-cycle fields (`season.kind = "review"`), with neutral fallbacks. */
    function metabolicSeasonMeta(goal) {
      const base = seasonMeta(goal)
      const weeks = base.weeks
      const week = base.week
      const label = goal?.season?.label
        || (base.hasSeason && week > 0
          ? `第 ${base.no} 个复查周期 · 第 ${Math.min(week, weeks)} 周 / ${weeks} 周`
          : '')
      return {
        ...base,
        kind: goal?.season?.kind ?? 'review',
        label,
        weeks,
        week,
      }
    }

    function metabolicWeekly(goal) {
      const accounts = metabolicAccounts(goal)
      const weekly = goal?.weekly ?? {}
      let deposits = typeof weekly.deposits === 'number' ? weekly.deposits : null
      let max = typeof weekly.max === 'number' ? weekly.max : null
      if (deposits === null || max === null) {
        let sum = 0
        let capacity = 0
        for (const account of accounts) {
          const week = account?.week
          if (typeof week?.met === 'number') sum += week.met
          capacity += typeof week?.max === 'number' ? week.max : 7
        }
        if (deposits === null) deposits = sum
        if (max === null) max = capacity || 28
      }
      return {
        start: weekly.start ?? null,
        end: weekly.end ?? null,
        deposits,
        max,
        recordDays: typeof weekly.recordDays === 'number' ? weekly.recordDays : null,
        bpDays: typeof weekly.bpDays === 'number' ? weekly.bpDays : null,
        mealDays: typeof weekly.mealDays === 'number' ? weekly.mealDays : null,
        activityMinutes: typeof weekly.activityMinutes === 'number' ? weekly.activityMinutes : null,
        labDone: typeof weekly.labDone === 'boolean' ? weekly.labDone : null,
      }
    }

    function metabolicLabs(goal) {
      const labs = goal?.metabolic?.labs ?? {}
      const items = Array.isArray(labs.items) ? labs.items.filter(Boolean) : []
      const cycleCount = typeof labs.cycleCount === 'number' ? labs.cycleCount : null
      const hasCycleLab = Boolean(labs.hasCycleLab)
        || items.length > 0
        || (cycleCount !== null && cycleCount > 0)
      return {
        latestAt: labs.latestAt ?? labs.latestDate ?? null,
        latestDate: labs.latestDate ?? labs.latestAt ?? null,
        cycleCount: cycleCount ?? (hasCycleLab ? 1 : 0),
        hasCycleLab,
        items,
      }
    }

    function metabolicSugary(goal) {
      const sugary = goal?.metabolic?.sugary ?? null
      if (!sugary) return null
      return {
        weekMl: typeof sugary.weekMl === 'number' ? sugary.weekMl : null,
        weekCount: typeof sugary.weekCount === 'number' ? sugary.weekCount : null,
        days7: typeof sugary.days7 === 'number' ? sugary.days7 : null,
        note: sugary.note ?? '只记录，不评价。',
      }
    }

    function signedValue(value, unit) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      const sign = value > 0 ? '+' : ''
      const text = String(Math.round(value * 100) / 100)
      return `${sign}${text}${unit ? ` ${unit}` : ''}`
    }

    /** Nearest change line for a statement row; never framed as good/bad. */
    function metabolicDelta(row) {
      if (!row) return null
      // Host text already carries its own comparison window.
      const labelFor = (text, fallback) => (String(text).includes('较') ? '' : fallback)
      if (row.deltaPrevDisplay) {
        return { text: row.deltaPrevDisplay, label: labelFor(row.deltaPrevDisplay, '较上次化验') }
      }
      if (typeof row.deltaPrev === 'number') {
        return { text: signedValue(row.deltaPrev, row.unit), label: '较上次化验' }
      }
      if (row.deltaDisplay) {
        const fallback = row.kind === 'homeAvg' ? '较前 7 天'
          : row.kind === 'latest' ? '较 30 天' : '较上次'
        return { text: row.deltaDisplay, label: labelFor(row.deltaDisplay, fallback) }
      }
      if (typeof row.delta30 === 'number') {
        return { text: signedValue(row.delta30, row.unit), label: '较 30 天' }
      }
      return null
    }

    /**
     * Statement rows: core five always rendered (missing rows show 「暂无数据」),
     * additional items are collapsible in the UI. No scoring, no 「符合 N 项」.
     */
    function metabolicStatementModel(goal) {
      const statement = goal?.metabolic?.statement ?? null
      const rawRows = Array.isArray(statement?.rows)
        ? statement.rows.filter((row) => row && row.code)
        : []
      const descriptors = [...METABOLIC_CORE_FALLBACKS, ...METABOLIC_EXTRA_FALLBACKS]
      const rows = descriptors.map((fallback) => {
        const aliases = fallback.aliases ?? [fallback.code]
        const raw = rawRows.find((row) => aliases.includes(row.code)) ?? null
        const status = raw && METABOLIC_STATUS_TEXT[raw.status] ? raw.status : 'unknown'
        const valueText = raw?.currentDisplay != null
          ? String(raw.currentDisplay)
          : (typeof raw?.current === 'number' ? fmtNumber(raw.current, 2) : null)
        const valueLabel = raw?.valueLabel
          ?? (valueText == null ? '暂无数据' : fallback.valueLabel ?? '')
        return {
          ...fallback,
          ...(raw ?? {}),
          code: fallback.code,
          name: raw?.name ?? fallback.name,
          role: fallback.role,
          unit: raw?.unit ?? fallback.unit ?? '',
          status,
          statusText: raw?.statusText ?? METABOLIC_STATUS_TEXT[status],
          valueText,
          valueLabel,
          measuredAt: raw?.measuredAt ?? null,
          single: Boolean(raw?.single),
          bandLabel: raw?.band?.label ?? fallback.bandLabel ?? '只观察趋势',
          delta: metabolicDelta(raw ?? {}),
          note: raw?.note ?? '',
          clickCode: fallback.clickCode ?? fallback.code,
        }
      })
      return {
        rows,
        core: rows.filter((row) => row.role === 'core'),
        extra: rows.filter((row) => row.role === 'extra'),
        note: statement?.note
          ?? '本页只做参考区间与趋势展示，不计算「符合几项」，不构成诊断。是否患病请医生判断。',
      }
    }

    function metabolicCoverage(goal) {
      const statement = goal?.metabolic?.statement ?? null
      const total = typeof statement?.coverage?.total === 'number' && statement.coverage.total > 0
        ? statement.coverage.total
        : 5
      const computed = metabolicStatementModel(goal).core
        .filter((row) => row.valueText != null).length
      const recorded = typeof statement?.coverage?.recorded === 'number'
        ? statement.coverage.recorded
        : computed
      return { recorded: Math.max(0, Math.min(total, recorded)), total }
    }

    /** Cycle review payload (`metabolic.review`), derived when absent. */
    function metabolicReview(goal) {
      const season = metabolicSeasonMeta(goal)
      const accounts = metabolicAccounts(goal)
      const weekly = metabolicWeekly(goal)
      const review = goal?.metabolic?.review ?? {}
      const byAccount = Array.isArray(review.byAccount) && review.byAccount.length > 0
        ? review.byAccount
        : accounts.map((account) => {
            const stat = account?.season ?? {}
            return {
              code: account?.code,
              name: account?.name ?? account?.metric ?? '账户',
              deposits: stat.deposits ?? 0,
              max: stat.max ?? 0,
              rate: stat.rate ?? null,
              label: stat.label ?? `${stat.deposits ?? 0} 天`,
            }
          })
      const deposits = typeof review.deposits === 'number'
        ? review.deposits
        : byAccount.reduce((sum, item) => sum + (Number(item?.deposits) || 0), 0)
      const max = typeof review.max === 'number' ? review.max : null
      const statementRows = metabolicStatementModel(goal).rows
      const unitOf = (code) => statementRows.find((row) => row.code === code)?.unit ?? ''
      const bpDisplay = statementRows.find((row) => row.code === 'bp')?.valueText ?? null
      const statement = Array.isArray(review.statement) && review.statement.length > 0
        ? review.statement.filter(Boolean).map((row) => ({
            ...row,
            unit: row.unit ?? unitOf(row.code),
            // BP's latest is a 7-day mean pair; the bare sys value alone
            // would misrepresent the row, so keep the display pair too.
            latestDisplay: row.code === 'bp' ? (row.latestDisplay ?? bpDisplay) : row.latestDisplay,
          }))
        : statementRows
            .filter((row) => row.role === 'core' && row.valueText != null)
            .map((row) => ({
              code: row.code,
              name: row.name,
              unit: row.unit,
              baseline: null,
              baselineAt: null,
              latest: row.valueText,
              latestAt: row.measuredAt,
              delta: null,
              deltaDisplay: null,
            }))
      const numberOrNull = (value) =>
        (typeof value === 'number' && Number.isFinite(value) ? value : null)
      return {
        ended: review.ended ?? season.ended,
        week: numberOrNull(review.week) ?? season.week,
        weeks: numberOrNull(review.weeks) ?? season.weeks,
        days: numberOrNull(review.days) ?? season.day,
        daysLeft: numberOrNull(review.daysLeft) ?? season.daysLeft,
        deposits,
        max,
        rate: typeof review.rate === 'number'
          ? review.rate
          : (max && max > 0 ? deposits / max : null),
        byAccount,
        recordDays: numberOrNull(review.recordDays) ?? weekly.recordDays,
        bpDays: numberOrNull(review.bpDays) ?? weekly.bpDays,
        mealDays: numberOrNull(review.mealDays) ?? weekly.mealDays,
        activityMinutes: numberOrNull(review.activityMinutes) ?? weekly.activityMinutes,
        sleepAvg: numberOrNull(review.sleepAvg),
        waterAvg: numberOrNull(review.waterAvg),
        sugaryMl: numberOrNull(review.sugaryMl),
        labCount: numberOrNull(review.labCount) ?? metabolicLabs(goal).cycleCount,
        latestLabAt: review.latestLabAt ?? metabolicLabs(goal).latestAt,
        statement,
        note: review.note
          ?? '本周期只陈述记录事实；指标变化受设备、饮食、水分、作息等影响，不构成效果承诺。',
      }
    }

    /** Normalised visit-summary model; rebuilds a descriptive one when absent. */
    function metabolicVisitModel(goal) {
      const visit = goal?.metabolic?.visitSummary ?? null
      const season = metabolicSeasonMeta(goal)
      const hasVisit = Boolean(visit) && (
        (Array.isArray(visit.sections) && visit.sections.length > 0)
        || (typeof visit.text === 'string' && visit.text.length > 0)
      )
      if (hasVisit) {
        return {
          title: visit.title ?? '就诊摘要',
          generatedAt: visit.generatedAt ?? '',
          period: visit.period ?? (season.label || ''),
          sections: (Array.isArray(visit.sections) ? visit.sections : [])
            .filter(Boolean)
            .map((section) => ({
              id: section.id ?? section.title,
              title: section.title ?? '记录',
              lines: Array.isArray(section.lines)
                ? section.lines.filter((line) => typeof line === 'string' && line)
                : [],
            })),
          questions: Array.isArray(visit.questions) && visit.questions.length > 0
            ? visit.questions.filter((item) => typeof item === 'string' && item)
            : METABOLIC_VISIT_QUESTIONS.slice(),
          text: typeof visit.text === 'string' ? visit.text : '',
          note: visit.note ?? '可在下面补充你想问医生的问题；本摘要不含诊断或建议。',
          disclaimer: visit.disclaimer ?? METABOLIC_SUMMARY_DISCLAIMER,
        }
      }

      const review = metabolicReview(goal)
      const weekly = metabolicWeekly(goal)
      const labs = metabolicLabs(goal)
      const statement = metabolicStatementModel(goal)
      const sections = []
      const coreLines = statement.core
        .filter((row) => row.valueText != null)
        .map((row) => `${row.name}：${row.valueText}${row.unit === '%' ? '%' : row.unit ? ` ${row.unit}` : ''}`
          + `（${row.valueLabel}${row.measuredAt ? ` ${row.measuredAt}` : ''}）`)
      if (coreLines.length > 0) {
        sections.push({ id: 'monitor', title: '核心指标', lines: coreLines })
      }
      if (labs.items.length > 0) {
        sections.push({
          id: 'labs',
          title: '最近化验',
          lines: [`${localDateOf(labs.latestAt) || '—'}：${labs.items.map((item) =>
            `${item.name ?? item.code ?? '项目'} ${item.display ?? '—'}${item.unit ? ` ${item.unit}` : ''}`)
            .join('，')}`],
        })
      }
      const behaviour = []
      if (weekly.recordDays != null) behaviour.push(`近 7 天有记录 ${weekly.recordDays} 天`)
      if (weekly.bpDays != null) behaviour.push(`血压记录 ${weekly.bpDays} 天`)
      if (weekly.mealDays != null) behaviour.push(`饮食记录 ${weekly.mealDays} 天`)
      if (weekly.activityMinutes != null) behaviour.push(`活动 ${weekly.activityMinutes} 分钟`)
      if (behaviour.length > 0) {
        sections.push({ id: 'behavior', title: '行为记录', lines: behaviour })
      }
      const coverage = metabolicCoverage(goal)
      sections.push({
        id: 'coverage',
        title: '记录覆盖',
        lines: [`本周期 ${review.recordDays ?? 0} 天有记录；核心指标有数据 ${coverage.recorded}/${coverage.total} 项`],
      })
      return {
        title: '就诊摘要',
        generatedAt: '',
        period: season.label || '',
        sections,
        questions: METABOLIC_VISIT_QUESTIONS.slice(),
        text: '',
        note: '可在下面补充你想问医生的问题；本摘要不含诊断或建议。',
        disclaimer: METABOLIC_SUMMARY_DISCLAIMER,
      }
    }

    /** Plain-text summary for the clipboard: records, questions, disclaimer only. */
    function metabolicVisitText(model, extraQuestions) {
      const extra = (extraQuestions ?? [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
      const extraBlock = extra.length > 0
        ? `【补充问题】\n${extra.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
        : ''
      // The host already renders a copyable plain-text block; keep it verbatim
      // and splice local questions in before the fixed disclaimer.
      const base = String(model.text ?? '').trim()
      if (base) {
        if (!extraBlock) return base
        const disclaimer = String(model.disclaimer ?? '').trim()
        const index = disclaimer ? base.lastIndexOf(disclaimer) : -1
        if (index > 0) {
          return `${base.slice(0, index).trimEnd()}\n\n${extraBlock}\n\n${base.slice(index)}`
        }
        return `${base}\n\n${extraBlock}`
      }

      const blocks = []
      blocks.push(model.generatedAt
        ? `${model.title}（生成于 ${model.generatedAt}）`
        : model.title)
      if (model.period) blocks.push(model.period)
      for (const section of model.sections ?? []) {
        if (!section?.lines || section.lines.length === 0) continue
        blocks.push(`【${section.title}】\n${section.lines.map((line) => `· ${line}`).join('\n')}`)
      }
      const questions = [...(model.questions ?? []), ...extra]
      if (questions.length > 0) {
        blocks.push(`【想问医生】\n${questions.map((item, index) => `${index + 1}. ${item}`).join('\n')}`)
      }
      if (model.disclaimer) blocks.push(model.disclaimer)
      return blocks.filter(Boolean).join('\n\n')
    }

    /** Weekly report in the metabolic dialect: accounts + lab status, no photos. */
    function metabolicWeeklyText({ memberName, goal, accounts, weekly, labs }) {
      const season = metabolicSeasonMeta(goal)
      const lines = ['代谢对账簿 · 本周对账单']
      if (memberName) lines.push(`成员：${memberName}`)
      if (season.label) lines.push(season.label)
      if (weekly.start || weekly.end) {
        lines.push(`近 7 天：${weekly.start ?? '—'} 至 ${weekly.end ?? '—'}`)
      }
      lines.push(`已存入：${weekly.deposits}/${weekly.max} 格`)
      for (const account of accounts ?? []) {
        const week = account?.week ?? {}
        const label = week.label ?? `${week.met ?? 0}/${week.max ?? 7} 天`
        lines.push(`${account?.name ?? account?.metric ?? '账户'}：${label}`)
      }
      lines.push(`化验：${labs?.hasCycleLab ? `本周期已录 ${labs.cycleCount || 1} 次` : '本周期待录入'}`
        + (labs?.latestAt ? ` · 最近 ${localDateOf(labs.latestAt)}` : ''))
      lines.push('说明：以上只是行为与记录统计，不评定身体好坏；参考区间非医学标准，不构成诊断、治疗或用药建议。')
      return lines.join('\n')
    }

    function readVisitQuestions(memberId) {
      if (!memberId) return []
      const stored = readLocalJSON(METABOLIC_QUESTIONS_KEY + memberId, null)
      return Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : []
    }

    function writeVisitQuestions(memberId, list) {
      if (!memberId) return
      const clean = (Array.isArray(list) ? list : [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
      writeLocalJSON(METABOLIC_QUESTIONS_KEY + memberId, clean.length > 0 ? clean : null)
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
     * Shared modal shell: overlay/Esc close, focus the first control on open
     * (or the control matched by `initialFocus`).
     * All panel modals go through this so their close behaviour stays uniform.
     */
    function ModalFrame({ title, onClose, children, footer, wide, extraWide, initialFocus }) {
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
        const preferred = initialFocus ? boxRef.current?.querySelector(initialFocus) : null
        const first = preferred
          ?? boxRef.current?.querySelector('input, select, textarea, button')
        if (first && typeof first.focus === 'function') first.focus()
      }, [initialFocus])

      return h(
        'div',
        { className: 'dshh-modal-mask', onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() } },
        h(
          'div',
          { className: extraWide ? 'dshh-modal dshh-modal-report'
            : wide ? 'dshh-modal dshh-modal-wide' : 'dshh-modal', ref: boxRef,
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

      // The top-level diet tab was removed; normalize a stale selection (for
      // example from an HMR-preserved state) instead of rendering a blank body.
      useEffect(() => {
        if (tab === 'diet') setTab('overview')
      }, [tab])

      const run = useCallback(async (action, args) => {
        setBusy(true)
        try {
          const result = await postAction(action, args)
          if (!result.ok) return result
          await load()
          // The floating avatar refreshes its "today" badge and reminder copy
          // after a panel mutation without polling the full overview again.
          try { window.dispatchEvent(new Event('dsh-health:changed')) } catch { /* ignore */ }
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
            onNewMeal: () => setModal({ kind: 'meal' }),
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

      // Events pass a SyntheticEvent here; only a string asks for a category focus.
      const openEntry = (focus) => setModal({
        kind: 'entry',
        focus: typeof focus === 'string' ? focus : null,
      })
      const openPhotoCapture = (photoKind) => setModal({ kind: 'photoCapture', photoKind: photoKind ?? 'progress' })
      const openPhoto = (photo) => setModal({ kind: 'photoView', photo })
      const openPhotoCompare = (a, b) => setModal({ kind: 'photoCompare', photos: [a, b] })
      const openPhotosTab = (photo) => {
        setArchiveSection('photos')
        setTab('archive')
        if (photo) setModal({ kind: 'photoView', photo })
      }

      const leanGoal = leanGoalOf(goals)
      const metabolicGoal = metabolicGoalOf(goals)
      const openDiet = () => setModal({ kind: 'diet' })
      const openDeposit = (account, date) => {
        // No account argument (hero CTA) -> first account, today.
        const target = account ?? leanAccounts(leanGoal)[0] ?? null
        // 「大餐」is the diet account: open the diet manager instead of a
        // single protein deposit, so meals/photos/totals stay in one place.
        if (target?.metric === 'protein') {
          openDiet()
          return
        }
        setModal({ kind: 'deposit', account: target, date: date ?? todayKey() })
      }
      const openWeekly = () => setModal({ kind: 'weeklyReview', code: 'lean_muscle' })
      const openMetabolicWeekly = () => setModal({ kind: 'weeklyReview', code: 'metabolic' })
      const openSeason = () => setModal({ kind: 'seasonReview' })
      const openHandbook = (code) => setModal({ kind: 'handbook', code: code ?? 'lean_muscle' })
      const openMetabolicHandbook = () => setModal({ kind: 'handbook', code: 'metabolic' })
      const openFamilyMonitor = (date) => setModal({
        kind: 'familyMonitor',
        date: typeof date === 'string' ? date : todayKey(),
      })
      const openLab = () => setModal({ kind: 'labEntry' })
      const openVisitSummary = () => setModal({ kind: 'visitSummary' })
      const openMeal = (date) => setModal({
        kind: 'meal',
        date: typeof date === 'string' ? date : null,
      })
      /**
       * Route a ledger account (or a ledger cell) to the right entry modal:
       * 测 -> 家庭监测, 吃 -> 记一餐, 动 / 睡 -> single-metric deposit.
       */
      const openAccount = (account, date) => {
        const key = account?.code ?? ''
        const day = date ?? todayKey()
        if (key === 'measure') { openFamilyMonitor(day); return }
        if (key === 'diet') { openMeal(day); return }
        setModal({ kind: 'deposit', account, date: day })
      }
      async function startSeason() {
        const result = await run('startSeason', { member: member.name, code: 'lean_muscle' })
        showToast(result?.ok ? '新赛季已开启，历史记录保留' : (result?.error ?? '开启赛季失败'))
        return result
      }
      async function startMetabolicCycle() {
        const result = await run('startSeason', { member: member.name, code: 'metabolic' })
        showToast(result?.ok ? '新复查周期已开启，历史记录保留' : (result?.error ?? '开启复查周期失败'))
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
          tabs: tabsFor(goals),
          leanActive: Boolean(leanActiveGoalOf(goals)),
          metabolicActive: Boolean(metabolicActiveGoalOf(goals)),
          onTab: (next) => setTab(next),
          onSelectMember: (id) => {
            setSelectedId(id)
            setTab('overview')
            writeSelectedMember(id)
            try { window.dispatchEvent(new Event('dsh-health:changed')) } catch { /* ignore */ }
          },
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
          onHandbook: () => openHandbook('lean_muscle'),
          onMetabolicHandbook: openMetabolicHandbook,
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
            onOpenMetabolicWeekly: openMetabolicWeekly,
            onOpenSeason: openSeason,
            onStartSeason: startSeason,
            onStartMetabolicCycle: startMetabolicCycle,
            onOpenHandbook: openMetabolicHandbook,
            onShareSeason: () => setModal({ kind: 'shareSeason' }),
            onOpenSquad: () => setModal({ kind: 'squad' }),
            onNewMeal: () => openMeal(null),
            onOpenDiet: openDiet,
            onOpenAccount: openAccount,
            onOpenLab: openLab,
            onOpenVisitSummary: openVisitSummary,
            onOpenSeasonTab: () => setTab('season'),
          }),
          tab === 'season' && h(PaneBoundary, { onReset: () => setTab('overview') },
            leanGoal
              ? h('div', { className: 'dshh-seasonpane' },
                  h(SeasonPane, {
                    member,
                    data,
                    goal: leanGoal,
                    goals,
                    recent: data.recent ?? [],
                    photos,
                    onOpenSeason: openSeason,
                    onStartSeason: startSeason,
                    onOpenHandbook: () => openHandbook('lean_muscle'),
                    onShareSeason: () => setModal({ kind: 'shareSeason' }),
                    onOpenSquad: () => setModal({ kind: 'squad' }),
                    onOpenDeposit: openDeposit,
                    onOpenWeekly: openWeekly,
                  }),
                  metabolicActiveGoalOf(goals) && h(MetabolicPane, {
                    goal: metabolicGoal,
                    onOpenVisitSummary: openVisitSummary,
                    onOpenMetabolicWeekly: openMetabolicWeekly,
                    onOpenHandbook: openMetabolicHandbook,
                    onStartMetabolicCycle: startMetabolicCycle,
                  }))
              : metabolicActiveGoalOf(goals)
                ? h(MetabolicPane, {
                    goal: metabolicGoal,
                    onOpenVisitSummary: openVisitSummary,
                    onOpenMetabolicWeekly: openMetabolicWeekly,
                    onOpenHandbook: openMetabolicHandbook,
                    onStartMetabolicCycle: startMetabolicCycle,
                  })
                : h(SeasonPane, {
                    member,
                    data,
                    goal: null,
                    goals,
                    recent: data.recent ?? [],
                    photos,
                    onOpenSeason: openSeason,
                    onStartSeason: startSeason,
                    onOpenHandbook: () => openHandbook('lean_muscle'),
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
              onAnalyzeDocument: (document) => setModal({ kind: 'documentAnalysis', document }),
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
          onNewMeal: () => setModal({ kind: 'meal' }),
          onDeleteMember: deleteMember,
        }),
      )
    }

    // ---------------------------------------------------------------- top bar

    /** Member height caption: "175 cm" / "175.5 cm" / "身高未填". */
    function memberHeightText(member) {
      const value = member?.height
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '身高未填'
      return `${fmtNumber(value, 1)} cm`
    }

    /** Risk caption: "未评估" is a first-class state, not a low-risk label. */
    function memberRiskText(member) {
      if (!member) return '未评估'
      if (member.riskCode === 'unknown' || member.riskLevel === 'unknown') return '未评估'
      return member.riskLevel ?? '未评估'
    }

    function TopBar(props) {
      const { members, member, tab, onTab, onSelectMember, onAddMember } = props
      const [menuOpen, setMenuOpen] = useState(false)
      const pills = members.length <= 4
      const tabs = Array.isArray(props.tabs) && props.tabs.length > 0 ? props.tabs : TABS

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
              h('span', { className: 'dshh-preview-tag' }, '1.3 预览')),
            h('div', { className: 'dshh-sub' },
              `${member.name} · ${member.relation} · ${member.sex} · `
              + `${memberHeightText(member)} · ${memberRiskText(member)}`),
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
                props.metabolicActive && props.onMetabolicHandbook
                  && menuItem('代谢手册', props.onMetabolicHandbook),
                (!props.metabolicActive || props.leanActive) && props.onHandbook
                  && menuItem('薄肌手册', props.onHandbook),
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
        h('nav', { className: 'dshh-tabbar', role: 'tablist' }, tabs.map((item) =>
          h('button', {
            key: item.code, type: 'button', role: 'tab', className: 'dshh-tabbtn',
            'data-active': String(tab === item.code),
            'aria-selected': String(tab === item.code),
            onClick: () => onTab(item.code),
          }, item.name))),
      )
    }

    // ---------------------------------------------------------------- goal cards

    function goalTargetStatusText(target, goalCode) {
      // Metabolic rows are a statement, not a score: keep the neutral reference
      // language even inside the generic goal card.
      if (goalCode === 'metabolic') {
        if (target.kind === 'observe' || target.status === 'observe') return '参考 · 观察'
        if (target.status === 'normal') return '参考内'
        if (target.status === 'high') return '高于参考'
        if (target.status === 'low') return target.kind === 'weeklyDays' ? '记录中' : '低于参考'
        if (target.status === 'pending') return '待补体重'
        if (target.status === 'trend') return '观察'
        return '暂无数据'
      }
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
                  : goal.code === 'metabolic'
                    ? `已记录 ${coverage.measured ?? 0}/${coverage.evaluable ?? 0}`
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
              goalTargetStatusText(target, goal.code)),
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
            { key: 'deposits', value: `${deposits}/${capacity}`, unit: '笔', label: '本周存入' },
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

    /**
     * Legacy metabolic hero (pre-v4 payload). Kept as the degraded surface for
     * a host that has not returned `season` + `accounts` + `metabolic` yet; it
     * must never render a blank page.
     */
    function LegacyMetabolicHero({ goals, onRecord, onManageGoal }) {
      const activeGoals = (goals ?? []).filter((goal) => goal.status === 'active')
      const metabolicGoal = activeGoals.find((goal) => goal.code === 'metabolic') ?? null
      const goal = metabolicGoal ?? activeGoals[0] ?? null
      if (!goal) return null
      const coverage = goal.coverage ?? {}
      const stats = [
        { key: 'met', value: `${coverage.met ?? 0}/${coverage.evaluable ?? 0}`, label: '已记录' },
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
     * v4 metabolic hero: coverage-driven numbers (deposits / days to review /
     * core coverage), a 12-week progress bar and three account actions. No
     * physique photo, no body-art, no pass/fail framing.
     */
    function MetabolicHero({
      goal, onOpenAccount, onOpenMetabolicWeekly, onOpenVisitSummary, onStartMetabolicCycle,
    }) {
      const season = metabolicSeasonMeta(goal)
      const weekly = metabolicWeekly(goal)
      const accounts = metabolicAccounts(goal)
      const coverage = metabolicCoverage(goal)
      const labs = metabolicLabs(goal)
      const [confirmStart, setConfirmStart] = useState(false)
      const ended = Boolean(season.ended)
      const firstEmpty = accounts.find((account) => !account?.today?.met) ?? accounts[0] ?? null
      const progress = season.hasSeason
        ? Math.max(0, Math.min(100, Math.round(season.progress * 100)))
        : 0
      const stats = season.hasSeason
        ? [
            { key: 'deposits', value: `${weekly.deposits}/${weekly.max}`, unit: '格', label: '本周存入' },
            { key: 'left', value: ended ? '0' : String(season.daysLeft ?? '—'),
              unit: ended ? '天' : '天', label: ended ? '距复查 · 周期已结束' : '距复查' },
            { key: 'core', value: `${coverage.recorded}/${coverage.total}`, unit: '项', label: '核心有数据' },
          ]
        : [
            { key: 'deposits', value: `${weekly.deposits}/${weekly.max}`, unit: '格', label: '本周存入' },
            { key: 'core', value: `${coverage.recorded}/${coverage.total}`, unit: '项', label: '核心有数据' },
            { key: 'last', value: goal?.coverage?.lastRecordAt
              ? fmtTime(goal.coverage.lastRecordAt) : '—', label: '最近记录' },
          ]
      const reviewHint = season.hasSeason && !ended
        && typeof season.daysLeft === 'number' && season.daysLeft <= 7
        ? '复查前 7 天：早晚各 1 次 × 2–3 遍，连续 7 天，弃首日取后 6 天均值。'
        : '周期只提供节奏，不承诺任何指标变化；复查时间与项目以医生安排为准。'

      async function startCycle() {
        setConfirmStart(false)
        await onStartMetabolicCycle?.()
      }

      return h(
        'section',
        { className: 'dshh-hero', 'data-variant': 'metabolic',
          style: { '--cut-accent': CUT_ACCENT, '--cut-hot': CUT_HOT } },
        h('div', { className: 'dshh-hero-scrim' }),
        h('div', { className: 'dshh-hero-top' },
          h('span', { className: 'dshh-hero-badge' }, h('span', null, 'METABOLIC LEDGER')),
          h('span', { className: 'dshh-hero-status' },
            `${goal?.statusName ?? GOAL_STATUS_LABEL[goal?.status] ?? goal?.status ?? '进行中'}`
            + (goal?.domainName ? ` · ${goal.domainName}` : '')),
        ),
        h('h2', { className: 'dshh-hero-title' }, '代谢对账簿'),
        h('div', { className: 'dshh-hero-sub' },
          season.hasSeason
            ? `${season.label || `第 ${season.no} 个复查周期`} · 覆盖度驱动，不看单次`
            : '把测、吃、动、睡存进四个账户，12 周一次复查'),
        h('div', { className: 'dshh-hero-stats' }, stats.map((stat) =>
          h('div', { key: stat.key, className: 'dshh-hero-stat' },
            h('span', { className: 'dshh-hero-num' }, stat.value,
              stat.unit && h('small', null, stat.unit)),
            h('span', { className: 'dshh-hero-label' }, stat.label)))),
        season.hasSeason && h('div', { className: 'dshh-seasonbar' },
          h('div', { className: 'dshh-seasonbar-track' },
            h('div', { className: 'dshh-seasonbar-fill',
              style: { width: `${progress}%` } })),
          h('div', { className: 'dshh-seasonbar-ticks' }, season.checkpoints.map((mark, index) => {
            const week = Number(mark?.week ?? 0)
            const last = week >= season.weeks
            const left = season.weeks > 0
              ? Math.min(100, Math.max(0, (week / season.weeks) * 100))
              : 0
            return h('span', {
              key: `met-cp-${mark?.week ?? index}`,
              className: 'dshh-seasonbar-tick',
              'data-reached': String(Boolean(mark?.reached)),
              'data-last': String(last),
              style: { left: `${left}%` },
            }, mark?.label ?? `W${week}`)
          })),
        ),
        h('div', { className: 'dshh-hero-cta' },
          ended
            ? h('button', {
                key: 'visit', type: 'button',
                className: 'dshh-hero-btn dshh-hero-btn-primary',
                onClick: () => onOpenVisitSummary?.(),
              }, '本周期结束 · 生成就诊摘要')
            : h('button', {
                key: 'deposit', type: 'button',
                className: 'dshh-hero-btn dshh-hero-btn-primary',
                onClick: () => onOpenAccount?.(firstEmpty, todayKey()),
              }, '今日存入'),
          !ended && h('button', {
            key: 'visit', type: 'button',
            className: 'dshh-hero-btn dshh-hero-btn-ghost',
            onClick: () => onOpenVisitSummary?.(),
          }, '就诊摘要'),
          h('button', {
            key: 'ledger', type: 'button',
            className: 'dshh-hero-btn dshh-hero-btn-ghost',
            onClick: () => onOpenMetabolicWeekly?.(),
          }, '对账'),
          ended && !confirmStart && h('button', {
            key: 'restart', type: 'button',
            className: 'dshh-hero-btn dshh-hero-btn-ghost',
            onClick: () => setConfirmStart(true),
          }, '开启新周期'),
        ),
        confirmStart && h('div', { className: 'dshh-met-heroconfirm' },
          h('div', null,
            `确认开启第 ${(season.no ?? 1) + 1} 个复查周期吗？只重置周期计时，`
            + '历史记录、化验与对账单数据都会保留。'),
          h('div', { className: 'dshh-met-inline', style: { justifyContent: 'flex-end', marginTop: 8 } },
            h('button', { type: 'button', className: 'dshh-hero-btn dshh-hero-btn-ghost',
              onClick: () => setConfirmStart(false) }, '再想想'),
            h('button', { type: 'button', className: 'dshh-hero-btn dshh-hero-btn-primary',
              onClick: startCycle }, '确认开启'))),
        h('div', { className: 'dshh-hero-note' }, reviewHint
          + (labs.hasCycleLab ? '' : ' 本周期还没有化验记录。')),
      )
    }

    /** 「代谢 / 薄肌」switch shown only when both goals are active. */
    function HeroSwitch({ value, onChange }) {
      return h('div', { className: 'dshh-hero-switch', role: 'group', 'aria-label': '切换账户' },
        [
          { code: 'metabolic', name: '代谢' },
          { code: 'lean_muscle', name: '薄肌' },
        ].map((item) => h('button', {
          key: item.code, type: 'button', className: 'dshh-hero-switch-btn',
          'data-active': String(value === item.code),
          'aria-pressed': String(value === item.code),
          onClick: () => onChange(item.code),
        }, item.name)))
    }

    /** Dual-goal members: both heroes exist, metabolic is the default view. */
    function DualHero(props) {
      // The switch is controlled by OverviewPane so the hero and the dashboard
      // below it always show the same goal (a switch that only changed the hero
      // would leave a metabolic deposit card under a lean hero).
      const [localKind, setLocalKind] = useState('metabolic')
      const kind = props.dashboardGoal === 'lean_muscle' || props.dashboardGoal === 'metabolic'
        ? props.dashboardGoal
        : localKind
      const leanGoal = leanActiveGoalOf(props.goals)
      const metabolicGoal = metabolicActiveGoalOf(props.goals)
      const change = (next) => {
        setLocalKind(next)
        props.onDashboardGoalChange?.(next)
      }
      return h('div', { className: 'dshh-hero-dual' },
        h(HeroSwitch, { value: kind, onChange: change }),
        kind === 'metabolic'
          ? h(MetabolicHero, { ...props, goal: metabolicGoal })
          : leanGoal && h(LeanHero, { ...props, goal: leanGoal }))
    }

    /**
     * Hero dispatcher:
     * - both goals active -> switchable hero, metabolic by default;
     * - metabolic only     -> v4 ledger hero (or the legacy hero on old payloads);
     * - lean only          -> the existing lean hero, unchanged.
     */
    function CutHero(props) {
      const leanGoal = leanActiveGoalOf(props.goals)
      const metabolicGoal = metabolicActiveGoalOf(props.goals)
      if (leanGoal && metabolicGoal) return h(DualHero, props)
      if (metabolicGoal) {
        if (!metabolicLedgerReady(metabolicGoal)) return h(LegacyMetabolicHero, props)
        return h(MetabolicHero, { ...props, goal: metabolicGoal })
      }
      if (leanGoal) return h(LeanHero, { ...props, goal: leanGoal })
      return h(LegacyMetabolicHero, props)
    }

    /** One-line coach bar: factual, behaviour-only, easily muted. */
    function CoachTone({ mode, line, onMode, onNext, showIntro, onDismissIntro, hidden, intro }) {
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
          h('span', null, intro ?? '硬核模式只针对行动（练 / 大餐 / 睡 / 水 / 照片），不评价你的身体；不适可切温和或关闭。'),
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
              '只给行为计分：大练 / 大餐 / 大睡 / 大水。体成分只观察，不在这里打分。')),
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
    function BodyStatement({ goal, member, catalogs, onMetric, onRecord, latest, series }) {
      const targets = observeTargets(goal)
      const metricDef = (code) => (catalogs?.metrics ?? []).find((item) => item?.code === code) ?? null
      const decimalsOf = (code) => {
        const decimals = metricDef(code)?.decimals
        return typeof decimals === 'number' ? decimals : 1
      }
      const unitOf = (code, fallback) => metricDef(code)?.unit ?? fallback ?? ''
      const displayOf = (value, code) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
        return value.toFixed(decimalsOf(code))
      }
      // A "%" reads better attached; a missing value never gets a dangling unit.
      const signedDeltaOf = (delta, code, unit) => {
        if (typeof delta !== 'number' || !Number.isFinite(delta)) return '—'
        const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
        const digits = decimalsOf(code)
        let text = Math.abs(delta).toFixed(digits)
        if (digits < 2 && text.endsWith('.0')) text = text.slice(0, -2)
        return withMetricUnit(`${sign}${text}`, unit)
      }
      const height = Number(member?.height)
      const hasHeight = Number.isFinite(height) && height >= 80 && height <= 250
      const heightM = hasHeight ? height / 100 : null
      const round1 = (value) => Math.round(value * 10) / 10

      // BMI may be stored explicitly, derived by the host, or only available as
      // the weight trend (older payloads). Prefer the host value and fall back to
      // weight + current height so the row never silently disappears.
      const weightTarget = targets.find((target) => target?.metric === 'weight') ?? null
      const bmiLatest = (latest ?? []).find((item) => item?.code === 'bmi') ?? null
      const bmiSeries = series?.bmi ?? null
      const bmiPoints = bmiSeries?.points ?? []
      const bmiPoint = bmiPoints.slice(-1)[0] ?? null
      const weightLatest = (latest ?? []).find((item) => item?.code === 'weight') ?? null
      const weightValue = weightLatest?.value ?? weightTarget?.current
      const derivedBmi = hasHeight && typeof weightValue === 'number'
        ? round1(weightValue / (heightM ** 2))
        : null
      const bmiValue = typeof bmiLatest?.value === 'number'
        ? bmiLatest.value
        : typeof bmiPoint?.value === 'number'
          ? bmiPoint.value
          : derivedBmi
      const bmiMeasuredAt = bmiLatest?.measuredAt ?? bmiPoint?.at
        ?? weightLatest?.measuredAt ?? weightTarget?.measuredAt ?? null
      const bmiUnit = unitOf('bmi', bmiLatest?.unit || bmiSeries?.unit || 'kg/m²')
      const bmiDisplay = bmiLatest?.display
        ?? (typeof bmiValue === 'number' ? displayOf(bmiValue, 'bmi') : null)

      // BMI follows weight, so its season baseline follows the weight baseline.
      // A single record gives nothing to compare and shows "—".
      const singleMeasurementOf = (row) => row?.singleMeasurement === true
        || (row?.singleMeasurement === undefined
          && Boolean(row?.baseline?.measuredAt && row?.measuredAt
            && row.baseline.measuredAt === row.measuredAt))
      const weightBaseline = weightTarget?.baseline?.value
      const bmiBaselineValue = hasHeight && typeof weightBaseline === 'number'
        ? round1(weightBaseline / (heightM ** 2))
        : null
      const bmiComparable = Boolean(weightTarget?.baseline
        && typeof bmiBaselineValue === 'number'
        && !singleMeasurementOf(weightTarget))
      const bmiDelta = bmiComparable && typeof bmiValue === 'number'
        ? round1(bmiValue - bmiBaselineValue)
        : null

      const bmi = typeof bmiValue === 'number' || bmiLatest || bmiPoint
        ? {
            metric: 'bmi',
            name: 'BMI',
            unit: bmiUnit,
            currentDisplay: bmiDisplay,
            measuredAt: bmiMeasuredAt,
            baseline: typeof bmiBaselineValue === 'number'
              ? { value: bmiBaselineValue, measuredAt: weightTarget?.baseline?.measuredAt ?? null }
              : null,
            deltaSinceBaseline: bmiDelta,
            band: { label: bmiSeries?.band?.label ?? '中国成人 18.5–23.9' },
          }
        : null
      // BMI is derived from member height + weight: show it as an extra observed
      // row when the body-composition targets do not already include it.
      const showBmi = Boolean(bmi) && !targets.some((target) => target?.metric === 'bmi')
      if (targets.length === 0 && !showBmi) return null
      // BMI is derived from weight, so keep it directly under the weight row.
      const rows = targets.slice()
      if (showBmi) {
        const weightIndex = rows.findIndex((row) => row?.metric === 'weight')
        rows.splice(weightIndex >= 0 ? weightIndex + 1 : rows.length, 0, bmi)
      }
      const hasAnyValue = rows.some((row) => row.currentDisplay != null
        || typeof row.baseline?.value === 'number')

      function bandTextOf(row) {
        if (row?.metric === 'weight' && hasHeight && bmiSeries?.band) {
          const low = Number(bmiSeries.band.low)
          const high = Number(bmiSeries.band.high)
          if (Number.isFinite(low) && Number.isFinite(high)) {
            const lowKg = round1(low * heightM ** 2)
            const highKg = round1(high * heightM ** 2)
            return `参考 ${lowKg}–${highKg} kg（身高 ${fmtNumber(height, 1)} cm + BMI ${low}–${high} 推算）`
          }
        }
        const base = row?.band?.label ?? row?.targetDisplay ?? '只观察趋势'
        const unit = row?.unit ?? ''
        if (!base || !unit) return base
        // Only labels that end in a bare bound need the unit; trend labels
        // ("观察趋势") must stay unit-free.
        if (row?.metric !== 'waist' && row?.metric !== 'bmi') return base
        if (unit === '%' || base.includes(unit)) return base
        return `${base} ${unit}`
      }

      function rowOf(row) {
        const unit = row.unit || ''
        const baseline = row.baseline?.value
        const single = row.metric === 'bmi'
          ? !bmiComparable
          : singleMeasurementOf(row)
        const deltaText = single
          ? '—'
          : row.metric === 'bmi'
            ? signedDeltaOf(row.deltaSinceBaseline, 'bmi', unit)
            : observeDeltaText(row)
        const latestHint = row.measuredAt ? `最新 ${fmtTime(row.measuredAt)}` : '暂无最新值'
        const baselineHint = typeof baseline === 'number'
          ? `${row.metric === 'bmi' ? '由基线体重换算 · ' : ''}${single ? '首次记录 · ' : ''}赛季基线 ${fmtTime(row.baseline?.measuredAt)}`
          : '暂无赛季基线'
        return h('button', {
          key: row.metric,
          type: 'button',
          className: 'dshh-observe-row',
          title: row.metric === 'bmi' ? 'BMI 由当前身高与体重计算，只观察' : undefined,
          onClick: () => onMetric?.(row.metric),
        },
          h('span', { className: 'dshh-observe-name' },
            row.name,
            h('span', { className: 'dshh-observe-tag' }, '只观察')),
          h('span', { className: 'dshh-observe-value' },
            withMetricUnit(row.currentDisplay, unit),
            h('small', null, latestHint)),
          h('span', { className: 'dshh-observe-value' },
            typeof baseline === 'number' ? withMetricUnit(displayOf(baseline, row.metric), unit) : '—',
            h('small', null, baselineHint)),
          h('span', { className: 'dshh-observe-deltacell' },
            h('small', { className: 'dshh-observe-deltaname' }, '较基线'),
            h('span', {
              className: 'dshh-observe-delta',
              title: single ? '本赛季暂无可比基线' : undefined,
            }, deltaText),
            h('small', { className: 'dshh-observe-band', style: { display: 'block' } },
              bandTextOf(row))),
        )
      }

      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('div', null,
            h('span', { className: 'dshh-cardtitle' }, '体成分对账单'),
            h('div', { className: 'dshh-muted dshh-small' },
              '只显示最新值、赛季基线与变化；不计分、不排序、不评分。')),
          onRecord && h('div', { className: 'dshh-observe-actions' },
            h('button', {
              type: 'button',
              className: 'dshh-btn',
              onClick: () => onRecord('body'),
            }, '＋ 记录体成分'))),
        h('div', { className: 'dshh-observe-head' },
          h('span', null, '指标'),
          h('span', null, '最新'),
          h('span', null, '赛季基线'),
          h('span', null, '较基线 / 参考区间')),
        !hasAnyValue && h('div', { className: 'dshh-muted dshh-small', style: { margin: '2px 0 4px' } },
          '还没有体成分记录。点右上角「＋ 记录体成分」记下体重、体脂率、骨骼肌量或腰围。'),
        h('div', { className: 'dshh-observe-list' }, rows.map(rowOf)),
        h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 10 } },
          '参考区间来自健身 / 中国成人公开参考，非医学标准；建议固定设备与时间比较。点击一行查看该指标全部记录。'),
        h('div', { className: 'dshh-muted dshh-small' },
          '「较基线」需要赛季内至少 2 次记录，只有 1 次时显示 —。'
          + (showBmi ? ' BMI 由当前身高与体重计算，只观察、不评分。' : '')),
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
            h('li', null, '大练 / 大餐 / 大睡 / 大水四个账户，每天每个账户最多存 1 笔；补存也算。'),
            h('li', null, '1 笔 = 一个行为账户当天存入 1 次；4 个账户 × 7 天 = 每周最多 28 笔。'),
            h('li', null, '体脂、体重、骨骼肌、腰围不计分、不排名、不做效果承诺。'),
            h('li', null, '赛季结束可开启新赛季；历史记录和照片保留。'))),
      )
    }

    // ------------------------------------------------------------------ metabolic ledger UI

    /** Today's four behaviour deposits plus the cycle's one lab event. */
    function MetabolicDepositCard({ goal, onOpenAccount, onOpenLab }) {
      const accounts = metabolicAccounts(goal)
      const labs = metabolicLabs(goal)
      const done = accounts.filter((account) => account?.today?.met).length
      const labDone = labs.hasCycleLab
      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('div', null,
            h('span', { className: 'dshh-cardtitle' }, '今日存入'),
            h('div', { className: 'dshh-muted dshh-small' },
              '测 / 吃 / 动 / 睡只记行为；「查」是周期事件，不计入 28 格。')),
          h('span', { className: 'dshh-muted dshh-small',
            style: { fontVariantNumeric: 'tabular-nums' } },
            `已存入 ${done}/${accounts.length} 笔`)),
        h('div', { className: 'dshh-accountgrid dshh-met-accountgrid' },
          accounts.map((account) => {
            const today = account?.today ?? null
            const met = Boolean(today?.met)
            const hasRecord = Boolean(today?.hasRecord)
            const valueText = today?.display != null
              ? String(today.display)
              : (hasRecord ? '已记录' : '未存入')
            return h('button', {
              key: account.code ?? account.metric,
              type: 'button',
              className: 'dshh-account',
              'data-met': String(met),
              'data-record': String(hasRecord),
              onClick: () => onOpenAccount?.(account, todayKey()),
            },
              h('span', { className: 'dshh-account-top' },
                h('span', { className: 'dshh-account-name' }, account.name ?? account.metric),
                account.role && h('span', { className: 'dshh-account-role' }, account.role)),
              h('span', { className: 'dshh-account-target' }, account.targetDisplay ?? ''),
              h('span', { className: 'dshh-account-value' }, valueText),
              h('span', { className: 'dshh-account-state' },
                h('span', { className: 'dshh-account-dot', 'aria-hidden': true }),
                met ? '已存入' : hasRecord ? '未达下限' : '未存入'))
          }),
          h('button', {
            type: 'button',
            className: 'dshh-account dshh-met-labtile',
            'data-met': String(labDone),
            'data-record': String(labDone),
            onClick: () => onOpenLab?.(),
          },
            h('span', { className: 'dshh-account-top' },
              h('span', { className: 'dshh-account-name' }, '查'),
              h('span', { className: 'dshh-account-role' }, '化验')),
            h('span', { className: 'dshh-account-target' }, '本周期化验'),
            h('span', { className: 'dshh-account-value' },
              labDone ? `已录 ${labs.cycleCount || 1} 次` : '待录入'),
            h('span', { className: 'dshh-account-state' },
              h('span', { className: 'dshh-account-dot', 'aria-hidden': true }),
              labDone ? '已存入' : '待录入'))),
      )
    }

    /** Rolling 7-day ledger (7 columns x 4 account rows), click to backfill. */
    function MetabolicLedger({ goal, onOpenAccount, onOpenMetabolicWeekly }) {
      const accounts = metabolicAccounts(goal)
      const weekly = metabolicWeekly(goal)
      const columns = leanWeekColumns(accounts)
      const range = weekly.start && weekly.end
        ? `近 7 天（${fmtDay(weekly.start)} – ${fmtDay(weekly.end)}）`
        : '近 7 天'
      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('span', { className: 'dshh-cardtitle' }, '本周对账单'),
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-sm',
            onClick: onOpenMetabolicWeekly }, '查看周报')),
        h('div', { className: 'dshh-ledger-summary' },
          `${range} · 已存入 ${weekly.deposits}/${weekly.max} 格 · 断更不惩罚，补录即可`),
        h('div', { className: 'dshh-ledger-scroll' },
          h('div', { className: 'dshh-ledger' },
            h('div', { className: 'dshh-ledger-head' },
              h('span', { className: 'dshh-ledger-colhead' }, ''),
              columns.map((day) => h('span', {
                key: `met-col-${day.date}`,
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
                    : state === 'record' ? '未达下限' : '无记录'
                  return h('button', {
                    key: `met-cell-${account.code ?? account.metric}-${day.date}`,
                    type: 'button',
                    className: 'dshh-ledger-cell',
                    'data-state': state,
                    title: `${account.name ?? ''} ${day.date} ${stateText}`,
                    'aria-label': `${account.name ?? ''} ${day.date} ${stateText}`,
                    onClick: () => onOpenAccount?.(account, day.date),
                  })
                }))
            }),
          )),
        h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 10 } },
          '实心 = 已存入 · 空心 = 有记录未达下限 · 更浅 = 无记录；点击格子可补录当天。'),
      )
    }

    /** One neutral statement row; statuses never use pass/fail colours. */
    function metabolicRowNode(row, onMetric, keyPrefix) {
      // Some host displays already embed the unit (e.g. 体重 / BMI).
      const unit = row.unit && row.valueText != null && !String(row.valueText).includes(row.unit)
        ? (row.unit === '%' ? '%' : ` ${row.unit}`) : ''
      const metaBits = []
      if (row.code === 'bp') {
        if (row.days7 != null || row.count7 != null) {
          metaBits.push(`近 7 天 · ${row.days7 ?? '—'} 天 ${row.count7 ?? '—'} 次`)
        }
        if (row.morningAvg != null || row.eveningAvg != null) {
          metaBits.push(`晨 ${row.morningAvg ?? '—'} · 晚 ${row.eveningAvg ?? '—'}`)
        }
        if (row.droppedFirstDay) metaBits.push('已弃首日')
      }
      if (row.code === 'fpg' && row.avg30 != null) {
        metaBits.push(`近 30 天均值 ${row.avg30}`)
      }
      if (row.single && row.valueLabel !== '单次 · 仅参考') {
        metaBits.push('单次 · 仅参考')
      }
      return h('button', {
        key: `${keyPrefix}-${row.code}`,
        type: 'button',
        className: 'dshh-met-row',
        'data-status': row.status,
        title: row.note || undefined,
        onClick: () => onMetric?.(row.clickCode ?? row.code),
      },
        h('span', { className: 'dshh-met-row-name' },
          row.name,
          row.role === 'core' && h('span', { className: 'dshh-met-pill' }, '核心')),
        h('span', { className: 'dshh-met-row-value' },
          row.valueText == null ? '暂无数据' : `${row.valueText}${unit}`,
          row.valueText != null && h('small', null,
            `${row.valueLabel}${row.measuredAt ? ` · ${fmtTime(row.measuredAt)}` : ''}`)),
        h('span', { className: 'dshh-met-row-band' },
          row.bandLabel,
          row.note && h('small', null, row.note)),
        h('span', { className: 'dshh-met-row-side' },
          h('span', { className: 'dshh-met-status', 'data-status': row.status },
            row.statusText),
          row.delta && h('span', null,
            [row.delta.label, row.delta.text].filter(Boolean).join(' '))),
        metaBits.length > 0 && h('span', { className: 'dshh-met-rowmeta' },
          metaBits.join(' · ')),
      )
    }

    /** Indicator statement: core five + collapsible extras, observed only. */
    function MetabolicStatement({ goal, onMetric }) {
      const model = metabolicStatementModel(goal)
      const coverage = metabolicCoverage(goal)
      const sugary = metabolicSugary(goal)
      const labs = metabolicLabs(goal)
      const [openExtras, setOpenExtras] = useState(false)
      const extraCount = model.extra.length + (sugary ? 1 : 0)
      const sugaryCount = sugary?.weekCount ?? 0
      const sugaryHasData = Boolean(sugary) && sugaryCount > 0
      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('div', null,
            h('span', { className: 'dshh-cardtitle' }, '指标对账单'),
            h('div', { className: 'dshh-muted dshh-small' },
              '只展示参考区间、均值与变化；不计分、不排名、不下诊断结论。')),
          h('span', { className: 'dshh-met-coverage' },
            `核心有数据 ${coverage.recorded}/${coverage.total} 项`)),
        h('div', { className: 'dshh-met-rows' },
          model.core.map((row) => metabolicRowNode(row, onMetric, 'met-core'))),
        h('button', {
          type: 'button',
          className: 'dshh-btn dshh-btn-sm dshh-met-more',
          'aria-expanded': String(openExtras),
          onClick: () => setOpenExtras((value) => !value),
        }, openExtras ? '收起附加项' : `附加项（${extraCount} 项）`),
        openExtras && h('div', { className: 'dshh-met-extra' },
          model.extra.map((row) => metabolicRowNode(row, onMetric, 'met-extra')),
          sugary && h('button', {
            key: 'met-sugary',
            type: 'button',
            className: 'dshh-met-row',
            'data-status': 'unknown',
            onClick: () => onMetric?.('sugary'),
          },
            h('span', { className: 'dshh-met-row-name' }, '含糖饮料'),
            h('span', { className: 'dshh-met-row-value' },
              sugaryHasData ? `近 7 天 ${sugary.weekMl ?? 0} ml` : '暂无数据',
              sugaryHasData && h('small', null,
                `近 7 天 ${sugaryCount} 次 · ${sugary.days7 ?? 0} 天`)),
            h('span', { className: 'dshh-met-row-band' }, sugary.note),
            h('span', { className: 'dshh-met-row-side' },
              h('span', { className: 'dshh-met-status', 'data-status': 'unknown' }, '只记录')))),
        h('div', { className: 'dshh-met-statement-note' },
          `${model.note} `
          + '设备差异会影响读数，建议固定设备、固定时间比较；单次偏高或偏低时可以复测，并咨询医生。'
          + (labs.hasCycleLab ? '' : ' 本周期还没有化验记录，可从「查」录入一次化验单。')),
      )
    }

    /** Review cycle card: progress, checkpoints, visit summary, new cycle. */
    function MetabolicCycleCard({ goal, onOpenVisitSummary, onOpenMetabolicWeekly, onStartMetabolicCycle }) {
      const season = metabolicSeasonMeta(goal)
      const [confirm, setConfirm] = useState(false)
      const checkpointText = season.checkpoints
        .map((mark) => mark?.label ?? `W${mark?.week ?? ''}`).join(' / ')
      const progress = Math.max(0, Math.min(100, Math.round(season.progress * 100)))

      async function start() {
        setConfirm(false)
        await onStartMetabolicCycle?.()
      }

      return h('section', { className: 'dshh-card dshh-seasoncard' },
        h('div', { className: 'dshh-cardhead', style: { marginBottom: 2 } },
          h('div', null,
            h('span', { className: 'dshh-cardtitle' }, '复查周期'),
            h('div', { className: 'dshh-muted dshh-small' },
              season.hasSeason
                ? `${season.label || `第 ${season.no} 个复查周期`}`
                  + (season.endsAt ? ` · 截止 ${season.endsAt}` : '')
                : '服务端暂未返回复查周期；记录、周对账与就诊摘要不受影响。'))),
        h('div', { className: 'dshh-seasonstat' },
          `检查点 ${checkpointText} · 周期进度 ${fmtPercent(season.progress)} · `
          + (season.ended ? '周期已结束' : `剩余 ${season.daysLeft ?? '—'} 天`)),
        h('div', { className: 'dshh-checkpoints' }, season.checkpoints.map((mark, index) =>
          h('span', {
            key: `met-checkpoint-${mark?.week ?? index}`,
            className: 'dshh-checkpoint',
            'data-reached': String(Boolean(mark?.reached)),
          }, `${mark?.label ?? `W${mark?.week ?? ''}`}${mark?.reached ? ' ✓' : ''}`))),
        season.hasSeason && h('div', { className: 'dshh-seasonprogress' },
          h('div', { className: 'dshh-seasonprogress-fill', style: { width: `${progress}%` } }),
          h('span', { className: 'dshh-seasonprogress-label' }, `${progress}%`)),
        h('div', { className: 'dshh-met-hint' },
          '复查前 7 天：早晚各 1 次 × 2–3 遍；静坐 5 分钟后测，连续 7 天，弃首日取后 6 天均值；不删高值。'),
        h('div', { className: 'dshh-quickfoot' },
          h('button', {
            type: 'button',
            className: season.ended ? 'dshh-btn dshh-btn-primary' : 'dshh-btn',
            onClick: onOpenVisitSummary,
          }, '生成就诊摘要'),
          h('button', { type: 'button', className: 'dshh-btn',
            onClick: onOpenMetabolicWeekly }, '查看周报'),
          season.ended && !confirm && h('button', {
            type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: () => setConfirm(true),
          }, '开启新周期')),
        confirm && h('div', { className: 'dshh-note', style: { marginTop: 10 } },
          h('div', null,
            `确认开启第 ${(season.no ?? 1) + 1} 个复查周期吗？只重置周期计时，`
            + '历史记录、化验与对账单数据都会保留。'),
          h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 } },
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: () => setConfirm(false) }, '再想想'),
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: start }, '确认开启'))),
        h('div', { className: 'dshh-muted dshh-small' },
          '周期只提供节奏，不承诺任何指标变化；复查时间与项目以医生安排为准。'),
      )
    }

    /** 复查 Tab: cycle overview, account totals, behaviour stats, statement. */
    function MetabolicPane({
      goal, onOpenVisitSummary, onOpenMetabolicWeekly, onOpenHandbook,
      onStartMetabolicCycle,
    }) {
      const [confirmStart, setConfirmStart] = useState(false)
      if (!goal) {
        return h('div', { className: 'dshh-seasonpane' },
          h('section', { className: 'dshh-card dshh-season-empty' },
            h('div', { className: 'dshh-cardtitle' }, '还没有代谢复查周期'),
            h('div', { className: 'dshh-muted dshh-small' },
              '先在「目标」里激活代谢管理。复查周期只提供 12 周节奏，'
              + '不承诺指标变化，也不代表诊断；是否管理由你自己决定。'),
          ))
      }
      const season = metabolicSeasonMeta(goal)
      const review = metabolicReview(goal)
      const weekly = metabolicWeekly(goal)
      const accounts = metabolicAccounts(goal)
      const coverage = metabolicCoverage(goal)
      const labs = metabolicLabs(goal)
      const progress = Math.max(0, Math.min(100, Math.round(season.progress * 100)))
      const statText = (value, unit) => (value == null ? '—' : `${value}${unit ?? ''}`)
      return h('div', { className: 'dshh-seasonpane' },
        h('section', { className: 'dshh-seasonhero' },
          h('div', { className: 'dshh-seasonhero-top' },
            h('span', { className: 'dshh-season-kicker' },
              `REVIEW ${String(season.no ?? 1).padStart(2, '0')}`),
            h('span', { className: 'dshh-season-status' },
              `${season.ended ? '已结束' : '进行中'} · 第 `
              + `${Math.max(1, Math.min(season.week || 1, season.weeks))} / ${season.weeks} 周`)),
          h('h2', { className: 'dshh-seasonhero-title' }, '把 12 周存成一次复查'),
          h('p', { className: 'dshh-seasonhero-sub' },
            '不比单次读数；只看有没有把测、吃、动、睡存进去。复诊时把记录带走一页纸。'),
          h('div', { className: 'dshh-seasonhero-stats' },
            h('div', { className: 'dshh-seasonhero-stat' },
              h('b', null, `${weekly.deposits}/${weekly.max}`),
              h('span', null, '本周存入 · 格')),
            h('div', { className: 'dshh-seasonhero-stat' },
              h('b', null, review.max ? `${review.deposits}/${review.max}` : String(review.deposits)),
              h('span', null, '周期累计 · 格')),
            h('div', { className: 'dshh-seasonhero-stat' },
              h('b', null, `${coverage.recorded}/${coverage.total}`),
              h('span', null, '核心有数据 · 项')),
            h('div', { className: 'dshh-seasonhero-stat' },
              h('b', null, statText(review.recordDays, ' 天')),
              h('span', null, '记录天数'))),
          season.hasSeason && h('div', { className: 'dshh-seasonprogress' },
            h('div', { className: 'dshh-seasonprogress-fill', style: { width: `${progress}%` } }),
            h('span', { className: 'dshh-seasonprogress-label' }, `${progress}%`)),
          h('div', { className: 'dshh-seasontimeline' }, season.checkpoints.map((mark, index) => {
            const reached = Boolean(mark?.reached)
            const weeksAway = Math.max(0, (mark?.week ?? 0) - (season.week || 0))
            return h('div', {
              key: `met-mark-${mark?.week ?? index}`,
              className: 'dshh-seasontimeline-step',
              'data-reached': String(reached),
            },
              h('span', { className: 'dshh-seasontimeline-dot' }, reached ? '✓' : '·'),
              h('b', null, mark?.label ?? `W${mark?.week ?? ''}`),
              h('small', null, reached ? '已到达' : weeksAway > 0 ? `${weeksAway} 周后` : '本周'))
          })),
          h('div', { className: 'dshh-seasonhero-actions' },
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: onOpenVisitSummary }, '生成就诊摘要'),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: onOpenMetabolicWeekly }, '查看周报'),
            h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
              onClick: onOpenHandbook }, '代谢手册'),
            season.ended && !confirmStart && h('button', {
              type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: () => setConfirmStart(true),
            }, '开启新周期')),
          confirmStart && h('div', { className: 'dshh-note', style: { marginTop: 12 } },
            h('div', null,
              `确认开启第 ${(season.no ?? 1) + 1} 个复查周期吗？只重置周期计时，`
              + '历史记录、化验与对账单数据都会保留。'),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 } },
              h('button', { type: 'button', className: 'dshh-btn',
                onClick: () => setConfirmStart(false) }, '再想想'),
              h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
                onClick: async () => { setConfirmStart(false); await onStartMetabolicCycle?.() } },
                '确认开启')))),
        h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '本周期对账'),
              h('div', { className: 'dshh-muted dshh-small' },
                '四账户累计存入，只记行为；指标不在这里计分。'))),
          h('div', null, (review.byAccount ?? []).map((item, index) =>
            h('div', { key: item?.code ?? `met-account-${index}`, className: 'dshh-review-line' },
              h('span', null, item?.name ?? '账户'),
              h('span', null,
                (item?.label ? `${item.label} · ` : '')
                + `${item?.deposits ?? 0}${item?.max ? `/${item.max}` : ''} 天`
                + (item?.rate != null ? ` · ${fmtPercent(item.rate)}` : ''))))),
          h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 8 } },
            `化验：${labs.hasCycleLab ? `本周期已录 ${labs.cycleCount || 1} 次` : '本周期待录入'}`
            + (labs.latestAt ? ` · 最近 ${localDateOf(labs.latestAt)}` : ''))),
        h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '行为统计'),
              h('div', { className: 'dshh-muted dshh-small' },
                '本周期记录事实，只做描述性统计。'))),
          h('div', { className: 'dshh-review-grid' },
            h(ReviewStat, { label: '记录天数', value: statText(review.recordDays, ' 天') }),
            h(ReviewStat, { label: '血压天数', value: statText(review.bpDays, ' 天') }),
            h(ReviewStat, { label: '饮食天数', value: statText(review.mealDays, ' 天') }),
            h(ReviewStat, { label: '活动分钟', value: statText(review.activityMinutes, ' min') }),
            h(ReviewStat, { label: '睡眠均值', value: statText(review.sleepAvg, ' h') }),
            h(ReviewStat, { label: '饮水均值', value: statText(review.waterAvg, ' ml') }),
            h(ReviewStat, { label: '甜饮总量', value: statText(review.sugaryMl, ' ml') }),
            h(ReviewStat, { label: '化验次数', value: statText(review.labCount, ' 次') }))),
        h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '核心指标基线 → 最新'),
              h('div', { className: 'dshh-muted dshh-small' },
                '只陈述数值与变化，不做好转 / 恶化评价。'))),
          (review.statement ?? []).length === 0
            ? h('div', { className: 'dshh-muted dshh-small' },
                '本周期还没有可对照的核心指标记录；先把家庭监测存进去。')
            : h('div', null, review.statement.map((row, index) => {
                const unit = row?.unit === '%' ? '%' : row?.unit ? ` ${row.unit}` : ''
                const base = row?.baseline == null ? '暂无基线' : `${row.baseline}${unit}`
                const latestValue = row?.latestDisplay ?? row?.latest ?? row?.currentDisplay
                const latest = latestValue == null ? '暂无最新' : `${latestValue}${unit}`
                const delta = row?.deltaDisplay
                  ?? (typeof row?.delta === 'number' ? signedValue(row.delta, row.unit) : '—')
                return h('div', { key: row?.code ?? `met-statement-${index}`,
                  className: 'dshh-review-line' },
                  h('span', null, `${row?.name ?? '指标'}：${base} → ${latest}`),
                  h('span', null, `${delta} · 只陈述`))
              })),
          h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 8 } },
            '血压基线取周期内第一次读数，最新取近 7 天均值，两次口径不同；'
            + '指标变化受设备、饮食、水分、作息等影响，不构成效果承诺。')),
        h('div', { className: 'dshh-muted dshh-small' }, METABOLIC_DISCLAIMER),
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
              h('li', null, '大练 / 大餐 / 大睡 / 大水 本周存入笔数'),
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
        : metric === 'activity' ? [20, 30, 45]
          : metric === 'water' ? [500, 1000]
            : metric === 'sugary' ? [330, 500]
              : metric === 'sleep' ? [7, 8]
                : []
      const hint = metric === 'training'
        ? '只记录力量训练时长；近 7 天训练天数由记录自动统计。'
        : metric === 'activity'
          ? '中等强度活动（如快走、骑车），只记录，不构成运动处方；同一天多条求和。'
          : metric === 'sugary'
            ? '含糖饮料（如奶茶、可乐），只记录，不评价；同一天多条求和。'
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
              ? ` · 存入下限 ${accountInfo.depositLine}` : '')),
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
          metric === 'activity' || metric === 'sugary'
            ? '同一天多条记录会求和；只记录行为，不评价身体或食物，也不构成运动、饮食或补剂处方。'
            : '训练 / 大餐 / 水同日多条会求和，睡眠取最大值；本工具只记录行为，不提供动作、食谱或补剂建议。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
      )
    }

    /** One home-monitoring record: any of pressure / glucose / waist / weight. */
    function FamilyMonitorModal({ member, date: initialDate, run, onClose, onToast }) {
      const FIELDS = [
        { code: 'sbp', name: '收缩压', unit: 'mmHg', placeholder: '如 128' },
        { code: 'dbp', name: '舒张压', unit: 'mmHg', placeholder: '如 78' },
        { code: 'hr', name: '心率', unit: '次/分', placeholder: '如 72' },
        { code: 'fpg', name: '空腹血糖', unit: 'mmol/L', placeholder: '如 5.6' },
        { code: 'ppg', name: '餐后2小时血糖', unit: 'mmol/L', placeholder: '如 7.2' },
        { code: 'waist', name: '腰围', unit: 'cm', placeholder: '如 88' },
        { code: 'weight', name: '体重', unit: 'kg', placeholder: '如 68.5' },
      ]
      const [time, setTime] = useState(() => {
        const raw = String(initialDate ?? '')
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T07:30` : toLocalInput()
      })
      const [context, setContext] = useState(() => {
        const guessed = inferContext(time)
        return METABOLIC_CONTEXTS.some((item) => item.code === guessed) ? guessed : 'random'
      })
      const [vals, setVals] = useState({})
      const [error, setError] = useState(null)
      const [saving, setSaving] = useState(false)

      async function save() {
        setError(null)
        if (!member) { setError('请先选择一位家庭成员'); return }
        const measuredAt = toApiTime(time)
        if (!measuredAt) { setError('请选择日期与时间'); return }
        const values = {}
        for (const field of FIELDS) {
          const raw = vals[field.code]
          if (raw === '' || raw == null) continue
          const value = Number(raw)
          if (!Number.isFinite(value) || value <= 0) {
            setError(`「${field.name}」请填写大于 0 的数字`)
            return
          }
          values[field.code] = value
        }
        if (Object.keys(values).length === 0) {
          setError('请至少填写一项（任填一项即可保存）')
          return
        }
        setSaving(true)
        let result
        try {
          result = await run('record', {
            member: member.name,
            measuredAt,
            context,
            values,
            source: 'form',
          })
        } finally {
          setSaving(false)
        }
        if (!result?.ok) { setError(result?.error ?? '保存失败'); return }
        onToast?.(`已存入：${member.name} · 家庭监测 ${Object.keys(values).length} 项`)
        onClose()
      }

      const footer = h('div', { className: 'dshh-modal-actions' },
        h('span', { className: 'dshh-muted dshh-small', style: { marginRight: 'auto' } },
          '任一指标即可保存'),
        h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
        h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
          onClick: save, disabled: saving }, saving ? '保存中…' : '存入家庭监测'))

      return h(ModalFrame, { title: `家庭监测 · ${member?.name ?? ''}`, onClose, footer, wide: true },
        h('div', { className: 'dshh-field-row' },
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '日期时间'),
            h('input', { className: 'dshh-input', type: 'datetime-local', value: time,
              'aria-label': '测量时间', onChange: (e) => setTime(e.target.value) })),
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '情境'),
            h('select', { className: 'dshh-select', value: context,
              'aria-label': '测量情境', onChange: (e) => setContext(e.target.value) },
              METABOLIC_CONTEXTS.map((item) =>
                h('option', { key: item.code, value: item.code }, item.name))))),
        h('div', { className: 'dshh-met-fieldgrid' }, FIELDS.map((field) =>
          h('div', { key: field.code, className: 'dshh-met-fieldcell' },
            h('span', { className: 'dshh-field-label' }, field.name),
            h('div', { className: 'dshh-qwrap' },
              h('input', {
                className: 'dshh-input',
                type: 'text',
                inputMode: 'decimal',
                autoComplete: 'off',
                placeholder: field.placeholder,
                'aria-label': field.name,
                value: vals[field.code] ?? '',
                onChange: (e) => setVals({ ...vals, [field.code]: e.target.value }),
              }),
              h('span', { className: 'dshh-unit' }, field.unit))))),
        h('div', { className: 'dshh-modal-note' },
          '测量要点：静坐 5 分钟后测；坐位，上臂与心脏同高，袖带下缘距肘窝 2–3 cm；'
          + '每次测 2–3 遍、间隔 1–2 分钟；早晚各 1 次；复查前连续 7 天，弃首日取后 6 天均值；不删高值。'),
        h('div', { className: 'dshh-modal-note' },
          '单次读数只做参考，这里不做正常 / 异常判断，也不弹提醒；'
          + '同一天多条记录会分别保存在时间线上。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
      )
    }

    /** One lab report -> one `context=lab` record with any of its values. */
    function LabEntryModal({ member, run, onClose, onToast }) {
      const FIELDS = [
        { code: 'fpg', name: '空腹血糖', unit: 'mmol/L', placeholder: '如 5.6' },
        { code: 'ppg', name: '餐后2小时血糖', unit: 'mmol/L', placeholder: '如 7.2' },
        { code: 'hba1c', name: '糖化血红蛋白', unit: '%', placeholder: '如 5.8' },
        { code: 'tc', name: '总胆固醇', unit: 'mmol/L', placeholder: '如 4.8' },
        { code: 'tg', name: '甘油三酯', unit: 'mmol/L', placeholder: '如 1.5' },
        { code: 'ldl', name: '低密度脂蛋白胆固醇', unit: 'mmol/L', placeholder: '如 2.9' },
        { code: 'hdl', name: '高密度脂蛋白胆固醇', unit: 'mmol/L', placeholder: '如 1.2' },
        { code: 'ua', name: '尿酸', unit: 'μmol/L', placeholder: '如 380' },
      ]
      const [date, setDate] = useState(() => todayKey())
      const [vals, setVals] = useState({})
      const [error, setError] = useState(null)
      const [saving, setSaving] = useState(false)

      async function save() {
        setError(null)
        if (!member) { setError('请先选择一位家庭成员'); return }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('请选择化验日期'); return }
        const values = {}
        for (const field of FIELDS) {
          const raw = vals[field.code]
          if (raw === '' || raw == null) continue
          const value = Number(raw)
          if (!Number.isFinite(value) || value <= 0) {
            setError(`「${field.name}」请填写报告上的数值（大于 0）`)
            return
          }
          values[field.code] = value
        }
        if (Object.keys(values).length === 0) {
          setError('请至少填写一项（任填一项即可保存）')
          return
        }
        setSaving(true)
        let result
        try {
          result = await run('record', {
            member: member.name,
            measuredAt: date,
            context: 'lab',
            values,
            source: 'form',
            note: '化验单录入',
          })
        } finally {
          setSaving(false)
        }
        if (!result?.ok) { setError(result?.error ?? '保存失败'); return }
        onToast?.(`已录入化验：${member.name} · ${Object.keys(values).length} 项`)
        onClose()
      }

      const footer = h('div', { className: 'dshh-modal-actions' },
        h('span', { className: 'dshh-muted dshh-small', style: { marginRight: 'auto' } },
          '同日多项合并为一条记录'),
        h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
        h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
          onClick: save, disabled: saving }, saving ? '保存中…' : '保存化验'))

      return h(ModalFrame, { title: `化验单录入 · ${member?.name ?? ''}`, onClose, footer, wide: true },
        h('div', { className: 'dshh-field', style: { maxWidth: 240 } },
          h('label', { className: 'dshh-field-label' }, '化验日期'),
          h('input', { className: 'dshh-input', type: 'date', value: date, max: todayKey(),
            'aria-label': '化验日期', onChange: (e) => setDate(e.target.value) })),
        h('div', { className: 'dshh-met-fieldgrid' }, FIELDS.map((field) =>
          h('div', { key: field.code, className: 'dshh-met-fieldcell' },
            h('span', { className: 'dshh-field-label' }, field.name),
            h('div', { className: 'dshh-qwrap' },
              h('input', {
                className: 'dshh-input',
                type: 'text',
                inputMode: 'decimal',
                autoComplete: 'off',
                placeholder: field.placeholder,
                'aria-label': field.name,
                value: vals[field.code] ?? '',
                onChange: (e) => setVals({ ...vals, [field.code]: e.target.value }),
              }),
              h('span', { className: 'dshh-unit' }, field.unit))))),
        h('div', { className: 'dshh-modal-note' },
          '只录入报告上的数值；参考区间由产品展示，不在这里解读报告。'
          + '建议同时把报告图片归档到「档案 → 检验报告」，方便复诊时核对。'),
        h('div', { className: 'dshh-modal-note' },
          '一次保存为一条「检验」记录，不计入每周 28 格；是否复查、查哪些项目以医生安排为准。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
      )
    }

    /** Visit summary: sections + fixed questions + local additions + copy. */
    function VisitSummaryModal({ member, goal, onClose, onToast }) {
      const model = metabolicVisitModel(goal)
      const [extra, setExtra] = useState(() => readVisitQuestions(member?.id))
      const [draft, setDraft] = useState('')
      const text = metabolicVisitText(model, extra)

      function addQuestion() {
        const value = String(draft ?? '').trim()
        if (!value) return
        const next = [...extra, value]
        setExtra(next)
        writeVisitQuestions(member?.id, next)
        setDraft('')
      }

      function removeQuestion(index) {
        const next = extra.filter((_, itemIndex) => itemIndex !== index)
        setExtra(next)
        writeVisitQuestions(member?.id, next)
      }

      async function copy() {
        const ok = await leanCopyText(text)
        onToast?.(ok ? '就诊摘要已复制为纯文本' : '复制失败，可手动选择文本')
      }

      return h(ModalFrame, { title: model.title, onClose, wide: true },
        (model.generatedAt || model.period) && h('div', { className: 'dshh-muted dshh-small' },
          [model.generatedAt ? `生成于 ${model.generatedAt}` : null, model.period]
            .filter(Boolean).join(' · ')),
        (model.sections ?? []).length === 0
          ? h('div', { className: 'dshh-empty', style: { padding: '16px' } },
              '本周期还没有可汇总的记录。')
          : h('div', null, model.sections.map((section, index) =>
              h('div', { key: section.id ?? `visit-section-${index}`,
                className: 'dshh-met-visit-section' },
                h('div', { className: 'dshh-met-visit-title' }, section.title),
                h('ul', { className: 'dshh-met-visit-lines' },
                  section.lines.map((line, lineIndex) =>
                    h('li', { key: `visit-line-${index}-${lineIndex}` }, line)))))),
        h('div', { className: 'dshh-met-visit-section' },
          h('div', { className: 'dshh-met-visit-title' }, '想问医生'),
          h('div', { className: 'dshh-met-qlist' }, (model.questions ?? []).map((question, index) =>
            h('div', { key: `visit-q-${index}`, className: 'dshh-met-qrow' },
              `${index + 1}. ${question}`))),
          extra.length > 0 && h('div', { className: 'dshh-met-qlist' },
            extra.map((question, index) =>
              h('div', { key: `visit-extra-${index}`, className: 'dshh-met-qrow' },
                h('span', null, `补充 ${index + 1}. ${question}`),
                h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
                  onClick: () => removeQuestion(index) }, '移除')))),
          h('div', { className: 'dshh-met-inline' },
            h('input', {
              className: 'dshh-input',
              style: { flex: 1, minWidth: 180 },
              placeholder: '补充一个想问医生的问题',
              value: draft,
              onChange: (e) => setDraft(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addQuestion() } },
            }),
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-sm',
              onClick: addQuestion }, '＋ 添加')),
          h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 6 } },
            `${model.note} 补充问题只保存在本机，不上传、不入库。`)),
        h('div', { className: 'dshh-review-sub' }, '可复制纯文本'),
        h('div', { className: 'dshh-copybox', style: { maxHeight: 240 } }, text),
        h('div', { className: 'dshh-modal-note' }, model.disclaimer),
        h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
            onClick: copy }, '复制摘要'),
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭')),
      )
    }

    /**
     * Weekly reconciliation report with a copyable plain-text block.
     * Two dialects: lean-muscle (photos) and metabolic (labs, no photos).
     */
    function WeeklyReviewModal({ member, goal, onClose, onToast }) {
      const metabolic = goal?.code === 'metabolic'
      const accounts = metabolic ? metabolicAccounts(goal) : leanAccounts(goal)
      const totals = metabolic ? metabolicWeekly(goal) : leanWeeklyTotals(goal, accounts)
      const labs = metabolic ? metabolicLabs(goal) : null
      const text = metabolic
        ? metabolicWeeklyText({ memberName: member?.name, goal, accounts, weekly: totals, labs })
        : weeklyReviewText({ memberName: member?.name, goal, accounts, totals })
      const rate = totals.max > 0 ? totals.deposits / totals.max : null

      async function copy() {
        const ok = await leanCopyText(text)
        onToast?.(ok ? '周报已复制为纯文本' : '复制失败，可手动选择文本')
      }

      const unit = metabolic ? '格' : '笔'
      const behaviourLine = metabolic
        ? `近 7 天你存入了 ${totals.deposits}/${totals.max} 格，有记录 ${totals.recordDays ?? 0} 天；`
          + `化验：${labs?.hasCycleLab ? `本周期已录 ${labs.cycleCount || 1} 次` : '本周期待录入'}。`
        : `近 7 天你存入了 ${totals.deposits}/${totals.max} 笔，照片覆盖 ${totals.photoDays} 天，`
          + `有记录 ${totals.recordDays} 天。`

      return h(ModalFrame, { title: metabolic ? '本周对账单 · 代谢' : '本周对账单',
        onClose, wide: true },
        h('div', { className: 'dshh-review-grid' },
          h(ReviewStat, { label: '已存入', value: `${totals.deposits}/${totals.max} ${unit}` }),
          h(ReviewStat, { label: '完成度', value: fmtPercent(rate) }),
          metabolic
            ? h(ReviewStat, {
                label: '化验状态',
                value: labs?.hasCycleLab ? `已录 ${labs.cycleCount || 1} 次` : '待录入',
                hint: labs?.latestAt ? `最近 ${localDateOf(labs.latestAt)}` : null,
              })
            : h(ReviewStat, { label: '照片天数', value: `${totals.photoDays} 天` }),
          h(ReviewStat, { label: '记录天数', value: `${totals.recordDays ?? 0} 天` })),
        h('div', { className: 'dshh-muted dshh-small' }, behaviourLine),
        metabolic && h('div', { className: 'dshh-review-grid', style: { marginTop: 10 } },
          h(ReviewStat, { label: '血压天数', value: totals.bpDays == null ? '—' : `${totals.bpDays} 天` }),
          h(ReviewStat, { label: '饮食天数', value: totals.mealDays == null ? '—' : `${totals.mealDays} 天` }),
          h(ReviewStat, { label: '活动分钟', value: totals.activityMinutes == null ? '—' : `${totals.activityMinutes} min` })),
        h('div', { className: 'dshh-review-sub' }, metabolic ? '四账户（测 / 吃 / 动 / 睡）' : '四账户'),
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
          metabolic
            ? '以上只是行为与记录统计，不评定身体好坏；断更不惩罚，下周补上即可。参考区间非医学标准，不构成诊断、治疗或用药建议。'
            : '以上只是记录统计；断更不惩罚，下周补上即可。参考区间非医学标准，不构成诊断、训练或营养处方。'),
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
              const unit = row?.unit ?? ''
              const baseline = withMetricUnit(row?.baseline ?? '—', unit)
              const latestValue = row?.latest ?? row?.currentDisplay
              const latest = withMetricUnit(latestValue ?? '—', unit)
              const single = row?.single
                ?? Boolean(row?.baselineAt && row?.latestAt && row.baselineAt === row.latestAt)
              const delta = single
                ? '—'
                : row?.deltaDisplay
                  ?? observeDeltaText({ deltaSinceBaseline: row?.delta, unit })
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

    /**
     * Theory handbook: claim -> product mechanism -> boundary, plus sources.
     * `code` selects the metabolic (代谢手册) or lean-muscle (薄肌手册) cards.
     */
    function HandbookModal({ templates, playbook: goalPlaybook, code, onClose }) {
      const metabolic = code === 'metabolic'
      const template = goalTemplateOf(templates, metabolic ? 'metabolic' : 'lean_muscle')
      const templateCards = Array.isArray(template?.playbook)
        ? template.playbook.filter(Boolean)
        : []
      // Older hosts expose the playbook on the goal progress payload instead.
      const playbook = templateCards.length > 0
        ? templateCards
        : (Array.isArray(goalPlaybook) ? goalPlaybook.filter(Boolean) : [])
      const sources = metabolic ? METABOLIC_SOURCES : LEAN_SOURCES
      return h(ModalFrame, { title: metabolic ? '代谢手册' : '薄肌手册', onClose, wide: true },
        h('div', { className: 'dshh-muted dshh-small', style: { marginBottom: 12 } },
          metabolic
            ? '这里解释「为什么这样设计」：只做记录、参考区间与趋势，不提供诊断、用药、食谱或训练计划。指南与网络主张只作为出处，不是个人处方。'
            : '这里解释「为什么这样设计」：只做记录、参考区间与趋势，不提供动作、组数、食谱或补剂。网络主张是主张，不是事实。'),
        playbook.length === 0
          ? h('div', { className: 'dshh-empty', style: { padding: '18px' } },
              h('div', { className: 'dshh-empty-title' }, '手册内容暂未返回'),
              h('div', { className: 'dshh-empty-desc' },
                `当前模板没有 playbook 字段；刷新或等服务端更新后再看。这不影响记录、${
                  metabolic ? '对账与复查摘要' : '对账与结算'}。`))
          : h('div', { className: 'dshh-handbook' }, playbook.map((card, index) =>
              h('div', { key: card.id ?? `card-${index}`, className: 'dshh-handbook-card' },
                h('div', { className: 'dshh-handbook-title' },
                  `${index + 1}. ${card.title ?? '未命名'}`),
                card.claim && h('div', { className: 'dshh-handbook-row' },
                  h('span', { className: 'dshh-handbook-label' },
                    metabolic ? '网络 / 指南主张' : '网络主张'), card.claim),
                card.takeaway && h('div', { className: 'dshh-handbook-row' },
                  h('span', { className: 'dshh-handbook-label' }, '本工具怎么用'), card.takeaway),
                card.boundary && h('div', { className: 'dshh-handbook-row' },
                  h('span', { className: 'dshh-handbook-label' }, '边界'), card.boundary),
                card.source && h('div', { className: 'dshh-handbook-source' },
                  `出处：${card.source}`)))),
        h('div', { className: 'dshh-review-sub' }, '参考来源（外部链接，非本工具观点）'),
        h('div', { className: 'dshh-handbook-sources' }, sources.map((source) =>
          h('a', { key: source.url, href: source.url, target: '_blank',
            rel: 'noreferrer noopener' }, source.label))),
        h('div', { className: 'dshh-modal-note' },
          metabolic
            ? `非医学、非处方。${METABOLIC_PLAYBOOK_DISCLAIMER}`
            : `非医学、非训练、非营养处方。${LEAN_DISCLAIMER}`),
        h('div', { className: 'dshh-modal-actions' },
          h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭')),
      )
    }

    // ---------------------------------------------------------------- diet

    function mealItemsText(items, max = 3) {
      const list = (items ?? []).filter((item) => item && item.name)
      if (list.length === 0) return ''
      const shown = list.slice(0, max).map((item) => item.name)
      return shown.join('、') + (list.length > shown.length ? ` 等 ${list.length} 项` : '')
    }

    function DietDayRow({ day }) {
      const kcal = typeof day?.kcal === 'number' ? day.kcal : 0
      const count = typeof day?.count === 'number' ? day.count : 0
      const empty = count === 0 && kcal === 0
      return h('div', { className: 'dshh-dietday' },
        h('span', { className: 'dshh-dietday-date' },
          day?.date ? `${fmtDay(day.date)} ${leanWeekdayOf(day.date)}`.trim() : '—'),
        h('div', { className: 'dshh-dietday-bar', 'aria-hidden': true },
          h('div', { className: 'dshh-dietday-fill',
            style: { width: `${day?.barPercent ?? 0}%` } })),
        h('span', { className: 'dshh-dietday-right' },
          empty ? '—' : `${fmtNumber(kcal, 0)} kcal`,
          empty ? null : h('small', null, `${count} 餐`)),
      )
    }

    /** Diet tab: today's totals, rolling 7 days, meal list. Records only. */
    function DietPane({ member, data, run, onToast, onNewMeal }) {
      const diet = data?.diet ?? null
      const [expanded, setExpanded] = useState({})
      const [confirmId, setConfirmId] = useState(null)
      const [brokenId, setBrokenId] = useState(null)
      const [removing, setRemoving] = useState(false)
      const timerRef = useRef(null)

      useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current)
      }, [])

      function arm(id) {
        setConfirmId(id)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setConfirmId(null), 3000)
      }

      async function removeMeal(id) {
        if (timerRef.current) clearTimeout(timerRef.current)
        setConfirmId(null)
        setRemoving(true)
        try {
          const result = await run('deleteMeal', { member: member.name, id })
          onToast(result?.ok ? '已删除这餐' : (result?.error ?? '删除失败'))
        } finally {
          setRemoving(false)
        }
      }

      function toggle(id) {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
      }

      const today = diet?.today ?? todayKey()
      const kcal = typeof diet?.kcal === 'number' ? diet.kcal : 0
      const protein = typeof diet?.protein === 'number' ? diet.protein : 0
      const count = typeof diet?.count === 'number' ? diet.count : 0
      const days = Array.isArray(diet?.days) ? diet.days : []
      // The host already returns newest first; sort defensively so the list is
      // never out of order if a partial/older payload comes through.
      const recent = (Array.isArray(diet?.recent) ? diet.recent : [])
        .slice()
        .sort((a, b) => String(b?.measuredAt ?? '').localeCompare(String(a?.measuredAt ?? '')))
      const maxKcal = days.reduce((max, day) =>
        Math.max(max, typeof day?.kcal === 'number' ? day.kcal : 0), 0)
      const withBar = days.map((day) => ({
        ...day,
        barPercent: maxKcal > 0 && typeof day?.kcal === 'number'
          ? (day.kcal > 0 ? Math.max(2, Math.round((day.kcal / maxKcal) * 100)) : 0)
          : 0,
      }))

      return h('div', { className: 'dshh-dietpane' },
        h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '今日饮食'),
              h('div', { className: 'dshh-muted dshh-small' },
                `只记录，不设热量目标 · ${today}`)),
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: onNewMeal }, '＋ 记一餐'),
          ),
          h('div', { className: 'dshh-dietstats' },
            h('div', { className: 'dshh-dietstat' },
              h('b', null, fmtNumber(kcal, 0)), h('span', null, '热量 kcal')),
            h('div', { className: 'dshh-dietstat' },
              h('b', null, fmtNumber(protein, 1)), h('span', null, '蛋白 g')),
            h('div', { className: 'dshh-dietstat' },
              h('b', null, String(count)), h('span', null, '已记餐数'))),
          h('div', { className: 'dshh-dietnote' },
            '仅记录，不设热量目标；估算值需你确认。热量与蛋白只做汇总和趋势，不设达标线。'),
        ),
        h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('span', { className: 'dshh-cardtitle' }, '近 7 天'),
            h('span', { className: 'dshh-muted dshh-small' }, '无记录的天显示「—」')),
          days.length === 0
            ? h('div', { className: 'dshh-muted dshh-small' }, '近 7 天数据暂未返回。')
            : h('div', { className: 'dshh-dietdays' }, withBar.map((day, index) =>
                h(DietDayRow, { key: day?.date ?? `diet-day-${index}`, day }))),
        ),
        h('section', { className: 'dshh-card' },
          h('div', { className: 'dshh-cardhead' },
            h('div', null,
              h('span', { className: 'dshh-cardtitle' }, '餐次记录'),
              h('div', { className: 'dshh-muted dshh-small' },
                '按时间倒序，最近 20 条；照片只存本机')),
            h('button', { type: 'button', className: 'dshh-btn', onClick: onNewMeal },
              '＋ 记一餐')),
          recent.length === 0
            ? h('div', { className: 'dshh-empty', style: { padding: '18px' } },
                h('div', { className: 'dshh-empty-title' }, '还没有饮食记录'),
                h('div', { className: 'dshh-empty-desc' },
                  '记一餐可以只填热量，也可以拍照后让模型估算、再由你确认。'),
                h('div', { className: 'dshh-empty-actions' },
                  h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
                    onClick: onNewMeal }, '＋ 记一餐')))
            : h('div', { className: 'dshh-meals' }, recent.map((meal) => {
                const isOpen = Boolean(expanded[meal.id])
                const items = meal.items ?? []
                const broken = brokenId === meal.id
                const kcalText = typeof meal.kcal === 'number'
                  ? `${fmtNumber(meal.kcal, 0)} kcal` : '未填热量'
                const proteinText = typeof meal.protein === 'number'
                  ? ` · 蛋白 ${fmtNumber(meal.protein, 1)} g` : ''
                return h('div', { key: meal.id, className: 'dshh-meal' },
                  meal.photo && !broken
                    ? h('img', {
                        className: 'dshh-meal-thumb', src: photoUrl(meal.photo.id),
                        alt: '', loading: 'lazy',
                        onError: () => setBrokenId(meal.id),
                      })
                    : h('div', { className: 'dshh-meal-thumb', 'aria-hidden': true }, '🍽'),
                  h('div', { className: 'dshh-meal-main' },
                    h('div', { className: 'dshh-meal-head' },
                      h('span', { className: 'dshh-meal-type' },
                        meal.mealTypeName ?? mealTypeName(meal.mealType)),
                      h('span', { className: 'dshh-meal-time' }, fmtTime(meal.measuredAt))),
                    h('div', { className: 'dshh-meal-nums' }, kcalText + proteinText),
                    meal.note && h('div', { className: 'dshh-meal-note' }, meal.note),
                    items.length > 0 && h('div', { className: 'dshh-meal-note' },
                      mealItemsText(items)),
                    isOpen && items.length > 0 && h('ul', { className: 'dshh-meal-items' },
                      items.map((item, index) =>
                        h('li', { key: `${meal.id}-item-${index}` },
                          `${item?.name ?? '条目'}`
                          + (item?.portion ? ` · ${item.portion}` : '')
                          + (typeof item?.kcal === 'number' ? ` · ${item.kcal} kcal` : ''))))),
                  h('div', { className: 'dshh-meal-actions' },
                    items.length > 0 && h('button', {
                      type: 'button', className: 'dshh-btn-ghost dshh-small',
                      onClick: () => toggle(meal.id),
                    }, isOpen ? '收起' : '展开'),
                    confirmId === meal.id
                      ? [
                          h('button', { key: 'cancel', type: 'button',
                            className: 'dshh-btn dshh-btn-sm',
                            onClick: () => setConfirmId(null) }, '取消'),
                          h('button', { key: 'confirm', type: 'button',
                            className: 'dshh-btn dshh-btn-sm dshh-btn-danger',
                            disabled: removing,
                            onClick: () => removeMeal(meal.id) }, '确认删除'),
                        ]
                      : h('button', { type: 'button',
                          className: 'dshh-btn-ghost dshh-small',
                          onClick: () => arm(meal.id) }, '删除'),
                  ))
              })),
        ),
        h('div', { className: 'dshh-muted dshh-small',
          style: { lineHeight: 1.6, padding: '0 2px' } },
          diet?.disclaimer ?? data?.disclaimer ?? ''),
      )
    }

    /** Compact "today's diet" card on the overview tab. */
    function DietQuickCard({ diet, onNewMeal, onOpenDiet }) {
      if (!diet) return null
      const kcal = typeof diet.kcal === 'number' ? diet.kcal : 0
      const protein = typeof diet.protein === 'number' ? diet.protein : 0
      const count = typeof diet.count === 'number' ? diet.count : 0
      const has = count > 0 || kcal > 0
      return h('section', { className: 'dshh-card' },
        h('div', { className: 'dshh-cardhead' },
          h('div', null,
            h('span', { className: 'dshh-cardtitle' }, '今日饮食'),
            h('div', { className: 'dshh-muted dshh-small' },
              '只记录，不设热量目标；估算值需你确认')),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            onOpenDiet && h('button', { type: 'button',
              className: 'dshh-btn-ghost dshh-small', onClick: onOpenDiet }, '查看饮食'),
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
              onClick: onNewMeal }, '＋ 记一餐'))),
        has
          ? h('div', { className: 'dshh-mealquick' },
              h('div', { className: 'dshh-mealquick-nums' },
                h('div', { className: 'dshh-mealquick-num' },
                  h('b', null, fmtNumber(kcal, 0)), h('span', null, '热量 kcal')),
                h('div', { className: 'dshh-mealquick-num' },
                  h('b', null, fmtNumber(protein, 1)), h('span', null, '蛋白 g')),
                h('div', { className: 'dshh-mealquick-num' },
                  h('b', null, String(count)), h('span', null, '餐'))))
          : h('div', { className: 'dshh-muted', style: { fontSize: 12 } }, '今天还没记录'),
      )
    }

    /**
     * "记一餐": optional photo + AI estimate (user confirms, then saves).
     * Estimation never writes; only saveMeal persists.
     */
    function MealModal({ member, run, onClose, onToast, initialDate }) {
      const fileRef = useRef(null)
      // Backfilling from the weekly ledger passes the cell date; a non-today
      // date opens at a neutral lunchtime clock and stays editable.
      const seedTime = () => {
        const raw = String(initialDate ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return toLocalInput()
        if (raw === todayKey()) return toLocalInput()
        return `${raw}T12:00`
      }
      const [mealType, setMealType] = useState(() => inferMealType())
      const [time, setTime] = useState(seedTime)
      const [note, setNote] = useState('')
      const [preview, setPreview] = useState(null)
      const [fileName, setFileName] = useState(null)
      const [kcal, setKcal] = useState('')
      const [protein, setProtein] = useState('')
      const [items, setItems] = useState([])
      const [estimate, setEstimate] = useState(null)
      const [estimateError, setEstimateError] = useState(null)
      const [picking, setPicking] = useState(false)
      const [estimating, setEstimating] = useState(false)
      const [saving, setSaving] = useState(false)
      const [error, setError] = useState(null)
      // Which provider/model reads the photo. Device-level preference stored by
      // the Host; `auto` keeps the default-model/first-vision-model behaviour.
      const [modelCatalog, setModelCatalog] = useState(null)
      const [modelError, setModelError] = useState(null)
      const [modelSaving, setModelSaving] = useState(false)
      const busy = picking || estimating || saving

      // Read the catalog lazily: a failure only disables the picker, the manual
      // calorie path stays available.
      useEffect(() => {
        let stale = false
        postAction('getEstimateModels', {})
          .then((result) => {
            if (stale) return
            if (result?.ok) setModelCatalog(result)
            else if (/未知操作/.test(String(result?.error ?? ''))) {
              // An older Host build has no model preference yet: keep the
              // estimate button working and simply hide the picker.
              setModelCatalog({
                unsupported: true,
                settings: { mode: 'auto', provider: null, model: null },
                routes: [],
                resolved: null,
              })
            } else setModelError(result?.error ?? '读取估算模型失败')
          })
          .catch((cause) => {
            if (!stale) setModelError(`读取估算模型失败：${String(cause?.message ?? cause)}`)
          })
        return () => { stale = true }
      }, [])

      async function onPick(event) {
        const file = event.target.files?.[0] ?? null
        event.target.value = ''
        if (!file) return
        setError(null)
        setEstimateError(null)
        setPicking(true)
        try {
          const dataUrl = await compressPhoto(file)
          setPreview(dataUrl)
          setFileName(file.name || `meal-${Date.now()}.jpg`)
          setEstimate(null)
          setItems([])
        } catch (cause) {
          setError(`照片处理失败：${String(cause?.message ?? cause)}`)
        } finally {
          setPicking(false)
        }
      }

      function clearPhoto() {
        setPreview(null)
        setFileName(null)
        setEstimate(null)
        setEstimateError(null)
        setItems([])
      }

      async function runEstimate() {
        if (!preview) return
        setEstimateError(null)
        setEstimating(true)
        try {
          const result = await run('estimateMeal', {
            member: member.name,
            dataBase64: preview,
            note,
            mealType,
          })
          if (!result?.ok) {
            setEstimateError(result?.error ?? '估算失败，可手动填写热量')
            return
          }
          const estimatePayload = result.estimate ?? {}
          setEstimate(estimatePayload)
          if (typeof estimatePayload.kcal === 'number') {
            setKcal(String(Math.round(estimatePayload.kcal)))
          }
          if (typeof estimatePayload.protein === 'number') {
            setProtein(String(Math.round(estimatePayload.protein)))
          }
          setItems(Array.isArray(estimatePayload.items) ? estimatePayload.items : [])
        } catch (cause) {
          setEstimateError(`估算失败：${String(cause?.message ?? cause)}`)
        } finally {
          setEstimating(false)
        }
      }

      async function save() {
        setError(null)
        const kcalText = String(kcal ?? '').trim()
        const kcalValue = Number(kcalText)
        if (kcalText === '' || !Number.isFinite(kcalValue) || kcalValue < 0 || kcalValue > 10000) {
          setError('请填写 0–10000 之间的热量（kcal）')
          return
        }
        const proteinText = String(protein ?? '').trim()
        let proteinValue
        if (proteinText !== '') {
          proteinValue = Number(proteinText)
          if (!Number.isFinite(proteinValue) || proteinValue < 0 || proteinValue > 400) {
            setError('蛋白请填写 0–400 g 之间的数字，或留空')
            return
          }
        }
        setSaving(true)
        try {
          const result = await run('saveMeal', {
            member: member.name,
            dataBase64: preview || undefined,
            measuredAt: toApiTime(time),
            mealType,
            kcal: kcalValue,
            protein: proteinValue,
            note,
            items: items.length > 0 ? items : undefined,
            fileName: fileName || undefined,
          })
          if (!result?.ok) { setError(result?.error ?? '保存失败'); return }
          onToast('已记录这一餐')
          onClose()
        } catch (cause) {
          setError(`保存失败：${String(cause?.message ?? cause)}`)
        } finally {
          setSaving(false)
        }
      }

      async function onPickModel(event) {
        const value = String(event.target.value ?? 'auto')
        const payload = value === 'auto'
          ? { mode: 'auto', provider: null, model: null }
          : {
            mode: 'fixed',
            provider: value.split('::')[0],
            model: value.split('::').slice(1).join('::'),
          }
        setModelError(null)
        setModelSaving(true)
        try {
          const result = await postAction('setEstimateSettings', { settings: payload })
          if (!result?.ok) {
            setModelError(result?.error ?? '切换估算模型失败')
            return
          }
          setModelCatalog(result)
          onToast?.(value === 'auto' ? '估算模型已改为自动选择' : '估算模型已切换')
        } catch (cause) {
          setModelError(`切换估算模型失败：${String(cause?.message ?? cause)}`)
        } finally {
          setModelSaving(false)
        }
      }

      const modelSettings = modelCatalog?.settings ?? { mode: 'auto', provider: null, model: null }
      const modelRoutes = modelCatalog?.routes ?? []
      const fixedKey = modelSettings.mode === 'fixed' && modelSettings.provider && modelSettings.model
        ? `${modelSettings.provider}::${modelSettings.model}`
        : null
      const routeKeys = new Set(modelRoutes.map((route) => `${route.provider}::${route.model}`))
      const modelValue = fixedKey ?? 'auto'
      const resolvedRoute = modelCatalog?.resolved ?? null
      const resolvedLabel = resolvedRoute
        ? `当前：${resolvedRoute.modelName ?? resolvedRoute.model}`
          + (resolvedRoute.providerName ? ` · ${resolvedRoute.providerName}` : '')
          + (resolvedRoute.source === 'fixed'
            ? '（已指定）'
            : resolvedRoute.source === 'default' ? '（默认模型）' : '（自动选择）')
        : modelCatalog
          ? '当前没有可用的图片模型：估算会提示手动填写。'
          : modelError ? '模型列表读取失败，仍可手动填写热量。' : '正在读取模型列表…'

      const estimateRange = estimate
        && typeof estimate.kcalLow === 'number' && typeof estimate.kcalHigh === 'number'
        ? `（区间 ${fmtNumber(estimate.kcalLow, 0)}–${fmtNumber(estimate.kcalHigh, 0)}）`
        : ''
      const estimateProtein = estimate && typeof estimate.protein === 'number'
        ? ` · 蛋白约 ${fmtNumber(estimate.protein, 0)} g` : ''

      const footer = h('div', { className: 'dshh-modal-actions' },
        h('span', { className: 'dshh-muted dshh-small', style: { marginRight: 'auto' } },
          '保存后才会写入本机'),
        h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '取消'),
        h('button', { type: 'button', className: 'dshh-btn dshh-btn-primary',
          onClick: save, disabled: busy }, saving ? '保存中…' : '保存这一餐'),
      )

      return h(ModalFrame, { title: `记一餐 · ${member.name}`, onClose, footer, wide: true },
        h('div', { className: 'dshh-field-row' },
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '餐次'),
            h('select', { className: 'dshh-select', value: mealType,
              onChange: (e) => setMealType(e.target.value) },
              MEAL_TYPES.map((item) =>
                h('option', { key: item.code, value: item.code }, item.name))),
          ),
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '时间'),
            h('input', { className: 'dshh-input', type: 'datetime-local', value: time,
              onChange: (e) => setTime(e.target.value) }),
          ),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '照片（可选）'),
          h('div', { className: 'dshh-upload' },
            h('input', {
              ref: fileRef, type: 'file', accept: 'image/*', capture: 'environment',
              onChange: onPick, style: { display: 'none' },
            }),
            h('button', { type: 'button', className: 'dshh-btn',
              onClick: () => fileRef.current?.click() },
              picking ? '处理中…' : preview ? '重新选择' : '拍照 / 选择照片'),
            preview && h('button', { type: 'button',
              className: 'dshh-btn-ghost dshh-small', onClick: clearPhoto }, '移除照片'),
            h('span', { className: 'dshh-privacy' },
              '最长边压缩至 1400px · JPEG 0.82 · 只存本机'),
          ),
          preview && h('img', { className: 'dshh-capture-preview', src: preview, alt: '餐食照片预览' }),
        ),
        !modelCatalog?.unsupported && h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '估算模型'),
          h('select', {
            className: 'dshh-select',
            value: modelValue,
            disabled: modelSaving || !modelCatalog,
            onChange: onPickModel,
          },
            h('option', { value: 'auto' }, '自动选择（默认模型优先）'),
            modelRoutes.map((route) => h('option', {
              key: `${route.provider}::${route.model}`,
              value: `${route.provider}::${route.model}`,
            }, `${route.modelName} · ${route.providerName}`)),
            fixedKey && !routeKeys.has(fixedKey) && h('option', { value: fixedKey },
              `${modelSettings.model} · ${modelSettings.provider}（不在当前列表）`),
          ),
          h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 4 } }, resolvedLabel),
          modelError && h('div', { className: 'dshh-note dshh-small', style: { marginTop: 4 } }, modelError),
          h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 4 } },
            '接入新模型：在 DSH 设置 → 模型服务里添加；声明了图片输入的模型会出现在这里。'),
        ),
        h('div', { className: 'dshh-privacy' },
          '估算会把照片发送给所选模型服务，仅用于本次估算，不入库、不用于训练；点保存后才写入本机。'),
        preview && h('div', null,
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
            h('button', { type: 'button', className: 'dshh-btn',
              disabled: busy, onClick: runEstimate },
              estimating ? '估算中…' : 'AI 估算热量')),
          estimate && h('div', { className: 'dshh-mealestimate' },
            h('div', { className: 'dshh-mealestimate-title' },
              `估算 ${fmtNumber(estimate.kcal, 0)} kcal${estimateRange}${estimateProtein}`),
            (estimate.items ?? []).length > 0 && h('ul', { className: 'dshh-meal-items' },
              estimate.items.map((item, index) =>
                h('li', { key: `estimate-item-${index}` },
                  `${item?.name ?? '条目'}`
                  + (item?.portion ? ` · ${item.portion}` : '')
                  + (typeof item?.kcal === 'number' ? ` · ${item.kcal} kcal` : '')))),
            h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 6 } },
              '估算值需你确认后才会保存，可手动修改；受份量、用油与遮挡影响，误差较大。'),
            h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 4 } },
              `本次由 ${estimate.modelName ?? estimate.model ?? '当前模型'} 估算`
              + (estimate.providerName ? ` · ${estimate.providerName}` : '')),
          ),
          estimateError && h('div', { className: 'dshh-note dshh-small',
            style: { marginTop: 8 } },
            `${estimateError}——也可以直接手动填写热量。`),
        ),
        h('div', { className: 'dshh-field-row' },
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '热量 kcal（必填）'),
            h('input', { className: 'dshh-input', type: 'number', inputMode: 'decimal',
              min: 0, max: 10000, placeholder: '如 620', value: kcal,
              onChange: (e) => setKcal(e.target.value) }),
          ),
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '蛋白 g（选填）'),
            h('input', { className: 'dshh-input', type: 'number', inputMode: 'decimal',
              min: 0, max: 400, placeholder: '如 30', value: protein,
              onChange: (e) => setProtein(e.target.value) }),
          ),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '备注（可选）'),
          h('input', { className: 'dshh-input', placeholder: '如：外食、白水换了一杯甜饮',
            value: note, onChange: (e) => setNote(e.target.value) }),
        ),
        h('div', { className: 'dshh-muted dshh-small', style: { lineHeight: 1.6 } },
          '热量只记录、汇总与看趋势；不设达标线，也不做差值评价。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
      )
    }

    /** Overview tab: hero -> coach tone -> deposits -> statement -> cycle. */
    function OverviewPane(props) {
      const {
        member, data, goals, templates, catalogs, contexts, photos, run,
        onToast, onEntry, onManageGoal, onSetGoal, onMetric, onDeleteRecord,
        onCapturePhoto, onOpenPhotosTab,
        onDeposit, onOpenWeekly, onOpenSeason,
        onNewMeal, onOpenDiet,
        onOpenAccount, onOpenLab, onOpenVisitSummary,
        onOpenMetabolicWeekly, onStartMetabolicCycle, onOpenSeasonTab,
      } = props
      const [tone, setTone] = useState(() => readTone(member.id))
      const [toneSeen, setToneSeen] = useState(() => readToneSeen(member.id))
      const [lineIndex, setLineIndex] = useState(0)
      // Which dashboard is open when a member has both metabolic and lean goals.
      const [dashGoal, setDashGoal] = useState('metabolic')

      useEffect(() => {
        setTone(readTone(member.id))
        setToneSeen(readToneSeen(member.id))
        setLineIndex(0)
        setDashGoal('metabolic')
      }, [member.id])

      const recent = data.recent ?? []
      const todayPhoto = findTodayPhoto(photos)
      const ctx = coachContext({ goals, photos, recent })
      const leanGoal = leanActiveGoalOf(goals)
      // New payloads carry accounts + season; without them (older/partial host)
      // fall back to the legacy quick-log layout instead of showing empty boards.
      const leanReady = Boolean(leanGoal
        && Array.isArray(leanGoal.accounts) && leanGoal.accounts.length > 0)
      // The metabolic ledger needs the whole v4 payload; a partial host keeps
      // the legacy dashboard (quick log + goal cards + latest metrics).
      const metabolicGoal = metabolicActiveGoalOf(goals)
      const metabolicReady = Boolean(metabolicGoal && metabolicLedgerReady(metabolicGoal))
      const dualGoals = Boolean(leanReady && metabolicReady)
      const activeDash = dualGoals
        ? (dashGoal === 'lean_muscle' ? 'lean_muscle' : 'metabolic')
        : metabolicReady
          ? 'metabolic'
          : leanReady
            ? 'lean_muscle'
            : null
      const leanDashboard = activeDash === 'lean_muscle'
      const metabolicDashboard = activeDash === 'metabolic'
      // On an active ledger dashboard the goal card and the generic "latest
      // metrics" block duplicate the accounts / statement. Keep them for the
      // legacy view, and keep the goal card when goals data is broken so the
      // error stays visible.
      const showGoalCards = (!leanDashboard && !metabolicDashboard) || Boolean(data.goalError)
      const showQuickLog = !leanReady && !metabolicReady && goals.length > 0
      const hasActiveGoal = goals.some((goal) => goal.status === 'active')
      const lines = coachLines(tone, ctx)
      const line = lines.length > 0 ? lines[lineIndex % lines.length] : ''
      const coachIntro = ctx.metabolic
        ? '硬核模式只针对行动（测 / 吃 / 动 / 睡 / 化验），不评价指标与身体；不适可切温和或关闭。'
        : ctx.lean
          ? '硬核模式只针对行动（练 / 大餐 / 睡 / 水 / 照片），不评价你的身体；不适可切温和或关闭。'
          : '硬核模式只针对行动（记录 / 训练 / 饮食），不评价你的身体；不适可切温和或关闭。'

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
          dashboardGoal: activeDash,
          onDashboardGoalChange: setDashGoal,
          onCapturePhoto, onRecord: onEntry, onOpenPhotosTab, onManageGoal,
          onOpenDeposit: onDeposit, onOpenWeekly, onOpenSeason,
          onOpenAccount, onOpenMetabolicWeekly,
          onOpenVisitSummary, onStartMetabolicCycle,
        }),
        h(CoachTone, {
          mode: tone,
          line,
          onMode: chooseTone,
          onNext: () => setLineIndex((index) => index + 1),
          showIntro: tone === 'hard' && !toneSeen,
          onDismissIntro: dismissIntro,
          hidden: !hasActiveGoal,
          intro: coachIntro,
        }),
        metabolicDashboard
          ? h('div', { className: 'dshh-overview' },
              h(MetabolicDepositCard, {
                goal: metabolicGoal,
                onOpenAccount,
                onOpenLab,
              }),
              h(MetabolicLedger, {
                goal: metabolicGoal,
                onOpenAccount,
                onOpenMetabolicWeekly,
              }),
              h(MetabolicStatement, { goal: metabolicGoal, onMetric }),
              h(MetabolicCycleCard, {
                goal: metabolicGoal,
                onOpenVisitSummary,
                onOpenMetabolicWeekly,
                onStartMetabolicCycle,
              }),
              leanReady && h('section', { className: 'dshh-card dshh-met-crosslink' },
                h('div', { className: 'dshh-muted dshh-small' },
                  '薄肌账户在「赛季」Tab 独立运行；体成分只做对账单，不计分、不排名。'),
                h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 } },
                  h('button', { type: 'button', className: 'dshh-btn dshh-btn-sm',
                    onClick: () => setDashGoal('lean_muscle') }, '切换到薄肌账户'),
                  h('button', { type: 'button', className: 'dshh-btn dshh-btn-sm',
                    onClick: onOpenSeasonTab }, '打开赛季 Tab'))))
          : leanDashboard
            ? h(DepositCard, {
                goal: leanGoal, todayPhoto,
                onOpenDeposit: onDeposit,
                onCapturePhoto,
                onOpenPhotosTab,
              })
            : showQuickLog && h(QuickLog, {
                member, goals, templates, catalogs, contexts, run,
                onToast, onMore: onEntry, onSetGoal, onManageGoal,
              }),
        leanDashboard && h(BodyStatement, {
          goal: leanGoal, member, catalogs, onMetric, onRecord: onEntry,
          latest: data.latest, series: data.series,
        }),
        leanDashboard && metabolicReady && h('section', { className: 'dshh-card dshh-met-crosslink' },
          h('div', { className: 'dshh-muted dshh-small' },
            '代谢对账簿在「复查」Tab 独立运行；行为账户与指标对账单互不影响。'),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 } },
            h('button', { type: 'button', className: 'dshh-btn dshh-btn-sm',
              onClick: () => setDashGoal('metabolic') }, '切换到代谢对账簿'))),
        showGoalCards && h(GoalCards, {
          goals, templates, error: data.goalError,
          onManage: onManageGoal, onSet: onSetGoal, onRecord: onEntry,
        }),
        data.diet && h(DietQuickCard, {
          diet: data.diet, onNewMeal, onOpenDiet,
        }),
        !leanDashboard && !metabolicDashboard && h(LatestMetrics, {
          latest: data.latest, catalogs, onMetricClick: onMetric,
        }),
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

    function DocumentSection({ documents, catalogs, onAdd, onAnalyze, onRemove }) {
      const types = catalogs?.documentTypes ?? []
      const [filter, setFilter] = useState(null)
      const rows = documents ?? []
      const shown = filter ? rows.filter((item) => item.type === filter) : rows
      const typeName = (code) => types.find((item) => item.code === code)?.name ?? code
      const icons = { medical_record: '📄', prescription: '💊', lab_report: '🧪', imaging: '🩻', other: '📎' }
      // Older payloads expose the absolute path instead of `hasFile`.
      const hasFile = (item) => item.hasFile ?? Boolean(item.filePath)

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
              '还没有档案。点「＋ 登记档案」上传病历、处方或检验报告；'
              + '图片 / 文本报告上传后可用「AI 解读」帮助理解，结果只作参考。')
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
                  h('div', { className: 'dshh-doc-actions' },
                    hasFile(item) && h('button', { type: 'button',
                      className: 'dshh-btn dshh-btn-sm',
                      onClick: () => onAnalyze?.(item) }, 'AI 解读'),
                    h('button', { type: 'button', className: 'dshh-btn-ghost dshh-small',
                      onClick: () => onRemove(item.id), title: '删除' }, '删除')),
                )),
              shown.length === 0 && h('div', { className: 'dshh-muted dshh-small' },
                '该类型暂无档案'),
            ),
        h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 8 } },
          'AI 解读支持图片（PNG / JPEG / WebP）和文本（.txt）报告；PDF 请先截图或拍照。'
          + '解读由所选模型生成，只作参考，请以报告原件和医生实际诊断为准。'),
      )
    }

    function ArchiveHub({
      member, data, catalogs, photos, photoError, season, series, goalCodes,
      section, onSection, onRecord, onMetricClick, onCapture, onCaptureInspiration,
      onView, onCompare, onRemovePhoto, onAddDocument, onAnalyzeDocument, onRemoveDocument,
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
          onAddDocument, onAnalyzeDocument, onRemoveDocument,
          onRemoveCondition, onAddCondition, onManageConditions,
        }),
      )
    }

    function ArchivePane({ member, data, catalogs, onAddDocument, onAnalyzeDocument, onRemoveDocument, onRemoveCondition, onAddCondition, onManageConditions }) {
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h(DocumentSection, {
          documents: data.documents, catalogs,
          onAdd: onAddDocument, onAnalyze: onAnalyzeDocument, onRemove: onRemoveDocument,
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

    function ModalHost({ modal, data, catalogs, busy, run, onClose, onOpenMember, onOpenGoal, onNewGoal, onNewMeal, onToast, onDeleteMember }) {
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
          focusCategory: modal.focus ?? null,
          goalCodes: goalMetricCodeSet(data?.goals, data?.goalTemplates),
        })
      }
      if (modal.kind === 'diet') {
        return h(ModalFrame, { title: '饮食管理', onClose, wide: true },
          h(DietPane, {
            member, data, run, onToast,
            onNewMeal: () => onNewMeal?.(),
          }))
      }
      if (modal.kind === 'meal') {
        return h(MealModal, {
          member, run, onClose, onToast,
          initialDate: modal.date ?? null,
        })
      }
      if (modal.kind === 'document') {
        return h(DocumentModal, { member, catalogs, busy, run, onClose, onToast })
      }
      if (modal.kind === 'documentAnalysis') {
        return h(DocumentAnalysisModal, { member, document: modal.document, onClose, onToast })
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
      if (modal.kind === 'familyMonitor') {
        return h(FamilyMonitorModal, {
          member,
          date: modal.date ?? todayKey(),
          run, onClose, onToast,
        })
      }
      if (modal.kind === 'labEntry') {
        return h(LabEntryModal, { member, run, onClose, onToast })
      }
      if (modal.kind === 'visitSummary') {
        return h(VisitSummaryModal, {
          member,
          goal: metabolicGoalOf(data?.goals),
          onClose, onToast,
        })
      }
      if (modal.kind === 'weeklyReview') {
        return h(WeeklyReviewModal, {
          member,
          goal: modal.code === 'metabolic'
            ? metabolicGoalOf(data?.goals)
            : leanGoalOf(data?.goals),
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
        const handbookCode = modal.code === 'metabolic' ? 'metabolic' : 'lean_muscle'
        return h(HandbookModal, {
          templates: data?.goalTemplates ?? [],
          playbook: handbookCode === 'metabolic'
            ? metabolicGoalOf(data?.goals)?.playbook ?? null
            : leanGoalOf(data?.goals)?.playbook ?? null,
          code: handbookCode,
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
            '管理目标表示你想管理什么，不代表诊断或患病结论；目标值来自通用参考区间，个人目标与是否患病请以医生意见为准。'
            + '代谢管理的参考区间来自中国指南与国家膳食规范，只用于记录与对照，不构成诊断、治疗、用药、食谱或训练计划。'
            + '薄肌等体态目标的参考区间来自运动/营养公开共识，非医学标准，不构成训练、营养或用药处方。'),
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
                    `${goal.code === 'metabolic' ? '已记录' : '达标'} `
                    + `${goal.coverage?.measured ?? 0}/${goal.coverage?.evaluable ?? 0}`
                    + ` · 最近记录 ${goal.coverage?.lastRecordAt ? fmtTime(goal.coverage.lastRecordAt) : '暂无'}`),
                ),
                h('button', { type: 'button', className: 'dshh-btn', onClick: () => onManage(goal) }, '管理'),
              ))),
      )
    }

    /** Full record list for one metric, opened from a chart or a latest chip. */
    function MetricDetailModal({ code, data, onClose }) {
      const rawRows = data?.recordsByMetric?.[code] ?? []
      // Older payloads derive only the statement row; the detail modal falls
      // back to the weight records so a derived BMI never opens an empty list.
      const height = Number(data?.member?.height)
      const rows = code === 'bmi' && rawRows.length === 0
        && Number.isFinite(height) && height >= 80 && height <= 250
        ? (data?.recordsByMetric?.weight ?? []).map((row) => {
            const value = Math.round((row.value / ((height / 100) ** 2)) * 10) / 10
            return { ...row, id: `bmi-${row.id}`, value, display: value.toFixed(1), derived: true }
          })
        : rawRows
      const metric = data?.latest?.find((item) => item.code === code)
      const seriesMeta = data?.series?.[code]
      const name = metric?.name ?? seriesMeta?.name ?? (code === 'bmi' ? '体质指数' : code)
      const unit = metric?.unit ?? seriesMeta?.unit ?? (code === 'bmi' ? 'kg/m²' : '')

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
        code === 'bmi' && rows.some((row) => row.derived)
          && h('div', { className: 'dshh-muted dshh-small', style: { marginBottom: 8 } },
            'BMI 由身高与体重计算，只观察；直接录入的 BMI 以录入值为准。'),
        rows.length === 0
          ? h('div', { className: 'dshh-empty', style: { padding: '20px' } }, '暂无该指标记录')
          : h('div', { style: { maxHeight: '52vh', overflowY: 'auto' } },
              h('table', { className: 'dshh-table' },
                h('thead', null, h('tr', null,
                  h('th', { style: { width: 130 } }, '时间'),
                  h('th', { style: { width: 90 } }, '数值'),
                  h('th', { style: { width: 62 } }, '情境'),
                  h('th', { style: { width: 62 } }, '来源'),
                )),
                h('tbody', null, rows.map((row) =>
                  h('tr', { key: row.id },
                    h('td', { className: 'dshh-num dshh-muted' }, row.measuredAt),
                    h('td', { className: 'dshh-num', style: { fontWeight: 600 } },
                      `${row.display} ${unit}`),
                    h('td', { className: 'dshh-muted' }, row.context),
                    h('td', { className: 'dshh-muted' },
                      row.derived ? '自动计算' : (RECORD_SOURCE_LABEL[row.source] ?? row.source)),
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
      const [riskLevel, setRiskLevel] = useState(member?.riskCode ?? 'unknown')
      const [height, setHeight] = useState(member?.height != null ? String(member.height) : '')
      const [birthYear, setBirthYear] = useState(member?.birthYear ?? '')
      const [note, setNote] = useState(member?.note ?? '')
      const [error, setError] = useState(null)
      const [confirmDelete, setConfirmDelete] = useState(false)

      // Risk stratification is optional and defaults to "not assessed". The host
      // catalog may lag behind, so always guarantee an "unknown" first option.
      const riskOptions = useMemo(() => {
        const list = (catalogs?.riskLevels ?? []).filter(Boolean)
        if (list.length === 0) {
          return [
            { code: 'unknown', name: '未评估（不了解 / 未由医生评估）' },
            { code: 'low', name: '低危' },
            { code: 'medium', name: '中危' },
            { code: 'high', name: '高危' },
            { code: 'veryHigh', name: '极高危' },
          ]
        }
        if (list.some((item) => item.code === 'unknown')) return list
        return [{ code: 'unknown', name: '未评估（不了解 / 未由医生评估）' }, ...list]
      }, [catalogs])

      async function save() {
        setError(null)
        if (!name.trim()) { setError('请填写称呼'); return }
        let heightValue = null
        const heightText = String(height ?? '').trim()
        if (heightText !== '') {
          const parsed = Number(heightText)
          if (!Number.isFinite(parsed) || parsed < 80 || parsed > 250) {
            setError('身高请填写 80–250 cm 之间的数字，或留空')
            return
          }
          heightValue = Math.round(parsed * 10) / 10
        }
        const patch = { name, sex, relation, riskLevel, height: heightValue }
        patch.birthYear = birthYear === '' ? undefined : Number(birthYear)
        patch.note = note
        const result = editing
          ? await run('updateMember', { member: member.name, patch })
          : await run('createMember', {
              name, sex, relation, riskLevel,
              height: heightValue,
              birthYear: patch.birthYear, note,
            })
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
            h('label', { className: 'dshh-field-label' }, '身高 cm（选填）'),
            h('input', { className: 'dshh-input', placeholder: '如 175',
              inputMode: 'decimal', value: height,
              onChange: (e) => setHeight(e.target.value) }),
            h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 4 } },
              '用于自动计算 BMI，不必每次录入'),
          ),
          h('div', { className: 'dshh-field' },
            h('label', { className: 'dshh-field-label' }, '出生年份（选填）'),
            h('input', { className: 'dshh-input', placeholder: '如 1965',
              inputMode: 'numeric', value: birthYear,
              onChange: (e) => setBirthYear(e.target.value) }),
          ),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '心血管风险分层（选填）'),
          h('select', { className: 'dshh-select', value: riskLevel,
            onChange: (e) => setRiskLevel(e.target.value) },
            riskOptions.map((item) =>
              h('option', { key: item.code, value: item.code }, item.name))),
          h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 4 } },
            '不了解可保持未评估；该字段只影响 LDL 等参考区间，不代表诊断。'),
          editing && member?.riskCode === 'low' && h('div', {
            className: 'dshh-muted dshh-small', style: { marginTop: 4 },
          }, '旧版本会把未填写默认成「低危」；如果你没有由医生评估过，可改为「未评估」。'),
        ),
        h('div', { className: 'dshh-field' },
          h('label', { className: 'dshh-field-label' }, '备注（如既往病史，仅记录不作判断）'),
          h('input', { className: 'dshh-input', value: note,
            onChange: (e) => setNote(e.target.value) }),
        ),
        h('div', { className: 'dshh-muted', style: { fontSize: '11px' } },
          '性别用于尿酸与 HDL 的参考区间；身高只用于计算 BMI；风险分层只影响 LDL 等参考区间。'),
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

    function EntryModal({
      member, catalogs, contexts, busy, run, onClose, onToast, goalCodes, focusCategory,
    }) {
      const metrics = catalogs?.metrics ?? []
      const focus = typeof focusCategory === 'string' ? focusCategory : null
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
        { code: 'diet', name: '饮食 / 饮水', codes: ['kcal', 'protein', 'water', 'sugary'] },
        { code: 'activity', name: '运动', codes: ['training', 'activity'] },
        { code: 'recovery', name: '恢复 / 睡眠', codes: ['sleep'] },
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
        if (focus && groups.some((group) => group.code === focus)) open.add(focus)
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

      const focusSelector = focus === 'body' ? '[data-metric="weight"]' : null
      return h(ModalFrame, {
        title: focus === 'body' ? '记录体成分' : '录入指标（全部指标）',
        onClose, footer, wide: true, initialFocus: focusSelector,
      },
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
                group.code === 'body' && member?.height
                  ? h('div', { className: 'dshh-muted dshh-small', style: { marginBottom: 8 } },
                      `已知身高 ${member.height} cm：填体重后会自动计算 BMI，BMI 可留空。`)
                  : null,
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
                      'data-metric': metric.code,
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
          '上传后文件会保存在本机档案目录。AI 解读目前支持图片（PNG / JPEG / WebP）和文本（.txt）报告；'
          + 'PDF 请先截图或拍照后再上传。解读由所选模型生成，只作参考，请以报告原件和医生实际诊断为准。'),
        error && h('div', { className: 'dshh-error', style: { marginTop: 10 } }, error),
      )
    }

    const REPORT_FLAG_LABEL = {
      high: '高于报告参考',
      low: '低于报告参考',
      normal: '在报告参考内',
      unknown: '报告未标注参考',
    }

    const REPORT_FALLBACK_DISCLAIMER = 'AI 生成内容仅供参考，不构成诊断、治疗或用药建议；'
      + '请以报告原件和医生的实际诊断为准，不要据此自行用药、停药或调整剂量。'

    /** AI reading of one archived report: proposal only, never a diagnosis. */
    function DocumentAnalysisModal({ member, document, onClose, onToast }) {
      const [catalog, setCatalog] = useState(null)
      const [catalogError, setCatalogError] = useState(null)
      const [unsupported, setUnsupported] = useState(false)
      const [modelSaving, setModelSaving] = useState(false)
      const [analysis, setAnalysis] = useState(null)
      const [analyzing, setAnalyzing] = useState(false)
      const [error, setError] = useState(null)
      const [copied, setCopied] = useState(false)
      const [imageError, setImageError] = useState(false)

      useEffect(() => {
        let stale = false
        postAction('getReportModels', {})
          .then((result) => {
            if (stale) return
            if (result?.ok) setCatalog(result)
            else if (/未知操作/.test(String(result?.error ?? ''))) setUnsupported(true)
            else setCatalogError(result?.error ?? '读取解读模型失败')
          })
          .catch((cause) => {
            if (!stale) setCatalogError(`读取解读模型失败：${String(cause?.message ?? cause)}`)
          })
        return () => { stale = true }
      }, [])

      const modelSettings = catalog?.settings ?? { mode: 'auto', provider: null, model: null }
      const modelRoutes = catalog?.routes ?? []
      const fixedKey = modelSettings.mode === 'fixed' && modelSettings.provider && modelSettings.model
        ? `${modelSettings.provider}::${modelSettings.model}`
        : null
      const routeKeys = new Set(modelRoutes.map((route) => `${route.provider}::${route.model}`))
      const modelValue = fixedKey ?? 'auto'
      const resolvedRoute = catalog?.resolved ?? null
      const resolvedLabel = resolvedRoute
        ? `当前：${resolvedRoute.modelName ?? resolvedRoute.model}`
          + (resolvedRoute.providerName ? ` · ${resolvedRoute.providerName}` : '')
          + (resolvedRoute.source === 'fixed'
            ? '（已指定）'
            : resolvedRoute.source === 'default' ? '（默认模型）' : '（自动选择）')
        : catalog
          ? '当前没有可用的图片模型：请先在 DSH 设置 → 模型服务接入。'
          : catalogError ? '模型列表读取失败，稍后重试。' : '正在读取模型列表…'
      const noModel = Boolean(catalog) && catalog.hasVision === false
      const busy = analyzing || modelSaving

      async function onPickModel(event) {
        const value = String(event.target.value ?? 'auto')
        const payload = value === 'auto'
          ? { mode: 'auto', provider: null, model: null }
          : {
            mode: 'fixed',
            provider: value.split('::')[0],
            model: value.split('::').slice(1).join('::'),
          }
        setCatalogError(null)
        setModelSaving(true)
        try {
          const result = await postAction('setReportSettings', { settings: payload })
          if (!result?.ok) {
            setCatalogError(result?.error ?? '切换解读模型失败')
            return
          }
          setCatalog(result)
          // The previous result belongs to the previous model; do not show it
          // under a new selection.
          setAnalysis(null)
          onToast?.(value === 'auto' ? '解读模型已改为自动选择' : '解读模型已切换')
        } catch (cause) {
          setCatalogError(`切换解读模型失败：${String(cause?.message ?? cause)}`)
        } finally {
          setModelSaving(false)
        }
      }

      async function analyze() {
        setError(null)
        setAnalyzing(true)
        try {
          const result = await postAction('analyzeDocument', { member: member.name, id: document.id })
          if (!result?.ok) {
            setError(result?.error ?? '解读失败，请重试')
            setAnalysis(null)
            return
          }
          setAnalysis(result)
        } catch (cause) {
          setError(`解读失败：${String(cause?.message ?? cause)}`)
        } finally {
          setAnalyzing(false)
        }
      }

      async function copy() {
        if (!analysis?.analysis) return
        const a = analysis.analysis
        const model = a.model ?? {}
        const source = model.source === 'fixed' ? '已指定'
          : model.source === 'default' ? '默认模型' : '自动选择'
        const lines = [
          `AI 报告解读 · ${document.title}（${document.docDate ?? '日期未标注'}）`,
          `模型：${model.modelName ?? model.model ?? '未知'} · ${model.providerName ?? model.provider ?? '未知'}（${source}）`,
          analysis.disclaimer || REPORT_FALLBACK_DISCLAIMER,
          '',
          `摘要：${a.summary ?? ''}`,
        ]
        const abnormal = (a.indicators ?? []).filter((row) => row.flag === 'high' || row.flag === 'low')
        for (const row of abnormal) {
          lines.push(`【${REPORT_FLAG_LABEL[row.flag] ?? row.flag}】${row.name}`
            + `${row.abbr ? `（${row.abbr}）` : ''}：${row.value || '—'}`
            + `${row.unit ? ` ${row.unit}` : ''} · 报告参考：${row.reference}`)
          if (row.meaning) lines.push(`  这项主要看什么：${row.meaning}`)
          if (row.abnormalMeaning) lines.push(`  异常通常说明什么：${row.abnormalMeaning}`)
          if (row.suggestion) lines.push(`  一般建议（非处方）：${row.suggestion}`)
        }
        if (abnormal.length === 0) lines.push('报告没有标注超出参考区间的指标。')
        if ((a.nextSteps ?? []).length > 0) lines.push('', '下一步：', ...a.nextSteps.map((q) => `- ${q}`))
        if ((a.generalInfo ?? []).length > 0) {
          lines.push('', '一般健康信息（公开参考，非处方）：', ...a.generalInfo.map((q) => `- ${q}`))
        }
        if (analysis.privacy) lines.push('', analysis.privacy)
        if ((a.questions ?? []).length > 0) lines.push('', '可以问医生：', ...a.questions.map((q) => `- ${q}`))
        try {
          await leanCopyText(lines.join('\n'))
          setCopied(true)
          onToast?.('报告解读已复制')
          setTimeout(() => setCopied(false), 2000)
        } catch (cause) {
          onToast?.(`复制失败：${String(cause?.message ?? cause)}`)
        }
      }

      const a = analysis?.analysis ?? null
      const abnormal = (a?.indicators ?? []).filter((row) => row.flag === 'high' || row.flag === 'low')
      const others = (a?.indicators ?? []).filter((row) => row.flag !== 'high' && row.flag !== 'low')
      const isText = /\.txt$/i.test(String(document?.fileName ?? ''))
      const isPdf = /\.pdf$/i.test(String(document?.fileName ?? ''))
      const previewUrl = document ? documentFileUrl(document.id, member.name) : ''
      const model = a?.model ?? null
      const modelLine = model
        ? `${model.modelName ?? model.model} · ${model.providerName ?? model.provider}`
        : ''
      const sourceLine = model?.source === 'fixed' ? '已指定'
        : model?.source === 'default' ? '默认模型' : '自动选择'
      const generated = a?.generatedAt
        ? fmtTime(String(a.generatedAt).replace('T', ' '))
        : ''

      const footer = h('div', { className: 'dshh-modal-actions' },
        h('span', { className: 'dshh-muted dshh-small', style: { marginRight: 'auto' } },
          '解读结果不会自动写入记录'),
        a && h('button', { type: 'button', className: 'dshh-btn', onClick: copy },
          copied ? '已复制' : '复制解读'),
        h('button', { type: 'button', className: 'dshh-btn', onClick: onClose }, '关闭'),
        h('button', {
          type: 'button', className: 'dshh-btn dshh-btn-primary',
          onClick: analyze, disabled: busy || noModel || unsupported,
        }, analyzing ? '解读中…' : a ? '重新解读' : '开始解读'),
      )

      const disclaimerText = 'AI 生成内容，不是医生诊断，也不构成治疗或用药建议。AI 可能看错报告；'
        + '请以报告原件和医生的实际诊断、处方为准，不要据此自行用药、停药或调整剂量。'

      return h(ModalFrame, {
        title: `AI 解读 · ${document?.title ?? '报告'}`,
        onClose, footer, extraWide: true,
      },
        h('div', { className: 'dshh-report-banner' }, disclaimerText),
        h('div', { className: 'dshh-report-layout' },
          h('section', { className: 'dshh-report-source' },
            h('div', { className: 'dshh-report-source-head' },
              h('div', null,
                h('div', { className: 'dshh-report-source-title' }, document?.title ?? '报告'),
                h('div', { className: 'dshh-muted dshh-small' },
                  `${document?.docDate ?? '日期未标注'} · ${document?.fileName ?? '已上传文件'}`)),
              previewUrl && h('a', {
                className: 'dshh-btn-ghost dshh-small',
                href: previewUrl, target: '_blank', rel: 'noreferrer',
              }, '打开原图 ↗')),
            isText
              ? h('pre', { className: 'dshh-report-text' },
                  a?.sourceText || '开始解读后在此显示文本内容；也可以点「打开原图」查看。')
              : isPdf
                ? h('div', { className: 'dshh-report-pdf' },
                    'PDF 报告。AI 解读暂不支持直接读取 PDF；请截图或拍照成图片后重新上传。')
                : imageError
                  ? h('div', { className: 'dshh-report-pdf' },
                      '原图预览失败；请点右上角「打开原图」查看。')
                  : h('a', {
                      className: 'dshh-report-image-link',
                      href: previewUrl, target: '_blank', rel: 'noreferrer',
                    },
                      h('img', {
                        className: 'dshh-report-image',
                        src: previewUrl,
                        alt: '报告原图',
                        loading: 'lazy',
                        onError: () => setImageError(true),
                      }))),
          h('section', { className: 'dshh-report-analysis' },
            unsupported
              ? h('div', { className: 'dshh-note' },
                  '当前运行中的宿主还没有报告解读动作；重启 DSH 后再打开这份档案即可使用。')
              : h('div', { className: 'dshh-field' },
                  h('label', { className: 'dshh-field-label' }, '解读模型'),
                  h('select', {
                    className: 'dshh-select',
                    value: modelValue,
                    disabled: modelSaving || !catalog,
                    onChange: onPickModel,
                  },
                    h('option', { value: 'auto' }, '自动选择（默认模型优先）'),
                    modelRoutes.map((route) => h('option', {
                      key: `${route.provider}::${route.model}`,
                      value: `${route.provider}::${route.model}`,
                    }, `${route.modelName} · ${route.providerName}`)),
                    fixedKey && !routeKeys.has(fixedKey) && h('option', { value: fixedKey },
                      `${modelSettings.model} · ${modelSettings.provider}（不在当前列表）`),
                  ),
                  h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 4 } }, resolvedLabel),
                  catalogError && h('div', { className: 'dshh-note dshh-small', style: { marginTop: 4 } }, catalogError),
                  h('div', { className: 'dshh-muted dshh-small', style: { marginTop: 4 } },
                    '接入新模型：DSH 设置 → 模型服务；只有声明图片输入的模型会出现在这里。')),
            h('div', { className: 'dshh-privacy' },
              '报告文件会发送给所选模型服务，仅用于本次解读；不会写入测量记录，也不会用于训练。'),
            error && h('div', { className: 'dshh-error' }, error),
            a
              ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
                  h('div', { className: 'dshh-report-model' },
                    h('span', { className: 'dshh-report-badge' }, 'AI 生成'),
                    h('span', null, `本次由 ${modelLine} 生成`),
                    h('span', null, `（${sourceLine}${generated ? ` · ${generated}` : ''}）`)),
                  h('div', { className: 'dshh-muted dshh-small' },
                    a.confidence === 'low'
                      ? '模型对本次识别把握较低，请重点核对原件。'
                      : '识别结果可能受图片清晰度与排版影响；请对照报告原件核对数值和参考区间。'),
                  a.summary && h('p', { className: 'dshh-report-summary' }, a.summary),
                  h('div', null,
                    h('div', { className: 'dshh-report-sub' },
                      `异常指标${abnormal.length > 0 ? ` · ${abnormal.length} 项` : ''}`),
                    abnormal.length === 0
                      ? h('div', { className: 'dshh-muted dshh-small' },
                          '报告中没有标注超出参考区间的指标。')
                      : h('div', { className: 'dshh-report-list' }, abnormal.map((row, index) =>
                          h('div', {
                            key: `report-abnormal-${index}`,
                            className: 'dshh-report-indicator',
                            'data-flag': row.flag,
                          },
                            h('div', { className: 'dshh-report-head' },
                              h('span', { className: 'dshh-report-name' },
                                row.name,
                                row.abbr
                                  ? h('span', { className: 'dshh-muted dshh-small' }, `（${row.abbr}）`)
                                  : null),
                              h('span', { className: 'dshh-report-flag', 'data-flag': row.flag },
                                REPORT_FLAG_LABEL[row.flag] ?? '超出报告参考')),
                            h('div', { className: 'dshh-report-values' },
                              h('span', { className: 'dshh-report-value' },
                                `${row.value || '—'}${row.unit ? ` ${row.unit}` : ''}`),
                              h('span', { className: 'dshh-report-reference' },
                                `报告参考：${row.reference}`)),
                            h('div', { className: 'dshh-report-block' },
                              h('b', null, '这项主要看什么'),
                              h('p', null, row.meaning)),
                            row.abnormalMeaning && h('div', { className: 'dshh-report-block' },
                              h('b', null, '异常通常说明什么'),
                              h('p', null, row.abnormalMeaning)),
                            row.suggestion && h('div', {
                              className: 'dshh-report-block',
                              'data-kind': 'suggestion',
                            },
                              h('b', null, '一般建议（非处方）'),
                              h('p', null, row.suggestion)))))),
                  others.length > 0 && h('details', { className: 'dshh-report-others' },
                    h('summary', null, `其他 ${others.length} 项指标`),
                    h('div', null, others.map((row, index) =>
                      h('div', { key: `report-other-${index}`, className: 'dshh-report-otherrow' },
                        h('div', null,
                          row.name,
                          row.abbr ? `（${row.abbr}）` : '',
                          h('small', null, `报告参考：${row.reference}`)),
                        h('div', { style: { textAlign: 'right' } },
                          `${row.value || '—'}${row.unit ? ` ${row.unit}` : ''}`,
                          h('small', null, REPORT_FLAG_LABEL[row.flag] ?? '报告未标注参考')))))),
                  (a.generalInfo ?? []).length > 0 && h('div', null,
                    h('div', { className: 'dshh-report-sub' }, '补充一般信息（公开参考，非处方）'),
                    h('ul', { className: 'dshh-report-ul' },
                      a.generalInfo.map((q, index) => h('li', { key: `report-g-${index}` }, q)))),
                  (a.nextSteps ?? []).length > 0 && h('div', null,
                    h('div', { className: 'dshh-report-sub' }, '下一步'),
                    h('ul', { className: 'dshh-report-ul' },
                      a.nextSteps.map((q, index) => h('li', { key: `report-step-${index}` }, q)))),
                  h('div', { className: 'dshh-report-questions' },
                    h('div', { className: 'dshh-report-sub' }, '可以问医生'),
                    (a.questions ?? []).length > 0
                      ? h('ul', { className: 'dshh-report-ul' },
                          a.questions.map((q, index) => h('li', { key: `report-q-${index}` }, q)))
                      : h('div', { className: 'dshh-muted dshh-small' },
                          '可以问医生：这些异常项是否需要复查？是否需要结合其他检查一起看？下一步怎么安排？')))
              : h('div', { className: 'dshh-note' },
                  '左侧是报告原图。选择模型后点底部「开始解读」，右侧会列出异常指标、一般建议和可以问医生的问题。'))
          )
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
      window.__dshHealthDebug = {
        SeasonPane, DiscoverPane, ArchiveHub, WeeklyLedger, SquadModal, ShareSeasonModal,
        MetabolicPane, MetabolicStatement, MetabolicLedger, MetabolicCycleCard, MetabolicHero,
        MetabolicDepositCard, CutHero, DualHero, HandbookModal, OverviewPane,
        FamilyMonitorModal, LabEntryModal, VisitSummaryModal, WeeklyReviewModal,
        DocumentAnalysisModal,
      }
    }

    // ------------------------------------------------------------- floating
    //
    // The avatar and its Settings section share one small store. The Host owns
    // the durable copy (float.json); localStorage is only a first-paint cache so
    // the avatar appears at its saved position without a visible jump.

    let floatSnapshot = {
      settings: { ...FLOAT_DEFAULT_SETTINGS, position: { ...FLOAT_DEFAULT_SETTINGS.position } },
      status: null,
      loaded: false,
      error: null,
    }

    try {
      const cached = readLocalJSON(FLOAT_CACHE_KEY, null)
      if (cached && typeof cached === 'object') {
        floatSnapshot.settings = {
          ...FLOAT_DEFAULT_SETTINGS,
          ...cached,
          position: { ...FLOAT_DEFAULT_SETTINGS.position, ...(cached.position ?? {}) },
        }
      }
    } catch {
      // A missing/unreadable cache is fine; the Host copy follows immediately.
    }

    const floatListeners = new Set()
    // Guards against an older save response (or an in-flight 60s refresh)
    // overwriting a newer optimistic setting.
    let floatSaveSeq = 0
    let floatPendingSaves = 0

    function emitFloat() {
      for (const listener of [...floatListeners]) {
        try { listener() } catch { /* one bad subscriber must not break the rest */ }
      }
    }

    function setFloat(patch) {
      floatSnapshot = { ...floatSnapshot, ...patch }
      if (patch.settings) writeLocalJSON(FLOAT_CACHE_KEY, patch.settings)
      emitFloat()
    }

    function useFloatSnapshot() {
      const [, force] = useState(0)
      useEffect(() => {
        const listener = () => force((value) => value + 1)
        floatListeners.add(listener)
        return () => { floatListeners.delete(listener) }
      }, [])
      return floatSnapshot
    }

    /** Re-render the avatar/settings copy when the active locale changes. */
    function useFloatLocale() {
      const [, force] = useState(0)
      useEffect(() => {
        let unsubscribe = () => {}
        try {
          unsubscribe = floatLocaleSubscribe(() => force((value) => value + 1))
        } catch {
          // Locale subscription is optional; the fallback copy still renders.
        }
        return () => {
          try { unsubscribe() } catch { /* ignore */ }
        }
      }, [])
    }

    /**
     * Small fetch helper for the avatar routes. A hung request must not leave
     * `floatPendingSaves` pinned forever (which would disable the Settings
     * retry button), so every avatar request gets a bounded lifetime.
     */
    async function floatFetchJSON(url, options = {}, timeoutMs = 8000) {
      const controller = typeof AbortController === 'undefined' ? undefined : new AbortController()
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller?.signal,
        })
        return await response.json()
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    async function loadFloatData() {
      // A save owns the optimistic state until its response lands.
      if (floatPendingSaves > 0) return
      const seqAtStart = floatSaveSeq
      try {
        const selected = readSelectedMember()
        const query = selected ? `?member=${encodeURIComponent(selected)}` : ''
        const body = await floatFetchJSON(`${API}/float${query}`, { credentials: 'same-origin' })
        // A save started while this GET was in flight: its optimistic state is
        // newer than the snapshot we just received.
        if (seqAtStart !== floatSaveSeq || floatPendingSaves > 0) return
        if (!body?.ok) {
          setFloat({ error: body?.error ?? floatTranslate('settings.readError') })
          return
        }
        setFloat({
          settings: {
            ...FLOAT_DEFAULT_SETTINGS,
            ...(body.settings ?? {}),
            position: { ...FLOAT_DEFAULT_SETTINGS.position, ...(body.settings?.position ?? {}) },
          },
          status: body.status ?? null,
          loaded: true,
          error: null,
        })
      } catch (error) {
        if (seqAtStart !== floatSaveSeq || floatPendingSaves > 0) return
        setFloat({ error: String(error?.message ?? error) })
      }
    }

    async function saveFloatSettings(patch) {
      const seq = ++floatSaveSeq
      const stale = () => seq !== floatSaveSeq
      const previous = floatSnapshot.settings
      const next = {
        ...previous,
        ...patch,
        position: { ...previous.position, ...(patch.position ?? {}) },
      }
      setFloat({ settings: next, error: null })
      floatPendingSaves += 1
      try {
        const body = await floatFetchJSON(`${API}/float/settings`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ settings: patch }),
        }, 10000)
        if (!body?.ok) throw new Error(body?.error ?? floatTranslate('settings.save.error'))
        if (stale()) return { ok: true, stale: true }
        setFloat({
          settings: {
            ...FLOAT_DEFAULT_SETTINGS,
            ...(body.settings ?? {}),
            position: { ...FLOAT_DEFAULT_SETTINGS.position, ...(body.settings?.position ?? {}) },
          },
          error: null,
        })
        return { ok: true }
      } catch (error) {
        if (!stale()) setFloat({ settings: previous })
        return { ok: false, error: String(error?.message ?? error), stale: stale() }
      } finally {
        floatPendingSaves = Math.max(0, floatPendingSaves - 1)
      }
    }

    const floatClamp = (value, min, max) => Math.min(max, Math.max(min, value))

    function floatPlacement(position, size, viewport) {
      const margin = 10
      const maxX = Math.max(1, viewport.w - size - margin * 2)
      const maxY = Math.max(1, viewport.h - size - margin * 2)
      const x = floatClamp(Number(position?.x ?? FLOAT_DEFAULT_SETTINGS.position.x), 0, 1)
      const y = floatClamp(Number(position?.y ?? FLOAT_DEFAULT_SETTINGS.position.y), 0, 1)
      return {
        left: margin + Math.round(x * maxX),
        top: margin + Math.round(y * maxY),
        margin,
        maxX,
        maxY,
      }
    }

    /** Place a card/bubble beside the avatar, flipping above near the bottom. */
    function floatPopoverStyle(anchor, size, viewport, width) {
      const gap = 10
      const placeAbove = anchor.top > viewport.h * 0.5
      const left = floatClamp(
        anchor.left + size / 2 - width / 2,
        10,
        Math.max(10, viewport.w - width - 10),
      )
      if (placeAbove) {
        return {
          left,
          width,
          bottom: Math.max(10, viewport.h - anchor.top + gap),
          maxHeight: Math.max(140, anchor.top - gap - 12),
        }
      }
      return {
        left,
        width,
        top: Math.min(viewport.h - 12, anchor.top + size + gap),
        maxHeight: Math.max(140, viewport.h - (anchor.top + size + gap) - 12),
      }
    }

    function floatInQuietHours(settings, date = new Date()) {
      if (!settings.quietHoursEnabled) return false
      const minutes = date.getHours() * 60 + date.getMinutes()
      const parse = (value) => {
        const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ''))
        return match ? Number(match[1]) * 60 + Number(match[2]) : null
      }
      const start = parse(settings.quietStart)
      const end = parse(settings.quietEnd)
      if (start === null || end === null || start === end) return false
      return start < end
        ? minutes >= start && minutes < end
        : minutes >= start || minutes < end
    }

    let floatTipCursor = 0

    /** Minutes since a stored `YYYY-MM-DD HH:mm` timestamp; Infinity if absent. */
    function floatMinutesSince(value, now = Date.now()) {
      if (!value) return Infinity
      const time = new Date(String(value).replace(' ', 'T')).getTime()
      return Number.isFinite(time) ? (now - time) / 60000 : Infinity
    }

    /**
     * Goal-aware reminder choice. It reads record counts, active goal codes and
     * last water/training timestamps; it never reads a measurement value, a
     * condition tag, or a target gap, so a reminder cannot become a diagnosis or
     * medication cue. Lean-muscle alternates water and movement reminders;
     * metabolic alternates measure / meal / activity / sleep prompts.
     */
    function floatReminder(status) {
      if (!status || status.memberCount === 0) return 'tip.noMembers'
      const counts = status.counts ?? {}
      const goals = status.activeGoals ?? []
      const lean = goals.some((goal) => goal.code === 'lean_muscle')
      const metabolic = goals.some((goal) => goal.code === 'metabolic')
      const hour = new Date().getHours()

      if (lean) {
        const waterDue = !counts.water || floatMinutesSince(status.lastWaterAt) >= 90
        const trainingDue = !counts.training || floatMinutesSince(status.lastTrainingAt) >= 36 * 60
        // Both due: alternate so the user hears about water and the 大练 account
        // rather than only one of them. Neither is a training prescription.
        if (waterDue && trainingDue) {
          return floatTipCursor++ % 2 === 0 ? 'tip.leanWater' : 'tip.leanTraining'
        }
        if (waterDue) return 'tip.leanWater'
        if (trainingDue && hour >= 7 && hour < 22) return 'tip.leanTraining'
        const keys = ['tip.leanWater', 'tip.leanMove', 'tip.leanTraining']
        return keys[floatTipCursor++ % keys.length]
      }

      if (metabolic) {
        if (!counts.sbp && !counts.dbp && hour >= 6 && hour < 22) return 'tip.measure'
        if (!(status.todayMealCount > 0) && hour >= 6 && hour < 22) return 'tip.meal'
        if (!counts.activity && hour >= 8 && hour < 21) return 'tip.move'
        if (!counts.sleep && hour >= 20) return 'tip.sleepRecord'
      }

      if ((status.todayRecordCount ?? 0) === 0) return 'tip.record'
      if (floatTipCursor % 5 === 4) {
        floatTipCursor += 1
        return 'tip.recorded'
      }
      const tips = ['tip.water', 'tip.stretch', 'tip.eyes', 'tip.breath']
      const key = tips[floatTipCursor % tips.length]
      floatTipCursor += 1
      return key
    }

    function floatNotify(text, name) {
      try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        const notice = new Notification(floatText('notification.title', { name }), {
          body: text,
          tag: 'dsh-health-float',
          silent: true,
        })
        setTimeout(() => { try { notice.close() } catch { /* ignore */ } }, 9000)
      } catch {
        // Notifications are optional; a failure never affects the avatar.
      }
    }

    /**
     * Keep one bad render from taking down the frame-wide overlay or the
     * Settings page. The avatar simply disappears; the settings page says it
     * could not load instead of blanking the whole panel.
     */
    class FloatBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        console.error('[dsh-health] floating avatar error', error, info)
      }

      render() {
        if (this.state.error) return this.props.fallback ?? null
        return this.props.children
      }
    }

    /**
     * Original mascot artwork: a jade "health bean" with a heart badge and a
     * leaf sprout. Fixed colors belong to the artwork; surrounding surfaces use
     * the host theme tokens.
     */
    function HealthAvatar({ mood = 'idle', variant = 'bean' }) {
      const sleeping = mood === 'sleep'
      const reminding = mood === 'remind'
      const palette = FLOAT_AVATAR_PALETTES[variant] ?? FLOAT_AVATAR_PALETTES.bean
      const [ids] = useState(() => {
        floatAvatarSeq += 1
        const suffix = `dshhFloat${floatAvatarSeq}`
        return { body: `${suffix}Body`, leaf: `${suffix}Leaf`, glow: `${suffix}Glow` }
      })
      return h('svg', { viewBox: '0 0 96 96', className: 'dshh-float-art', 'aria-hidden': true },
        h('defs', {},
          h('linearGradient', { id: ids.body, x1: '0', y1: '0', x2: '1', y2: '1' },
            h('stop', { offset: '0%', stopColor: palette.body[0] }),
            h('stop', { offset: '58%', stopColor: palette.body[1] }),
            h('stop', { offset: '100%', stopColor: palette.body[2] })),
          palette.leaf && h('linearGradient', { id: ids.leaf, x1: '0', y1: '1', x2: '1', y2: '0' },
            h('stop', { offset: '0%', stopColor: palette.leaf[0] }),
            h('stop', { offset: '100%', stopColor: palette.leaf[1] })),
          h('radialGradient', { id: ids.glow, cx: '50%', cy: '40%', r: '60%' },
            h('stop', { offset: '0%', stopColor: '#ffffff', stopOpacity: '0.55' }),
            h('stop', { offset: '100%', stopColor: '#ffffff', stopOpacity: '0' }))),
        h('ellipse', { cx: '48', cy: '87', rx: '25', ry: '4.5', fill: '#0f172a', opacity: sleeping ? '0.07' : '0.15' }),
        h('g', { className: 'dshh-float-body' },
          palette.rays && h('g', { stroke: '#F59E0B', strokeWidth: '3.2', strokeLinecap: 'round' },
            h('path', { d: 'M48 3 L48 12' }),
            h('path', { d: 'M26 10 L31 17' }),
            h('path', { d: 'M70 10 L65 17' }),
            h('path', { d: 'M12 42 L21 45' }),
            h('path', { d: 'M84 42 L75 45' }),
            h('path', { d: 'M20 22 L26 27' }),
            h('path', { d: 'M76 22 L70 27' })),
          palette.leaf && h(React.Fragment, null,
            h('path', { d: 'M48 23 L48 12', stroke: '#15803D', strokeWidth: '3.2', strokeLinecap: 'round' }),
            h('path', { d: 'M48 17 C40 17 35 12 36 5 C43 5 48 10 48 17 Z', fill: `url(#${ids.leaf})` }),
            h('path', { d: 'M48 14 C56 14 61 9 60 2 C53 2 48 7 48 14 Z', fill: `url(#${ids.leaf})`, opacity: '0.92' })),
          h('path', {
            d: 'M48 22 C65 22 79 34 79 53 C79 71 66 84 48 84 C30 84 17 71 17 53 C17 34 31 22 48 22 Z',
            fill: `url(#${ids.body})`,
            stroke: '#F8FAFC',
            strokeWidth: '2.4',
          }),
          h('ellipse', { cx: '41', cy: '38', rx: '15', ry: '10', fill: `url(#${ids.glow})` }),
          palette.headband && h('g', {},
            h('path', {
              d: 'M24 35 Q48 28 72 35 L71 41 Q48 34 25 41 Z',
              fill: '#DC2626',
              stroke: '#FFFFFF',
              strokeWidth: '1.2',
            }),
            h('path', { d: 'M70 38 L79 33 L78 43 Z', fill: '#DC2626', stroke: '#FFFFFF', strokeWidth: '1.2' })),
          variant === 'muscle' && !sleeping && h('g', { stroke: '#7C2D12', strokeWidth: '2', strokeLinecap: 'round' },
            h('path', { d: 'M30 39 L38 41' }),
            h('path', { d: 'M66 39 L58 41' })),
          sleeping
            ? h('g', { stroke: '#123B37', strokeWidth: '2.6', strokeLinecap: 'round', fill: 'none' },
              h('path', { d: 'M32 46 q4 3 8 0' }),
              h('path', { d: 'M56 46 q4 3 8 0' }))
            : h('g', {},
              h('circle', { cx: '36', cy: '45', r: reminding ? '3.9' : '3.4', fill: '#123B37' }),
              h('circle', { cx: '60', cy: '45', r: reminding ? '3.9' : '3.4', fill: '#123B37' }),
              h('circle', { cx: '37.2', cy: '43.8', r: '1.15', fill: '#FFFFFF' }),
              h('circle', { cx: '61.2', cy: '43.8', r: '1.15', fill: '#FFFFFF' })),
          h('ellipse', { cx: '28.5', cy: '53', rx: '4.2', ry: '2.5', fill: '#FF9F9A', opacity: '0.72' }),
          h('ellipse', { cx: '67.5', cy: '53', rx: '4.2', ry: '2.5', fill: '#FF9F9A', opacity: '0.72' }),
          h('path', { d: 'M43 54 q5 4 10 0', fill: 'none', stroke: '#123B37', strokeWidth: '2.2', strokeLinecap: 'round' }),
          h('path', {
            d: 'M48 79 C48 79 37 71 37 64.5 C37 59.5 43.5 57.5 48 62.5 C52.5 57.5 59 59.5 59 64.5 C59 71 48 79 48 79 Z',
            fill: '#FF6B6B',
            stroke: '#FFFFFF',
            strokeWidth: '1.6',
          }),
          h('path', {
            d: 'M18 57 q-7 1 -9 6',
            fill: 'none',
            stroke: palette.arm,
            strokeWidth: palette.armWidth,
            strokeLinecap: 'round',
          }),
          h('path', {
            d: 'M78 55 q8 -3 9 -9',
            fill: 'none',
            stroke: palette.arm,
            strokeWidth: palette.armWidth,
            strokeLinecap: 'round',
          }),
          sleeping && h('text', { x: '72', y: '26', fontSize: '11', fontWeight: '700', fill: '#94A3B8' }, 'z'),
        ),
      )
    }

    function floatDisplayName(settings) {
      return String(settings?.name ?? '').trim() || FLOAT_DEFAULT_SETTINGS.name
    }

    function floatUsesImage(settings) {
      return Boolean(settings?.avatarImage) || (settings?.avatarStyle ?? 'portrait') === 'portrait'
    }

    /** Render the uploaded image or the portrait when present, otherwise the built-in SVG. */
    function floatAvatarNode(settings, mood) {
      if (settings?.avatarImage) {
        return h('img', {
          className: 'dshh-float-art dshh-float-custom',
          src: settings.avatarImage,
          alt: '',
          draggable: false,
        })
      }
      if ((settings?.avatarStyle ?? 'portrait') === 'portrait') {
        return h('img', {
          className: 'dshh-float-art dshh-float-custom',
          src: AVATAR_ART,
          alt: '',
          draggable: false,
        })
      }
      return h(HealthAvatar, { mood, variant: settings?.avatarStyle ?? 'bean' })
    }

    function HealthFloat() {
      const snapshot = useFloatSnapshot()
      useFloatLocale()
      const settings = snapshot.settings ?? FLOAT_DEFAULT_SETTINGS
      const displayName = floatDisplayName(settings)
      const usingImage = floatUsesImage(settings)
      const size = FLOAT_SIZE_PX[settings.size] ?? FLOAT_SIZE_PX.medium
      const [viewport, setViewport] = useState(() => ({
        w: typeof window === 'undefined' ? 1200 : window.innerWidth,
        h: typeof window === 'undefined' ? 800 : window.innerHeight,
      }))
      const [pos, setPos] = useState(() => ({
        x: Number(settings.position?.x ?? FLOAT_DEFAULT_SETTINGS.position.x),
        y: Number(settings.position?.y ?? FLOAT_DEFAULT_SETTINGS.position.y),
      }))
      const posRef = useRef(pos)
      const [dragging, setDragging] = useState(false)
      const [cardOpen, setCardOpen] = useState(false)
      const [bubble, setBubble] = useState(null)
      const [mood, setMood] = useState('idle')
      const dragRef = useRef(null)
      const clickTimer = useRef(null)
      const bubbleTimer = useRef(null)
      const positionTimer = useRef(null)
      const snoozeUntil = useRef(0)
      const greetedRef = useRef(false)
      const statusRef = useRef(snapshot.status)
      const settingsRef = useRef(settings)
      const cardOpenRef = useRef(cardOpen)
      statusRef.current = snapshot.status
      settingsRef.current = settings
      cardOpenRef.current = cardOpen

      useEffect(() => {
        const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])

      // A reset from the Settings page (or another window) moves the avatar.
      // A stale GET response is discarded by loadFloatData's sequence guard,
      // so this effect can follow every position change while not dragging.
      useEffect(() => {
        if (dragRef.current) return
        const next = {
          x: Number(settings.position?.x ?? FLOAT_DEFAULT_SETTINGS.position.x),
          y: Number(settings.position?.y ?? FLOAT_DEFAULT_SETTINGS.position.y),
        }
        posRef.current = next
        setPos(next)
      }, [settings.position?.x, settings.position?.y])

      // Poll even while the avatar is hidden: another window may re-enable it,
      // and a disabled avatar must not need a page reload to come back.
      useEffect(() => {
        let cancelled = false
        const refresh = () => { if (!cancelled) loadFloatData() }
        refresh()
        const timer = setInterval(refresh, 60000)
        window.addEventListener('dsh-health:changed', refresh)
        return () => {
          cancelled = true
          clearInterval(timer)
          window.removeEventListener('dsh-health:changed', refresh)
        }
      }, [])

      useEffect(() => {
        if (!settings.enabled || !settings.remindersEnabled || greetedRef.current) return undefined
        greetedRef.current = true
        const timer = setTimeout(() => {
          if (cardOpenRef.current) return
          if (floatInQuietHours(settingsRef.current)) return
          showBubble(floatText('tip.greeting', { name: floatDisplayName(settingsRef.current) }))
        }, 3500)
        return () => clearTimeout(timer)
      }, [settings.enabled, settings.remindersEnabled])

      useEffect(() => {
        if (settings.enabled && settings.remindersEnabled && floatInQuietHours(settings)) {
          setMood('sleep')
        } else {
          setMood((current) => (current === 'sleep' ? 'idle' : current))
        }
      }, [settings.enabled, settings.remindersEnabled, settings.quietHoursEnabled, settings.quietStart, settings.quietEnd])

      useEffect(() => {
        if (!settings.enabled || !settings.remindersEnabled) return undefined
        const minutes = Math.max(5, Number(settings.intervalMinutes) || 45)
        const timer = setInterval(() => {
          if (Date.now() < snoozeUntil.current) return
          if (cardOpenRef.current) return
          if (floatInQuietHours(settingsRef.current)) {
            setMood('sleep')
            return
          }
          const text = floatTranslate(floatReminder(statusRef.current))
          showBubble(text)
          if (settingsRef.current.desktopNotifications) {
            floatNotify(text, floatDisplayName(settingsRef.current))
          }
        }, minutes * 60000)
        return () => clearInterval(timer)
      }, [
        settings.enabled,
        settings.remindersEnabled,
        settings.intervalMinutes,
        settings.quietHoursEnabled,
        settings.quietStart,
        settings.quietEnd,
      ])

      useEffect(() => () => {
        if (clickTimer.current) clearTimeout(clickTimer.current)
        if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
        if (positionTimer.current) clearTimeout(positionTimer.current)
      }, [])

      function showBubble(text) {
        setCardOpen(false)
        setBubble({ text })
        setMood('remind')
        if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
        const seconds = Math.max(0, Number(settingsRef.current.bubbleSeconds) || 0)
        if (seconds > 0) {
          bubbleTimer.current = setTimeout(() => {
            setBubble(null)
            setMood('idle')
          }, seconds * 1000)
        }
      }

      function dismissBubble() {
        if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
        setBubble(null)
        setMood('idle')
      }

      function persistPosition(delay = 350) {
        if (positionTimer.current) clearTimeout(positionTimer.current)
        positionTimer.current = setTimeout(() => {
          positionTimer.current = null
          saveFloatSettings({ position: posRef.current })
        }, delay)
      }

      function beginDrag(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        event.preventDefault()
        // A pending single-click must not fire after the user starts dragging.
        if (clickTimer.current) {
          clearTimeout(clickTimer.current)
          clickTimer.current = null
        }
        const base = floatPlacement(posRef.current, size, viewport)
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          baseLeft: base.left,
          baseTop: base.top,
          margin: base.margin,
          moved: false,
          size,
          viewport,
        }
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* ignore */ }
        setDragging(true)
      }

      function moveDrag(event) {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true
        if (!drag.moved) return
        const maxX = Math.max(1, drag.viewport.w - drag.size - drag.margin * 2)
        const maxY = Math.max(1, drag.viewport.h - drag.size - drag.margin * 2)
        const next = {
          x: floatClamp((drag.baseLeft + dx - drag.margin) / maxX, 0, 1),
          y: floatClamp((drag.baseTop + dy - drag.margin) / maxY, 0, 1),
        }
        posRef.current = next
        setPos(next)
        setCardOpen(false)
      }

      function endDrag(event) {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        dragRef.current = null
        setDragging(false)
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
        if (drag.moved) {
          // Persist immediately: if the user disables/hides the avatar right
          // after a drag, the drag result must still reach the Host.
          if (clickTimer.current) {
            clearTimeout(clickTimer.current)
            clickTimer.current = null
          }
          saveFloatSettings({ position: posRef.current })
          return
        }
        // Distinguish a click from a double-click: the 300ms timer is cancelled
        // by openFromAvatar() when the second click arrives.
        if (clickTimer.current) return
        clickTimer.current = setTimeout(() => {
          clickTimer.current = null
          dismissBubble()
          setCardOpen((open) => !open)
        }, 300)
      }

      function cancelDrag() {
        dragRef.current = null
        setDragging(false)
      }

      function openFromAvatar() {
        if (clickTimer.current) {
          clearTimeout(clickTimer.current)
          clickTimer.current = null
        }
        dismissBubble()
        setCardOpen(false)
        openHealthPanel()
      }

      function onAvatarKeyDown(event) {
        if (event.key === 'Escape') {
          setCardOpen(false)
          dismissBubble()
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          dismissBubble()
          setCardOpen((open) => !open)
          return
        }
        const step = 0.03
        let dx = 0
        let dy = 0
        if (event.key === 'ArrowLeft') dx = -step
        else if (event.key === 'ArrowRight') dx = step
        else if (event.key === 'ArrowUp') dy = -step
        else if (event.key === 'ArrowDown') dy = step
        if (dx === 0 && dy === 0) return
        event.preventDefault()
        const next = {
          x: floatClamp(posRef.current.x + dx, 0, 1),
          y: floatClamp(posRef.current.y + dy, 0, 1),
        }
        posRef.current = next
        setPos(next)
        persistPosition()
      }

      if (!settings.enabled) return null

      const status = snapshot.status
      const memberName = status?.member?.name
        ?? status?.primaryMember?.name
        ?? floatTranslate('status.memberFallback')
      let statusText = floatTranslate('status.unknown')
      if (status) {
        if (status.memberCount === 0) {
          statusText = floatTranslate('status.noMembers')
        } else {
          statusText = floatText('status.today', {
            name: memberName,
            count: status.todayRecordCount ?? 0,
          })
          const goalCount = (status.activeGoals ?? []).length
          if (goalCount > 0) statusText += ` · ${floatText('status.goals', { count: goalCount })}`
        }
      }

      const dotColor = !status || status.memberCount === 0
        ? 'var(--dsw-alias-state-idle-primary)'
        : (status.todayRecordCount ?? 0) === 0
          ? 'var(--dsw-alias-state-idle-primary)'
          : 'var(--dsw-alias-brand-primary)'

      const placement = floatPlacement(pos, size, viewport)
      const cardWidth = Math.min(300, Math.max(160, viewport.w - 24))
      const bubbleWidth = Math.min(270, Math.max(150, viewport.w - 24))

      return h(React.Fragment, null,
        h('style', { 'data-dsh-health-float': 'styles' }, FLOAT_CSS),
        h('div', { className: 'dshh-float-root' },
          h('div', {
            className: 'dshh-float'
              + (dragging ? ' is-dragging' : '')
              + (mood === 'sleep' ? ' is-sleeping' : ''),
            style: { left: placement.left, top: placement.top, width: size, height: size },
            role: 'button',
            tabIndex: 0,
            'aria-label': floatText('avatar.label', { name: displayName }),
            'aria-expanded': cardOpen ? 'true' : 'false',
            'aria-haspopup': 'dialog',
            title: floatText('avatar.label', { name: displayName }),
            onPointerDown: beginDrag,
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: cancelDrag,
            onDoubleClick: openFromAvatar,
            onKeyDown: onAvatarKeyDown,
          },
            h('div', { className: 'dshh-float-inner' }, floatAvatarNode(settings, mood)),
            h('span', { className: 'dshh-float-dot', style: { background: dotColor }, title: statusText }),
            mood === 'remind' && h('span', { className: 'dshh-float-bang', 'aria-hidden': true }, '!'),
            mood === 'sleep' && usingImage && h('span', {
              className: 'dshh-float-sleep',
              'aria-hidden': true,
            }, 'z'),
          ),
          cardOpen && h('div', {
          className: 'dshh-float-card',
          style: floatPopoverStyle(placement, size, viewport, cardWidth),
          role: 'dialog',
          'aria-label': floatText('card.title', { name: displayName }),
          onPointerDown: (event) => event.stopPropagation(),
        },
          h('div', { className: 'dshh-float-card-head' },
            h('div', { className: 'dshh-float-card-avatar' }, floatAvatarNode(settings, 'idle')),
            h('div', { className: 'dshh-float-card-title' }, floatText('card.title', { name: displayName })),
            h('button', {
              type: 'button',
              className: 'dshh-float-iconbtn',
              onClick: () => setCardOpen(false),
              'aria-label': floatTranslate('card.close'),
            }, '×')),
          h('div', { className: 'dshh-float-card-status' }, statusText),
          h('div', { className: 'dshh-float-metrics' },
            h('div', { className: 'dshh-float-metrics-head' },
              h('span', { className: 'dshh-float-metrics-title' }, floatText('card.metricsTitle', { name: memberName })),
              h('span', { className: 'dshh-float-metrics-note' }, floatTranslate('card.metricsNote'))),
            (status?.keyMetrics ?? []).length > 0
              ? status.keyMetrics.map((metric) => h('div', {
                key: metric.code,
                className: 'dshh-float-metric',
              },
                h('span', { className: 'dshh-float-metric-name' }, metric.name),
                h('span', { className: 'dshh-float-metric-value' },
                  metric.display,
                  metric.unit ? h('small', null, metric.unit) : null),
                h('span', { className: 'dshh-float-metric-meta' },
                  [metric.bandLabel, fmtDay(metric.measuredAt)].filter(Boolean).join(' · '))))
              : h('div', { className: 'dshh-float-metrics-empty' }, floatText('card.noMetrics', { name: memberName }))),
          h('div', { className: 'dshh-float-card-text' }, floatTranslate('card.tip')),
          h('div', { className: 'dshh-float-card-actions' },
            h('button', {
              type: 'button',
              className: 'dshh-btn dshh-btn-primary',
              onClick: () => { setCardOpen(false); openHealthPanel() },
            }, floatTranslate('card.open')),
            h('button', {
              type: 'button',
              className: 'dshh-btn',
              onClick: () => {
                snoozeUntil.current = Date.now() + 60 * 60 * 1000
                showBubble(floatTranslate('tip.snoozed'))
              },
            }, floatTranslate('card.snooze'))),
          h('div', { className: 'dshh-float-card-hint' }, floatTranslate('card.configHint')),
        ),
        bubble && h('div', {
          className: 'dshh-float-bubble',
          style: floatPopoverStyle(placement, size, viewport, bubbleWidth),
          role: 'status',
          onPointerDown: (event) => event.stopPropagation(),
        },
          h('div', { className: 'dshh-float-bubble-text' }, bubble.text),
          h('button', {
            type: 'button',
            className: 'dshh-float-iconbtn',
            onClick: dismissBubble,
            'aria-label': floatTranslate('bubble.close'),
          }, '×')),
        ),
      )
    }

    // ------------------------------------------------------- float settings
    // A dedicated `settings.section`, so DSH Settings is the one place that
    // configures the avatar; the page is independent from the health panel.

    function FloatSwitch({ checked, onChange, label }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        className: 'dshh-switch' + (checked ? ' is-on' : ''),
        onClick: () => onChange(!checked),
      }, h('span', { className: 'dshh-switch-thumb' }))
    }

    function FloatRow({ title, desc, children }) {
      return h('div', { className: 'dshh-set-row' },
        h('div', { className: 'dshh-set-copy' },
          h('div', { className: 'dshh-set-label' }, title),
          desc && h('div', { className: 'dshh-set-desc' }, desc)),
        h('div', { className: 'dshh-set-control' }, children))
    }

    function FloatSettingsSection() {
      const snapshot = useFloatSnapshot()
      useFloatLocale()
      const settings = snapshot.settings ?? FLOAT_DEFAULT_SETTINGS
      const displayName = floatDisplayName(settings)
      const [nameDraft, setNameDraft] = useState(displayName)
      const [saveState, setSaveState] = useState('idle')
      const [message, setMessage] = useState('')
      const saveTimer = useRef(null)
      const messageTimer = useRef(null)
      const nameEditing = useRef(false)
      const fileInput = useRef(null)

      useEffect(() => {
        loadFloatData()
      }, [])

      useEffect(() => {
        if (!nameEditing.current) setNameDraft(displayName)
      }, [displayName])

      useEffect(() => () => {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        if (messageTimer.current) clearTimeout(messageTimer.current)
      }, [])

      function flashMessage(text) {
        setMessage(String(text ?? ''))
        if (messageTimer.current) clearTimeout(messageTimer.current)
        messageTimer.current = setTimeout(() => setMessage(''), 4200)
      }

      function apply(patch, onSuccess) {
        setSaveState('saving')
        saveFloatSettings(patch).then((result) => {
          if (result.ok) {
            setSaveState('saved')
            if (saveTimer.current) clearTimeout(saveTimer.current)
            saveTimer.current = setTimeout(() => setSaveState('idle'), 1800)
            if (typeof onSuccess === 'function' && !result.stale) onSuccess()
          } else if (!result.stale) {
            setSaveState('error')
            flashMessage(result.error ?? floatTranslate('settings.save.error'))
          }
        })
      }

      async function toggleNotifications(next) {
        if (!next) {
          apply({ desktopNotifications: false })
          return
        }
        if (typeof Notification === 'undefined') {
          flashMessage(floatTranslate('settings.notifyUnsupported'))
          return
        }
        let permission = Notification.permission
        if (permission === 'default') {
          try { permission = await Notification.requestPermission() } catch { permission = 'denied' }
        }
        if (permission !== 'granted') {
          flashMessage(floatTranslate('settings.notifyDenied'))
          return
        }
        apply({ desktopNotifications: true })
      }

      function resetPosition() {
        apply({ position: { ...FLOAT_DEFAULT_SETTINGS.position } }, () => {
          flashMessage(floatTranslate('settings.positionReset'))
        })
      }

      function commitName() {
        const next = Array.from(
          String(nameDraft ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim(),
        ).slice(0, 24).join('') || FLOAT_DEFAULT_SETTINGS.name
        setNameDraft(next)
        // Compare against the live store so blur + clicking the Save button
        // cannot submit the same name twice.
        if (next !== floatDisplayName(floatSnapshot.settings)) apply({ name: next })
      }

      function handleAvatarFile(event) {
        const input = event.currentTarget
        const file = input.files?.[0]
        // Reset first so choosing the same file again still fires `change`.
        input.value = ''
        if (!file) return
        if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) {
          flashMessage(floatTranslate('settings.avatarBadType'))
          return
        }
        if (file.size > FLOAT_AVATAR_MAX_BYTES) {
          flashMessage(floatTranslate('settings.avatarTooLarge'))
          return
        }
        if (typeof FileReader === 'undefined') {
          flashMessage(floatTranslate('settings.avatarReadError'))
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : ''
          if (!result
            || result.length > FLOAT_AVATAR_MAX_LENGTH
            || !/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(result)) {
            flashMessage(floatTranslate('settings.avatarReadError'))
            return
          }
          apply({ avatarImage: result })
        }
        reader.onerror = () => flashMessage(floatTranslate('settings.avatarReadError'))
        reader.readAsDataURL(file)
      }

      const intervalOptions = [...new Set([
        ...FLOAT_INTERVALS,
        Number(settings.intervalMinutes) || 45,
      ])].sort((a, b) => a - b)
      const bubbleOptions = [...new Set([
        ...FLOAT_BUBBLE_SECONDS,
        Number(settings.bubbleSeconds) || 0,
      ])].sort((a, b) => a - b)

      const saveLabel = saveState === 'saving'
        ? floatTranslate('settings.save.saving')
        : saveState === 'saved'
          ? floatTranslate('settings.save.saved')
          : saveState === 'error'
            ? floatTranslate('settings.save.error')
            : ''
      const saveClass = 'dshh-set-save'
        + (saveState === 'saved' ? ' is-saved' : '')
        + (saveState === 'error' ? ' is-error' : '')
      const avatarPreview = settings.avatarImage
        ? h('img', { className: 'dshh-set-avatarimg', src: settings.avatarImage, alt: '' })
        : settings.avatarStyle === 'portrait'
          ? h('img', { className: 'dshh-set-avatarimg', src: AVATAR_ART, alt: '' })
          : h('div', { className: 'dshh-set-avatarimg' },
            h(HealthAvatar, { mood: 'idle', variant: settings.avatarStyle }))

      return h('div', { className: 'dshh-set' },
        h(Styles),
        h('style', { 'data-dsh-health-float': 'styles' }, FLOAT_CSS),
        h('div', { className: 'dshh-set-head' },
          h('div', null,
            h('h1', { className: 'dshh-set-title' }, floatTranslate('settings.title')),
            h('p', { className: 'dshh-set-sub' }, floatText('settings.subtitle', { name: displayName }))),
          h('div', { className: saveClass, role: 'status', 'aria-live': 'polite' }, saveLabel)),
        !snapshot.loaded && !snapshot.error
          && h('div', { className: 'dshh-set-desc' }, floatTranslate('settings.loading')),
        (snapshot.error || message) && h('div', { className: 'dshh-set-error' },
          snapshot.error && h('div', null,
            `${floatTranslate('settings.readError')}：${snapshot.error}`),
          message && h('div', null, message),
          snapshot.error && h('button', {
            type: 'button',
            className: 'dshh-btn dshh-set-reset',
            style: { marginTop: 8 },
            onClick: () => loadFloatData(),
          }, floatTranslate('settings.retry'))),

        h('section', { className: 'dshh-set-card' },
          h('div', { className: 'dshh-set-cardhead' }, floatTranslate('settings.identity')),
          h(FloatRow, {
            title: floatTranslate('settings.name'),
            desc: floatTranslate('settings.nameHint'),
          }, h('input', {
            className: 'dshh-set-input',
            type: 'text',
            value: nameDraft,
            maxLength: 24,
            placeholder: FLOAT_DEFAULT_SETTINGS.name,
            'aria-label': floatTranslate('settings.name'),
            onFocus: () => { nameEditing.current = true },
            onChange: (event) => setNameDraft(event.target.value),
            onBlur: () => {
              nameEditing.current = false
              commitName()
            },
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            },
          }), h('button', {
            type: 'button',
            className: 'dshh-btn dshh-set-reset',
            onClick: commitName,
          }, floatTranslate('settings.nameSave'))),
          h('div', { className: 'dshh-set-row dshh-set-avatar-row' },
            h('div', { className: 'dshh-set-avatarpreview' }, avatarPreview),
            h('div', { className: 'dshh-set-avatarmain' },
              h('div', { className: 'dshh-set-label' }, floatTranslate('settings.avatarStyle')),
              h('div', {
                className: 'dshh-set-seg',
                role: 'group',
                'aria-label': floatTranslate('settings.avatarStyle'),
              }, FLOAT_AVATAR_STYLES.map((code) => h('button', {
                key: code,
                type: 'button',
                className: 'dshh-set-segbtn'
                  + (!settings.avatarImage && settings.avatarStyle === code ? ' is-active' : ''),
                'aria-pressed': !settings.avatarImage && settings.avatarStyle === code,
                onClick: () => apply({ avatarStyle: code, avatarImage: null }),
              }, floatTranslate(`settings.avatarStyle.${code}`)))),
              h('div', { className: 'dshh-set-avataractions' },
                h('button', {
                  type: 'button',
                  className: 'dshh-btn',
                  onClick: () => fileInput.current?.click(),
                }, floatTranslate('settings.avatarUpload')),
                settings.avatarImage && h('button', {
                  type: 'button',
                  className: 'dshh-btn',
                  onClick: () => apply({ avatarImage: null }),
                }, floatTranslate('settings.avatarRemove'))),
              h('div', { className: 'dshh-set-desc' }, floatTranslate('settings.avatarHint')),
              settings.avatarImage && h('div', { className: 'dshh-set-avatartag' },
                floatTranslate('settings.avatarCustom')),
              h('input', {
                ref: fileInput,
                type: 'file',
                accept: 'image/png,image/jpeg,image/webp,image/gif',
                style: { display: 'none' },
                onChange: handleAvatarFile,
              }),
            )),
        ),

        h('section', { className: 'dshh-set-card' },
          h('div', { className: 'dshh-set-cardhead' }, floatTranslate('settings.appearance')),
          h(FloatRow, {
            title: floatText('settings.show', { name: displayName }),
            desc: floatText('settings.showHint', { name: displayName }),
          }, h(FloatSwitch, {
            checked: settings.enabled,
            onChange: (next) => apply({ enabled: next }),
            label: floatText('settings.show', { name: displayName }),
          })),
          h(FloatRow, {
            title: floatTranslate('settings.size'),
            desc: floatText('settings.sizeHint', { name: displayName }),
          }, h('div', { className: 'dshh-set-seg', role: 'group', 'aria-label': floatTranslate('settings.size') },
            FLOAT_SIZE_CODES.map((code) => h('button', {
              key: code,
              type: 'button',
              className: 'dshh-set-segbtn' + (settings.size === code ? ' is-active' : ''),
              'aria-pressed': settings.size === code,
              onClick: () => apply({ size: code }),
            }, floatTranslate(`settings.size.${code}`))))),
          h(FloatRow, {
            title: floatTranslate('settings.position'),
            desc: floatText('settings.positionHint', { name: displayName }),
          }, h('button', {
            type: 'button',
            className: 'dshh-btn dshh-set-reset',
            onClick: resetPosition,
          }, floatTranslate('settings.resetPosition')))),

        h('section', { className: 'dshh-set-card' },
          h('div', { className: 'dshh-set-cardhead' }, floatTranslate('settings.reminders')),
          h(FloatRow, {
            title: floatTranslate('settings.remindersEnabled'),
            desc: floatTranslate('settings.remindersHint'),
          }, h(FloatSwitch, {
            checked: settings.remindersEnabled,
            onChange: (next) => apply({ remindersEnabled: next }),
            label: floatTranslate('settings.remindersEnabled'),
          })),
          h(FloatRow, {
            title: floatTranslate('settings.interval'),
            desc: floatTranslate('settings.intervalHint'),
          }, h('select', {
            className: 'dshh-set-select',
            value: String(settings.intervalMinutes),
            disabled: !settings.remindersEnabled,
            'aria-label': floatTranslate('settings.interval'),
            onChange: (event) => apply({ intervalMinutes: Number(event.target.value) }),
          }, intervalOptions.map((minutes) => h('option', { key: minutes, value: String(minutes) },
            floatText('settings.minutes', { n: minutes }))))),
          h(FloatRow, {
            title: floatTranslate('settings.bubble'),
            desc: floatTranslate('settings.bubbleHint'),
          }, h('select', {
            className: 'dshh-set-select',
            value: String(settings.bubbleSeconds),
            disabled: !settings.remindersEnabled,
            'aria-label': floatTranslate('settings.bubble'),
            onChange: (event) => apply({ bubbleSeconds: Number(event.target.value) }),
          }, bubbleOptions.map((seconds) => h('option', { key: seconds, value: String(seconds) },
            seconds === 0
              ? floatTranslate('settings.bubble.never')
              : floatText('settings.seconds', { n: seconds }))))),
          h(FloatRow, {
            title: floatTranslate('settings.notify'),
            desc: floatTranslate('settings.notifyHint'),
          }, h(FloatSwitch, {
            checked: settings.desktopNotifications,
            onChange: toggleNotifications,
            label: floatTranslate('settings.notify'),
          }))),

        h('section', { className: 'dshh-set-card' },
          h('div', { className: 'dshh-set-cardhead' }, floatTranslate('settings.quiet')),
          h(FloatRow, {
            title: floatTranslate('settings.quietEnabled'),
            desc: floatText('settings.quietHint', { name: displayName }),
          }, h(FloatSwitch, {
            checked: settings.quietHoursEnabled,
            onChange: (next) => apply({ quietHoursEnabled: next }),
            label: floatTranslate('settings.quietEnabled'),
          })),
          h(FloatRow, {
            title: floatTranslate('settings.quietWindow'),
          }, h('div', { className: 'dshh-set-times' },
            h('span', null, floatTranslate('settings.quietStart')),
            h('input', {
              type: 'time',
              className: 'dshh-set-time',
              value: settings.quietStart,
              disabled: !settings.quietHoursEnabled,
              'aria-label': floatTranslate('settings.quietStart'),
              onChange: (event) => {
                if (event.target.value) apply({ quietStart: event.target.value })
              },
            }),
            h('span', null, '—'),
            h('span', null, floatTranslate('settings.quietEnd')),
            h('input', {
              type: 'time',
              className: 'dshh-set-time',
              value: settings.quietEnd,
              disabled: !settings.quietHoursEnabled,
              'aria-label': floatTranslate('settings.quietEnd'),
              onChange: (event) => {
                if (event.target.value) apply({ quietEnd: event.target.value })
              },
            })))),

        h('p', { className: 'dshh-set-note' }, floatText('settings.disclaimer', { name: displayName })),
      )
    }

    function SafeHealthFloat() {
      return h(FloatBoundary, null, h(HealthFloat))
    }

    function SafeFloatSettingsSection() {
      return h(FloatBoundary, {
        fallback: h('div', { className: 'dshh-set' },
          h(Styles),
          h('style', { 'data-dsh-health-float': 'styles' }, FLOAT_CSS),
          h('div', { className: 'dshh-set-error' }, floatTranslate('settings.readError'))),
      }, h(FloatSettingsSection))
    }

    // ------------------------------------------------------------- register

    return {
      inject: ['slots', 'layout', 'locale'],
      apply(ctx) {
        // Register the avatar's own copy so the label thunk follows a locale
        // switch and the page is readable in both shipped languages.
        ctx.effect(() => {
          let dispose = () => {}
          try {
            dispose = ctx.locale.register('dsh-health-float', {
              zh: FLOAT_I18N.zh,
              en: FLOAT_I18N.en,
            })
            floatTranslate = ctx.locale.bind('dsh-health-float')
            floatLocaleSubscribe = (listener) => ctx.locale.subscribe(listener)
          } catch (error) {
            console.warn('[dsh-health] floating avatar locale registration failed', error)
          }
          return () => {
            try { dispose() } catch { /* ignore */ }
          }
        })

        openHealthPanel = () => {
          try {
            ctx.layout.selectPanel('dsh-health')
          } catch (error) {
            console.warn('[dsh-health] cannot open the health panel', error)
          }
        }

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'dsh-health', order: 20, label: () => '健康管理' },
            HealthIcon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'dsh-health' }, SafeHealthPanel),
        )
        // Frame-wide floating layer: the avatar is draggable and click-through
        // everywhere else, so it never blocks the host UI.
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'dsh-health-float', order: 30 },
            SafeHealthFloat,
          ),
        )
        // Dedicated DSH Settings page (show/hide, reminders, quiet hours).
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'dsh-health-float',
              order: 55,
              label: () => floatTranslate('settings.title'),
              locale: 'dsh-health-float',
            },
            SafeFloatSettingsSection,
          ),
        )
      },
    }
  },
})
