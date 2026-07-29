/**
 * Rug-pull detection for user-connected MCP servers.
 *
 * We let users connect arbitrary external servers. A tool's DESCRIPTION is an
 * instruction the model obeys, so a server that rewrites one after the user
 * approved it has a prompt-injection channel that needs no user interaction at
 * all. Fingerprinting the approved definitions and diffing on every load closes
 * it.
 *
 * `fingerprintTools` / `detectToolDrift` come from `ai` and work on any
 * `ToolSet` — adopting them costs nothing and does NOT require replacing
 * `UserMCPClient` with the SDK's MCP client (ours carries SSRF revalidation per
 * connect, widget extraction and call serialisation that we want to keep).
 *
 * WHAT THIS CANNOT SEE — document it, don't imply otherwise: the fingerprint
 * covers name, description and input schema. A server that keeps all three
 * identical and changes what the tool DOES on its side is invisible here,
 * because the tool runs remotely. This detects definition drift, not behaviour
 * drift.
 */
import { detectToolDrift, fingerprintTools, type ToolSet } from 'ai';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('mcpToolDrift');

export interface ToolDriftVerdict {
  /** Fingerprints of the tool set as it looks right now. */
  current: Record<string, string>;
  /** Tools whose definition changed since approval — the rug-pull signal. */
  changed: string[];
  /** Tools that appeared since approval. New instructions, also unapproved. */
  added: string[];
  /** Tools that disappeared. Not a security event; the server shrank. */
  removed: string[];
  /**
   * True when the server has no baseline yet and this load establishes one.
   * Callers must NOT block in that case — see `tool_fingerprints` being
   * nullable, otherwise every pre-existing connection breaks on deploy.
   */
  baselineEstablished: boolean;
  /** Whether this server's tools must be withheld from the model this turn. */
  blocked: boolean;
}

/**
 * Diff a freshly loaded tool set against the approved baseline.
 *
 * `baseline == null` means the server was connected before fingerprinting
 * existed (or is being connected right now): record, don't block.
 */
export async function evaluateToolDrift(
  tools: ToolSet,
  baseline: Record<string, string> | null | undefined,
  serverLabel: string
): Promise<ToolDriftVerdict> {
  const current = await fingerprintTools(tools);

  if (baseline == null) {
    return {
      current,
      changed: [],
      added: [],
      removed: [],
      baselineEstablished: true,
      blocked: false,
    };
  }

  const drift = detectToolDrift(current, baseline);
  // `removed` alone is not a security event: the server dropped a tool, which
  // can only reduce what the model can be told to do.
  const blocked = drift.changed.length > 0 || drift.added.length > 0;

  if (blocked) {
    log.warn(
      `[mcpToolDrift] "${serverLabel}" tool definitions drifted — changed=[${drift.changed.join(
        ', '
      )}] added=[${drift.added.join(', ')}]; withholding this server's tools`
    );
  }

  return {
    current,
    changed: drift.changed,
    added: drift.added,
    removed: drift.removed,
    baselineEstablished: false,
    blocked,
  };
}

/** User-facing German explanation of why a server's tools were withheld. */
export function describeDrift(serverLabel: string, verdict: ToolDriftVerdict): string {
  const parts: string[] = [];
  if (verdict.changed.length > 0) {
    parts.push(`geändert: ${verdict.changed.join(', ')}`);
  }
  if (verdict.added.length > 0) {
    parts.push(`neu: ${verdict.added.join(', ')}`);
  }
  return (
    `Der MCP-Server „${serverLabel}" hat seine Werkzeug-Beschreibungen seit der Freigabe ` +
    `verändert (${parts.join('; ')}). Die Werkzeuge dieses Servers wurden deshalb für ` +
    `diese Anfrage nicht verwendet. Bitte prüfe den Server in den Einstellungen und gib ` +
    `ihn erneut frei.`
  );
}
