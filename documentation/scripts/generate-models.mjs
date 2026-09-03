/**
 * Generate documentation/src/generated/models.json — which model serves which
 * task, and at which host, read from the code that decides it.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The "Sparsame Modelle statt Größenwahn" table in
 * `docs/basics/nachhaltigkeit.md` was hand-typed from eight
 * source files, and it drifted every time a lane moved host — which happens
 * every few weeks (Gemma 4 alone moved verdigado → Regolo → Scaleway inside
 * two months). A table that is wrong about where data is processed is worse
 * than no table on a page whose whole subject is exactly that. So the routing
 * facts come from the routing code now.
 *
 * ── What is generated and what is not ───────────────────────────────────────
 *
 * Generated: the model id, the provider, and the primary/fallback role for
 * every row. That is the half that moves.
 *
 * Hand-written here: the German task wording (`ROWS[].task`), the readable
 * model names (`MODEL_LABELS`) and the host names with their flag
 * (`PROVIDER_HOSTS`). Those are presentation copy — the same split as
 * `MIME_GROUPS`/`AUTH_LABEL` in generate-reference.mjs. An unknown model id or
 * provider does not fall back to something plausible, it throws: a silently
 * mislabelled row is the failure this script exists to prevent, so a new model
 * costs one line here and CI says which one.
 *
 * Usage:
 *   node scripts/generate-models.mjs           # write the JSON
 *   node scripts/generate-models.mjs --check   # exit 1 if the committed JSON is stale
 */
import {
  constStringArray,
  fail,
  findDeclaration,
  objectEntries,
  parse,
  ts,
  unwrap,
} from './lib/ast.mjs';
import { runGenerator } from './lib/audit.mjs';

const SRC = {
  chatProviders: 'apps/api/routes/chat/agents/providers.ts',
  autoPolicy: 'apps/api/routes/chat/agents/autoPolicy.ts',
  intermediate: 'apps/api/services/ai/intermediateLanes.ts',
  // Wer Gemma 4 bedient, steht seit dem 25.08.2026 nur noch hier; die
  // Lane-Konfigurationen in `chatProviders` leiten Provider, Modellname,
  // Kontextfenster und Ausweich-Kennung daraus ab. Ohne diese Quelle liest
  // der Generator dort Property-Zugriffe auf einen Namen, den er nicht kennt.
  gemmaHosts: 'apps/api/services/ai/gemmaHosts.ts',
  selector: 'apps/api/services/providers/providerSelector.ts',
  transcription: 'apps/api/services/transcription/providerPolicy.ts',
  voxtral: 'apps/api/services/voice/mistralVoiceService.ts',
  greenptStt: 'apps/api/services/transcription/greenptListen.ts',
  catalog: 'packages/core/src/models/catalog.ts',
  regoloImage: 'apps/api/services/flux/RegoloImageService.ts',
  // FluxImageService is deliberately absent: the picker's catalog owns which
  // FLUX variants exist (`modelPath`), the service only owns the EU endpoint —
  // which is prose on the page, not a table row.
  embeddings: 'apps/api/services/mistral/MistralEmbeddingService/MistralEmbeddingService.ts',
};

const OUT_FILE = 'documentation/src/generated/models.json';

// ── Presentation copy ───────────────────────────────────────────────────────

/**
 * Readable names for the model ids the code uses.
 *
 * `verdigado-pro` is a LiteLLM alias, not a model: probed at the proxy it
 * answers `model: "gpt-oss:120b-ctx128k"` (see AVOID_AS_SYNTH in autoPolicy.ts).
 * The label says what actually runs, because that is what the reader is asking.
 */
