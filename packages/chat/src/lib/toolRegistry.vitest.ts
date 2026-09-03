import { describe, expect, it } from 'vitest';

import { INTENT_TO_TOOL, DEEP_TOOL_MAP } from './toolMappings';
import { getToolQuery, toolResultSummary } from './toolResults';
import {
  parseGenericFallback,
  resolveToolEntry,
  TOOL_REGISTRY,
  UI_TOOL_NAMES,
} from './toolRegistry';

// ---------------------------------------------------------------------------
// Drift guard: every tool name the SSE mappings can produce must have a
// registry entry. This is what keeps the tool list in ONE place — adding a
// tool to the mappings without a registry entry fails CI.
// ---------------------------------------------------------------------------

describe('tool registry drift guard', () => {
  it('covers every INTENT_TO_TOOL value', () => {
    for (const toolName of Object.values(INTENT_TO_TOOL)) {
      expect(UI_TOOL_NAMES.options, `missing registry entry for ${toolName}`).toContain(toolName);
    }
  });

  it('covers every DEEP_TOOL_MAP value', () => {
    for (const toolName of Object.values(DEEP_TOOL_MAP)) {
      expect(UI_TOOL_NAMES.options, `missing registry entry for ${toolName}`).toContain(toolName);
    }
  });

  /**
   * INTENT_TO_TOOL is consulted ONLY on the non-agentic path
   * (`agentic ? undefined : INTENT_TO_TOOL[intent]`, parseSSEStream), so an
   * entry here is a promise that the SINGLE-PASS path actually ran that tool.
   *
   * `hilfe` broke that promise: the docs tool is mounted in the agentic loop's
   * catalog only, while CHITCHAT_RE pins "hilfe" / "was kannst du" to
   * single-pass, where respondNode injects a documentation page map into the
   * prompt instead of retrieving anything. The card announced a search that
   * never happened — and then "disappeared on reload", which is simply what
   * correctly persisting nothing looks like.
   */
  it('maps no intent to a tool that exists only inside the agentic loop', () => {
    const agenticOnlyTools = ['gruenerator_docs_search'];
    for (const [intent, toolName] of Object.entries(INTENT_TO_TOOL)) {
      expect(agenticOnlyTools, `${intent} → ${toolName} would be a ghost card`).not.toContain(
        toolName
      );
    }
  });

  it('every registry entry has a label and matching kind', () => {
    for (const name of UI_TOOL_NAMES.options) {
      const entry = TOOL_REGISTRY[name];
      expect(entry.meta.label.length).toBeGreaterThan(0);
      expect(resolveToolEntry(name)).toBe(entry);
    }
  });
});

// ---------------------------------------------------------------------------
// Parse fixtures — shapes lifted from the live SSE payloads
// (intentExecutionService / sseHelpers ThinkingStepPayload).
// ---------------------------------------------------------------------------

