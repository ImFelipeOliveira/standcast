import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'min-h-11 w-full min-w-0 rounded-[9px] border border-border-strong bg-surface px-2.5 text-base text-text placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-bad-ink desk:min-h-10 desk:text-sm',
        className,
      )}
      {...props}
    />
  );
}
