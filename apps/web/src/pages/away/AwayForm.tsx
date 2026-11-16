import { type FormEvent, useId, useState } from 'react';
import { useMarkAway } from '../../api/mutations';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useT } from '../../i18n';
import { awayErrorMessage } from './away-error';

export function AwayForm({
  installationId,
  login,
  onDone,
}: {
  installationId: number;
  login?: string;
  onDone?: () => void;
}) {
  const t = useT();
  const id = useId();
  const mark = useMarkAway(installationId);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      await mark.mutateAsync({ ...(from ? { from } : {}), until, ...(login ? { login } : {}) });
      setFrom('');
      setUntil('');
      onDone?.();
    } catch (error) {
      setProblem(awayErrorMessage(t('setup.actionFailed'), error));
    }
  };
  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-from`}>{t('away.from')}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-until`}>{t('away.until')}</Label>
          <Input
            id={`${id}-until`}
            type="date"
            required
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </div>
      </div>
      {problem ? (
        <p
          role="alert"
          className="m-0 rounded-[9px] border border-bad-line bg-bad-soft px-3 py-2 text-[13px] text-bad-ink2"
        >
          {problem}
        </p>
      ) : null}
      <Button type="submit" className="w-fit" disabled={mark.isPending}>
        {login ? t('away.markFor', { login }) : t('away.save')}
      </Button>
    </form>
  );
}
