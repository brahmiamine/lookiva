export type Recurrence = {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    interval: number;
    until?: string;
};
const DAY = 86400000;
export function dateValue(value: string): number {
    const t = Date.parse(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== value)
        throw new Error('Invalid date');
    return t;
}
/** Virtual local dates, independent of DST. No implied instant or reminder is generated. */
export function occurrenceDates(start: string, rule: Recurrence | null, from: string, to: string): string[] {
    const base = dateValue(start), lo = dateValue(from), hi = dateValue(to);
    if (hi < lo || hi - lo > 366 * DAY)
        throw new Error('Window must be at most 366 days');
    if (rule && (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 365))
        throw new Error('Invalid interval');
    const end = rule?.until ? dateValue(rule.until) : hi;
    const dates: string[] = [];
    for (let t = Math.max(lo, base); t <= Math.min(hi, end); t += DAY) {
        const d = new Date(t), b = new Date(base), days = (t - base) / DAY;
        const months = (d.getUTCFullYear() - b.getUTCFullYear()) * 12 + d.getUTCMonth() - b.getUTCMonth();
        const match = !rule ? t === base : rule.frequency === 'DAILY' ? days % rule.interval === 0 : rule.frequency === 'WEEKLY' ? days % (7 * rule.interval) === 0 : d.getUTCDate() === b.getUTCDate() && months % rule.interval === 0;
        if (match)
            dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
}
export function stagesValid(from: string, to: string, stages: {
    from: string;
    to: string;
}[]): boolean {
    if (dateValue(to) < dateValue(from))
        return false;
    const ordered = [...stages].sort((a, b) => a.from.localeCompare(b.from));
    return ordered.every((s, i) => dateValue(s.from) <= dateValue(s.to) && s.from >= from && s.to <= to && (!i || ordered[i - 1]!.to < s.from));
}
export function packingList(ids: string[], maxPieces?: number) {
    const garmentIds = [...new Set(ids)];
    return { garmentIds, pieces: garmentIds.length, overCapacity: maxPieces !== undefined && garmentIds.length > maxPieces, weightKnown: false as const };
}
