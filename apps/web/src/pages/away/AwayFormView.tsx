import { type FormEvent, useId } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useT } from '../../i18n';
import { AwayProblem } from './AwayProblem';

export function AwayFormView({
  login,
  from,
  until,
  onFrom,
  onUntil,
  pending,
  problem,
  onSubmit,
}: {
  login?: string;
  from: string;
  until: string;
  onFrom: (value: string) => void;
  onUntil: (value: string) => void;
  pending: boolean;
  problem: unknown;
  onSubmit: (event: FormEvent) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-from`}>{t('away.from')}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            value={from}
            onChange={(event) => onFrom(event.target.value)}
          />
        </div>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-until`}>{t('away.until')}</Label>
          <Input
            id={`${id}-until`}
            type="date"
            required
            value={until}
            onChange={(event) => onUntil(event.target.value)}
          />
        </div>
      </div>
      <AwayProblem error={problem} />
      <Button type="submit" className="w-fit" disabled={pending}>
        {login ? t('away.markFor', { login }) : t('away.save')}
      </Button>
    </form>
  );
}
