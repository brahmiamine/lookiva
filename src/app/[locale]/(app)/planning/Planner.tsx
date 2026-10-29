'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/ui/api-client';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/TextField';
import { PAGE_TITLE, SELECT } from '../dressing/ui';
type Check = {
    id: string;
    text: string;
    done: boolean;
};
type Payload = {
    title: string;
    date?: string;
    timezone?: string;
    type?: string;
    indoor?: boolean;
    notes: string;
    recurrence?: {
        frequency: string;
        interval: number;
        until?: string;
    } | null;
    from?: string;
    to?: string;
    stages?: {
        city: string;
        timezone: string;
        from: string;
        to: string;
    }[];
    checklist: Check[];
    garmentIds?: string[];
    maxPieces?: number;
};
type Entry = {
    id: string;
    payload: Payload;
    version: number;
};
export function Planner({ timezone, today }: {
    timezone: string;
    today: string;
}) {
    const t = useTranslations('planning'), locale = useLocale(), router = useRouter();
    const [kind, setKind] = useState<'events' | 'trips'>('events'), [rows, setRows] = useState<Entry[]>([]), [cursor, setCursor] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState(false);
    const [title, setTitle] = useState(''), [date, setDate] = useState(today), [end, setEnd] = useState(today), [type, setType] = useState('PERSONAL'), [indoor, setIndoor] = useState(false), [frequency, setFrequency] = useState(''), [notes, setNotes] = useState(''), [checkText, setCheckText] = useState(''), [cities, setCities] = useState('');
    const [occurrences, setOccurrences] = useState<Record<string, string[]>>({});
    const fail = useCallback((e: unknown) => { if (e instanceof ApiError && e.status === 401)
        router.replace(`/${locale}/login`);
    else
        setError(true); }, [router, locale]);
    const generation = useRef(0);
    const createIntent = useRef<{ signature: string; body: object; key: string } | null>(null);
    const load = useCallback(async () => { const g = ++generation.current; setBusy(true); setError(false); try {
        const r = await api<{
            items: Entry[];
            nextCursor?: string;
        }>(`/${kind}?limit=20`);
        if (g !== generation.current)
            return;
        setRows(r.data.items);
        setCursor(r.data.nextCursor);
    }
    catch (e) {
        if (g === generation.current)
            fail(e);
    }
    finally {
        if (g === generation.current)
            setBusy(false);
    } }, [kind, fail]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- startup of an asynchronous owner-scoped request
        void load();
        const active = generation.current;
        return () => { generation.current = active + 1; };
    }, [load]);
    async function more() { if (!cursor || busy)
        return; setBusy(true); try {
        const r = await api<{
            items: Entry[];
            nextCursor?: string;
        }>(`/${kind}?limit=20&cursor=${encodeURIComponent(cursor)}`);
        setRows(old => [...old, ...r.data.items]);
        setCursor(r.data.nextCursor);
    }
    catch (e) {
        fail(e);
    }
    finally {
        setBusy(false);
    } }
    async function create() {
        if (busy)
            return;
        setBusy(true);
        setError(false);
        const checklist = checkText.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ id: crypto.randomUUID(), text, done: false }));
        const body = kind === 'events' ? { title, date, timezone, type, indoor, notes, checklist, recurrence: frequency ? { frequency, interval: 1 } : null } : { title, from: date, to: end, notes, checklist, stages: cities.trim() ? [{ city: cities.trim(), timezone, from: date, to: end }] : [], garmentIds: [] };
        const signature = JSON.stringify([kind,title,date,end,timezone,type,indoor,notes,checkText,cities,frequency]);
        if (createIntent.current?.signature !== signature) createIntent.current = { signature, body, key: crypto.randomUUID() };
        const intent = createIntent.current;
        try {
            const r = await api<Entry>(`/${kind}`, { method: 'POST', body: intent.body, idempotent: intent.key });
            createIntent.current = null;
            setRows(old => [r.data, ...old]);
            setTitle('');
            setNotes('');
            setCheckText('');
        }
        catch (e) {
            fail(e);
        }
        finally {
            setBusy(false);
        }
    }
    async function update(e: Entry, check: Check) { if (busy)
        return; setBusy(true); setError(false); try {
        const r = await api<Entry>(`/${kind}/${e.id}`, { method: 'PUT', ifMatch: `W/"v${e.version}"`, body: { ...e.payload, checklist: e.payload.checklist.map(c => c.id === check.id ? { ...c, done: !c.done } : c) } });
        setRows(old => old.map(x => x.id === e.id ? r.data : x));
    }
    catch (err) {
        fail(err);
        await load();
    }
    finally {
        setBusy(false);
    } }
    async function remove(e: Entry) { if (busy || !window.confirm(t('confirmDelete')))
        return; setBusy(true); try {
        await api(`/${kind}/${e.id}`, { method: 'DELETE', ifMatch: `W/"v${e.version}"` });
        setRows(old => old.filter(x => x.id !== e.id));
    }
    catch (err) {
        fail(err);
    }
    finally {
        setBusy(false);
    } }
    async function dates(e: Entry) { setBusy(true); try {
        const start = e.payload.date!;
        const finish = new Date(`${start}T00:00:00Z`);
        finish.setUTCDate(finish.getUTCDate() + 90);
        const r = await api<{
            items: {
                date: string;
            }[];
        }>(`/events/${e.id}/occurrences?from=${start}&to=${finish.toISOString().slice(0, 10)}`);
        setOccurrences(old => ({ ...old, [e.id]: r.data.items.map(x => x.date) }));
    }
    catch (err) {
        fail(err);
    }
    finally {
        setBusy(false);
    } }
    return <main className="space-y-5 py-6">
  <h1 className={PAGE_TITLE}>{t('title')}</h1><p className="text-sm text-muted">{t('intro')}</p>
  <div className="flex gap-2">{(['events', 'trips'] as const).map(k => <Button key={k} variant={kind === k ? 'primary' : 'secondary'} disabled={busy || kind === k} onClick={() => { setRows([]); setKind(k); }}>{t(k)}</Button>)}</div>
  <form className="space-y-3 rounded-card border border-border p-4" onSubmit={e => { e.preventDefault(); void create(); }}>
   <TextField label={t('name')} value={title} onChange={e => setTitle(e.target.value)} required maxLength={120}/>
   <TextField type="date" label={t('date')} value={date} onChange={e => setDate(e.target.value)} required/>
   {kind === 'trips' ? <><TextField type="date" label={t('end')} min={date} value={end} onChange={e => setEnd(e.target.value)} required/><TextField label={t('city')} value={cities} maxLength={120} onChange={e => setCities(e.target.value)}/></> : <>
    <label className="flex flex-col gap-1">{t('type')}<select className={SELECT} value={type} onChange={e => setType(e.target.value)}>{['PERSONAL', 'WORK', 'SPORT'].map(v => <option key={v} value={v}>{t(`types.${v}` as 'types.PERSONAL')}</option>)}</select></label>
    {type === 'SPORT' && <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={indoor} onChange={e => setIndoor(e.target.checked)}/>{t('indoor')}</label>}
    <label className="flex flex-col gap-1">{t('repeat')}<select className={SELECT} value={frequency} onChange={e => setFrequency(e.target.value)}>{['', 'DAILY', 'WEEKLY', 'MONTHLY'].map(v => <option key={v} value={v}>{t(`repeatValues.${v || 'NONE'}` as 'repeatValues.NONE')}</option>)}</select></label>
   </>}
   <TextField label={t('notes')} value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)}/>
   <label className="flex flex-col gap-1">{t('checklist')}<textarea className={SELECT} value={checkText} maxLength={20000} rows={3} onChange={e => setCheckText(e.target.value)}/></label>
   <Button variant="primary" type="submit" disabled={busy}>{t('create')}</Button>
  </form>
  {busy && <p role="status">{t('loading')}</p>}{error && <p role="alert">{t('error')}</p>}
  {!busy && !rows.length && <p>{t('empty')}</p>}
  <ul className="space-y-4">{rows.map(e => <li key={e.id} className="space-y-3 rounded-card border border-border p-4">
   <h2 className="break-words text-lg font-bold" dir="auto">{e.payload.title}</h2>
   <p><bdi>{e.payload.date ?? e.payload.from}{e.payload.to ? ` – ${e.payload.to}` : ''}</bdi></p><p className="break-words" dir="auto">{e.payload.notes}</p>
   {e.payload.stages?.map((s, i) => <p key={i}><bdi>{s.city} · {s.from} – {s.to} · {s.timezone}</bdi></p>)}
   <ul>{e.payload.checklist.map(c => <li key={c.id}><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={c.done} disabled={busy} onChange={() => void update(e, c)}/><bdi className="break-words">{c.text}</bdi></label></li>)}</ul>
   {kind === 'events' && <Button variant="secondary" disabled={busy} onClick={() => void dates(e)}>{t('occurrences')}</Button>}
   {occurrences[e.id] && <p className="break-words" dir="auto">{occurrences[e.id]!.join(' · ')}</p>}
   <Button variant="danger" disabled={busy} onClick={() => void remove(e)}>{t('remove')}</Button>
  </li>)}</ul>
  {cursor && <Button variant="secondary" disabled={busy} onClick={() => void more()}>{t('more')}</Button>}
 </main>;
}
