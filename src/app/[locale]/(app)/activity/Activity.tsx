'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiError } from '@/ui/api-client';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { PAGE_TITLE } from '../dressing/ui';
type Notice = {
    id: string;
    outfitId: string;
    startsAt: string;
    readAt: string | null;
};
type Stats = {
    eligible: number;
    used: number;
    missingPrices: number;
    spending: {
        currency: string;
        amount: number;
    }[];
    items: {
        id: string;
        name: string | null;
        wears: number;
        totalWears: number;
        lastThree: string[];
        forgotten: boolean;
        costPerWear: number | null;
        currency: string | null;
    }[];
};
export function Activity({ today }: {
    today: string;
}) {
    const t = useTranslations('activity'), locale = useLocale(), router = useRouter();
    const [tab, setTab] = useState<'notifications' | 'stats'>('notifications'), [busy, setBusy] = useState(false), [error, setError] = useState(false), [notices, setNotices] = useState<Notice[]>([]), [cursor, setCursor] = useState<string>(), [enabled, setEnabled] = useState(false), [minutes, setMinutes] = useState(60), [stats, setStats] = useState<Stats | null>(null), [from, setFrom] = useState('2000-01-01'), [to, setTo] = useState(today), [threshold, setThreshold] = useState(90), [visible, setVisible] = useState(50);
    const generation = useRef(0);
    const fail = useCallback((e: unknown) => { if (e instanceof ApiError && e.status === 401)
        router.replace(`/${locale}/login`);
    else
        setError(true); }, [router, locale]);
    const load = useCallback(async () => { const g = ++generation.current; setBusy(true); setError(false); try {
        const [n, p] = await Promise.all([api<{
                items: Notice[];
                nextCursor?: string;
            }>('/notifications'), api<{
                enabled: boolean;
                minutesBefore: number;
            }>('/notifications/preferences')]);
        if (g !== generation.current)
            return;
        setNotices(n.data.items);
        setCursor(n.data.nextCursor);
        setEnabled(p.data.enabled);
        setMinutes(p.data.minutesBefore);
    }
    catch (e) {
        if (g === generation.current)
            fail(e);
    }
    finally {
        if (g === generation.current)
            setBusy(false);
    } }, [fail]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initial asynchronous API load
        void load();
        const g = generation.current;
        return () => { generation.current = g + 1; };
    }, [load]);
    async function run(action: () => Promise<unknown>) { if (busy)
        return; setBusy(true); setError(false); try {
        await action();
    }
    catch (e) {
        fail(e);
    }
    finally {
        setBusy(false);
    } }
    const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    const money = (n: number, currency: string) => { try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
    }
    catch {
        return `${new Intl.NumberFormat(locale).format(n)} ${currency}`;
    } };
    async function calculate() { await run(async () => { const q = new URLSearchParams({ from, to, forgottenDays: String(threshold) }); setStats((await api<Stats>(`/analytics?${q}`)).data); setVisible(50); }); }
    return <main className="space-y-5 py-6"><h1 className={PAGE_TITLE}>{t('title')}</h1>
  <div className="flex gap-2">{(['notifications', 'stats'] as const).map(k => <Button key={k} variant={tab === k ? 'primary' : 'secondary'} disabled={busy || tab === k} onClick={() => setTab(k)}>{t(k)}</Button>)}</div>
  {busy && <p role="status">{t('loading')}</p>}{error && <p role="alert">{t('error')}</p>}
  {tab === 'notifications' ? <>
   <p>{t('intro')}</p><form className="space-y-3 rounded-card border border-border p-4" onSubmit={e => { e.preventDefault(); void run(async () => { await api('/notifications/preferences', { method: 'PUT', body: { enabled, minutesBefore: minutes } }); await api('/notifications/refresh', { method: 'POST' }); await load(); }); }}>
    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={busy}/>{t('enabled')}</label>
    <TextField label={t('minutes')} type="number" min={15} max={1440} required value={minutes} onChange={e => setMinutes(Number(e.target.value))}/><Button variant="primary" type="submit" disabled={busy}>{t('save')}</Button>
   </form><Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await api('/notifications/refresh', { method: 'POST' }); await load(); })}>{t('refresh')}</Button>
   {!busy && !notices.length && <p>{t('empty')}</p>}<ul className="space-y-3">{notices.map(n => <li key={n.id} className="space-y-2 rounded-card border border-border p-4"><p>{t('due')}</p><p>{date(n.startsAt)}</p><Link className="block min-h-11 text-primary underline" href={`/${locale}/tenues/${n.outfitId}`}>{t('open')}</Link><div className="flex flex-wrap gap-2">{!n.readAt && <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await api(`/notifications/${n.id}/read`, { method: 'PUT' }); setNotices(old => old.map(x => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)); })}>{t('read')}</Button>}<Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await api(`/notifications/${n.id}`, { method: 'DELETE' }); setNotices(old => old.filter(x => x.id !== n.id)); })}>{t('remove')}</Button></div></li>)}</ul>
   {cursor && <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { const r = await api<{
            items: Notice[];
            nextCursor?: string;
        }>(`/notifications?cursor=${encodeURIComponent(cursor)}`); setNotices(old => [...old, ...r.data.items]); setCursor(r.data.nextCursor); })}>{t('more')}</Button>}
  </> : <>
   <p>{t('definition')}</p><form className="space-y-3" onSubmit={e => { e.preventDefault(); void calculate(); }}><TextField type="date" label={t('from')} value={from} required max={to} onChange={e => setFrom(e.target.value)}/><TextField type="date" label={t('to')} value={to} required min={from} max={today} onChange={e => setTo(e.target.value)}/><TextField type="number" label={t('threshold')} value={threshold} min={1} max={3650} required onChange={e => setThreshold(Number(e.target.value))}/><Button variant="primary" type="submit" disabled={busy}>{t('calculate')}</Button></form>
   {stats && <section className="space-y-4"><p role="status">{t('usage', { used: stats.used, total: stats.eligible })}</p><p>{t('missing', { count: stats.missingPrices })}</p><h2 className="font-bold">{t('purchases')}</h2><ul>{stats.spending.map(s => <li key={s.currency}>{money(s.amount, s.currency)}</li>)}</ul><ul className="space-y-3">{stats.items.slice(0, visible).map(g => <li key={g.id} className="space-y-2 rounded-card border border-border p-4"><Link className="block min-h-11 break-words text-primary underline" href={`/${locale}/dressing/${g.id}`}><bdi>{g.name ?? t('garment')}</bdi></Link><p>{t('wears', { count: g.wears, total: g.totalWears })}</p><p>{t('cost')}: {g.costPerWear === null || !g.currency ? t('unknown') : money(g.costPerWear, g.currency)}</p>{g.forgotten && <p>{t('forgotten')}</p>}<ul>{g.lastThree.map((d, i) => <li key={`${d}:${i}`}>{date(d)}</li>)}</ul></li>)}</ul>{visible < stats.items.length && <Button variant="secondary" onClick={() => setVisible(n => n + 50)}>{t('more')}</Button>}</section>}
  </>}
 </main>;
}
