import { cn } from '../../lib/utils';
import { type Ref, refLabel } from './refLabel';

export function RefLink({ refValue, className }: { refValue: Ref; className?: string }) {
  return (
    <a
      href={refValue.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex min-w-0 max-w-full items-center truncate whitespace-nowrap rounded-md bg-accent-soft px-[7px] py-0.5 font-mono text-[12px] text-accent-text no-underline hover:bg-accent-soft2 hover:text-accent-ink',
        className,
      )}
    >
      {refLabel(refValue)}
    </a>
  );
}

export function Avatar({ text, small = false }: { text: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full bg-accent-soft2 font-bold text-accent-ink',
        small ? 'size-6 text-[10px]' : 'size-8 text-[12px]',
      )}
    >
      {text}
    </span>
  );
}
