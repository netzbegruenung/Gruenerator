/**
 * Übersetzt einen fehlgeschlagenen MCP-Kontakt in einen Satz, mit dem eine
 * Person etwas anfangen kann.
 *
 * Vorher lief alles durch `toUserFacingMessage`, das für Medien- und KI-Jobs
 * gebaut ist: es ersetzt jede mehrzeilige oder längere Meldung durch einen
 * generischen Satz. Ein 404 auf der Server-URL, ein abgelaufenes Token und ein
 * selbstsigniertes Zertifikat sahen dadurch identisch aus — obwohl die Abhilfe
 * jedes Mal eine andere ist.
 *
 * Die Zuordnung rät NICHT am Meldungstext herum, wo es etwas Besseres gibt:
 * `StreamableHTTPError` und `SseError` des SDK tragen den HTTP-Status als
 * `code`, Node-`fetch`-Fehler den Netzwerkgrund als `cause.code`. Nur die
 * Protokoll- und Capability-Fehler des SDK sind reine Texte.
 *
 * `hint` ist der Handgriff, nicht die Diagnose — er steht im UI unter der
 * Meldung und darf leer bleiben, wenn es nichts zu tun gibt.
 */

/** Warum ein Konnektor nichts liefert. Auch die gutartigen Fälle haben einen Code. */
export type McpReasonCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_authorized_yet'
  | 'endpoint_not_found'
  | 'not_an_mcp_endpoint'
  | 'protocol_unsupported'
  | 'invalid_response'
  | 'tls'
  | 'dns'
  | 'refused'
  | 'timeout'
  | 'blocked_url'
  | 'server_error'
  | 'no_tools_capability'
  | 'empty_tool_list'
  | 'unknown';

export interface McpReason {
  code: McpReasonCode;
  /** Ein vollständiger deutscher Satz — das, was die Person zuerst liest. */
  message: string;
  /** Was sie tun kann. Leer, wenn wir nichts Ehrliches anzubieten haben. */
  hint?: string;
}

function statusOf(err: unknown): number | null {
  // StreamableHTTPError/SseError tragen den HTTP-Status; McpError nutzt dasselbe
  // Feld für JSON-RPC-Codes, die negativ sind — die gehören nicht hierher.
  const code = (err as { code?: unknown }).code;
  return typeof code === 'number' && code > 0 ? code : null;
}

function causeCodeOf(err: unknown): string | null {
  const cause = (err as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === 'string' ? cause.code : null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? '');
}

/**
 * Ein erreichbarer Server, der keine Werkzeuge liefert, ist kein Fehler — aber
 * auch kein Erfolg. Die `tools`-Capability trennt „bietet gar keine Werkzeuge
 * an" von „bietet welche an, gibt aber keine heraus" (fast immer: Anmeldung).
 */
export function describeEmptyToolList(hasToolsCapability: boolean): McpReason {
  return hasToolsCapability
    ? {
        code: 'empty_tool_list',
        message: 'Der Server ist erreichbar, gibt aber keine Werkzeuge heraus.',
        hint: 'Das deutet meist auf eine fehlende oder abgelaufene Anmeldung hin — prüfe Token bzw. Autorisierung.',
      }
    : {
        code: 'no_tools_capability',
        message: 'Dieser Server bietet gar keine Werkzeuge an.',
        hint: 'Er stellt womöglich nur Ressourcen oder Prompts bereit — die kann der Chat derzeit nicht nutzen.',
      };
}

