// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../setup/dom-polyfills';
import DevUiPage from '@/app/[locale]/dev/ui/page';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const props = (locale: string) => ({ params: Promise.resolve({ locale }) });

describe('/[locale]/dev/ui', () => {
  it('dev_ui_page_returns_404_when_NODE_ENV_production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(DevUiPage(props('fr'))).rejects.toMatchObject({ digest: expect.stringMatching(/NOT_FOUND|404/) });
  });

  it('dev_ui_page_rejects_unknown_locale', async () => {
    await expect(DevUiPage(props('xx'))).rejects.toMatchObject({ digest: expect.stringMatching(/NOT_FOUND|404/) });
  });

  it('dev_ui_page_renders_in_development', async () => {
    for (const locale of ['fr', 'en', 'ar']) {
      const { container, unmount } = render(await DevUiPage(props(locale)));
      expect(screen.getByRole('heading', { level: 1 }).textContent, locale).not.toContain('dev.ui');
      expect(container.querySelectorAll('article').length, locale).toBeGreaterThanOrEqual(8);
      expect(container.querySelector('table'), locale).not.toBeNull();
      expect(container.textContent, locale).not.toMatch(/dev\.ui\./);
      unmount();
    }
  });
});
