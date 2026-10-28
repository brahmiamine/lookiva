// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteError from '@/app/[locale]/error';
import { getMessage } from '@/i18n/messages';

const params = vi.hoisted(() => ({ value: {} as Record<string, string> }));
vi.mock('next/navigation', () => ({ useParams: () => params.value }));

afterEach(cleanup);

describe('route error boundary', () => {
  it('route_error_boundary_renders_error_state', async () => {
    params.value = { locale: 'ar' };
    const reset = vi.fn();
    const secret = 'ECONNREFUSED db.internal:3306 secret-detail';
    const { container } = render(<RouteError error={new Error(secret)} reset={reset} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(getMessage('ar', 'error.title'));
    expect(getMessage('ar', 'error.title')).not.toBe('error.title');
    expect(container.textContent).not.toContain(secret);
    expect(container.textContent).not.toContain('ECONNREFUSED');

    await userEvent.click(screen.getByRole('button', { name: getMessage('ar', 'error.retry') }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('route_error_boundary_falls_back_to_default_locale', () => {
    params.value = {};
    render(<RouteError error={new Error('x')} reset={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain(getMessage('fr', 'error.title'));
  });
});
