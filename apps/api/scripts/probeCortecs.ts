/**
 * Misst, ob Cortecs (api.cortecs.ai) Scaleway als Upstream ersetzen kann.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/probeCortecs.ts
 *
 * Braucht CORTECS_API_KEY. Kostet ein paar tausend Token. Nichts hier ändert
 * Code oder Konfiguration — das Skript sammelt die Zahlen, mit denen die
 * Entscheidung getroffen wird.
 *
 * ── Was Scaleway heute trägt, und woran ein Ersatz scheitern kann ──────────
 *
 * Der Verkehr auf `provider: 'scaleway'` ist praktisch vollständig Gemma 4
 * 26B-A4B: die Stufen `heavy` und `hedge` in services/ai/intermediateLanes.ts,
 * die Ausweich-Lane GEMMA_4_26B in routes/chat/agents/providers.ts und der
 * Deep-Research-Worker in services/research/deepAgent/models.ts. Dazu die
 * ruhende Mistral-Medium-Route (SCALEWAY_MISTRAL_ROUTING, derzeit aus).
 *
 * Diese Lane sitzt aus EINEM Grund auf Scaleway: der Host reicht
 * `reasoning_effort: 'none'` durch. GreenPT nimmt den Wert an und ignoriert
 * ihn, und das kostete den Deep-Research-Worker den Lauf — 500 s ohne Bericht
 * gegen 156 s (gemessen 10.08.2026, siehe deepAgent/models.ts). Ohne
 * abschaltbares Denken antwortet die Lane bei knappem Budget mit LEEREM
 * `content`, weil das Denken gegen `max_tokens` zählt.
 *
 * Cortecs' Doku kennt für `reasoning_effort` nur `low|medium|high`; `none`
 * steht dort allein bei den AKI-Modellen. Ob der Router den Wert trotzdem
 * durchreicht, ist die Frage, an der der ganze Umzug hängt — und sie ist
 * messbar, nicht ableitbar. Deshalb läuft PROBE_KNAPP mit einem absichtlich
 * kleinen Budget: nur dort wird ein ignoriertes 'none' als leerer Inhalt
 * sichtbar, ein großzügiges Budget verdeckt genau diesen Fehler.
 *
 * Zweite offene Frage: Cortecs ist ein ROUTER, kein Rechenzentrum. Wo eine
 * Anfrage lief, steht erst in der Antwort (`provider`). Für die
 * CO2-Zuordnung (services/usage/energyFootprint.ts nennt heute Scaleway DC5,
 * 24 g/kWh, PUE 1,25) und für die Datenschutzerklärung ist das ein
 * Kategorienwechsel. Das Skript protokolliert deshalb bei jeder Probe, wer
 * geantwortet hat, und stellt `eu_native: true` einmal seiner Gegenprobe
 * gegenüber.
 */

const BASE = 'https://api.cortecs.ai/v1';
const KEY = process.env.CORTECS_API_KEY;

/**
 * Die Modelle, die ein Ersatz führen muss.
 *
 * `bevorzugt` ist die ID, auf die es ankommt, `muster` nur das Netz darunter
 * für den Fall, dass Cortecs umbenennt. Ohne die exakte Wahl griff der erste
 * Lauf für die Gemma-Rolle das 31B ab, weil es im Katalog vorne stand — und
 * hätte damit ein Urteil über ein Modell gefällt, das diese Lane gar nicht
 * fährt.
 */
const GESUCHT: readonly {
  rolle: string;
  bevorzugt: string;
  muster: RegExp;
  heute: string;
}[] = [
  {
    rolle: 'heavy/hedge + Deep-Research-Worker',
    bevorzugt: 'gemma-4-26b-a4b-it',
    muster: /gemma.*26b|gemma.*a4b/i,
    heute: 'gemma-4-26b-a4b-it @ scaleway',
  },
  {
    rolle: 'Deep-Research-Lead + ruhende Medium-Route',
    bevorzugt: 'mistral-medium-3.5',
    muster: /mistral.*medium.*3\.5/i,
    heute: 'mistral-medium-3.5-128b @ scaleway (Route aus, läuft auf Mistral)',
  },
  {
    rolle: 'Geschwister-Lane (modelSiblings)',
    bevorzugt: 'gemma-4-31b-it',
    muster: /gemma.*31b/i,
    heute: 'gemma4-31b @ regolo',
  },
];

