/**
 * Was jede Cortecs-Anfrage mitführen muss — und was danach nachgeprüft wird.
 *
 * Cortecs ist ein Router: es vermittelt an Unteranbieter ("Upstream Inference
 * Providers" in seiner Auftragsverarbeitungsvereinbarung, Stand 11.08.2026).
 * Dieser Wrapper trägt zwei Dinge, die beide load-bearing sind.
 *
 * ── 1. DER DENK-PIN ───────────────────────────────────────────────────────
 *
 * Gemma 4 26B-A4B denkt von Haus aus, legt die Gedanken in ein Feld, das das
 * Chat-Completions-Schema des AI SDK nicht liest, und rechnet sie trotzdem
 * gegen `max_tokens`. Ohne Pin kommt bei knappem Budget LEERER Inhalt zurück,
 * und eine leere Antwort ist für die Fassade kein Fehler — sie startet die
 * ganze Fallback-Kette. Gemessen 21.08.2026 über Cortecs, `max_tokens: 120`:
 *
 *   ohne Parameter          → content LEER, 550 Zeichen Denken, finish=length
 *   reasoning_effort=low    → content LEER, 521 Zeichen Denken, finish=length
 *   reasoning_effort=none   → content 477 Zeichen, kein Denken, finish=stop
 *
 * WARUM EINE WHITELIST, anders als bei Scaleway. Der Scaleway-Wrapper pinnt
 * bedingungslos, mit der ausdrücklichen Begründung, Scaleway sei "not a fan-out
 * over many backends, so there is no lane here that might reject the enum
 * value". Cortecs IST ein Fan-out, und genau dieses Risiko ist eingetreten:
 * `gemma-4-31b-it` (Unteranbieter infercom) weist `none` mit HTTP 400 ab —
 * "value must be one of 'low', 'medium', 'high'". Ein bedingungsloser Pin
 * machte damit jedes künftig ergänzte Cortecs-Modell zum harten Fehler statt
 * zum teuren Erfolg. Whitelist und nicht Sperrliste, weil ein unbekanntes
 * Modell ohne Pin höchstens denkt, mit Pin aber bricht.
 *
 * ── 2. DIE SOUVERÄNITÄTS-WEISUNG, UND WARUM SIE NACHGEPRÜFT WIRD ──────────
 *
 * Wir nutzen ausschliesslich Unteranbieter mit Zero Data Retention, die in der
 * EU/im EWR sitzen UND dort reguliert sind. Die DPA-Tabelle listet drei, auf
 * die das nicht zutrifft — Microsoft Ireland (ZDR: NEIN), Google Cloud EMEA
 * und AWS EMEA (beide ZDR, aber Drittlandtransfer über das EU-US Data Privacy
 * Framework). Die übrigen elf erfüllen beides.
 *
 * Das ist keine blosse Einstellung, sondern die vertragliche Weisung: nach
 * Ziffer 2.11 der DPA gilt die Routing-Konfiguration als dokumentierte
 * Weisung, und wer "full availability of providers" stehen lässt, autorisiert
 * neue Unterauftragnehmer AUTOMATISCH, sobald Cortecs sie aufnimmt. Eine
 * eingeschränkte Auswahl dreht das um: neue Unterauftragnehmer werden erst
 * nach ausdrücklicher Freigabe eingesetzt.
 *
 * DER FILTER ALLEIN TRÄGT NICHT. Gemessen am 21.08.2026:
 *
 *   allowed_providers: ['mistral']   auf einem Modell, das dort nicht liegt
 *                                    → HTTP 404, korrekt geblockt
 *   allowed_providers: ['__keiner__'] → läuft DURCH, Filter still ignoriert
 *   allowed_providers: ['aki']       → antwortet, Header sagt `scaleway`
 *
 * Ein unbekannter Name hebt den Filter also auf, statt zu sperren — fail-open.
 * Ein Tippfehler, ein umbenannter Anbieter oder ein Feldname, den Cortecs
 * künftig anders liest, schaltet den Schutz lautlos ab. Deshalb prüft dieser
 * Wrapper die ANTWORT: `x-cortecs-provider` nennt, wer tatsächlich gerechnet
 * hat, und ein Name ausserhalb der Positivliste wird als Fehler protokolliert.
 *
 * Was die Prüfung NICHT kann: die Übermittlung rückgängig machen. Sie ist
 * Entdeckung, nicht Verhinderung — der einzige Punkt, an dem sich das
 * Fail-open von aussen überhaupt bemerken lässt.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('cortecsRequestPolicy');

/**
 * Cortecs-Modelle, für die `reasoning_effort: 'none'` gemessen funktioniert.
 *
 * STAND 21.08.2026: keine aktive Lane fährt dieses Modell mehr über Cortecs —
 * die ID ist dort unbedienbar geworden, und die Lanes sind auf `gemma-4-31b-it`
 * bzw. GreenPT ausgewichen. Der Eintrag bleibt trotzdem stehen: er ist die
 * gemessene Aussage über dieses Modell, und wenn Cortecs den Endpunkt
 * zurückbringt, muss der Pin sofort wieder greifen. Ohne ihn kommt bei knappem
 * Budget leerer Inhalt.
 *
 * `gemma-4-31b-it` steht hier NICHT, und der Grund ist nicht der, der bis zum
 * 25.08.2026 an mehreren Stellen im Repo stand („infercom weist
 * `reasoning_effort` mit HTTP 400 ab"). Live nachgemessen am 25.08.2026 gegen
 * api.cortecs.ai stimmt das so nicht:
 *
 *   reasoning_effort: 'low' | 'medium' | 'high'  → HTTP 200, aber WIRKUNGSLOS
 *                                                  (0 Zeichen Reasoning, Antwort
 *                                                  zeichengleich zum Baseline)
 *   reasoning_effort: 'none'                     → HTTP 400 „value must be one
 *                                                  of 'low', 'medium', 'high'"
 *
 * Es ist also genau umgekehrt: die GRADIERTEN Werte gehen durch und tun
 * nichts, und `none` ist der abgelehnte. Ein Pin wäre hier deshalb doppelt
 * sinnlos — er würde abgelehnt, und das Modell denkt ohne Flag ohnehin nicht
 * (gemessen: 0 Zeichen Reasoning im Baseline).
 *
 * Der Hebel, der auf diesem Host WIRKT, ist `chat_template_kwargs.enable_thinking`
 * — an wie aus, beides bestätigt. Er sitzt nicht hier, sondern im Denk-Strom
 * (services/ai/regoloReasoningStream.ts), weil nur der die `reasoning_content`-
 * Deltas auch lesen kann.
 */
