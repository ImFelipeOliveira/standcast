import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { XIcon } from './icons';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-overlay"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[14px] border border-border bg-surface p-6 text-text shadow-xl',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-3 right-3 inline-flex size-11 cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent text-muted hover:bg-hover hover:text-text desk:size-9"
          aria-label={t('dialog.close')}
        >
          <XIcon />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1.5 pr-10', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 desk:flex-row desk:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('m-0 font-bold text-[17px] leading-snug', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('m-0 text-[13px] text-muted', className)}
      {...props}
    />
  );
}