const MODEL_LABELS = {
  'mistral-medium-2604': 'Mistral Medium 3.5',
  'mistral-small-4-119b': 'Mistral Small 4',
  'mistral-small-3.2-24b-instruct-2506': 'Mistral Small 3.2',
  'pixtral-large-latest': 'Pixtral Large',
  'mistral-embed': 'Mistral Embed',
  'gemma4-31b': 'Gemma 4 (31 Mrd.)',
  // Dieselben Gewichte, Cortecs' Kennung — deshalb DERSELBE lesbare Name.
  // Für Leser*innen der Tabelle ist das ein Modell auf zwei Hosts, und genau
  // so soll es dort stehen.
  'gemma-4-31b-it': 'Gemma 4 (31 Mrd.)',
  'gemma-4-26b-a4b-it': 'Gemma 4 (26 Mrd., MoE)',
  gemma4: 'Gemma 4',
  'gpt-oss-120b': 'GPT-OSS 120B',
  // Verdigado-Alias, seit dem 29.08.2026 stillgelegt (litellmRetired.ts). Das
  // Label bleibt, damit eine noch irgendwo notierte Kennung nicht als
  // unbeschriftet durchfaellt.
  'verdigado-pro': 'GPT-OSS 120B',
  'voxtral-mini-latest': 'Voxtral Mini',
  'green-s-pro': 'Green S Pro',
  'Qwen-Image': 'Qwen-Image',
  '/v1/flux-2-pro': 'FLUX 2 Pro',
  '/v1/flux-2-klein-9b': 'FLUX 2 Klein',
  '/v1/flux-2-max': 'FLUX 2 Max',
};

/**
 * Where a provider id actually runs. The flag is the point of the whole table
 * on a sustainability page — it decides which grid intensity applies further
 * down the article.
 */
const PROVIDER_HOSTS = {
  mistral: { host: 'Mistral AI', flag: '🇫🇷' },
  regolo: { host: 'Regolo', flag: '🇮🇹' },
  // Stillgelegt am 29.08.2026 — der Name wird nur noch gelesen und bedient
  // Cortecs (apps/api/services/ai/litellmRetired.ts). Der Eintrag bleibt, damit
  // eine Alt-Kennung nicht ohne Standort in der Tabelle landet.
  litellm: { host: 'Cortecs', flag: '🇱🇺' },
  greenpt: { host: 'GreenPT', flag: '🇪🇺' },
  scaleway: { host: 'Scaleway', flag: '🇫🇷' },
  cortecs: { host: 'Cortecs', flag: '🇱🇺' },
  bfl: { host: 'Black Forest Labs', flag: '🇩🇪' },
  // Transcription names its providers after the model family, not the company.
  voxtral: { host: 'Mistral AI', flag: '🇫🇷' },
};

function label(model, where) {
  const found = MODEL_LABELS[model];
  if (!found) {
    throw new Error(
      `${where}: no readable name for model "${model}".\n` +
        `  Add one to MODEL_LABELS in documentation/scripts/generate-models.mjs.`
    );
  }
  return found;
}

function host(provider, where) {
  const found = PROVIDER_HOSTS[provider];
  if (!found) {
    throw new Error(
      `${where}: no host for provider "${provider}".\n` +
        `  Add one to PROVIDER_HOSTS in documentation/scripts/generate-models.mjs.`
    );
  }
  return found;
}

/**
 * One rendered cell pair: what runs, and where.
 *
 * `model` stays exactly as the code spells it (that is the thing to grep for);
 * `code` is the same value trimmed for display — the image lanes name a request
 * path rather than a model id, and `/v1/flux-2-pro` in a docs table reads like
 * a mistake.
 */
function entry(provider, model, where, role = 'primary') {
  const { host: hostName, flag } = host(provider, where);
  const code = model.startsWith('/') ? model.split('/').pop() : model;
  return { model, code, label: label(model, where), provider, host: hostName, flag, role };
}

// ── AST helpers ─────────────────────────────────────────────────────────────

/**
 * A string literal, an identifier pointing at one, or the right-hand side of an
 * `env.X || 'literal'` / `env.X ?? 'literal'` default. The env branch is what
 * ships when nothing is configured, which is what the docs should describe.
 */
