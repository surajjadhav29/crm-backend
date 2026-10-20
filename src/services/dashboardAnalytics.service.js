const File = require('../models/File');
const { buildListQuery, toPublicFile } = require('./file.service');
const { todayDateString } = require('../utils/date');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const OBJECTION_REMINDER_DAYS = 3;

const STATUS_COLORS = {
  pending: '#c0392b',
  in_progress: '#e67e22',
  objection: '#8e44ad',
  paper_return: '#1a5276',
  on_hold: '#5dade2',
  completed: '#27ae60',
};

const WORK_TYPE_COLORS = ['#8b0000', '#f39c12', '#2980b9', '#27ae60', '#8e44ad'];

function parseFileDate(file) {
  const raw = file.date || file.createdAt;
  if (!raw) return null;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))) {
    const [y, m, d] = raw.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildChartBuckets(period, files, now = new Date()) {
  if (period === 'week') {
    const buckets = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      buckets.push({
        label: DAYS[d.getDay()],
        sub: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        key,
        records: 0,
        payment: 0,
      });
    }
    files.forEach((f) => {
      const parsed = parseFileDate(f);
      if (!parsed) return;
      const key = parsed.toISOString().split('T')[0];
      const b = buckets.find((x) => x.key === key);
      if (b) {
        b.records += 1;
        b.payment += Number(f.totalBill) || 0;
      }
    });
    return buckets;
  }

  if (period === 'year') {
    const year = now.getFullYear();
    const buckets = MONTHS.map((label, i) => ({
      label,
      sub: String(year),
      key: `${year}-${String(i + 1).padStart(2, '0')}`,
      records: 0,
      payment: 0,
    }));
    files.forEach((f) => {
      const parsed = parseFileDate(f);
      if (!parsed || parsed.getFullYear() !== year) return;
      const b = buckets[parsed.getMonth()];
      if (b) {
        b.records += 1;
        b.payment += Number(f.totalBill) || 0;
      }
    });
    return buckets;
  }

  const buckets = [];
  for (let w = 3; w >= 0; w -= 1) {
    const start = new Date(now);
    start.setDate(start.getDate() - w * 7 - 6);
    const end = new Date(now);
    end.setDate(end.getDate() - w * 7);
    buckets.push({
      label: `Week ${4 - w}`,
      sub: `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
      start: start.getTime(),
      end: end.getTime() + 86400000,
      records: 0,
      payment: 0,
    });
  }
  files.forEach((f) => {
    const parsed = parseFileDate(f);
    if (!parsed) return;
    const t = parsed.getTime();
    const b = buckets.find((x) => t >= x.start && t < x.end);
    if (b) {
      b.records += 1;
      b.payment += Number(f.totalBill) || 0;
    }
  });
  return buckets;
}

function chartRangeQuery(period, now = new Date()) {
  if (period === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { chartFrom: from, chartTo: now };
  }
  if (period === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { chartFrom: from, chartTo: now };
  }
  const from = new Date(now);
  from.setDate(from.getDate() - 27);
  from.setHours(0, 0, 0, 0);
  return { chartFrom: from, chartTo: now };
}

function fileInChartRange(file, chartFrom, chartTo) {
  const parsed = parseFileDate(file);
  if (!parsed) return false;
  const t = parsed.getTime();
  return t >= chartFrom.getTime() && t <= chartTo.getTime();
}

function formatStatusBreakdown(byStatus) {
  const map = Object.fromEntries(byStatus.map((r) => [r._id, r.count]));
  const pending = map.pending || 0;
  const inProgress = map.in_progress || 0;
  const objection = map.objection || 0;
  const paperReturn = map.paper_return || 0;
  const onHold = map.on_hold || 0;
  const completed = (map.completed || 0) + (map.done || 0);
  return [
    { name: 'Pending', value: pending, color: STATUS_COLORS.pending },
    { name: 'In Process', value: inProgress, color: STATUS_COLORS.in_progress },
    { name: 'Objection', value: objection, color: STATUS_COLORS.objection },
    { name: 'Paper Return', value: paperReturn, color: STATUS_COLORS.paper_return },
    { name: 'On Hold', value: onHold, color: STATUS_COLORS.on_hold },
    { name: 'Completed', value: completed, color: STATUS_COLORS.completed },
  ].filter((x) => x.value > 0);
}

function formatWorkTypeBreakdown(rows) {
  return rows
    .map((r, i) => ({
      name: r._id || 'Other',
      value: r.count,
      color: WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

function getObjectionSince(file) {
  if (String(file.status || '').toLowerCase() !== 'objection') return null;
  const history = Array.isArray(file.statusHistory) ? file.statusHistory : [];
  let latest = null;
  for (const entry of history) {
    if (String(entry?.status || '').toLowerCase() !== 'objection') continue;
    const at = entry.at ? new Date(entry.at) : null;
    if (!at || Number.isNaN(at.getTime())) continue;
    if (!latest || at > latest) latest = at;
  }
  if (latest) return latest;
  for (const field of ['lastStatusAt', 'updatedAt', 'createdAt']) {
    const at = file[field] ? new Date(file[field]) : null;
    if (at && !Number.isNaN(at.getTime())) return at;
  }
  return null;
}

function isObjectionOverdue(file, now = new Date()) {
  const since = getObjectionSince(file);
  if (!since) return false;
  const ms = now.getTime() - since.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  return days > OBJECTION_REMINDER_DAYS;
}

async function getAnalytics(user, { filterUserId, period = 'month' } = {}) {
  const safePeriod = ['week', 'month', 'year'].includes(period) ? period : 'month';
  const baseMatch = buildListQuery(user, { type: 'all_records', filterUserId });

  const [byStatus, byWorkType] = await Promise.all([
    File.aggregate([{ $match: baseMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    File.aggregate([
      { $match: baseMatch },
      { $group: { _id: { $ifNull: ['$workType', 'Other'] }, count: { $sum: 1 } } },
    ]),
  ]);

  const { chartFrom, chartTo } = chartRangeQuery(safePeriod);
  const chartRows = await File.find(baseMatch)
    .select('date createdAt totalBill')
    .lean();
  const chartFiles = chartRows.filter((f) => fileInChartRange(f, chartFrom, chartTo));

  return {
    period: safePeriod,
    chart: buildChartBuckets(safePeriod, chartFiles),
    statusBreakdown: formatStatusBreakdown(byStatus),
    workTypeBreakdown: formatWorkTypeBreakdown(byWorkType),
  };
}

async function getLists(user, { filterUserId } = {}) {
  const baseMatch = buildListQuery(user, { type: 'all_records', filterUserId });
  const today = todayDateString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);

  const staffTodayQuery = {
    $and: [
      baseMatch,
      {
        $or: [
          { date: today },
          { date: { $regex: `^${today}` } },
          { createdAt: { $gte: dayStart, $lte: dayEnd } },
        ],
      },
    ],
  };

  const [staffTodayRaw, objectionRaw] = await Promise.all([
    user.role === 'superadmin' && filterUserId
      ? File.find(staffTodayQuery).sort({ createdAt: -1 }).limit(200)
      : user.role === 'superadmin'
        ? Promise.resolve([])
        : File.find(staffTodayQuery).sort({ createdAt: -1 }).limit(200),
    File.find({ $and: [baseMatch, { status: 'objection' }] })
      .sort({ lastStatusAt: 1, createdAt: 1 })
      .limit(150),
  ]);

  const overdueObjections = objectionRaw
    .filter((f) => isObjectionOverdue(f))
    .sort((a, b) => {
      const aSince = getObjectionSince(a)?.getTime() ?? 0;
      const bSince = getObjectionSince(b)?.getTime() ?? 0;
      return aSince - bSince;
    });

  return {
    staffTodayFiles: staffTodayRaw.map((f) => toPublicFile(f, user)),
    overdueObjections: overdueObjections.map((f) => toPublicFile(f, user)),
  };
}

module.exports = {
  getAnalytics,
  getLists,
};
