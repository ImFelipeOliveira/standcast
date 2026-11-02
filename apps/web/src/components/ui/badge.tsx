import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-xs',
  {
    variants: {
      variant: {
        default: 'bg-accent-soft text-accent-text',
        neutral: 'bg-hover text-text2',
        outline: 'border border-border bg-surface font-medium text-muted',
        ok: 'bg-ok-soft text-ok-ink',
        warn: 'bg-warn-soft2 text-warn-ink',
        bad: 'bg-bad-soft text-bad-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