function resolveString(sf, node, seen = new Set()) {
  const n = unwrap(node);
  if (!n) return undefined;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isIdentifier(n)) {
    if (seen.has(n.text)) return undefined;
    seen.add(n.text);
    // Erst in der eigenen Datei, dann in den QUERVERWEIS-Quellen (heute:
    // gemmaHosts.ts). Ohne den zweiten Schritt liest der Generator ein
    // `GEMMA_31B_PRIMARY`, findet nichts, und die Lane fällt stillschweigend
    // aus der Tabelle — was als „Modell nicht dokumentiert" endet, nicht als
    // Fehler.
    const own = findDeclaration(sf, n.text);
    if (own) return resolveString(sf, own, seen);
    for (const cross of crossFileSources) {
      const found = findDeclaration(cross, n.text);
      if (found) return resolveString(cross, found, seen);
    }
    return undefined;
  }
  // `GEMMA_31B_PRIMARY.provider` — ein Feld eines benannten Objekts, das auch
  // in einer anderen Datei stehen darf.
  if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.name)) {
    const obj = resolveObjectLiteral(sf, n.expression);
    if (obj) return resolveString(sf, objectEntries(obj).get(n.name.text), seen);
    return undefined;
  }
  if (
    ts.isBinaryExpression(n) &&
    (n.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    return resolveString(sf, n.right, seen);
  }
  return undefined;
}

/**
 * Quellen, in denen nach einem Namen gesucht wird, der in der aktuellen Datei
 * nicht deklariert ist. Wird von `generate()` gefüllt, bevor irgendetwas
 * aufgelöst wird.
 */
const crossFileSources = [];

/**
 * Das Objektliteral hinter einem Ausdruck — ein Literal selbst, ein Name in
 * dieser Datei, oder ein Name aus einer Querverweis-Quelle. Alias-Ketten
 * (`const A = B`) werden verfolgt.
 */
function resolveObjectLiteral(sf, node, seen = new Set()) {
  let n = unwrap(node);
  if (!n) return undefined;
  if (ts.isIdentifier(n)) {
    if (seen.has(n.text)) return undefined;
    seen.add(n.text);
    const own = findDeclaration(sf, n.text);
    if (own) return resolveObjectLiteral(sf, own, seen);
    for (const cross of crossFileSources) {
      const found = findDeclaration(cross, n.text);
      if (found) return resolveObjectLiteral(cross, found, seen);
    }
    return undefined;
  }
  return ts.isObjectLiteralExpression(n) ? n : undefined;
}

/**
 * `{ provider: 'x', model: 'y' }` → `{ provider, model }`.
 *
 * The node may be a named constant instead of the literal — the lanes share
 * one config between several stages (`standard: REGOLO_SMALL_4`), which is the
 * point of naming them.
 */
function readLane(sf, node, relFile, what) {
  let obj = unwrap(node);
  if (obj && ts.isIdentifier(obj)) obj = findDeclaration(sf, obj.text);
  if (!obj || !ts.isObjectLiteralExpression(obj)) {
    fail(relFile, what, 'an object literal with `provider` and `model`');
  }
  const props = spreadEntries(sf, obj);
  const provider = resolveString(sf, props.get('provider'));
  const model = resolveString(sf, props.get('model'));
  if (!provider || !model) fail(relFile, what, 'literal `provider` and `model` properties');
  return { provider, model };
}

/**
 * `objectEntries`, aber Spread-Elemente werden aufgeloest.
 *
 * Noetig seit `INTERMEDIATE_LANES` seine Stufen als
 * `{ ...GREENPT_SMALL_32, fallback: SMALL_CHAIN }` schreibt: der Lane-Name
 * steht dann in einer anderen Konstante, und `objectEntries` sieht nur
 * `fallback`. Ohne diese Aufloesung bricht `models:check` mit "expected literal
 * `provider` and `model` properties" ab - der Generator liest den Quelltext per
 * AST, also ist ein Spread fuer ihn kein Detail, sondern eine Sackgasse.
 *
 * Spaetere Eintraege gewinnen, wie in JavaScript: erst die Spreads in ihrer
 * Reihenfolge, dann die eigenen Felder.
 */
function spreadEntries(sf, obj) {
  const out = new Map();
  for (const p of obj.properties) {
    if (ts.isSpreadAssignment(p)) {
      const src = resolveObjectLiteral(sf, p.expression);
      if (!src) continue;
      for (const [k, v] of spreadEntries(sf, src)) out.set(k, v);
      continue;
    }
    if (!ts.isPropertyAssignment(p)) continue;
    const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
    if (key) out.set(key, unwrap(p.initializer));
  }
  return out;
}

