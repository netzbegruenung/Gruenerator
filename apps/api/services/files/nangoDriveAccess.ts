/**
 * Die Nango-Naht der Drive-Anbieter: Welche Konten hat die Person verbunden,
 * und welches Zugriffstoken gilt gerade.
 *
 * Läuft über `ConnectionService` und nie daran vorbei — dort sitzen die
 * HIDDEN-/ADMIN_ONLY-Mengen, und Nango erneuert die Token.
 */
import { ConnectionService } from '../connections/ConnectionService.js';

import { reauthError } from './driveErrors.js';

import type { NangoProviderKey } from '../../config/nango.js';

/** Die Nango-Verbindungs-Id des Kontos, oder `null`, wenn nichts verbunden ist. */
export async function findNangoConnectionId(
  userId: string,
  provider: NangoProviderKey
): Promise<string | null> {
  const connections = await ConnectionService.listConnections(userId);
  return connections.find((c) => c.provider === provider && c.connected)?.connectionId ?? null;
}

/** Frisches Zugriffstoken. Jeder Fehler (nicht verbunden, gesperrt, Nango aus) ist „neu verbinden". */
export async function getNangoAccessToken(
  userId: string,
  provider: NangoProviderKey
): Promise<string> {
  try {
    return (await ConnectionService.getConnection(userId, provider)).accessToken;
  } catch {
    throw reauthError();
  }
}
