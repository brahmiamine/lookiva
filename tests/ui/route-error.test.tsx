// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteError from '@/app/[locale]/error';
import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';

afterEach(cleanup);

describe('route error boundary', () => {
  it('route_error_boundary_renders_error_state_from_the_error_namespace_only', async () => {
    const reset = vi.fn();
    const secret = 'ECONNREFUSED db.internal:3306 secret-detail';
    // Only the `error` namespace is provided (what the layout ships): the boundary must not need anything else.
    const { container } = render(
      <IntlProvider locale="ar" messages={pickMessages('ar', ['error'])}>
        <RouteError error={new Error(secret)} reset={reset} />
      </IntlProvider>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(getMessage('ar', 'error.title'));
    expect(getMessage('ar', 'error.title')).not.toBe('error.title');
    expect(container.textContent).not.toContain(secret);
    expect(container.textContent).not.toContain('ECONNREFUSED');

    await userEvent.click(screen.getByRole('button', { name: getMessage('ar', 'error.retry') }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
