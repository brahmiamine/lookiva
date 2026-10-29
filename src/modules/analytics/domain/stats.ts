export type GarmentStatSource = {
    id: string;
    price: number | null;
    currency: string | null;
    createdAt: string;
    category: string;
    status: string;
};
export type WearStatSource = {
    garmentId: string;
    at: string;
};
export function wardrobeStats(garments: GarmentStatSource[], wears: WearStatSource[], window: {
    from: string;
    to: string;
    now: Date;
    forgottenDays: number;
}) {
    const lo = Date.parse(`${window.from}T00:00:00Z`), hi = Math.min(Date.parse(`${window.to}T00:00:00Z`) + 86400000, window.now.getTime() + 1);
    garments = garments.filter(g => Date.parse(g.createdAt) < hi);
    const grouped = new Map<string, number[]>(), historyById = new Map<string, number[]>();
    for (const w of wears) {
        const t = Date.parse(w.at);
        if (t <= window.now.getTime()) {
            if (!historyById.has(w.garmentId))
                historyById.set(w.garmentId, []);
            historyById.get(w.garmentId)!.push(t);
        }
        if (t >= lo && t < hi) {
            if (!grouped.has(w.garmentId))
                grouped.set(w.garmentId, []);
            grouped.get(w.garmentId)!.push(t);
        }
    }
    const money = new Map<string, number>(), categories: Record<string, number> = {}, statuses: Record<string, number> = {};
    const items = garments.map(g => {
        const dates = (grouped.get(g.id) ?? []).sort((a, b) => b - a), last = dates[0] ?? null;
        categories[g.category] = (categories[g.category] ?? 0) + 1;
        statuses[g.status] = (statuses[g.status] ?? 0) + 1;
        if (g.price !== null && g.currency)
            money.set(g.currency, (money.get(g.currency) ?? 0) + Math.round(g.price * 100));
        // Forgotten is relative to the entire confirmed history supplied, not merely the selected reporting window.
        const history = historyById.get(g.id) ?? [];
        const lastEver = history.length ? history.reduce((max, t) => Math.max(max, t), 0) : Date.parse(g.createdAt);
        return { id: g.id, wears: dates.length, totalWears: history.length, lastWorn: last === null ? null : new Date(last).toISOString(), lastThree: dates.slice(0, 3).map(t => new Date(t).toISOString()), forgotten: window.now.getTime() - lastEver >= window.forgottenDays * 86400000, costPerWear: g.price !== null && g.currency && history.length ? g.price / history.length : null, currency: g.currency };
    });
    return { from: window.from, to: window.to, eligible: garments.length, used: items.filter(i => i.wears > 0).length, categories, statuses, missingPrices: garments.filter(g => g.price === null || !g.currency).length, spending: [...money].sort(([a], [b]) => a.localeCompare(b)).map(([currency, cents]) => ({ currency, amount: cents / 100 })), items };
}
