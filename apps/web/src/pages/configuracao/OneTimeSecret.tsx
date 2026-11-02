import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { useT } from '../../i18n';

type CopyState = 'idle' | 'copied' | 'failed';

export function OneTimeSecret({
  title,
  secret,
  copyNow,
  hint,
  onDismiss,
}: {
  title: string;
  secret: string;
  copyNow: string;
  hint: string;
  onDismiss: () => void;
}) {
  const t = useT();
  const [copy, setCopy] = useState<CopyState>('idle');
  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };
  return (
    <div
      role="status"
      className="flex flex-col gap-2.5 rounded-xl border border-amber-line bg-amber-soft px-4 py-3.5 text-amber-ink"
    >
      <p className="m-0 font-semibold text-[13px]">{title}</p>
      <p className="m-0 text-[13px]">{copyNow}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <code className="min-w-0 flex-[1_1_260px] select-all break-all rounded-lg border border-amber-line bg-surface px-2.5 py-1.5 font-mono text-[13px] text-text">
          {secret}
        </code>
        <Button type="button" variant="outline" onClick={() => void copySecret()}>
          {copy === 'copied' ? t('setup.secret.copied') : t('setup.secret.copy')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          {t('setup.secret.done')}
        </Button>
      </div>
      {copy === 'failed' ? <p className="m-0 text-[13px]">{t('setup.secret.copyFailed')}</p> : null}
      <p className="m-0 text-[12px]">{hint}</p>
    </div>
  );
}
