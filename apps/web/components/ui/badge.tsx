import type { ReactNode } from 'react';

export type Tone =
  'neutral' | 'info' | 'warning' | 'success' | 'orange' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-muted',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  orange: 'bg-orange-soft text-orange',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
