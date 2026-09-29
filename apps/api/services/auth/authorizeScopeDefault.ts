/**
 * Wer an `/oauth2/authorize` keinen `scope` schickt, bekommt die Default-Liste —
 * nicht alles, was der Client haben dürfte.
 *
 * better-auth 1.7 kennt dafür nur eine Liste pro Client: `client.scopes` ist
 * zugleich Obergrenze und Vorgabe, wenn `scope` fehlt. Eine dynamische
 * Registrierung speichert dort immer `clientRegistrationDefaultScopes` ∪
 * `clientRegistrationAllowedScopes`, egal was der Client angefragt hat. Damit
 * lässt sich „wer `chat:completions` ausdrücklich anfragt, bekommt ihn — wer
 * nichts angibt, nicht" nicht mehr über die Registrierung ausdrücken (#3668).
 * Das Excel-Add-in registriert sich aber genau so, und claude.ai lässt `scope`
 * weg.
 *
 * Also trennen wir beides: die Obergrenze enthält `chat:completions`
 * (`clientRegistrationAllowedScopes`), und die Vorgabe setzt dieser Haken, bevor
 * der Endpunkt auf `client.scopes` zurückfällt. Das trifft auch die aus 1.6
 * übernommenen Clients: deren `scopes` ist NULL, und ohne Haken fiele der
 * Endpunkt dort auf `opts.scopes` zurück — also samt `chat:completions`.
 *
 * Nach dem Login ruft das Plugin den Endpunkt intern erneut auf, ohne Haken —
 * das ist unschädlich, weil die signierte Anfrage den eingesetzten `scope`
 * schon trägt.
 */

import { createAuthMiddleware } from 'better-auth/api';

export function defaultAuthorizeScope(defaultScopes: readonly string[]) {
  const scope = defaultScopes.join(' ');
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== '/oauth2/authorize') return;
    // Der Endpunkt liest bei POST den Formular-Body, sonst die Query.
    if (ctx.method === 'POST') {
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      if (body.scope) return;
      return { context: { body: { ...body, scope } } };
    }
    const query = ctx.query ?? {};
    if (query.scope) return;
    return { context: { query: { ...query, scope } } };
  });
}