describe('per-tool parsers', () => {
  it('search tools → citations', () => {
    const result = {
      results: [
        { title: 'Wahlprogramm', url: 'https://gruene.de/programm', snippet: 'Auszug …' },
        { title: 'Beschluss', url: 'https://gruene.de/beschluss', content: 'Text …' },
      ],
    };
    for (const name of ['gruenerator_search', 'search_sources', 'search_user_content'] as const) {
      const vm = TOOL_REGISTRY[name].parse({}, result);
      expect(vm.kind).toBe('citations');
      if (vm.kind === 'citations') {
        expect(vm.citations).toHaveLength(2);
        expect(vm.citations[0].href).toBe('https://gruene.de/programm');
      }
    }
  });

  it('web_search → citations', () => {
    const vm = TOOL_REGISTRY.web_search.parse(
      { query: 'klimageld' },
      { results: [{ title: 'Artikel', url: 'https://example.org/a', snippet: 's' }] }
    );
    expect(vm.kind).toBe('citations');
    if (vm.kind === 'citations') expect(vm.citations[0].type).toBe('webpage');
  });

  it('research → markdown report with citations, confidence, follow-ups', () => {
    const vm = TOOL_REGISTRY.research.parse(
      { query: 'Wärmepumpen-Förderung' },
      {
        answer: '## Lage\nDie Förderung …',
        citations: [
          { id: 1, title: 'BMWK', url: 'https://bmwk.de/x', domain: 'bmwk.de', snippet: 's' },
        ],
        confidence: 'high',
        followUpQuestions: ['Wie hoch ist die Förderung 2026?'],
        searchSteps: [{ tool: 'web_search', query: 'förderung wärmepumpe', resultsCount: 8 }],
      }
    );
    expect(vm.kind).toBe('markdown-report');
    if (vm.kind === 'markdown-report') {
      expect(vm.answer).toContain('## Lage');
      expect(vm.citations[0].domain).toBe('bmwk.de');
      expect(vm.confidence).toBe('high');
      expect(vm.followUpQuestions).toHaveLength(1);
      expect(vm.stepsList[0].resultsCount).toBe(8);
    }
  });

  it('examples → snippets', () => {
    const vm = TOOL_REGISTRY.gruenerator_examples_search.parse(
      {},
      { examples: [{ platform: 'instagram', content: 'Post-Text' }] }
    );
    expect(vm.kind).toBe('snippets');
    if (vm.kind === 'snippets') expect(vm.items[0].platform).toBe('instagram');
  });

  it('pressemitteilung examples → press-examples', () => {
    const vm = TOOL_REGISTRY.gruenerator_pressemitteilung_examples.parse(
      {},
      {
        examples: [
          {
            id: 'pm-1',
            title: 'PM Titel',
            body: 'Text',
            lv: 'BY',
            publishedAt: '2026-05-01T10:00:00Z',
            url: 'https://gruene-bayern.de/pm',
          },
        ],
      }
    );
    expect(vm.kind).toBe('press-examples');
    if (vm.kind === 'press-examples') expect(vm.examples[0].lv).toBe('BY');
  });

  it('person search → person', () => {
    const vm = TOOL_REGISTRY.gruenerator_person_search.parse(
      { query: 'Lang' },
      {
        isPersonQuery: true,
        person: { name: 'Ricarda Lang', fraktion: 'Grüne', wahlkreis: 'Backnang' },
      }
    );
    expect(vm.kind).toBe('person');
    if (vm.kind === 'person') {
      expect(vm.found).toBe(true);
      expect(vm.name).toBe('Ricarda Lang');
    }
  });

  it('scrape_url → link preview', () => {
    const vm = TOOL_REGISTRY.scrape_url.parse(
      { url: 'https://taz.de/artikel' },
      'Langer Seiteninhalt …'
    );
    expect(vm.kind).toBe('link-preview');
    if (vm.kind === 'link-preview') {
      expect(vm.href).toBe('https://taz.de/artikel');
      expect(vm.domain).toBe('taz.de');
    }
  });

  it('generate_image → image (ThinkingStepPayload result.image shape)', () => {
    const vm = TOOL_REGISTRY.generate_image.parse(
      { prompt: 'Solarpark Sonnenaufgang' },
      { image: { url: 'https://cdn.gruenerator.eu/img/1.png' } }
    );
    expect(vm.kind).toBe('image');
    if (vm.kind === 'image') {
      expect(vm.url).toBe('https://cdn.gruenerator.eu/img/1.png');
      expect(vm.prompt).toBe('Solarpark Sonnenaufgang');
    }
  });

  it('memory tools → text note', () => {
    expect(TOOL_REGISTRY.recall_memory.parse({}, 'Nutzer mag kurze Antworten')).toEqual({
      kind: 'text-note',
      text: 'Nutzer mag kurze Antworten',
    });
    const vm = TOOL_REGISTRY.save_memory.parse({}, { summary: 'Gespeichert.' });
    expect(vm).toEqual({ kind: 'text-note', text: 'Gespeichert.' });
  });

  it('ask_human → interactive (platforms render their own component)', () => {
    expect(TOOL_REGISTRY.ask_human.parse({ question: '?' }, undefined)).toEqual({
      kind: 'interactive',
    });
  });
});

// ---------------------------------------------------------------------------
// Generic fallback — unknown/future tools must degrade legibly, never throw.
// ---------------------------------------------------------------------------