/** Einen geworfenen Fehler in Diagnose plus Handgriff übersetzen. */
export function classifyMcpFailure(err: unknown, ctx: { name: string; url: string }): McpReason {
  const raw = messageOf(err);

  // Unsere eigenen Meldungen sind bereits nutzerfertig.
  if (/kein gültiger Zugang/i.test(raw)) {
    return {
      code: 'not_authorized_yet',
      message: raw,
      hint: 'Über „Autorisieren" neu anmelden oder das Token erneut hinterlegen.',
    };
  }
  if (/Unsichere MCP-Server-URL/i.test(raw)) {
    return {
      code: 'blocked_url',
      message: raw,
      hint: 'Der Server muss öffentlich erreichbar sein — lokale Adressen und interne Netze sind gesperrt.',
    };
  }

  const status = statusOf(err);
  if (status === 401 || /UnauthorizedError|\bUnauthorized\b/i.test(raw)) {
    return {
      code: 'unauthorized',
      message: `„${ctx.name}" verlangt eine Anmeldung (HTTP 401).`,
      hint: 'Token hinterlegen oder den Konnektor autorisieren. Ein bereits hinterlegtes Token ist womöglich abgelaufen.',
    };
  }
  if (status === 403) {
    return {
      code: 'forbidden',
      message: `„${ctx.name}" weist den Zugriff ab (HTTP 403).`,
      hint: 'Das Token ist gültig, reicht aber nicht aus — prüfe die Berechtigungen bzw. Scopes beim Anbieter.',
    };
  }
  if (status === 404) {
    return {
      code: 'endpoint_not_found',
      message: `Unter dieser URL antwortet kein MCP-Server (HTTP 404).`,
      hint: 'Häufig fehlt der Pfad: die meisten Server hören auf /mcp, ältere auf /sse.',
    };
  }
  if (status === 405 || status === 406 || status === 400) {
    return {
      code: 'not_an_mcp_endpoint',
      message: `„${ctx.name}" hat die MCP-Anfrage abgelehnt (HTTP ${status}).`,
      hint: 'Beide Transporte wurden probiert. Meist zeigt die URL auf die falsche Route — prüfe sie beim Anbieter.',
    };
  }
  if (status !== null && status >= 500) {
    return {
      code: 'server_error',
      message: `„${ctx.name}" meldet einen internen Fehler (HTTP ${status}).`,
      hint: 'Das liegt beim Server selbst — später erneut versuchen.',
    };
  }

  const cause = causeCodeOf(err);
  if (cause && /CERT|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(cause)) {
    return {
      code: 'tls',
      message: `Das TLS-Zertifikat von „${ctx.name}" ist nicht vertrauenswürdig (${cause}).`,
      hint: 'Selbstsignierte Zertifikate werden nicht akzeptiert — ein gültiges Zertifikat einrichten (z. B. Let’s Encrypt).',
    };
  }
  if (cause === 'ENOTFOUND' || cause === 'EAI_AGAIN') {
    return {
      code: 'dns',
      message: `Der Hostname aus der URL lässt sich nicht auflösen (${cause}).`,
      hint: 'Schreibweise der Adresse prüfen.',
    };
  }
  if (cause === 'ECONNREFUSED') {
    return {
      code: 'refused',
      message: `„${ctx.name}" nimmt keine Verbindung an (Verbindung abgelehnt).`,
      hint: 'Läuft der Server, und ist der Port von außen erreichbar?',
    };
  }
  if (cause === 'ETIMEDOUT' || /timed? ?out|timeout/i.test(raw)) {
    return {
      code: 'timeout',
      message: `„${ctx.name}" hat nicht rechtzeitig geantwortet.`,
      hint: 'Der Server ist zu langsam oder blockiert — später erneut versuchen.',
    };
  }

  const protocolMismatch = /protocol version is not supported: (\S+)/i.exec(raw);
  if (protocolMismatch) {
    return {
      code: 'protocol_unsupported',
      message: `„${ctx.name}" spricht die MCP-Protokollversion ${protocolMismatch[1]}, die wir nicht unterstützen.`,
      hint: 'Server auf eine aktuelle MCP-Bibliothek heben.',
    };
  }
  if (/does not support tools/i.test(raw)) {
    return describeEmptyToolList(false);
  }
  if (/invalid initialize result|Unexpected content type/i.test(raw) || err instanceof TypeError) {
    return {
      code: 'invalid_response',
      message: `„${ctx.name}" hat keine gültige MCP-Antwort geliefert.`,
      hint: 'Antwortet unter dieser URL wirklich ein MCP-Server?',
    };
  }
  // ZodError: mehrzeilig, mit `issues` — als Ganzes unbrauchbar fürs UI, aber
  // die Aussage dahinter ist eindeutig.
  if (Array.isArray((err as { issues?: unknown }).issues)) {
    return {
      code: 'invalid_response',
      message: `„${ctx.name}" hat eine Antwort in unerwartetem Format geliefert.`,
      hint: 'Die Rohmeldung steht im Server-Log; das Diagnose-Skript scripts/probe-mcp.ts zeigt sie im Detail.',
    };
  }

  return {
    code: 'unknown',
    message: `„${ctx.name}" konnte nicht verbunden werden.`,
    // Kurze technische Meldungen sind besser als nichts; lange sind Rauschen.
    ...(raw && raw.length <= 160 && !raw.includes('\n') ? { hint: raw } : {}),
  };
}
