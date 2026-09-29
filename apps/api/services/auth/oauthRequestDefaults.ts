/**
 * Zwei Korrekturen an OAuth-Anfragen, bevor better-auth sie sieht. better-auth
 * nimmt nur einen `hooks.before`, deshalb stehen beide hier.
 *
 * **Scope.** Wer an `/oauth2/authorize` keinen `scope` schickt, bekommt die
 * Default-Liste — nicht alles, was der Client haben dürfte.
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
 *
 * **Resource.** better-auth 1.7 gleicht `resource` (RFC 8707) exakt gegen die
 * registrierte Ressource ab, also `https://mcp.gruenerator.eu` ohne Slash. Das
 * MCP-SDK sendet aber `new URL(resource).href`, und das hängt bei einer
 * pfadlosen URL einen Slash an. Jede Anmeldung über claude.ai endete deshalb
 * mit `invalid_target`. Nach RFC 3986 §6.2.3 sind beide Schreibweisen dieselbe
 * Ressource, deshalb schreiben wir auf `/oauth2/authorize` und `/oauth2/token`
 * die registrierte Form ein. Das Token trägt dann genau das `aud`, das
 * `verifyOAuthResourceRequest` erwartet.
 *
 * Ein Token-Aufruf mit MEHREREN `resource`-Werten liest better-auth selbst noch
 * einmal aus dem rohen Formular, an diesem Haken vorbei. Wir haben nur eine
 * Ressource, ein Client schickt dort also genau einen Wert.
 */

import { createAuthMiddleware } from 'better-auth/api';

function canonicalResource(value: unknown, resource: string): unknown {
  if (Array.isArray(value)) return value.map((v) => canonicalResource(v, resource));
  if (typeof value !== 'string') return value;
  try {
    return new URL(value).href === new URL(resource).href ? resource : value;
  } catch {
    // Keine URL — die Ablehnung gehört better-auth.
    return value;
  }
}

export function oauthRequestDefaults(defaultScopes: readonly string[], resource: string) {
  const scope = defaultScopes.join(' ');
  return createAuthMiddleware(async (ctx) => {
    const isAuthorize = ctx.path === '/oauth2/authorize';
    if (!isAuthorize && ctx.path !== '/oauth2/token') return;
    // Beide Endpunkte lesen bei POST den Formular-Body, sonst die Query.
    const inBody = ctx.method === 'POST';
    const params = { ...((inBody ? ctx.body : ctx.query) ?? {}) } as Record<string, unknown>;
    if (isAuthorize && !params.scope) params.scope = scope;
    if (params.resource !== undefined)
      params.resource = canonicalResource(params.resource, resource);
    return { context: inBody ? { body: params } : { query: params } };
  });
}