describe('parseGenericFallback', () => {
  it('string result → text note', () => {
    expect(parseGenericFallback({}, 'fertig')).toEqual({ kind: 'text-note', text: 'fertig' });
  });

  it('object with results → lifts citations and scalar entries', () => {
    const vm = parseGenericFallback(
      {},
      {
        status: 'ok',
        resultCount: 3,
        results: [{ title: 'A', url: 'https://a.de' }, { note: 'no url, skipped' }],
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.citations).toHaveLength(1);
      expect(vm.entries).toContainEqual({ label: 'status', value: 'ok' });
      expect(vm.entries).toContainEqual({ label: 'resultCount', value: '3' });
    }
  });

  it('object with image → lifts image url', () => {
    const vm = parseGenericFallback({}, { image: { url: 'https://img.de/x.png' }, seed: 42 });
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') expect(vm.imageUrl).toBe('https://img.de/x.png');
  });

  it('long content-only object → markdown text note', () => {
    const vm = parseGenericFallback({}, { content: 'x'.repeat(200) });
    expect(vm.kind).toBe('text-note');
  });

  it('unknown tool name resolves to the fallback entry', () => {
    const entry = resolveToolEntry('future_tool');
    expect(entry.kind).toBe('key-value');
    expect(entry.parse({}, { error: 'nope', status: 'failed' }).kind).toBe('key-value');
  });
});

// ---------------------------------------------------------------------------
// The loop-catalog tools that used to fall through to the raw-name pill.
// Payload shapes are copied from their API implementations (recipeTools.ts,
// domainTools.ts, personalDataTools.ts) — if a backend shape changes, these
// fail rather than the card silently degrading to a <dl> dump again.
// ---------------------------------------------------------------------------