const FRAGE = 'Erklaere in drei Saetzen, warum Photovoltaik auf Mehrfamilienhaeusern sinnvoll ist.';

/** Knapp genug, dass ein nicht abgeschaltetes Denken den Inhalt auffrisst.
 *  Das ist der Messpunkt, nicht ein Sparzwang. */
const PROBE_KNAPP = 120;
const PROBE_WEIT = 800;

interface Antwort {
  ok: boolean;
  status: number;
  fehler?: string;
  provider?: string;
  modelZurueck?: string;
  inhalt: string;
  denken: string;
  finish?: string;
  promptTokens?: number;
  completionTokens?: number;
  msGesamt: number;
  toolCalls?: { name: string; args: string }[];
}

interface CortecsBody {
  provider?: string;
  model?: string;
  choices?: {
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: { function?: { name?: string; arguments?: string } }[] | null;
    };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function ruf(body: Record<string, unknown>): Promise<Antwort> {
  const start = Date.now();
  let response: Response;
  try {
    response = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY ?? ''}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      fehler: err instanceof Error ? err.message : String(err),
      inhalt: '',
      denken: '',
      msGesamt: Date.now() - start,
    };
  }
  const roh = await response.text();
  const msGesamt = Date.now() - start;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      fehler: roh.slice(0, 400),
      inhalt: '',
      denken: '',
      msGesamt,
    };
  }
  let daten: CortecsBody;
  try {
    daten = JSON.parse(roh) as CortecsBody;
  } catch {
    return {
      ok: false,
      status: response.status,
      fehler: `kein JSON: ${roh.slice(0, 200)}`,
      inhalt: '',
      denken: '',
      msGesamt,
    };
  }
  const wahl = daten.choices?.[0];
  const werkzeuge = wahl?.message?.tool_calls ?? [];
  return {
    ok: true,
    status: response.status,
    provider: daten.provider,
    modelZurueck: daten.model,
    inhalt: wahl?.message?.content ?? '',
    denken: wahl?.message?.reasoning_content ?? '',
    finish: wahl?.finish_reason,
    promptTokens: daten.usage?.prompt_tokens,
    completionTokens: daten.usage?.completion_tokens,
    msGesamt,
    toolCalls: werkzeuge.map((t) => ({
      name: t.function?.name ?? '(ohne Namen)',
      args: t.function?.arguments ?? '',
    })),
  };
}

function zeile(label: string, a: Antwort): string {
  if (!a.ok) return `  ${label.padEnd(22)} FEHLER ${a.status} — ${a.fehler ?? ''}`;
  const teile = [
    `inhalt=${a.inhalt.length}z`,
    `denken=${a.denken.length}z`,
    // `in=` ist das Signal der Nadelprobe: bricht es weit unter das Gesendete
    // ein, hat der Endpunkt still gekürzt (siehe gemmaHosts.ts, GEMMA_31B_ON_CORTECS).
    `in=${a.promptTokens ?? '?'}tok`,
    `out=${a.completionTokens ?? '?'}tok`,
    `finish=${a.finish ?? '?'}`,
    `${a.msGesamt}ms`,
    `via=${a.provider ?? '?'}`,
  ];
  if (a.modelZurueck) teile.push(`model=${a.modelZurueck}`);
  return `  ${label.padEnd(22)} ${teile.join('  ')}`;
}

/** Der eine Befund, auf den es ankommt: schaltet 'none' das Denken ab, ohne
 *  den Inhalt mitzunehmen? */