const REASONING_OFF_MODELS: ReadonlySet<string> = new Set(['gemma-4-26b-a4b-it']);

/**
 * Die Unterauftragnehmer, die Zero Data Retention führen UND in der EU/im EWR
 * ansässig und reguliert sind — nach der DPA-Tabelle vom 11.08.2026.
 *
 * Bewusst NICHT enthalten: `microsoft` (ZDR: nein), `google` und `amazon`
 * (Drittlandtransfer über das EU-US Data Privacy Framework).
 *
 * Die Kurznamen sind Cortecs' interne Kennungen, nicht die Firmennamen der
 * DPA. Belegt sind bislang `scaleway`, `mistral`, `infercom`, `ovh` (aus
 * Antwort-Headern) und `aki` (aus einer 404-Fehlermeldung); der Rest ist aus
 * dem Firmennamen abgeleitet. Ein daneben geratener Name ist für die ANFRAGE
 * folgenlos (Cortecs ignoriert ihn), für die PRÜFUNG aber nicht: taucht er im
 * Header auf, ohne hier zu stehen, schlägt sie an. Genau so herum ist es
 * richtig — die Prüfung soll bei Unbekanntem laut werden, nicht schweigen.
 */
export const SOVEREIGN_ZDR_PROVIDERS: readonly string[] = [
  'aki',
  'scaleway',
  'nebius',
  'mistral',
  'ovh',
  'stackit',
  'ionos',
  'inceptron',
  'tensorx',
  'infercom',
  'berget',
];

const ALLOWED = new Set(SOVEREIGN_ZDR_PROVIDERS);

/** Der Header, in dem Cortecs den tatsächlich eingesetzten Unterauftragnehmer
 *  nennt. Gemessen 21.08.2026 bei JEDER erfolgreichen Antwort, gestreamt wie
 *  ungestreamt (beim Streaming vor dem ersten `data:`-Chunk); NICHT bei
 *  Fehlerantworten. Das Body-Feld `provider`, das Cortecs' OpenAPI-Schema
 *  zusagt, gibt es nicht — die Antwort trägt nur
 *  `id, created, model, object, choices, usage`. */
export const CORTECS_UPSTREAM_HEADER = 'x-cortecs-provider';

/**
 * WANN er kommt — und warum das die Fehlersuche begrenzt.
 *
 * Hier stand bis zum 01.09.2026 „beim Streaming vor dem ersten `data:`-Chunk",
 * was als „vorher, also auch ohne Antwort verfügbar" gelesen werden kann. So
 * ist es nicht. Gemessen am 01.09.2026 gegen `gemma-4-31b-it`, gestreamt, bei
 * 200 / 16 000 / 64 000 Eingabe-Tokens (Prefill 0,4 s / 1,8 s / 6,1 s):
 *
 *   Header @13201 ms   erstes Token @13202 ms   Vorlauf 1 ms
 *   Header @ 1751 ms   erstes Token @ 1751 ms   Vorlauf 0 ms
 *   Header @ 6091 ms   erstes Token @ 6091 ms   Vorlauf 0 ms
 *
 * Cortecs hält die Antwort-Header also zurück, bis der Upstream tatsächlich
 * etwas produziert — auch über sechs Sekunden Prefill hinweg. Für die
 * Buchhaltung genügt das (sie läuft ohnehin nur bei einer Antwort). Für die
 * Fehlersuche heisst es: **bei einem First-Token-Timeout gibt es keinen
 * Header.** Welcher der beiden Unterauftragnehmer stillstand, ist aus einem
 * gescheiterten Zug nicht rekonstruierbar, und kein Logging ändert daran
 * etwas; wer es wissen muss, misst mit `allowed_providers: ['infercom']` bzw.
 * `['berget']` gegen den Endpunkt.
 */

