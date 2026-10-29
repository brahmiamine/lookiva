import { forwardRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

const TONES = {
  danger: ['text-danger bg-danger-soft', 'warn'],
  warning: ['text-warning bg-warning-soft', 'clock'],
  info: ['text-info bg-info-soft', 'info'],
  success: ['text-success bg-success-soft', 'check'],
} as const satisfies Record<string, readonly [string, IconName]>;

export type NoticeTone = keyof typeof TONES;

/** Message box of the mockups (`.note`). tabIndex -1 so a form can move focus to it after a failed submit. */
export const Notice = forwardRef<
  HTMLDivElement,
  { tone: NoticeTone; title: string; text?: string; role?: 'alert' | 'status'; icon?: IconName; children?: ReactNode }
>(function Notice({ tone, title, text, role = 'status', icon, children }, ref) {
  const [cls, defaultIcon] = TONES[tone];
  return (
    <div ref={ref} role={role} tabIndex={-1} className={`flex items-start gap-2.5 rounded-card p-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${cls}`}>
      <Icon name={icon ?? defaultIcon} className="mt-0.5" />
      <div className="flex flex-col gap-0.5">
        <strong className="text-[15px]">{title}</strong>
        {text && <span className="font-medium">{text}</span>}
        {children}
      </div>
    </div>
  );
});
