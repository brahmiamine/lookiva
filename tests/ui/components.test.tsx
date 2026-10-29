// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../setup/dom-polyfills';
import { Bdi } from '@/ui/components/Bdi';
import { Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorState } from '@/ui/components/ErrorState';
import { LoadingState } from '@/ui/components/LoadingState';
import { StatusBadge } from '@/ui/components/StatusBadge';
import { TextField } from '@/ui/components/TextField';

afterEach(cleanup);

describe('base components', () => {
  it('button_and_field_have_min_44px_target', () => {
    render(
      <>
        <Button variant="primary">Go</Button>
        <TextField label="Name" />
      </>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.className).toContain('min-h-11');
    expect(button.className).toContain('min-w-11');
    expect(button.getAttribute('type')).toBe('button');
    expect(screen.getByLabelText('Name').className).toContain('min-h-13');
  });

  it('textfield_label_is_associated_and_error_has_role_alert', () => {
    const { rerender } = render(<TextField label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<TextField label="Email" error="Required" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Required');
    const field = screen.getByLabelText('Email');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('textfield_keeps_label_association_when_id_is_passed', () => {
    render(<TextField label="Email" id="email-field" />);
    const input = screen.getByLabelText('Email');
    expect(input.id).toBe('email-field');
  });

  it('textfield_merges_caller_aria_describedby_with_error', () => {
    const { rerender } = render(<TextField label="Email" aria-describedby="hint-1" />);
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe('hint-1');

    rerender(<TextField label="Email" aria-describedby="hint-1" error="Required" />);
    const alert = screen.getByRole('alert');
    const ids = (screen.getByLabelText('Email').getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toContain('hint-1');
    expect(ids).toContain(alert.id);
  });

  it('dialog_traps_focus_and_closes_on_escape', async () => {
    // jsdom does not reproduce real-browser focus behaviour; the Playwright/axe suite of Task 14 is the real-browser re-check.
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <>
        <button>outside</button>
        <Dialog open onOpenChange={onOpenChange} title="Delete item" closeLabel="Close">
          <button>confirm</button>
        </Dialog>
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete item' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.className).toContain('min-h-11');

    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it('status_badge_renders_icon_text_and_tone_class', () => {
    render(<StatusBadge tone="warning" label="To wash" icon={<svg data-testid="icon" />} />);
    const label = screen.getByText('To wash');
    const badge = label.closest('span[class*="text-warning"]') ?? label;
    expect(badge.className).toContain('text-warning');
    expect(badge.className).toContain('bg-warning-soft');
    expect(screen.getByTestId('icon').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('bdi_renders_email_ltr_inside_rtl_text', () => {
    const { container } = render(
      <>
        <p dir="rtl">
          البريد: <Bdi>user@exemple.com</Bdi>
        </p>
        <p dir="rtl">
          الاسم: <Bdi>قميص أزرق</Bdi>
        </p>
      </>,
    );
    const bdis = container.querySelectorAll('bdi');
    expect(bdis[0]?.getAttribute('dir')).toBe('ltr');
    expect(bdis[1]?.getAttribute('dir')).toBe('auto');
  });

  it('error_state_has_role_alert', () => {
    render(<ErrorState title="Oops" description="Try again" action={<button>Retry</button>} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Oops');
    expect(alert.textContent).toContain('Try again');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('loading_state_has_role_status_and_aria_busy', () => {
    render(<LoadingState title="Loading" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toContain('Loading');
  });

  it('empty_state_renders_title_and_action', () => {
    render(<EmptyState title="Nothing yet" description="Add one" action={<button>Add</button>} />);
    expect(screen.getByText('Nothing yet')).toBeTruthy();
    expect(screen.getByText('Add one')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
});
