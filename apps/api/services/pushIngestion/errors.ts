/**
 * Typed error carrying the HTTP status the push-ingest router should return.
 * Keeps the target services free of Express while letting the thin router map
 * failures to the right contract status code.
 */
export type PushIngestErrorStatus = 400 | 403 | 404 | 422 | 500;

export class PushIngestError extends Error {
  constructor(
    public readonly status: PushIngestErrorStatus,
    message: string
  ) {
    super(message);
    this.name = 'PushIngestError';
  }
}
