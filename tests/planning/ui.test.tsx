// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi, afterEach } from 'vitest';
import { Planner } from '@/app/[locale]/(app)/planning/Planner';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pickMessages } from '@/i18n/messages';
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps loaded entries visible when the current tab is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: 'a', version: 1, payload: { title: 'Lunch', date: '2026-10-29', notes: '', checklist: [] } }] }), { headers: { 'Content-Type': 'application/json' } })));
    render(<IntlProvider locale="fr" messages={pickMessages('fr', ['planning'])}><Planner timezone="Europe/Paris" today="2026-10-29"/></IntlProvider>);
    expect(await screen.findByText('Lunch')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Événements' }));
    expect(screen.getByText('Lunch')).toBeTruthy();
});
it('creates an event and updates only the chosen checklist item using its displayed version', async () => {
    const payload = { title: 'Foot', date: '2026-10-29', timezone: 'Europe/Paris', type: 'PERSONAL', indoor: false, notes: '', recurrence: null, checklist: [{ id: '00000000-0000-4000-8000-000000000001', text: 'Gourde', done: false }] };
    const fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const body = init.method === 'POST' ? { ...payload } : init.method === 'PUT' ? JSON.parse(String(init.body)) : null;
        return Promise.resolve(new Response(JSON.stringify(body ? { id: 'a', version: init.method === 'PUT' ? 2 : 1, payload: body } : { items: [] }), { headers: { 'Content-Type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fetch);
    render(<IntlProvider locale="fr" messages={pickMessages('fr', ['planning'])}><Planner timezone="Europe/Paris" today="2026-10-29" /></IntlProvider>);
    await screen.findByText('Aucun élément pour le moment.');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Titre'), 'Foot');
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    await screen.findByText('Foot');
    await user.click(screen.getByRole('checkbox', { name: 'Gourde' }));
    await screen.findByRole('checkbox', { name: 'Gourde', checked: true });
    const put = fetch.mock.calls.find(c => c[1]?.method === 'PUT')!;
    expect(new Headers(put[1].headers).get('if-match')).toBe('W/"v1"');
    expect(JSON.parse(put[1].body).checklist[0].done).toBe(true);
});
it('reuses the same intent and checklist IDs when retrying a failed create', async () => {
 let posts=0;
 const fetch=vi.fn().mockImplementation((_url:string,init:RequestInit)=>{
  if(init.method!=='POST')return Promise.resolve(new Response(JSON.stringify({items:[]}),{headers:{'Content-Type':'application/json'}}));
  if(++posts===1)return Promise.reject(new Error('Network lost'));
  return Promise.resolve(new Response(JSON.stringify({id:'a',version:1,payload:JSON.parse(String(init.body))}),{headers:{'Content-Type':'application/json'}}));
 });
 vi.stubGlobal('fetch',fetch);
 render(<IntlProvider locale="fr" messages={pickMessages('fr',['planning'])}><Planner timezone="UTC" today="2026-10-29"/></IntlProvider>);
 await screen.findByText('Aucun élément pour le moment.');const user=userEvent.setup();
 await user.type(screen.getByLabelText('Titre'),'Retry');await user.type(screen.getByLabelText('Liste libre : un élément par ligne'),'Passport');
 await user.click(screen.getByRole('button',{name:'Créer'}));await screen.findByRole('alert');
 await user.click(screen.getByRole('button',{name:'Créer'}));await screen.findByText('Retry');
 const attempts=fetch.mock.calls.filter(c=>c[1].method==='POST');
 expect(attempts[0]![1].body).toBe(attempts[1]![1].body);
 expect(new Headers(attempts[0]![1].headers).get('idempotency-key')).toBe(new Headers(attempts[1]![1].headers).get('idempotency-key'));
});
