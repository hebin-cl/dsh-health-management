/**
 * Curated demonstration data for the Discover venue pilot.
 *
 * Region: 杭州市余杭区. Every entry keeps its public source and source date;
 * hours/fees are copied from that source when available and otherwise marked
 * as "以现场为准". This is a data pilot, not a live venue database.
 *
 * Sources:
 * - 杭州市文化广电旅游局 / 余杭文旅 (2026-02-26):
 *   https://wgly.hangzhou.gov.cn/cn/xwdt/art/2026/art_d0c3e4131b634e008b72e4b5e900fd0b.html
 * - 余杭发布 / 澎湃政务 (2025-04-02):
 *   https://thirdpage.thepaper.cn/h5/jrtt/30559949
 * - 电话邦公开目录 for the community gym (accessed 2026-11):
 *   https://www.dianhua.cn/dt/3aeb5c96a214450394ea710e6b456cb3/944aee0c435e2476197717722cb4ca06
 */

export const VENUE_REGION = {
  id: 'hangzhou-yuhang',
  name: '杭州市余杭区',
  shortName: '余杭区',
  pilot: true,
  updatedAt: '2026-11-13',
  note: '余杭区试点：公开信息整理，开放时间、收费与入场规则可能调整，以现场/官方最新公告为准。',
  sources: [
    {
      label: '杭州市文化广电旅游局 · 余杭文旅（2026-02-26）',
      url: 'https://wgly.hangzhou.gov.cn/cn/xwdt/art/2026/art_d0c3e4131b634e008b72e4b5e900fd0b.html',
    },
    {
      label: '余杭发布 · 澎湃政务（2025-04-02）',
      url: 'https://thirdpage.thepaper.cn/h5/jrtt/30559949',
    },
    {
      label: '电话邦公开目录（访问于 2026-11）',
      url: 'https://www.dianhua.cn/dt/3aeb5c96a214450394ea710e6b456cb3/944aee0c435e2476197717722cb4ca06',
    },
  ],
}

const OFFICIAL_SOURCE = {
  name: '杭州市文化广电旅游局 · 余杭文旅',
  url: 'https://wgly.hangzhou.gov.cn/cn/xwdt/art/2026/art_d0c3e4131b634e008b72e4b5e900fd0b.html',
  date: '2026-02-26',
  tier: 'official',
}

