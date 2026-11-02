export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg aria-hidden="true" width="22" height="20" viewBox="0 0 44 40" className="fill-mark">
        <rect x="0" y="20" width="11" height="20" rx="1.5" />
        <rect x="16" y="10" width="11" height="30" rx="1.5" />
        <rect x="32" y="0" width="11" height="40" rx="1.5" />
      </svg>
      <span className="font-bold font-brand text-[19px] text-text tracking-[-0.01em]">
        Standcast
      </span>
    </span>
  );
}
