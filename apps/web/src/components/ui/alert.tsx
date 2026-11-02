import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

const alertVariants = cva(
  'grid w-full gap-1 rounded-xl border px-4 py-3 text-sm [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface text-text',
        info: 'border-accent-line bg-accent-wash text-accent-ink',
        warn: 'border-warn-line bg-warn-wash text-warn-ink',
        destructive: 'border-bad-line bg-bad-soft text-bad-ink2',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('font-semibold', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('text-[13px] [&_p]:m-0 [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}