/** The initializer of `const <name> = …`, resolved to a string. */
function constString(sf, name, relFile) {
  const value = resolveString(sf, findDeclaration(sf, name));
  if (!value) fail(relFile, name, 'a string constant');
  return value;
}

// ── AVAILABLE_MODELS ────────────────────────────────────────────────────────

/**
 * The chat model registry, including the entries added by assignment after the
 * object literal (`AVAILABLE_MODELS['gruenerator-ultra'] = …`). The three
 * size lanes the picker offers are all defined that way, so an extractor that
 * only reads the literal would return exactly the rows nobody asks about.
 */
function readAvailableModels(sf) {
  const decl = findDeclaration(sf, 'AVAILABLE_MODELS');
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    fail(SRC.chatProviders, 'AVAILABLE_MODELS', 'an object literal keyed by model id');
  }

  const raw = new Map();
  for (const [key, value] of objectEntries(decl)) raw.set(key, value);

  // `AVAILABLE_MODELS['id'] = <expr>` statements further down the file.
  const assignments = [];
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isElementAccessExpression(node.left) &&
      ts.isIdentifier(node.left.expression) &&
      node.left.expression.text === 'AVAILABLE_MODELS'
    ) {
      const key = resolveString(sf, node.left.argumentExpression);
      if (key) assignments.push([key, unwrap(node.right)]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  for (const [key, value] of assignments) raw.set(key, value);

  /** Resolve one entry to `{ kind, … }`, following identifiers and aliases. */
  const resolveConfig = (node, seen = new Set()) => {
    const n = unwrap(node);
    if (!n) return undefined;
    if (ts.isIdentifier(n)) {
      if (seen.has(`id:${n.text}`)) return undefined;
      seen.add(`id:${n.text}`);
      const own = findDeclaration(sf, n.text);
      if (own) return resolveConfig(own, seen);
      for (const cross of crossFileSources) {
        const found = findDeclaration(cross, n.text);
        if (found) return resolveConfig(found, seen);
      }
      return undefined;
    }
    // `AVAILABLE_MODELS['gruenerator-ultra'] = AVAILABLE_MODELS['mistral-medium-3.5']`
    if (ts.isElementAccessExpression(n)) {
      const key = resolveString(sf, n.argumentExpression);
      if (!key || seen.has(`key:${key}`)) return undefined;
      seen.add(`key:${key}`);
      return resolveConfig(raw.get(key), seen);
    }
    if (!ts.isObjectLiteralExpression(n)) return undefined;
    const props = objectEntries(n);
    const kind = resolveString(sf, props.get('kind'));
    if (kind === 'overflow') {
      return {
        kind,
        primary: readLane(sf, props.get('primary'), SRC.chatProviders, 'primary'),
        overflow: readLane(sf, props.get('overflow'), SRC.chatProviders, 'overflow'),
      };
    }
    const provider = resolveString(sf, props.get('provider'));
    const model = resolveString(sf, props.get('model'));
    if (!provider || !model) return undefined;
    const fallback = resolveString(sf, props.get('fallback'));
    return { kind: 'single', provider, model, fallback };
  };

  const models = new Map();
  for (const key of raw.keys()) {
    const config = resolveConfig(raw.get(key));
    if (config) models.set(key, config);
  }
  return models;
}

/** A registry id → the rows it contributes, its `fallback` pointer followed. */
function fromRegistry(models, id, roleForFallback = 'fallback') {
  const config = models.get(id);
  if (!config) {
    fail(SRC.chatProviders, `AVAILABLE_MODELS['${id}']`, 'a resolvable model configuration');
  }
  const where = `${SRC.chatProviders} AVAILABLE_MODELS['${id}']`;
  if (config.kind === 'overflow') {
    return [
      entry(config.primary.provider, config.primary.model, where),
      entry(config.overflow.provider, config.overflow.model, where, 'overflow'),
    ];
  }
  const rows = [entry(config.provider, config.model, where)];
  if (config.fallback) {
    const target = models.get(config.fallback);
    if (!target || target.kind !== 'single') {
      fail(SRC.chatProviders, `fallback '${config.fallback}'`, 'a single-provider entry');
    }
    rows.push(entry(target.provider, target.model, where, roleForFallback));
  }
  return rows;
}

// ── The table ───────────────────────────────────────────────────────────────

function generate() {
  // VOR allem anderen: `chatProviders` und `intermediateLanes` greifen auf
  // Namen zu, die in dieser Datei stehen.
  crossFileSources.length = 0;
  crossFileSources.push(parse(SRC.gemmaHosts));
  // `intermediateLanes` seit dem 29.08.2026 auch: die kleine Antwortlane
  // (`gruenerator-small`) zieht ihren Modellnamen aus `CORTECS_SMALL_32` dort,
  // statt ihn ein zweites Mal zu behaupten.
  crossFileSources.push(parse(SRC.intermediate));

  const chat = parse(SRC.chatProviders);
  const policy = parse(SRC.autoPolicy);
  const lanes = parse(SRC.intermediate);
  const selector = parse(SRC.selector);
  const transcription = parse(SRC.transcription);
  const catalog = parse(SRC.catalog);

  const models = readAvailableModels(chat);

  // Intermediate lanes — one object literal keyed by lane id.
  const laneDecl = findDeclaration(lanes, 'INTERMEDIATE_LANES');
  if (!laneDecl || !ts.isObjectLiteralExpression(laneDecl)) {
    fail(SRC.intermediate, 'INTERMEDIATE_LANES', 'an object literal keyed by lane id');
  }
  const laneEntries = objectEntries(laneDecl);
  const lane = (id) => {
    const node = laneEntries.get(id);
    if (!node) fail(SRC.intermediate, `INTERMEDIATE_LANES.${id}`, 'a lane entry');
    return readLane(lanes, node, SRC.intermediate, `INTERMEDIATE_LANES.${id}`);
  };

  // Vision: `{ provider: 'regolo' as const, model: env.VISION_DEFAULT_MODEL || 'gemma4-31b' }`
  const vision = readLane(
    chat,
    findDeclaration(chat, 'VISION_MODEL'),
    SRC.chatProviders,
    'VISION_MODEL'
  );

  // Image generation — the picker's own catalog, so the docs list exactly the
  // variants a user can choose.
  const optionsDecl = findDeclaration(catalog, 'MODEL_OPTIONS');
  if (!optionsDecl || !ts.isArrayLiteralExpression(optionsDecl)) {
    fail(SRC.catalog, 'MODEL_OPTIONS', 'an array literal of model options');
  }
  const regoloImageModel = constString(parse(SRC.regoloImage), 'DEFAULT_MODEL', SRC.regoloImage);
  const imageRows = [];
  for (const el of optionsDecl.elements) {
    const option = unwrap(el);
    if (!option || !ts.isObjectLiteralExpression(option)) continue;
    const props = objectEntries(option);
    if (resolveString(chat, props.get('modality')) !== 'image') continue;
    const backend = resolveString(catalog, props.get('backend'));
    const where = `${SRC.catalog} MODEL_OPTIONS`;
    if (backend === 'hosted') {
      const modelPath = resolveString(catalog, props.get('modelPath'));
      if (!modelPath) fail(SRC.catalog, 'a hosted image option', 'a `modelPath` string');
      imageRows.push(entry('bfl', modelPath, where));
    } else if (backend === 'regolo') {
      imageRows.push(entry('regolo', regoloImageModel, where));
    } else {
      throw new Error(
        `${SRC.catalog}: unknown image backend "${backend}".\n` +
          `  Teach documentation/scripts/generate-models.mjs how to resolve it.`
      );
    }
  }
  if (imageRows.length === 0) fail(SRC.catalog, 'MODEL_OPTIONS', 'at least one image option');

  // Transcription — the chain is provider ids; each names its own model.
  const chain = constStringArray(transcription, 'TRANSCRIPTION_CHAIN');
  if (chain.length === 0) fail(SRC.transcription, 'TRANSCRIPTION_CHAIN', 'a non-empty array');
  const transcriptionModels = {
    voxtral: constString(parse(SRC.voxtral), 'VOXTRAL_TRANSCRIBE_MODEL', SRC.voxtral),
    greenpt: constString(parse(SRC.greenptStt), 'GREENPT_STT_MODEL', SRC.greenptStt),
  };
  const transcriptionRows = chain.map((provider, i) => {
    const model = transcriptionModels[provider];
    if (!model) {
      throw new Error(
        `${SRC.transcription}: TRANSCRIPTION_CHAIN names provider "${provider}" but the ` +
          `generator does not know its model constant.\n` +
          `  Add it to transcriptionModels in documentation/scripts/generate-models.mjs.`
      );
    }
    return entry(provider, model, SRC.transcription, i === 0 ? 'primary' : 'fallback');
  });

  // Embeddings — the service names the model on the LangChain adapter it builds.
  const embeddings = parse(SRC.embeddings);
  let embeddingModel;
  const findModelName = (node) => {
    if (
      !embeddingModel &&
      ts.isPropertyAssignment(node) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'modelName'
    ) {
      embeddingModel = resolveString(embeddings, node.initializer);
    }
    ts.forEachChild(node, findModelName);
  };
  findModelName(embeddings);
  if (!embeddingModel) fail(SRC.embeddings, 'modelName', 'a string literal model id');

  const artifact = {
    provider: constString(selector, 'ARTIFACT_PROVIDER', SRC.selector),
    model: constString(selector, 'ARTIFACT_MODEL', SRC.selector),
  };

  const planner = readLane(
    policy,
    findDeclaration(policy, 'LOOP_PLANNER_PRIMARY'),
    SRC.autoPolicy,
    'LOOP_PLANNER_PRIMARY'
  );

  // The German task wording is the hand-written half — see the header note.
  const rows = [
    {
      id: 'chat',
      task: 'Chat & Texte (Standard)',
      models: fromRegistry(models, 'gruenerator-ultra'),
    },
    {
      id: 'kreativ',
      task: 'Kreativtexte, Antworten schreiben',
      models: fromRegistry(models, 'gruenerator-medium'),
    },
    {
      id: 'schnell',
      task: 'Schnelle Antworten',
      models: fromRegistry(models, 'gruenerator-small'),
    },
    {
      id: 'zusammenfassen',
      task: 'Lange Dokumente zusammenfassen',
      models: [entry(lane('heavy').provider, lane('heavy').model, `${SRC.intermediate} heavy`)],
    },
    {
      id: 'einordnen',
      task: 'Anfragen einordnen, Zwischenschritte',
      models: [
        entry(lane('standard').provider, lane('standard').model, `${SRC.intermediate} standard`),
      ],
    },
    {
      id: 'werkzeuge',
      task: 'Werkzeuge planen und aufrufen',
      models: [entry(planner.provider, planner.model, `${SRC.autoPolicy} LOOP_PLANNER_PRIMARY`)],
    },
    {
      id: 'artefakte',
      task: 'Dokumente, Präsentationen, PDFs, Tabellen',
      models: [entry(artifact.provider, artifact.model, `${SRC.selector} ARTIFACT_MODEL`)],
    },
    {
      id: 'bilder-verstehen',
      task: 'Bilder verstehen',
      models: [entry(vision.provider, vision.model, `${SRC.chatProviders} VISION_MODEL`)],
    },
    { id: 'bilder-erzeugen', task: 'Bilder erzeugen & bearbeiten', models: imageRows },
    { id: 'transkription', task: 'Untertitel & Transkription', models: transcriptionRows },
    {
      id: 'embeddings',
      task: 'Suche & Notebooks (Embeddings)',
      models: [entry('mistral', embeddingModel, `${SRC.embeddings} modelName`)],
    },
  ];

  const hosts = [...new Set(rows.flatMap((r) => r.models.map((m) => `${m.host} ${m.flag}`)))].sort(
    (a, b) => a.localeCompare(b, 'de')
  );

  return {
    json: JSON.stringify({ rows, hosts }, null, 2) + '\n',
    summary: `${rows.length} Aufgaben über ${hosts.length} Anbieter`,
  };
}

runGenerator({
  outFile: OUT_FILE,
  generate,
  regenerateCmd: 'pnpm --filter @gruenerator/documentation models:generate',
});
