// SPDX-License-Identifier: MPL-2.0
/**
 * Ein Fehler, dessen Meldung für Menschen geschrieben ist. Erkannt am Feld
 * `userFacing`, nicht an einer Klasse: injizierte Dienste (apps/web) müssen dafür
 * nicht das ganze Editor-Paket importieren.
 */
export type UserFacingError = Error & { userFacing: true };

export function userFacingError(message: string): UserFacingError {
  return Object.assign(new Error(message), { userFacing: true as const });
}

export function userFacingMessage(error: unknown): string | null {
  return error instanceof Error &&
    (error as Partial<UserFacingError>).userFacing === true &&
    error.message
    ? error.message
    : null;
}
