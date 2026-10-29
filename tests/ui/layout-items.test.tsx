// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import '../setup/dom-polyfills';
import { generateMetadata } from '@/app/[locale]/layout';
import { config } from '@/proxy';
import { getMessage, pickMessages } from '@/i18n/messages';
import { Dialog } from '@/ui/components/Dialog';
import { Icon } from '@/ui/components/Icon';

afterEach(cleanup);

// Next compiles the matcher with path-to-regexp; for this negative-lookahead shape a plain RegExp is equivalent.
const proxied = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe('proxy matcher', () => {
  it('skips_api_next_assets_and_metadata_routes', () => {
    for (const p of ['/api', '/api/v1/me', '/_next/static/x.js', '/manifest.webmanifest', '/sw.js', '/favicon.ico', '/icon', '/apple-icon', '/robots.txt', '/sitemap.xml', '/opengraph-image'])
      expect(proxied(p), p).toBe(false);
  });
  it('still_redirects_pages_that_only_start_with_api', () => {
    for (const p of ['/apiary', '/dressing', '/fr/login', '/', '/icons-page']) expect(proxied(p), p).toBe(true);
  });
});

describe('layout metadata', () => {
  it('title_comes_from_messages_per_locale', async () => {
    for (const locale of ['fr', 'en', 'ar'] as const) {
      const m = await generateMetadata({ params: Promise.resolve({ locale }) });
      expect(m.title).toEqual({ default: getMessage(locale, 'app.name'), template: `%s · ${getMessage(locale, 'app.name')}` });
    }
  });
});

describe('pickMessages', () => {
  it('returns_only_the_requested_namespaces_with_fr_fallback', () => {
    const m = pickMessages('ar', ['error']);
    expect(Object.keys(m)).toEqual(['error']);
    expect(m.error).toMatchObject({ title: getMessage('ar', 'error.title') });
  });
});

describe('dialog and icons', () => {
  it('dialog_content_scrolls_and_sits_above_the_page', () => {
    render(
      <Dialog open onOpenChange={() => {}} title="T" closeLabel="Close">
        <p>x</p>
      </Dialog>,
    );
    const cls = screen.getByRole('dialog').className;
    for (const c of ['max-h-[90dvh]', 'overflow-y-auto', 'z-50']) expect(cls).toContain(c);
  });
  it('directional_icon_mirrors_in_rtl_and_is_hidden_from_at', () => {
    const { container } = render(
      <>
        <Icon name="back" directional />
        <Icon name="mail" />
      </>,
    );
    const [back, mail] = [...container.querySelectorAll('svg')] as unknown as [SVGElement, SVGElement];
    expect(back.getAttribute('class')).toContain('rtl:-scale-x-100');
    expect(mail.getAttribute('class')).not.toContain('scale-x');
    expect(back.getAttribute('aria-hidden')).toBe('true');
  });
});