export const YUYANG_VENUES = [
  {
    id: 'yuhang-lianjutang',
    name: '连具塘村多功能运动场',
    category: 'public',
    typeName: '公共健身场所',
    area: '仓前街道',
    address: '仓前街道连具塘村农贸市场西侧',
    hours: '以现场为准',
    fee: '免费',
    tags: ['足球', '篮球', '乒乓球', '智慧刷脸入场'],
    summary: '约 3000 平方米，由足球场、篮球场、乒乓球场等组成；免费开放，刷脸或刷卡入场。',
    mapQuery: '连具塘村多功能运动场 杭州余杭',
    source: OFFICIAL_SOURCE,
  },
  {
    id: 'yuhang-baotaxingyuan',
    name: '宝塔星苑体育公园',
    category: 'public',
    typeName: '公共健身场所',
    area: '余杭街道',
    address: '余杭街道宝塔星苑小区内',
    hours: '以现场为准（分时段）',
    fee: '非高峰免费或低收费',
    tags: ['健身步道', '多功能运动场', '健身广场', '儿童游乐'],
    summary: '约 15000 平方米，含环形塑胶步道、健身广场、多功能运动场、老年与儿童活动区，配套停车和卫生间。',
    mapQuery: '宝塔星苑体育公园 杭州余杭',
    source: OFFICIAL_SOURCE,
  },
  {
    id: 'yuhang-shuangchen',
    name: '双陈村陈家坝社区多功能运动场',
    category: 'public',
    typeName: '公共健身场所',
    area: '仁和街道',
    address: '仁和街道运溪高架路与合杭高铁交会处',
    hours: '以现场为准（错峰开放）',
    fee: '低免开放',
    tags: ['篮球', '羽毛球', '笼式足球', '乒乓球', '健身路径'],
    summary: '约 2000 平方米，含篮球场、羽毛球场、笼式足球场、乒乓球桌和健身路径，配套停车场。',
    mapQuery: '双陈村陈家坝社区多功能运动场 杭州余杭',
    source: OFFICIAL_SOURCE,
  },
  {
    id: 'yuhang-bafangcheng',
    name: '八方城文体公园',
    category: 'public',
    typeName: '公共健身场所',
    area: '五常街道',
    address: '五常街道同顺街以南、红旗路以西',
    hours: '以现场为准',
    fee: '免费或低收费',
    tags: ['网球', '三人篮球', '空中跑道', '图书馆'],
    summary: '总建筑面积约 4.5 万平方米，含 2 片网球场、三人制篮球场、1066 米空中跑道，并连接图书馆、美术馆。',
    mapQuery: '八方城文体公园 杭州余杭',
    source: OFFICIAL_SOURCE,
  },
  {
    id: 'yuhang-xingang',
    name: '新港村文体中心',
    category: 'public',
    typeName: '公共健身场所',
    area: '良渚街道',
    address: '良渚街道新港村村委东',
    hours: '以现场为准',
    fee: '村民开放日免费；其余低免',
    tags: ['室内篮球', '健身房', '羽毛球', '更衣储物'],
    summary: '室内运动场所，体育场地面积约 2000 平方米，含标准篮球场和健身房，配套停车、卫生间、更衣储物。',
    mapQuery: '新港村文体中心 杭州余杭良渚',
    source: OFFICIAL_SOURCE,
  },
  {
    id: 'yuhang-zhongtai-park',
    name: '中泰街道运动公园',
    category: 'public',
    typeName: '公共健身场所',
    area: '中泰街道',
    address: '中泰街道新西湖小镇北侧（G56 杭瑞高速旁）',
    hours: '每天 9 点前免费；9 点后低收费',
    fee: '9 点前免费；9 点后低收费',
    tags: ['网球', '篮球', '足球', '门球', '健身步道'],
    summary: '约 21100 平方米，含两片网球场、两片篮球场、足球场、门球场、健身步道和健身路径；可在“中泰运动公园”服务号预约。',
    mapQuery: '中泰街道运动公园 杭州余杭',
    source: OFFICIAL_SOURCE,
  },
  {
    id: 'yuhang-efc-plaza',
    name: '欧美金融城南侧健身广场',
    category: 'public',
    typeName: '公共健身场所',
    area: '仓前街道',
    address: '仓前街道红卫港河边、向往街南侧（EFC 欧美金融城南侧）',
    hours: '24 小时',
    fee: '免费',
    tags: ['羽毛球', '乒乓球', '滨水步道', '服务驿站'],
    summary: '约 8000 平方米，含 2 片羽毛球场、8 张乒乓球桌、滨水健身步道、景观栈桥和服务驿站，24 小时免费开放。',
    mapQuery: '欧美金融城南侧健身广场 杭州余杭',
    source: OFFICIAL_SOURCE,
  },
  {
    id: 'yuhang-xingfuhe-gym',
    name: '幸福河社区百姓健身房',
    category: 'gym',
    typeName: '社区健身房',
    area: '中泰街道',
    address: '中泰街道幸福河社区南湖大厦一楼',
    hours: '以现场为准',
    fee: '公益性社区健身服务（以现场为准）',
    tags: ['社区健身房', '器械', '公益性'],
    summary: '公开目录登记的社区百姓健身房，提供公益性、就近健身服务；开放时间与收费建议先电话/现场确认。',
    mapQuery: '幸福河社区百姓健身房 杭州余杭中泰',
    source: {
      name: '电话邦公开目录',
      url: 'https://www.dianhua.cn/dt/3aeb5c96a214450394ea710e6b456cb3/944aee0c435e2476197717722cb4ca06',
      date: '访问于 2026-11',
      tier: 'directory',
    },
  },
  {
    id: 'yuhang-liangzhu-baseball',
    name: '良渚棒垒球橄榄球运动中心',
    category: 'specialty',
    typeName: '特色运动场馆',
    area: '良渚街道',
    address: '良渚街道石桥村与纤石村交界处',
    hours: '以场馆公告为准',
    fee: '以场馆公告为准',
    tags: ['棒垒球', '橄榄球', '专业场地'],
    summary: '占地约 39767 平方米的专业棒垒球/橄榄球场地，用于赛事与训练；对公众开放时段以场馆公告为准。',
    mapQuery: '良渚棒垒球橄榄球运动中心 杭州余杭',
    source: {
      name: '余杭发布 · 澎湃政务',
      url: 'https://thirdpage.thepaper.cn/h5/jrtt/30559949',
      date: '2025-04-02',
      tier: 'official',
    },
  },
  {
    id: 'yuhang-liangzhu-archery',
    name: '良渚射箭运动中心',
    category: 'specialty',
    typeName: '特色运动场馆',
    area: '良渚街道',
    address: '紧邻良渚棒垒球橄榄球运动中心',
    hours: '以场馆公告为准',
    fee: '以场馆公告为准',
    tags: ['射箭', '70m/50m/30m 靶场', '60 个靶位'],
    summary: '占地约 11000 平方米，配备 70 米、50 米、30 米训练靶场，共 60 个靶位；公众体验时段以场馆公告为准。',
    mapQuery: '良渚射箭运动中心 杭州余杭',
    source: {
      name: '余杭发布 · 澎湃政务',
      url: 'https://thirdpage.thepaper.cn/h5/jrtt/30559949',
      date: '2025-04-02',
      tier: 'official',
    },
  },
]
