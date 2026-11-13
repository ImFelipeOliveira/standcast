import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border font-semibold text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover',
        outline: 'border-border-strong bg-surface text-text hover:bg-hover',
        ghost: 'border-transparent bg-transparent text-text2 hover:bg-hover hover:text-text',
        destructive:
          'border-border-strong bg-surface text-bad-ink hover:bg-hover hover:text-bad-ink2',
        link: 'h-auto min-h-0 border-transparent p-0 text-accent-text underline-offset-4 hover:text-accent-ink hover:underline',
      },
      size: {
        default: 'min-h-11 px-3.5 desk:min-h-9',
        sm: 'min-h-11 px-3 text-xs desk:min-h-8',
        icon: 'size-11 desk:size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
