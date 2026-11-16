import { ApiError } from '../../api/client';
import type { MessageKey } from '../../i18n';

type Translate = (key: MessageKey) => string;

const AWAY_ERRORS: Record<string, MessageKey> = {
  away_overlap: 'away.error.overlap',
  invalid_away_period: 'away.error.invalidPeriod',
  not_in_team: 'away.error.notInTeam',
  forbidden: 'away.error.forbidden',
};

export function awayErrorMessage(t: Translate, error: unknown): string {
  const key =
    error instanceof ApiError && Object.hasOwn(AWAY_ERRORS, error.code)
      ? AWAY_ERRORS[error.code]
      : undefined;
  return t(key ?? 'setup.actionFailed');
}
