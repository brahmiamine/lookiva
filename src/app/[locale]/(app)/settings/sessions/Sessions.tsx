'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { StatusBadge } from '@/ui/components/StatusBadge';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { CARD, H1, LEAD, SECTION } from '../../styles';

export type SessionItem = { id: string; userAgent: string; createdAt: string; lastSeenAt: string; current: boolean };

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** "il y a 2 h" / "just now" with Latin digits, like the rest of the app. */
function relative(locale: string, iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(`${locale}-u-nu-latn`, { numeric: 'auto', style: 'short' });
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  return rtf.format(0, 'second');
}

export function Sessions({ initial }: { initial: SessionItem[] }) {
  const t = useTranslations('settings.sessions');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [items, setItems] = useState(initial);
  const [notice, setNotice] = useState<(NoticeData & { role: 'status' | 'alert' }) | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string[]>([]);
  const pending = useRef(new Set<string>()); // synchronous guard (state updates land after the second click)
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);

  // The API summarises the user agent as "<Browser> on <OS>" (English, coarse): shown as "OS · Browser", localized.
  const device = (ua: string) => {
    const [, browser = '', os = ''] = /^(.*) on (.*)$/.exec(ua) ?? [];
    return t('device', {
      os: os === 'unknown OS' || !os ? t('unknownOs') : os,
      browser: browser === 'Unknown browser' || !browser ? t('unknownBrowser') : browser,
    });
  };
  const icon = (ua: string) => (/ on (iOS|Android)$/.test(ua) ? 'phone' : 'laptop');

  const toLogin = () => router.replace(`/${locale}/login`);

  async function revoke(s: SessionItem) {
    if (pending.current.has(s.id)) return; // double click: one DELETE per row
    pending.current.add(s.id);
    setRevoking((ids) => [...ids, s.id]);
    const done = () => {
      setItems((list) => list.filter((x) => x.id !== s.id));
      setNotice({ tone: 'success', role: 'status', title: t('revokedTitle'), text: t('revokedText', { device: device(s.userAgent) }) });
    };
    try {
      await api(`/me/sessions/${s.id}`, { method: 'DELETE' });
      done();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return toLogin();
      if (e instanceof ApiError && e.status === 404) done(); // already revoked (elsewhere or by a retry): same outcome
      else setNotice({ ...genericNotice(e), role: 'alert' });
    }
    pending.current.delete(s.id);
    setRevoking((ids) => ids.filter((x) => x !== s.id));
  }

  async function logoutAll() {
    setBusy(true);
    try {
      await api('/auth/logout-all', { method: 'POST' });
      return toLogin();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return toLogin();
      setConfirm(false);
      setNotice({ ...genericNotice(e), role: 'alert' });
    }
    setBusy(false);
  }

  return (
    <>
      <h1 className={`${H1} mt-2`}>{t('title')}</h1>
      <p className={LEAD}>{t('lead')}</p>
      {notice && (
        <div className="mb-3.5">
          <Notice ref={noticeRef} {...notice} />
        </div>
      )}
      <ul className="flex flex-col gap-2.5" data-testid="sessions">
        {items.map((s) => (
          <li key={s.id} className={`${CARD} flex items-start gap-3 p-3.5`} data-current={s.current || undefined}>
            <span className="mt-0.5 text-[28px] text-muted">
              <Icon name={icon(s.userAgent)} />
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <h2 className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold">
                <span dir="ltr">{device(s.userAgent)}</span>
                {s.current && <StatusBadge tone="success" label={t('thisDevice')} icon={<Icon name="check" />} />}
              </h2>
              <p className="text-[13px] text-muted" suppressHydrationWarning>
                {t('lastSeen', { when: relative(locale, s.lastSeenAt) })}
              </p>
              {!s.current && (
                <Button variant="danger" className="mt-2 self-start text-sm" onClick={() => revoke(s)} aria-disabled={revoking.includes(s.id) || undefined} aria-label={t('revokeLabel', { device: device(s.userAgent) })}>
                  {t('revoke')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {items.length === 1 && <p className="mt-2 text-sm text-muted">{t('empty')}</p>}

      <h2 className={SECTION}>{t('danger')}</h2>
      <Button variant="danger" className={BLOCK} onClick={() => setConfirm(true)} aria-describedby="logout-all-hint">
        <Icon name="logout" directional />
        {t('logoutAll')}
      </Button>
      <p id="logout-all-hint" className="mt-1.5 text-sm text-muted">
        {t('logoutAllHint')}
      </p>

      <Dialog open={confirm} onOpenChange={setConfirm} title={t('confirmTitle')} closeLabel={c('close')} description={t('confirmText')}>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className={BLOCK} onClick={() => setConfirm(false)}>
            {c('cancel')}
          </Button>
          <Button variant="danger" className={BLOCK} onClick={logoutAll} aria-disabled={busy || undefined}>
            <Icon name="logout" directional />
            {t('logoutAll')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