describe('loop-catalog tool parsers', () => {
  it('rezept_laden shows the recipe TITLE, never the mention id or the model hint', () => {
    const vm = resolveToolEntry('rezept_laden').parse(
      { rezept: 'presse' },
      {
        geladen: true,
        rezept: 'presse',
        titel: 'Pressemitteilung',
        hinweis: 'Die Schreibvorgaben stehen dir ab jetzt zur Verfügung.',
      }
    );
    expect(vm.kind).toBe('text-note');
    if (vm.kind === 'text-note') {
      expect(vm.text).toContain('Pressemitteilung');
      // The instruction is addressed to the model, not to the reader.
      expect(vm.text).not.toContain('Schreibvorgaben stehen dir');
      expect(vm.text).not.toBe('presse');
    }
  });

  it('memory cards show what was kept, changed or dropped — never the model hint', () => {
    const saved = resolveToolEntry('memory').parse(
      { action: 'save', kind: 'fakt', text: 'Aus Köln.' },
      { gespeichert: true, nr: 3, kind: 'fakt', text: 'Schreibt für den KV Köln.' }
    );
    expect(saved).toEqual({ kind: 'text-note', text: 'Gemerkt: Schreibt für den KV Köln.' });

    const dup = resolveToolEntry('memory').parse(
      {},
      { gespeichert: true, nr: 1, text: 'Aus Köln.', hinweis: 'War schon gespeichert.' }
    );
    expect(dup).toEqual({ kind: 'text-note', text: 'Bereits gemerkt: Aus Köln.' });

    expect(
      resolveToolEntry('memory').parse({}, { aktualisiert: true, nr: 1, text: 'Immer Sie-Form.' })
    ).toEqual({
      kind: 'text-note',
      text: 'Aktualisiert: Immer Sie-Form.',
    });
    expect(
      resolveToolEntry('memory').parse({}, { vergessen: true, nr: 2, text: 'Aus Köln.' })
    ).toEqual({
      kind: 'text-note',
      text: 'Vergessen: Aus Köln.',
    });
    expect(resolveToolEntry('memory').parse({}, { error: 'Das Gedächtnis ist voll.' })).toEqual({
      kind: 'text-note',
      text: 'Das Gedächtnis ist voll.',
    });
  });

  it('rezept_laden failure reports the reason, not a success line', () => {
    const vm = resolveToolEntry('rezept_laden').parse(
      { rezept: 'presse' },
      { geladen: false, rezept: 'presse', grund: 'Für dieses Rezept liegen keine Vorgaben vor.' }
    );
    expect(vm.kind).toBe('text-note');
    if (vm.kind === 'text-note') expect(vm.text).toContain('keine Vorgaben');
  });

  it('create_pdf surfaces every self-check problem as its own row', () => {
    const vm = resolveToolEntry('create_pdf').parse(
      {},
      {
        document: { title: 'Antrag.pdf' },
        geprueft: true,
        felder: ['name', 'datum'],
        probleme: ['Feld „datum" blieb leer', 'Schriftgröße unter 9pt'],
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      const values = vm.entries.map((e) => e.value).join(' | ');
      expect(values).toContain('Antrag.pdf');
      expect(values).toContain('datum');
      expect(values).toContain('Schriftgröße');
    }
  });

  it('create_board names the board — it has no second surface', () => {
    const vm = resolveToolEntry('create_board').parse(
      {},
      { board: { boardId: 'b-1', title: 'Wahlkampf 2026' }, note: 'Board angelegt.' }
    );
    expect(vm.kind).toBe('text-note');
    if (vm.kind === 'text-note') expect(vm.text).toContain('Wahlkampf 2026');
  });

  it('create_document stays slim — DocumentCreatedCard renders the rich card', () => {
    const vm = resolveToolEntry('create_document').parse(
      {},
      { document: { title: 'Rede zum Haushalt' }, note: 'Dokument erstellt.' }
    );
    expect(vm.kind).toBe('text-note');
    if (vm.kind === 'text-note') expect(vm.text).toContain('Rede zum Haushalt');
  });

  it('read_artifact keeps the ambiguous-match candidates the fallback dropped', () => {
    const vm = resolveToolEntry('read_artifact').parse(
      {},
      {
        candidates: [
          { id: 'a-1', title: 'Entwurf A' },
          { id: 'a-2', title: 'Entwurf B' },
        ],
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.entries.map((e) => e.label)).toEqual(['Entwurf A', 'Entwurf B']);
    }
  });

  // notebooks: `search` und `get` haben eigene Formen (notebookTools.ts) — ohne
  // Zweig landeten beide im <dl>-Dump, die Antwort als abgeschnittene Zeile.
  it('notebooks search renders the answer as markdown with the citations', () => {
    const vm = resolveToolEntry('notebooks').parse(
      { action: 'search', id: 'n1', query: 'Radweg?' },
      {
        notebook: 'Kreisverband',
        answer: 'Der Radweg wird 2027 gebaut [1].',
        resultCount: 1,
        citations: [{ index: '1', title: 'Antrag Radweg', snippet: 'Der Bau beginnt 2027.' }],
        sources: '[1] Antrag Radweg',
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.markdown).toContain('2027');
      expect(vm.entries).toEqual([{ label: 'Notebook', value: 'Kreisverband' }]);
      expect(vm.citations).toHaveLength(1);
      expect(vm.citations[0].title).toBe('Antrag Radweg');
    }
  });

  it('notebooks get renders the detail rows, not the raw object', () => {
    const vm = resolveToolEntry('notebooks').parse(
      { action: 'get', id: 'n1' },
      {
        notebook: {
          id: 'n1',
          name: 'Kreisverband',
          url: '/notebooks/kreisverband-Ab3xK9',
          documentCount: 12,
          pendingCount: 3,
          wolkeFolders: [{ folderName: '2026', folderPath: 'Anträge/2026' }],
          sharedGroups: [{ id: 'g1', name: 'Fraktion' }],
          documents: [{ id: 'd1', title: 'Antrag Radweg' }],
        },
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.entries).toEqual([
        { label: 'Notebook', value: 'Kreisverband' },
        { label: 'Dokumente', value: '12' },
        { label: 'Neue Dateien', value: '3' },
        { label: 'Wolke-Ordner', value: '2026' },
        { label: 'Geteilt mit', value: 'Fraktion' },
      ]);
    }
  });

  it('notebooks create names the new notebook', () => {
    const vm = resolveToolEntry('notebooks').parse(
      { action: 'create', name: 'Wahlkampf' },
      { ok: true, notebook: { id: 'n2', name: 'Wahlkampf', url: '/notebooks/wahlkampf-Zz9yX1' } }
    );
    expect(vm.kind).toBe('text-note');
    if (vm.kind === 'text-note') expect(vm.text).toContain('Wahlkampf');
  });

  it('notebooks list still lifts the rows into citations', () => {
    const vm = resolveToolEntry('notebooks').parse(
      { action: 'list' },
      {
        resultCount: 1,
        results: [{ title: 'Kreisverband', url: '/notebooks/x', type: 'Notebook' }],
      }
    );
    expect(vm.kind).toBe('citations');
  });

  // groups: `get` liefert ein `{group}`-Detailobjekt (groupTools.ts); `content`
  // und `list` bleiben Zeilen → Zitatliste.
  it('groups get renders the detail rows, not the raw object', () => {
    const vm = resolveToolEntry('groups').parse(
      { action: 'get', groupId: 'g1' },
      {
        group: {
          id: 'g1',
          name: 'Klima-AG',
          description: 'Für den Klimaschutz',
          url: '/gruppen/klima-ag-ab12cd',
          role: 'admin',
          isAdmin: true,
          memberCount: 7,
          isPublic: true,
          audience: 'de-DE',
          contentCount: 3,
        },
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.entries).toEqual([
        { label: 'Projekt', value: 'Klima-AG' },
        { label: 'Beschreibung', value: 'Für den Klimaschutz' },
        { label: 'Rolle', value: 'Admin' },
        { label: 'Mitglieder', value: '7' },
        { label: 'Sichtbarkeit', value: 'Öffentlich gelistet' },
        { label: 'Geteilte Inhalte', value: '3' },
      ]);
    }
  });

  it('groups content lifts the rows into citations', () => {
    const vm = resolveToolEntry('groups').parse(
      { action: 'content', groupId: 'g1' },
      {
        project: 'Klima-AG',
        resultCount: 1,
        results: [{ title: 'Protokoll', url: '/office/d1', type: 'Dokument' }],
      }
    );
    expect(vm.kind).toBe('citations');
    if (vm.kind === 'citations') expect(vm.citations[0].title).toBe('Protokoll');
  });

  // recurring_tasks: `get` liefert `{task, runs}` mit fertigen Etiketten
  // (recurringTaskTools.ts); `list` bleibt Zeilen → Zitatliste.
  it('recurring_tasks get renders the detail rows with the server-side labels', () => {
    const vm = resolveToolEntry('recurring_tasks').parse(
      { action: 'get', taskId: 't1' },
      {
        task: {
          id: 't1',
          title: 'Wochenbericht',
          recurrenceLabel: 'wöchentlich (Montag) um 09:00 Uhr',
          deliveryLabel: 'als Dokument',
          agentIdentifier: 'presse-agent',
          agentTitle: 'Presse-Agent',
          enabled: false,
          url: '/wiederkehrend',
        },
        runs: [{ statusLabel: 'erledigt' }, { statusLabel: 'fehlgeschlagen' }],
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.entries).toEqual([
        { label: 'Aufgabe', value: 'Wochenbericht' },
        { label: 'Takt', value: 'wöchentlich (Montag) um 09:00 Uhr' },
        { label: 'Zustellung', value: 'als Dokument' },
        { label: 'Agent', value: 'Presse-Agent' },
        { label: 'Status', value: 'Pausiert' },
        { label: 'Letzte Läufe', value: 'erledigt, fehlgeschlagen' },
      ]);
    }
  });

  it('recurring_tasks list lifts the rows into citations', () => {
    const vm = resolveToolEntry('recurring_tasks').parse(
      { action: 'list' },
      {
        resultCount: 1,
        results: [
          { title: 'Wochenbericht', url: '/wiederkehrend', type: 'Wiederkehrende Aufgabe' },
        ],
      }
    );
    expect(vm.kind).toBe('citations');
    if (vm.kind === 'citations') expect(vm.citations[0].title).toBe('Wochenbericht');
    expect(resolveToolEntry('recurring_tasks').meta.label).toBe('Wiederkehrende Aufgaben');
  });

  // user_agents: `get` liefert `{agent}` mit fertigen Etiketten (userAgentTools.ts);
  // `list` bleibt Zeilen → Zitatliste; Karten-Aktionen sind eine Notiz.
  it('user_agents get renders the detail rows with the server-side labels', () => {
    const vm = resolveToolEntry('user_agents').parse(
      { action: 'get', identifier: 'presse-kv-ab12cd' },
      {
        agent: {
          identifier: 'presse-kv-ab12cd',
          title: 'Presse KV',
          description: 'Schreibt Pressemitteilungen.',
          role: 'Du bist die Pressestelle …',
          toolLabels: 'Grünerator-Wissen, Recherche',
          skillMentions: ['presse'],
          notebooks: [{ id: 'nb-1', name: 'Kommunalpolitik' }],
          shareModeLabel: 'Privat',
          sharedFromGroup: null,
          url: '/agents/presse-kv-ab12cd',
        },
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.entries).toEqual([
        { label: 'Name', value: 'Presse KV' },
        { label: 'Beschreibung', value: 'Schreibt Pressemitteilungen.' },
        { label: 'Werkzeuge', value: 'Grünerator-Wissen, Recherche' },
        { label: 'Rezepte', value: 'presse' },
        { label: 'Notebooks', value: 'Kommunalpolitik' },
        { label: 'Sichtbarkeit', value: 'Privat' },
      ]);
    }
  });

  it('user_agents get on a shared agent shows the group and stops there', () => {
    const vm = resolveToolEntry('user_agents').parse(
      { action: 'get', identifier: 'wahlkampf-xy' },
      {
        agent: {
          identifier: 'wahlkampf-xy',
          title: 'Wahlkampf',
          description: 'Hilft im Wahlkampf.',
          sharedFromGroup: 'Klima-AG',
          readOnly: true,
          url: '/agents/wahlkampf-xy',
        },
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.entries).toEqual([
        { label: 'Name', value: 'Wahlkampf' },
        { label: 'Beschreibung', value: 'Hilft im Wahlkampf.' },
        { label: 'Geteilt aus', value: 'Klima-AG' },
      ]);
    }
  });

  it('user_agents list lifts the rows into citations; create/share are a note', () => {
    const list = resolveToolEntry('user_agents').parse(
      { action: 'list' },
      {
        resultCount: 1,
        results: [
          { title: 'Presse KV', url: '/agents/presse-kv-ab12cd', type: 'Grünerator-Agent' },
        ],
      }
    );
    expect(list.kind).toBe('citations');
    if (list.kind === 'citations') expect(list.citations[0].title).toBe('Presse KV');

    const card = resolveToolEntry('user_agents').parse(
      { action: 'create', brief: 'x' },
      {
        ok: true,
        needsConfirmation: true,
        note: 'Bestätigung angefordert: Grünerator-Agent „X" anlegen.',
      }
    );
    expect(card).toEqual({
      kind: 'text-note',
      text: 'Bestätigung angefordert: Grünerator-Agent „X" anlegen.',
    });
    expect(resolveToolEntry('user_agents').meta.label).toBe('Grünerator-Agenten');
  });

  // recipes: `get` liefert `{recipe}` (textFormTools.ts) — eigene Textform mit
  // Stilblock, mitgeliefertes Rezept ohne Rumpf; `list` bleibt Zeilen →
  // Zitatliste; create/add_examples/delete sind eine Notiz.
  it('recipes get renders an own text form with kind, type, examples and style', () => {
    const vm = resolveToolEntry('recipes').parse(
      { action: 'get', mention: 'omveinladungen' },
      {
        recipe: {
          mention: 'omveinladungen',
          title: 'OV-Einladungen',
          source: 'user',
          kind: 'custom',
          kindLabel: 'Eigene Textform',
          textType: null,
          textTypeLabel: null,
          overridesSystemRecipe: false,
          exampleCount: 2,
          examples: ['Liebe Mitglieder …'],
          styleBlock: '## STIL: Einladungen …',
          styleTruncated: true,
          analyzedAt: '2026-08-30T10:00:00.000Z',
          sharedFromGroup: null,
          readOnly: false,
          url: '/settings/texte-anlernen',
        },
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.entries).toEqual([
        { label: 'Name', value: 'OV-Einladungen' },
        { label: 'Mention', value: '@omveinladungen' },
        { label: 'Art', value: 'Eigene Textform' },
        { label: 'Beispiele', value: '2' },
        { label: 'Stil (gekürzt)', value: '## STIL: Einladungen …' },
      ]);
    }
  });

  it('recipes get on a system recipe shows title and description and stops there', () => {
    const vm = resolveToolEntry('recipes').parse(
      { action: 'get', mention: 'presse' },
      {
        recipe: {
          mention: 'presse',
          title: 'Pressemitteilung',
          description: 'PM im Grünen-Stil',
          source: 'system',
          readOnly: true,
          note: 'Das ist ein mitgeliefertes Rezept …',
          url: '/agentura/rezept/presse',
        },
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.entries).toEqual([
        { label: 'Name', value: 'Pressemitteilung' },
        { label: 'Mention', value: '@presse' },
        { label: 'Beschreibung', value: 'PM im Grünen-Stil' },
        { label: 'Art', value: 'Mitgeliefertes Rezept' },
      ]);
    }
  });

  it('recipes list lifts the rows into citations; create/delete are a note', () => {
    const list = resolveToolEntry('recipes').parse(
      { action: 'list' },
      {
        resultCount: 2,
        results: [
          { title: 'Pressemitteilung', url: '/agentura/rezept/presse', type: 'Rezept' },
          { title: 'OV-Einladungen', url: '/settings/texte-anlernen', type: 'Eigene Textform' },
        ],
      }
    );
    expect(list.kind).toBe('citations');
    if (list.kind === 'citations') expect(list.citations[0].title).toBe('Pressemitteilung');

    // create liefert note UND recipe — die Notiz gewinnt, sie sagt, was passiert ist.
    const created = resolveToolEntry('recipes').parse(
      { action: 'create', title: 'x' },
      {
        ok: true,
        note: 'Textform „X" aus 2 Beispielen angelernt.',
        recipe: { mention: 'x', title: 'X', source: 'user', exampleCount: 2 },
      }
    );
    expect(created).toEqual({
      kind: 'text-note',
      text: 'Textform „X" aus 2 Beispielen angelernt.',
    });

    const ask = resolveToolEntry('recipes').parse(
      { action: 'delete', mention: 'x' },
      { needsConfirmation: true, note: 'Soll die Textform „X" wirklich gelöscht werden?' }
    );
    expect(ask).toEqual({
      kind: 'text-note',
      text: 'Soll die Textform „X" wirklich gelöscht werden?',
    });
    expect(resolveToolEntry('recipes').meta.label).toBe('Rezepte & Textformen');
  });

  it('every formerly-unregistered tool now resolves to a real label', () => {
    const previouslyBroken = [
      'rezept_laden',
      'sharepic',
      'create_document',
      'create_presentation',
      'create_sheet',
      'create_pdf',
      'create_board',
      'umfragen',
      'abgeordnetenwatch',
      'summarize',
      'product_knowledge',
      'expand_attachment',
      'dokumente_lesen',
      'search_threads',
      'read_artifact',
    ];
    for (const name of previouslyBroken) {
      const { meta } = resolveToolEntry(name);
      // The old symptom was the label BEING the wire name.
      expect(meta.label, `${name} still renders its raw wire name`).not.toBe(name);
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});

describe('toolResultSummary precedence', () => {
  it('an error never reads as success', () => {
    expect(toolResultSummary('create_pdf', {}, { error: 'Konvertierung fehlgeschlagen' })).toBe(
      'Konvertierung fehlgeschlagen'
    );
  });

  it('per-tool summarize wins over the backend line for the create_* family', () => {
    // wrapTools' own summariser returns nothing for create_*, which is exactly
    // why meta.summarize must sit ahead of result.summary.
    expect(
      toolResultSummary('create_board', {}, { board: { boardId: 'b', title: 'Klimaplan' } })
    ).toBe('Klimaplan');
  });

  it('falls back to the backend summary, then to a count, then to null', () => {
    expect(toolResultSummary('web_search', {}, { summary: '5 Ergebnisse' })).toBe('5 Ergebnisse');
    expect(toolResultSummary('web_search', {}, { resultCount: 3 })).toBe('3 Suchen');
    expect(toolResultSummary('web_search', {}, {})).toBeNull();
  });

  it('a throwing summarize downgrades the line instead of breaking the card', () => {
    // Defensive: a backend shape change must not throw through the render.
    expect(() => toolResultSummary('create_pdf', {}, { document: null })).not.toThrow();
  });
});

describe('getToolQuery with per-tool keys', () => {
  it('reads rezept_laden’s subject from its own arg name', () => {
    expect(getToolQuery({ rezept: 'presse' }, 'rezept_laden')).toBe('presse');
  });

  it('keeps the old single-argument behaviour', () => {
    expect(getToolQuery({ query: 'Klimageld' })).toBe('Klimageld');
    expect(getToolQuery({ rezept: 'presse' })).toBeNull();
  });
});
