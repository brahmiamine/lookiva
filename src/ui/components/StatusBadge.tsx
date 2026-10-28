import type { ReactNode } from 'react';

const TONES = {
  success: 'text-success bg-success-soft',
  warning: 'text-warning bg-warning-soft',
  danger: 'text-danger bg-danger-soft',
  info: 'text-info bg-info-soft',
  neutral: 'text-neutral bg-neutral-soft',
};

export function StatusBadge({ tone, label, icon }: { tone: keyof typeof TONES; label: string; icon: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${TONES[tone]}`}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
