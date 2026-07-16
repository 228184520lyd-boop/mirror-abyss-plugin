import { normalizeSnapshot } from './snapshot.js';
const REMOVABLE_TABLES = new Set(['spacetime', 'events', 'regions']);
const SETTLED_STATUS = /(已结束|已完成|已关闭|已失效|已归档|已替代|resolved|closed|completed|expired|archived|superseded|historical)/i;
function canRemoveRow(table, row, snapshot) {
    if (!REMOVABLE_TABLES.has(table))
        return false;
    if (row.source === 'manual' || row.locked)
        return false;
    if (!SETTLED_STATUS.test(`${row.status} ${row.content}`))
        return false;
    if (table === 'spacetime' && snapshot.spacetime.length <= 1)
        return false;
    return true;
}
function canAdvanceActivity(current, target, row) {
    if (row.source === 'manual' || row.locked)
        return false;
    if (current === '当前在场' || current === '当前相关')
        return false;
    const order = ['离场但仍活跃', '休眠', '长期休眠', '已归档'];
    const from = order.indexOf(current ?? '未标注');
    const to = order.indexOf(target);
    if (to < 0)
        return false;
    if (current === '未标注')
        return target === '休眠';
    return from >= 0 && to === Math.min(from + 1, order.length - 1);
}
export function applySedimentation(snapshot, summary) {
    const plan = summary.sedimentation;
    if (!plan)
        return normalizeSnapshot(snapshot, snapshot);
    const next = normalizeSnapshot(snapshot, snapshot);
    const requested = new Set(plan.removeRowIds);
    const applied = [];
    const ignored = [];
    for (const table of ['spacetime', 'events', 'regions']) {
        next[table] = next[table].filter((row) => {
            if (!requested.has(row.id))
                return true;
            if (canRemoveRow(table, row, next)) {
                applied.push(row.id);
                return false;
            }
            ignored.push(row.id);
            return true;
        });
    }
    for (const update of plan.characterActivityUpdates) {
        const row = next.characters.find((item) => item.id === update.rowId);
        if (!row) {
            ignored.push(update.rowId);
            continue;
        }
        const current = row.lifecycle?.activity;
        if (!canAdvanceActivity(current, update.activity, row)) {
            ignored.push(update.rowId);
            continue;
        }
        row.lifecycle ||= {
            existence: '未标注',
            activity: '未标注',
            memory: '未标注',
            evidenceLevel: '未知',
            evidence: '',
            returnConditions: [],
            returnBlockers: [],
        };
        row.lifecycle.activity = update.activity;
        row.status = update.activity;
        applied.push(update.rowId);
    }
    const normalizedPlan = {
        ...plan,
        appliedRowIds: [...new Set(applied)],
        ignoredRowIds: [...new Set(ignored)],
    };
    summary.sedimentation = normalizedPlan;
    return next;
}
