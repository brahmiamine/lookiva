// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Notice } from '@/ui/components/Notice';
import { PasswordField, PasswordMeter } from '@/ui/components/PasswordField';

afterEach(cleanup);

const labels = { showLabel: 'Show password', hideLabel: 'Hide password' };

describe('PasswordField', () => {
  it('toggles_visibility_with_a_pressed_button_and_keeps_autocomplete', async () => {
    render(<PasswordField label="Password" autoComplete="new-password" hint="12 min" {...labels} />);
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('type')).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    expect(input.getAttribute('dir')).toBe('ltr');
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByText('12 min').id);
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('error_is_announced_and_marks_the_input_invalid', () => {
    render(<PasswordField label="Password" error="Too short" {...labels} />);
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
  });
});

describe('PasswordMeter', () => {
  it('counts_code_points_and_flips_to_strong_at_12', () => {
    const { rerender, container } = render(<PasswordMeter value="" tooShort={(n) => `short ${n}`} strong="Strong" />);
    expect(container.textContent).toBe('');
    rerender(<PasswordMeter value="ééééé😀" tooShort={(n) => `short ${n}`} strong="Strong" />);
    expect(screen.getByRole('status').textContent).toContain('short 6');
    rerender(<PasswordMeter value="une phrase facile" tooShort={(n) => `short ${n}`} strong="Strong" />);
    expect(screen.getByRole('status').textContent).toContain('Strong');
  });
});

describe('Notice', () => {
  it('is_focusable_programmatically_with_the_given_role', () => {
    render(<Notice tone="danger" role="alert" title="Wrong" text="Retry" />);
    const n = screen.getByRole('alert');
    expect(n.getAttribute('tabindex')).toBe('-1');
    expect(n.textContent).toContain('Wrong');
  });
});
