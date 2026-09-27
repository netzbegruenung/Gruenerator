import { describe, it, expect } from 'vitest';

import { classifyMcpFailure, describeEmptyToolList } from './mcpFailure.js';

const ctx = { name: 'Mein Server', url: 'https://mcp.example.org/mcp' };

/** Nachbau der SDK-Transportfehler: beide tragen den HTTP-Status als `code`. */
function transportError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Nachbau eines Node-fetch-Fehlers: der Grund steht in `cause.code`. */
function fetchError(causeCode: string): Error {
  return Object.assign(new TypeError('fetch failed'), { cause: { code: causeCode } });
}

describe('classifyMcpFailure', () => {
  it.each([
    [401, 'unauthorized', /Anmeldung/],
    [403, 'forbidden', /weist den Zugriff ab/],
    [404, 'endpoint_not_found', /kein MCP-Server/],
    [405, 'not_an_mcp_endpoint', /abgelehnt/],
    [503, 'server_error', /interne/],
  ])('ordnet HTTP %i als %s ein', (status, code, messagePattern) => {
    const reason = classifyMcpFailure(
      transportError(status, `Streamable HTTP error: Error POSTing to endpoint: …`),
      ctx
    );
    expect(reason.code).toBe(code);
    expect(reason.message).toMatch(messagePattern);
    expect(reason.hint).toBeTruthy();
  });

  it('erkennt ein nicht vertrauenswürdiges Zertifikat', () => {
    // Der wahrscheinlichste Fall bei einem selbstgehosteten Server.
    const reason = classifyMcpFailure(fetchError('DEPTH_ZERO_SELF_SIGNED_CERT'), ctx);
    expect(reason.code).toBe('tls');
    expect(reason.hint).toMatch(/Zertifikat/);
  });

  it.each([
    ['ENOTFOUND', 'dns'],
    ['ECONNREFUSED', 'refused'],
    ['ETIMEDOUT', 'timeout'],
  ])('ordnet den Netzwerkgrund %s als %s ein', (cause, code) => {
    expect(classifyMcpFailure(fetchError(cause), ctx).code).toBe(code);
  });

  it('nennt die nicht unterstützte Protokollversion beim Namen', () => {
    const reason = classifyMcpFailure(
      new Error("Server's protocol version is not supported: 2023-01-01"),
      ctx
    );
    expect(reason.code).toBe('protocol_unsupported');
    expect(reason.message).toContain('2023-01-01');
  });

  it('behandelt einen ZodError als Formatproblem statt ihn durchzureichen', () => {
    // Die Rohmeldung ist mehrzeilig und im UI unbrauchbar.
    const zodLike = Object.assign(new Error('[\n  {\n "code": "invalid_type"\n }\n]'), {
      issues: [{ code: 'invalid_type' }],
    });
    const reason = classifyMcpFailure(zodLike, ctx);
    expect(reason.code).toBe('invalid_response');
    expect(reason.message).not.toContain('invalid_type');
  });

  it('reicht unsere eigenen Meldungen unverändert durch', () => {
    const reason = classifyMcpFailure(
      new Error('Für „X" liegt kein gültiger Zugang vor — bitte neu autorisieren.'),
      ctx
    );
    expect(reason.code).toBe('not_authorized_yet');
    expect(reason.message).toContain('kein gültiger Zugang');
  });

  it('verwechselt JSON-RPC-Codes nicht mit HTTP-Status', () => {
    // McpError nutzt dasselbe `code`-Feld, aber negativ.
    const reason = classifyMcpFailure(transportError(-32601, 'Method not found'), ctx);
    expect(reason.code).toBe('unknown');
  });

  it('hängt eine kurze technische Meldung als Hinweis an, eine lange nicht', () => {
    expect(classifyMcpFailure(new Error('socket closed'), ctx).hint).toBe('socket closed');
    expect(classifyMcpFailure(new Error('x'.repeat(300)), ctx).hint).toBeUndefined();
  });
});

describe('describeEmptyToolList', () => {
  it('trennt „bietet keine Werkzeuge an" von „gibt keine heraus"', () => {
    expect(describeEmptyToolList(false).code).toBe('no_tools_capability');
    expect(describeEmptyToolList(true).code).toBe('empty_tool_list');
    // Der zweite Fall ist fast immer ein Anmeldeproblem — genau das soll dastehen.
    expect(describeEmptyToolList(true).hint).toMatch(/Anmeldung|Token/);
  });
});