function urteilReasoning(none: Antwort, ohne: Antwort): string {
  // Ein 401 wegen leerem Guthaben sagt nichts über den Parameter. Der erste
  // Lauf (21.08.2026) druckte dafür "NEIN" und hätte den Umzug auf einer
  // Kontostandsmeldung beerdigt.
  if (!none.ok) return `UNGEMESSEN — die Anfrage kam nicht durch (HTTP ${none.status})`;
  if (none.inhalt.trim().length === 0) {
    return "NEIN — 'none' akzeptiert, aber der Inhalt ist LEER (genau die GreenPT-Fehlerart)";
  }
  const denktTrotzdem = none.denken.length > 200;
  if (denktTrotzdem) {
    return `FRAGLICH — Inhalt da (${none.inhalt.length}z), aber ${none.denken.length}z Denken kommen mit; 'none' wird also nicht wirklich befolgt`;
  }
  const referenz = ohne.ok ? ` (ohne Parameter: ${ohne.denken.length}z Denken)` : '';
  return `JA — Inhalt ${none.inhalt.length}z, kein nennenswertes Denken${referenz}`;
}

const WERKZEUG = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Aktuelles Wetter einer Stadt.',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string', description: 'Stadt, z. B. Berlin' } },
      required: ['location'],
    },
  },
};