/**
 * Wer eine Cortecs-Anfrage tatsächlich bedient hat, für die Nutzungserfassung.
 *
 * Die Buchhaltung führt den UPSTREAM, nicht den Lane-Namen — dasselbe Muster,
 * nach dem Scaleway-geroutetes Mistral Medium unter `scaleway` landet und nicht
 * unter `mistral`. Bei einem Router ist das kein Detail: die
 * CO₂-Koeffizienten in services/usage/energyFootprint.ts hängen am STANDORT,
 * und zwischen Scaleway (Frankreich, 24 g/kWh) und einem deutschen
 * Unterauftragnehmer (363) liegt Faktor 15. Solange die Lane `cortecs`
 * schriebe, wäre dieser Unterschied unsichtbar, obwohl er bei jeder Anfrage
 * gemessen vorliegt.
 *
 * Fällt auf den Lane-Namen zurück, wenn kein Header kam — dann ist `cortecs`
 * die ehrlichere Auskunft als ein geratener Standort.
 */
export function resolveCortecsUpstream(headers: unknown): string | null {
  const value = readHeader(headers, CORTECS_UPSTREAM_HEADER);
  return value === null || value.length === 0 ? null : value;
}

/** Header aus dem, was der Provider durchreicht: ein `Headers`-Objekt oder das
 *  einfache Record, das das AI SDK aus einer Antwort baut. */
function readHeader(headers: unknown, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  if (typeof headers === 'object' && headers !== null) {
    const record = headers as Record<string, unknown>;
    const hit = record[name] ?? record[name.toLowerCase()];
    return typeof hit === 'string' ? hit : null;
  }
  return null;
}

export const cortecsFetchWithPolicy: typeof fetch = async (input, init) => {
  let request = init;
  if (init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      // Chat-Anfragen tragen `messages`, Embeddings-Anfragen `input` — die
      // Weisung gilt für beide, und zwar nach Vorhandensein des Felds, nicht
      // nach Wahrheitswert: `input: ''` ist eine Anfrage, die hinausgeht.
      // Der Denk-Pin bleibt eine Chat-Angelegenheit.
      const isChat = 'messages' in parsed;
      if (typeof parsed.model === 'string' && (isChat || 'input' in parsed)) {
        if (isChat && REASONING_OFF_MODELS.has(parsed.model)) {
          parsed.reasoning_effort = 'none';
        }
        // Die dokumentierte Weisung nach DPA 2.11. `eu_native` und
        // `allow_zero_data_retention` sind Cortecs' eigene Filter, die
        // Positivliste ist die engere Aussage darüber.
        parsed.eu_native = true;
        parsed.allow_zero_data_retention = true;
        parsed.allowed_providers = SOVEREIGN_ZDR_PROVIDERS;
        request = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // Kein JSON-Body (z. B. multipart) — unverändert durchreichen.
    }
  }

  const response = await fetch(input, request);
  assertSovereignUpstream(response);
  return response;
};

/**
 * Prüft im Nachhinein, wer geantwortet hat.
 *
 * Kein Wurf und kein Verwerfen der Antwort: die Übermittlung hat zu diesem
 * Zeitpunkt stattgefunden, eine kaputte Lane macht sie nicht ungeschehen. Was
 * hier zählt, ist dass es AUFFÄLLT — ein stiller Fail-open-Filter ist sonst
 * von aussen nicht von einem wirksamen zu unterscheiden.
 */
export function assertSovereignUpstream(response: Response): void {
  const upstream = response.headers.get(CORTECS_UPSTREAM_HEADER);
  if (!upstream) {
    // Nur bei einer erfolgreichen Antwort aussagekräftig — Fehlerantworten
    // (401 bei leerem Guthaben, 400 bei abgelehntem Parameter) tragen den
    // Header nicht, und dafür gibt es nichts zu melden.
    if (response.ok) {
      log.warn('Antwort ohne x-cortecs-provider — der Unterauftragnehmer ist unbekannt');
    }
    return;
  }
  if (!ALLOWED.has(upstream)) {
    log.error(
      `Cortecs hat an "${upstream}" vermittelt — dieser Unterauftragnehmer steht NICHT auf der ` +
        `Positivliste (Zero Data Retention + EU-Ansässigkeit). Der allowed_providers-Filter ist ` +
        `fail-open; siehe cortecsRequestPolicy.ts.`
    );
  }
}
