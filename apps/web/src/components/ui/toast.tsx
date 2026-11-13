import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type ToastTone = 'error' | 'warning' | 'neutral';

export function ToastRegion({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="toast-region"
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 desk:inset-x-auto desk:right-6 desk:bottom-6',
        className,
      )}
      {...props}
    />
  );
}

const TONE_ICON: Record<ToastTone, string> = {
  error: 'text-bad-ink',
  warning: 'text-amber-ink',
  neutral: 'text-muted',
};

export function Toast({
  tone,
  title,
  description,
  action,
  dismissLabel,
  onDismiss,
}: {
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ReactNode;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div
      data-slot="toast"
      role={tone === 'neutral' ? 'status' : 'alert'}
      aria-live={tone === 'neutral' ? 'polite' : 'assertive'}
      className="pointer-events-auto box-border flex w-full max-w-[384px] items-start gap-3 rounded-[10px] bg-surface p-3.5 pl-4 text-text ring-1 ring-border-strong shadow-[0_16px_40px_-12px_rgba(24,24,27,0.25),0_2px_6px_rgba(24,24,27,0.08)]"
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 inline-flex size-7 flex-none items-center justify-center rounded-full bg-hover',
          TONE_ICON[tone],
        )}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5v.01" />
        </svg>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold text-[13px]">{title}</span>
        {description ? <span className="text-[13px] text-muted">{description}</span> : null}
        {action ? <span className="mt-1.5 flex gap-2">{action}</span> : null}
      </div>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={onDismiss}
        className="inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted hover:bg-hover hover:text-text desk:size-7"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