async function probiereModell(model: string, rolle: string): Promise<void> {
  console.log(`\n── ${model}  (${rolle}) ────────────────────────────`);

  const basis = { model, messages: [{ role: 'user', content: FRAGE }], eu_native: true };

  // Die Kernmessung: dasselbe knappe Budget, einmal mit 'none', einmal ohne.
  const none = await ruf({ ...basis, max_tokens: PROBE_KNAPP, reasoning_effort: 'none' });
  const ohne = await ruf({ ...basis, max_tokens: PROBE_KNAPP });
  const low = await ruf({ ...basis, max_tokens: PROBE_KNAPP, reasoning_effort: 'low' });
  const weit = await ruf({ ...basis, max_tokens: PROBE_WEIT, reasoning_effort: 'none' });

  console.log(zeile(`none (${PROBE_KNAPP}tok)`, none));
  console.log(zeile(`ohne (${PROBE_KNAPP}tok)`, ohne));
  console.log(zeile(`low  (${PROBE_KNAPP}tok)`, low));
  console.log(zeile(`none (${PROBE_WEIT}tok)`, weit));
  console.log(`  → reasoning_effort:'none': ${urteilReasoning(none, ohne)}`);

  const werkzeug = await ruf({
    model,
    messages: [{ role: 'user', content: 'Wie ist das Wetter in Paris?' }],
    tools: [WERKZEUG],
    tool_choice: 'auto',
    max_tokens: 300,
    reasoning_effort: 'none',
    eu_native: true,
  });
  console.log(zeile('tool-call', werkzeug));
  if (werkzeug.ok) {
    const rufe = werkzeug.toolCalls ?? [];
    if (rufe.length === 0) {
      console.log('  → Tool-Call: KEINER — die Lane trägt keinen agentischen Loop');
    } else {
      const gut = rufe.every((r) => {
        if (r.name !== 'get_weather') return false;
        try {
          return typeof (JSON.parse(r.args) as { location?: unknown }).location === 'string';
        } catch {
          return false;
        }
      });
      console.log(
        `  → Tool-Call: ${rufe.length}× ${rufe.map((r) => r.name).join(', ')} — ${gut ? 'wohlgeformt' : `MISSGEBILDET: ${JSON.stringify(rufe)}`}`
      );
    }
  }

  // Die Fassade übersetzt `json: true` in genau dieses Feld; ohne es wird
  // erzwungenes JSON still wieder zu einer Prompt-Bitte (siehe CLAUDE.md).
  const json = await ruf({
    model,
    messages: [
      { role: 'system', content: 'Antworte ausschliesslich mit JSON.' },
      { role: 'user', content: 'Nenne drei Bundeslaender als {"laender":[...]}.' },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 200,
    reasoning_effort: 'none',
    eu_native: true,
  });
  console.log(zeile('json_object', json));
  if (json.ok) {
    try {
      JSON.parse(json.inhalt);
      console.log('  → JSON: parsebar');
    } catch {
      console.log(`  → JSON: NICHT parsebar — ${json.inhalt.slice(0, 120)}`);
    }
  }

  // Wer antwortet, wenn die EU-Schranke fällt? Der Unterschied ist der Preis
  // der Schranke — an Verfügbarkeit wie an Latenz.
  const offen = await ruf({
    model,
    messages: [{ role: 'user', content: FRAGE }],
    max_tokens: PROBE_KNAPP,
    reasoning_effort: 'none',
    eu_native: false,
  });
  console.log(zeile('ohne eu_native', offen));
  if (none.ok && offen.ok) {
    console.log(
      none.provider === offen.provider
        ? `  → Anbieter: ${none.provider ?? '?'} in beiden Fällen`
        : `  → Anbieter: eu_native=${none.provider ?? '?'} gegen offen=${offen.provider ?? '?'}`
    );
  }
}

async function katalog(): Promise<{ id: string; rolle: string }[]> {
  const response = await fetch(`${BASE}/models`, {
    headers: { Authorization: `Bearer ${KEY ?? ''}` },
  });
  if (!response.ok) {
    console.error(`/v1/models: HTTP ${response.status} — ${(await response.text()).slice(0, 300)}`);
    return [];
  }
  const daten = (await response.json()) as { data?: { id?: string }[] };
  const ids = (daten.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
  console.log(`Katalog: ${ids.length} Modelle.\n`);

  const treffer: { id: string; rolle: string }[] = [];
  for (const g of GESUCHT) {
    const passend = ids.filter((id) => g.muster.test(id));
    const gewaehlt = ids.includes(g.bevorzugt) ? g.bevorzugt : passend[0];
    console.log(`${g.rolle}`);
    console.log(`  heute: ${g.heute}`);
    console.log(
      passend.length > 0 ? `  bei Cortecs: ${passend.join(', ')}` : '  bei Cortecs: KEIN TREFFER'
    );
    if (gewaehlt) {
      console.log(
        `  geprüft wird: ${gewaehlt}${gewaehlt === g.bevorzugt ? ' (dieselbe ID wie heute)' : ' — ERSATZWAHL, die Wunsch-ID fehlt'}`
      );
      treffer.push({ id: gewaehlt, rolle: g.rolle });
    }
  }
  return treffer;
}

async function main(): Promise<void> {
  if (!KEY) {
    console.error('CORTECS_API_KEY fehlt.');
    process.exit(1);
  }

  const erzwungen = process.argv
    .filter((a) => a.startsWith('--model='))
    .map((a) => ({ id: a.slice('--model='.length), rolle: 'per --model erzwungen' }));

  const zuPruefen = erzwungen.length > 0 ? erzwungen : await katalog();
  if (zuPruefen.length === 0) {
    console.error('\nNichts zu prüfen. Mit --model=<id> ein Modell direkt benennen.');
    process.exit(1);
  }

  // Eine Ein-Token-Anfrage klärt Schlüssel und Guthaben, bevor 18 weitere
  // in denselben Fehler laufen. /v1/models antwortet auch mit leerem Konto,
  // taugt als Vorabtest also nicht.
  const vorab = await ruf({
    model: zuPruefen[0]?.id,
    messages: [{ role: 'user', content: 'ok' }],
    max_tokens: 1,
  });
  if (!vorab.ok) {
    const guthaben = /insufficient balance/i.test(vorab.fehler ?? '');
    console.error(`\nKeine Messung möglich (HTTP ${vorab.status}): ${vorab.fehler ?? 'unbekannt'}`);
    if (guthaben) {
      console.error(
        'Das Konto hat kein Guthaben. Aufladen unter cortecs.ai/userArea/console?tab=billing,\nsinnvollerweise mit Auto-Top-up — leeres Guthaben lässt JEDE Anfrage scheitern.'
      );
    }
    process.exit(1);
  }

  for (const m of zuPruefen) {
    await probiereModell(m.id, m.rolle);
  }

  console.log(
    [
      '\n── Was das Ergebnis bedeutet ──────────────────────────────',
      "Trägt 'none' nicht, ist Cortecs KEIN Ersatz für die Gemma-Lane:",
      'heavy/hedge und der Deep-Research-Worker leben davon, dass das',
      'Denken abschaltbar ist. Die Mistral-Medium-Route wäre davon',
      'unberührt — sie ruht ohnehin und denkt bewusst auf der Mistral-API.',
      'Wechselt der `provider` zwischen zwei Anfragen, brauchen',
      'energyFootprint.ts und die Datenschutzerklärung eine Antwort auf',
      '"wo lief das", die es bei einem festen Host nicht brauchte.',
    ].join('\n')
  );
}

void main();
