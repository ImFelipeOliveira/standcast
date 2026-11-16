import { type FormEvent, useState } from 'react';
import { useMarkAway } from '../../api/mutations';
import { AwayFormView } from './AwayFormView';

export function AwayForm({
  installationId,
  login,
  onDone,
}: {
  installationId: number;
  login?: string;
  onDone?: () => void;
}) {
  const mark = useMarkAway(installationId);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [problem, setProblem] = useState<unknown>(null);
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      await mark.mutateAsync({ ...(from ? { from } : {}), until, ...(login ? { login } : {}) });
      setFrom('');
      setUntil('');
      onDone?.();
    } catch (error) {
      setProblem(error);
    }
  };
  return (
    <AwayFormView
      login={login}
      from={from}
      until={until}
      onFrom={setFrom}
      onUntil={setUntil}
      pending={mark.isPending}
      problem={problem}
      onSubmit={(event) => void onSubmit(event)}
    />
  );
}
