import axios from 'axios';

/**
 * Der deutsche Satz, den eine Route im Feld `message` schickt — Axios' eigener
 * Text wäre „Request failed with status code 403“.
 */
export function serverMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { message?: unknown } | undefined)?.message;
    return typeof message === 'string' && message ? message : fallback;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}
