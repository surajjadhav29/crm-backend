const File = require('../models/File');
const { buildListQuery, toPublicFile } = require('./file.service');
const { todayDateString } = require('../utils/date');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const { isObjectionOverdue, sortOverdueObjections } = require('../utils/objectionReminder');

const OVERDUE_OBJECTION_PAGE_SIZE_DEFAULT = 150;
const OVERDUE_OBJECTION_PAGE_SIZE_MAX = 150;

function parseOverduePage(value) {
  return Math.max(1, parseInt(value, 10) || 1);
}

function parseOverduePageSize(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return OVERDUE_OBJECTION_PAGE_SIZE_DEFAULT;
  return Math.min(OVERDUE_OBJECTION_PAGE_SIZE_MAX, n);
}

async function listOverdueObjectionsForUser(user, { filterUserId, page = 1, pageSize } = {}) {
  const safePage = parseOverduePage(page);
  const safeSize = parseOverduePageSize(pageSize);
  const baseMatch = buildListQuery(user, { type: 'all_records', filterUserId });

  const objectionRaw = await File.find({
    $and: [baseMatch, { status: 'objection' }],
  }).sort({ lastStatusAt: 1, createdAt: 1 });

  const overdueAll = sortOverdueObjections(objectionRaw.filter((f) => isObjectionOverdue(f)));
  const total = overdueAll.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize) || 1);
  const pageClamped = total > 0 ? Math.min(safePage, totalPages) : 1;
  const skip = (pageClamped - 1) * safeSize;
  const pageRows = overdueAll.slice(skip, skip + safeSize);

  return {
    overdueObjections: pageRows.map((f) => toPublicFile(f, user)),
    overdueTotal: total,
    overduePage: pageClamped,
    overduePageSize: safeSize,
    overdueTotalPages: totalPages,
  };
}

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

async function getLists(user, { filterUserId, overduePage, overduePageSize } = {}) {
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

  const staffTodayRaw =
    user.role === 'superadmin' && filterUserId
      ? await File.find(staffTodayQuery).sort({ createdAt: -1 }).limit(200)
      : user.role === 'superadmin'
        ? []
        : await File.find(staffTodayQuery).sort({ createdAt: -1 }).limit(200);

  const overdue = await listOverdueObjectionsForUser(user, {
    filterUserId,
    page: overduePage,
    pageSize: overduePageSize,
  });

  return {
    staffTodayFiles: staffTodayRaw.map((f) => toPublicFile(f, user)),
    ...overdue,
  };
}

module.exports = {
  getAnalytics,
  getLists,
  listOverdueObjectionsForUser,
};
