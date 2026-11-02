import { useId } from 'react';
import type { Installation } from '../api/client';
import { useT } from '../i18n';

type Props = {
  installations: Installation[];
  current: number;
  onChange: (installationId: number) => void;
};

export function OrgSelect({ installations, current, onChange }: Props) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="px-2 font-semibold text-[11px] text-muted uppercase tracking-[0.06em]"
      >
        {t('org.label')}
      </label>
      <select
        id={id}
        value={String(current)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 w-full cursor-pointer rounded-[9px] border border-border-strong bg-surface px-2.5 font-medium text-sm text-text desk:min-h-10"
      >
        {installations.map((installation) => (
          <option key={installation.id} value={String(installation.id)}>
            {installation.owner}
          </option>
        ))}
      </select>
    </div>
  );
}
