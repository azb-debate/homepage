const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');

class HTMLElementStub {}

const emptyClassList = {
  add() {},
  remove() {},
  toggle() {}
};

const documentStub = {
  activeElement: null,
  baseURI: 'https://azb-debate.github.io/homepage/',
  body: {
    appendChild() {},
    classList: emptyClassList
  },
  createElement() {
    return {
      classList: emptyClassList,
      focus() {},
      remove() {},
      select() {},
      setAttribute() {},
      style: {}
    };
  },
  documentElement: {
    scrollHeight: 0,
    style: { setProperty() {} }
  },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  hidden: false,
  readyState: 'loading'
};

const windowStub = {
  addEventListener() {},
  clearTimeout() {},
  innerHeight: 900,
  matchMedia() { return { matches: false }; },
  requestAnimationFrame() { return 0; },
  scrollY: 0,
  setTimeout() { return 0; }
};

const context = {
  console: { assert() {}, error() {}, warn() {} },
  document: documentStub,
  HTMLElement: HTMLElementStub,
  IntersectionObserver: class {},
  location: { hash: '' },
  navigator: {},
  performance,
  requestAnimationFrame() { return 0; },
  cancelAnimationFrame() {},
  ResizeObserver: class {},
  window: windowStub
};
windowStub.window = windowStub;

vm.runInNewContext(script, context, { filename: 'js/main.js' });
const schedule = windowStub.AZBDebateSchedule;
assert.ok(schedule, '日程計算APIが公開されている');

const regular = {
  regularWeekdays: [2, 4, 5],
  startTime: '15:00',
  endTime: '18:00',
  timeZone: 'Asia/Tokyo',
  excludedDates: [],
  specialDates: [],
  activePeriods: [],
  lookaheadDays: 370
};

function nextAt(instant, overrides = {}) {
  return schedule.findNextActivity({ ...regular, ...overrides }, new Date(instant));
}

assert.deepEqual(
  JSON.parse(JSON.stringify(schedule.getZonedParts(new Date('2026-08-18T05:59:59Z'), 'Asia/Tokyo'))),
  {
    year: 2026,
    month: 8,
    day: 18,
    hour: 14,
    minute: 59,
    second: 59,
    dateKey: '2026-08-18',
    weekday: 2,
    secondsSinceMidnight: 53999,
    timeZone: 'Asia/Tokyo'
  },
  '端末のタイムゾーンではなく東京時刻へ変換する'
);

assert.equal(nextAt('2026-08-18T05:59:59Z').dateKey, '2026-08-18');
assert.equal(nextAt('2026-08-18T05:59:59Z').state, 'upcoming');
assert.equal(nextAt('2026-08-18T06:00:00Z').state, 'ongoing');
assert.equal(nextAt('2026-08-18T08:59:59Z').state, 'ongoing');
assert.equal(nextAt('2026-08-18T09:00:00Z').dateKey, '2026-08-20');
assert.equal(nextAt('2026-08-19T03:00:00Z').dateKey, '2026-08-20');
assert.equal(nextAt('2026-08-21T09:00:00Z').dateKey, '2026-08-25');

assert.equal(
  nextAt('2026-08-18T05:00:00Z', { excludedDates: ['2026-08-18'] }).dateKey,
  '2026-08-20',
  '除外日は通常活動より優先する'
);

const special = nextAt('2026-08-18T09:30:00Z', {
  specialDates: [{
    date: '2026-08-19',
    startTime: '14:00',
    endTime: '17:00',
    room: 'M1-5',
    note: '臨時活動'
  }]
});
assert.equal(special.dateKey, '2026-08-19');
assert.equal(special.source, 'special');
assert.equal(special.startTime, '14:00');

assert.equal(
  nextAt('2026-08-18T05:00:00Z', {
    activePeriods: [{ start: '2026-08-20', end: '2026-08-21' }]
  }).dateKey,
  '2026-08-20',
  '通常活動は設定済み活動期間の内側だけを候補にする'
);

assert.equal(
  nextAt('2026-08-18T05:00:00Z', {
    activePeriods: [{ start: '2026-09-01', end: '2026-09-30' }],
    specialDates: [{ date: '2026-08-19', startTime: '14:00', endTime: '17:00' }]
  }).dateKey,
  '2026-08-19',
  '臨時活動は通常活動期間の外側にも追加できる'
);

assert.equal(schedule.addDays('2028-02-28', 1), '2028-02-29');
assert.equal(schedule.addDays('2026-12-31', 1), '2027-01-01');
assert.equal(schedule.weekdayForDate('2026-08-18'), 2);
assert.ok(Object.isFrozen(schedule));
assert.ok(Object.isFrozen(schedule.defaults));

const requiredText = [
  '毎週 火・木・金',
  '15:00〜18:00',
  'M1-5',
  '麻布中学校・高等学校の在校生',
  '途中入部・兼部ともに可能',
  '筆記用具のみ',
  '欠席連絡は不要で、途中退室も可能',
  '部費は徴収していません',
  '9月初旬の始業前',
  '参加は任意',
  '約5万円',
  'azabudebateclub@gmail.com'
];
requiredText.forEach(text => assert.ok(html.includes(text), `静的HTMLに「${text}」がある`));
assert.ok(!html.includes(['M1', '4'].join('-')), '静的HTMLに旧教室がない');
assert.ok(!html.includes(['後日', '掲載'].join('')), '静的HTMLに旧メール代替表示がない');
assert.equal((html.match(/<details data-motion>/g) || []).length, 10, 'Q&Aが独立したdetails 10件である');

const configMatch = html.match(/<script id="club-config" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
assert.ok(configMatch, '埋め込み設定が存在する');
const config = JSON.parse(configMatch[1]);
assert.equal(config.room, 'M1-5');
assert.equal(config.email, 'azabudebateclub@gmail.com');
assert.deepEqual(config.activitySchedule.regularWeekdays, [2, 4, 5]);
assert.equal(config.activitySchedule.timeZone, 'Asia/Tokyo');

const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
assert.ok(jsonLdMatch, '構造化データが存在する');
const jsonLd = JSON.parse(jsonLdMatch[1]);
assert.equal(jsonLd.email, 'azabudebateclub@gmail.com');
assert.ok(jsonLd.description.includes('M1-5'));
assert.ok(!Object.hasOwn(jsonLd, 'logo'), '人物写真をlogoとして指定していない');

for (const asset of [
  'assets/hero-960.webp',
  'assets/hero-1600.webp',
  'assets/hero-2400.webp',
  'assets/hero-mobile-640.webp',
  'assets/hero-mobile-960.webp',
  'assets/og-image.jpg'
]) {
  assert.ok(fs.existsSync(path.join(root, asset)), `${asset} が存在する`);
}

console.log('site.test.cjs: all checks passed');
