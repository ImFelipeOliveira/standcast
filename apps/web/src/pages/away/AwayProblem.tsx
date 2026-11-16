import { useT } from '../../i18n';
import { awayErrorMessage } from './away-error';

export function AwayProblem({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  return (
    <p
      role="alert"
      className="m-0 rounded-[9px] border border-bad-line bg-bad-soft px-3 py-2 text-[13px] text-bad-ink2"
    >
      {awayErrorMessage(t, error)}
    </p>
  );
}
