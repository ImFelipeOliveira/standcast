import { ApiError } from '../../api/client';

const SERVER_MESSAGES = ['away_overlap', 'invalid_away_period'];

export function awayErrorMessage(fallback: string, error: unknown): string {
  return error instanceof ApiError && SERVER_MESSAGES.includes(error.code)
    ? error.message
    : fallback;
}
