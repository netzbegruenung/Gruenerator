/**
 * `recipes` — Rezepte und eigene Textformen („Texte anlernen") im agentischen
 * Loop.
 *
 * EIN Werkzeug mit `action`-Enum wie `userAgentTools.ts` (Katalogbudget).
 * `rezept_laden` (`recipeTools.ts`) WENDET ein Rezept an; dieses Werkzeug
 * VERWALTET: welche Rezepte es gibt, was in einer eigenen Textform steckt,
 * eine neue anlegen — aus Beispielen angelernt oder aus einer Beschreibung
 * entworfen (`draftRecipeSpec`, derselbe Entwurf wie „Rezept erstellen" in der
 * Agentura) —, Titel/Beschreibung/Icon/Anweisungen ändern, Beispiele
 * nachschieben, löschen. Bis 09/2026 ging das nur über die Einstellungen — der
 * Chat konnte nicht einmal sagen, ob die Person einen eigenen Presse-Stil
 * hinterlegt hat.
 *
 * Gatter, nach Wirkung sortiert:
 * - `confirm=true` im Werkzeug: Löschen.
 * - direkt: anlegen, ändern und ergänzen — privat, umkehrbar (delete), nur die
 *   Person selbst sieht die Textform. Die Analyse ist ein Modellaufruf; die Deckel
 *   aus dem Contract (`MAX_TEXT_FORM_EXAMPLES`, `_TOTAL_CHARS`) gelten hier wie
 *   am HTTP-Pfad, damit ein langer Anhang das Kontextfenster nicht sprengt.
 *
 * Parteiinterne Grenze (CLAUDE.md): die Rümpfe der Systemrezepte liegen in
 * `INTERN_CONTENT_DIR`. Dieses Werkzeug kennt sie NICHT — es importiert
 * `getInternalSkillPrompt` nicht und gibt für ein Systemrezept nur Titel und
 * Beschreibung aus dem öffentlichen Frontmatter zurück. Der Stilblock einer
 * eigenen Textform ist dagegen Nutzertext und darf zurück.
 *
 * Überschreiben: eine eigene Textform mit der Mention eines Systemrezepts
 * ersetzt dessen Rumpf (`kind: 'preset'` für die vier Textyp-Schlüssel,
 * `kind: 'recipe'` für ein Landesverbands-Rezept — dieselbe Zuteilung wie
 * `userTextFormsContractRouter.save`, über die gemeinsame Regel in
 * `resolveTextFormKind`). Ein Systemrezept ohne Landesverband
 * (`wahlpruefstein`) ist nicht überschreibbar; das sagt das Werkzeug, statt
 * die Mention still als `custom` zu speichern, was die Route mit 409 abweist.
 *
 * Keine Freigabe- oder Veröffentlichungs-Aktion: `public_ownership` ist eine
 * menschliche Rechtsversicherung für die Auflistung in der Agentura, die ein
 * Modell nicht selbst abgeben darf. Eine Projekt-Freigabe über dieses
 * Werkzeug hätte dasselbe Problem — das Modell würde die Sichtbarkeit
 * ausweiten und die eigene Rückfrage gleich mit beantworten. `description`
 * und `iconKey` lassen sich beim Anlernen mitgeben (create); Freigeben an
 * Projekte und Veröffentlichen bleiben Sache der Einstellungen/Agentura.
 *
 * Dienste kommen über `ctx.deps` herein, damit der Test ohne Postgres und
 * Modellaufruf jede Aktion durchspielen kann.
 */
import {
  MAX_TEXT_FORM_EXAMPLES,
  MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  MAX_TEXT_FORM_STYLE_CHARS,
  MAX_TEXT_FORM_TITLE_CHARS,
  draftRecipeBodySchema,
  textFormDescriptionSchema,
  textFormExamplesChars,
  textFormIconKeySchema,
  textFormTypeSchema,
  type TextForm,
  type TextFormKind,
  type TextFormType,
  type DraftedRecipeSpec,
} from '@gruenerator/contracts';
import {
  DEFAULT_AGENT_ICON,
  hasSystemRecipe,
  isSuggestedAgentIcon,
  landesverbandIdsForRoles,
  type RoleLandesverbandInput,
} from '@gruenerator/shared/agents';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { loadUserRoles } from '../../../services/roles/userRoles.js';
import {
  analyzeTextForm,
  textFormLabel,
  textTypeLabel,
} from '../../../services/user/textFormAnalysisService.js';
import { draftRecipeSpec } from '../../../services/user/textFormDraftService.js';
import {
  deriveRecipeMention,
  normalizeTextFormMention,
  resolveTextFormKind,
} from '../../../services/user/textFormKind.js';
import {
  deleteTextForm,
  listTextForms,
  upsertTextForm,
} from '../../../services/user/textFormRepository.js';
import { collectTakenMentions } from '../../userTextForms/textFormRouterHelpers.js';

import {
  groundNote,
  groundRows,
  makeRow,
  NO_SESSION,
  refuseForbiddenAction,
  requireUserId,
  type PersonalToolCtx,
} from './personalDataTools.js';
import { buildRecipeCatalog } from './recipeCatalog.js';

export interface RecipeToolDeps {
  listTextForms: typeof listTextForms;
  upsertTextForm: typeof upsertTextForm;
  deleteTextForm: typeof deleteTextForm;
  analyzeTextForm: typeof analyzeTextForm;
  /** Der Entwurf hinter „Rezept erstellen" in der Agentura: Beschreibung → Titel, Mention, Anweisungen. */
  draftRecipeSpec: typeof draftRecipeSpec;
  /** Alle Rezepte, die das Modell kennen darf — dieselbe Liste wie `rezept_laden`. */
  recipeCatalog: typeof buildRecipeCatalog;
  /** Nur wenn der State keine Rollen trägt (MCP): die Zuteilung der LV-Rezepte. */
  loadUserRoles: typeof loadUserRoles;
}

/** `PersonalToolCtx` plus optionale Fakes — der Katalog reicht den Ctx ohne `deps`. */
export type RecipeToolCtx = PersonalToolCtx & { deps?: Partial<RecipeToolDeps> };

export function resolveRecipeDeps(partial: Partial<RecipeToolDeps> | undefined): RecipeToolDeps {
  return {
    listTextForms: partial?.listTextForms ?? listTextForms,
    upsertTextForm: partial?.upsertTextForm ?? upsertTextForm,
    deleteTextForm: partial?.deleteTextForm ?? deleteTextForm,
    analyzeTextForm: partial?.analyzeTextForm ?? analyzeTextForm,
    draftRecipeSpec: partial?.draftRecipeSpec ?? draftRecipeSpec,
    recipeCatalog: partial?.recipeCatalog ?? buildRecipeCatalog,
    loadUserRoles: partial?.loadUserRoles ?? loadUserRoles,
  };
}

const NOT_FOUND = 'Keine eigene Textform mit dieser Mention gefunden.';
const SYSTEM_BODY_NOTE =
  'Das ist ein mitgeliefertes Rezept. Sein Text wird über rezept_laden angewendet und ist hier nicht einsehbar.';
const TYPE_SYSTEM = 'Rezept';
const TYPE_USER = 'Eigene Textform';

export const RECIPES_SETTINGS_URL = '/agentura?cat=meine';

/** Wie viel Beispieltext und Stilblock die Antwort zeigt. */
const EXAMPLE_PREVIEW_CHARS = 200;
const EXAMPLE_PREVIEW_COUNT = 5;
const STYLE_ANSWER_CHARS = 1500;

const KIND_LABEL: Record<TextFormKind, string> = {
  preset: 'Eigener Stil für ein mitgeliefertes Rezept',
  recipe: 'Eigener Stil für ein Landesverbands-Rezept',
  custom: 'Eigene Textform',
};

export function recipeUrl(mention: string): string {
  return `/agentura/rezept/${mention}`;
}

function recipeEditUrl(mention: string): string {
  return `${recipeUrl(mention)}/bearbeiten`;
}

const RECIPE_CREATOR_URL = '/agentura/rezept/neu';

/** Ein unbekannter Icon-Schlüssel wird auf das Standardicon geklemmt; leer heißt „nicht gesetzt". */
function clampIconKey(raw: string | undefined): string | null {
  const key = raw?.trim();
  if (!key) return null;
  return isSuggestedAgentIcon(key) ? key : DEFAULT_AGENT_ICON;
}

/**
 * `shareMode`/`isPublic` als eine der drei Stufen, die die Person hier zu
 * sehen bekommt. Es gibt keine Freigabe-Aktion in diesem Werkzeug (s.
 * Docblock) — `authenticated` ohne `isPublic` ist von hier aus nicht
 * herstellbar und zeigt sich darum als „privat".
 */
function visibilityLabel(form: TextForm): string {
  if (form.isPublic) return 'öffentlich in Agentura';
  if (form.shareMode === 'groups') return 'mit Projekten geteilt';
  return 'privat';
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Trimmt, wirft Leeres weg, prüft Anzahl und Gesamtbudget — dieselben Deckel wie der Contract. */
function normalizeExamples(
  raw: readonly string[] | undefined,
  already: ReadonlyArray<{ content: string }> = []
): Array<{ content: string }> | { error: string } {
  const fresh = (raw ?? []).map((e) => e.trim()).filter(Boolean);
  if (fresh.length === 0) return { error: 'examples braucht mindestens einen Beispieltext.' };
  const merged = [...already, ...fresh.map((content) => ({ content }))];
  if (merged.length > MAX_TEXT_FORM_EXAMPLES) {
    return {
      error: `Höchstens ${MAX_TEXT_FORM_EXAMPLES} Beispiele je Textform (jetzt wären es ${merged.length}).`,
    };
  }
  const chars = textFormExamplesChars(merged);
  if (chars > MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS) {
    return {
      error: `Alle Beispiele zusammen dürfen höchstens ${MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS.toLocaleString('de-DE')} Zeichen haben (jetzt ${chars.toLocaleString('de-DE')}).`,
    };
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Das Werkzeug
// ---------------------------------------------------------------------------

export function makeRecipesTool(ctx: RecipeToolCtx): Tool {
  const { state, threadId, sourceRegistry } = ctx;
  const deps = resolveRecipeDeps(ctx.deps);
  const userLocale = state.userLocale ?? null;

  return tool({
    description: `Verwaltet Rezepte und die eigenen Textformen der Person („Texte anlernen"): welche Rezepte es gibt, was in einem eigenen Rezept steckt, ein neues Rezept aus einer Beschreibung oder aus Beispieltexten anlegen, ändern, Beispiele ergänzen, löschen. recipes verwaltet, rezept_laden wendet an.

NUTZE FÜR: alle verfügbaren Rezepte und eigenen Textformen auflisten (list), Details ansehen — bei einer eigenen Textform Beispiele, Stilblock und Textsorte, bei einem mitgelieferten Rezept nur Titel und Beschreibung (get mit mention), ein neues Rezept aus einer Beschreibung anlegen — „erstell mir ein Rezept für OV-Einladungen", „bau ein Rezept, das Pressemitteilungen kürzer macht" (create mit brief; optional title, mention, description, iconKey), aus Beispieltexten eine eigene Textform anlernen — „lern meinen Schreibstil", „so schreibe ich Instagram-Posts" (create mit title, examples; optional mention, textType), Titel, Beschreibung, Icon oder Anweisungen eines eigenen Rezepts ändern (update mit mention und den neuen Feldern; die mention selbst bleibt), Beispiele zu einer eigenen Textform nachschieben (add_examples mit mention, examples), eine eigene Textform löschen (delete mit mention und confirm=true nach Zustimmung).

NICHT für: ein Rezept ANWENDEN, also einen Text in einer Form schreiben (dafür 'rezept_laden'), einen Grünerator-Agenten anlegen oder ändern (dafür 'user_agents'), den Text eines mitgelieferten Rezepts lesen (nicht einsehbar).

brief ist die Beschreibung der Person, was das Rezept tun soll — Textsorte, Anlass, Ton, Aufbau —, möglichst in ihren eigenen Worten und vollständig. Die Beispiele für create und add_examples sind die Texte der Person selbst — aus der Nachricht oder aus angehängten Dokumenten; übergib sie wörtlich, je Beispiel ein Eintrag. Eine eigene Textform mit der Mention eines mitgelieferten Rezepts (presse, instagram, facebook oder ein Landesverbands-Rezept) ersetzt dessen Stilvorgaben; ohne solche Mention entsteht eine zusätzliche Textform, die im Chat als @mention nutzbar ist. Anlegen dauert einige Sekunden (Entwurf bzw. Stilanalyse); zeig der Person danach die Anweisungen und den Link zum Bearbeiten.`,
    inputSchema: z.object({
      action: z.enum(['list', 'get', 'create', 'update', 'add_examples', 'delete']),
      mention: z
        .string()
        .optional()
        .describe(
          'Mention der Textform, aus list Feld ref (get, update, add_examples, delete; create: optional, sonst aus title bzw. dem Entwurf)'
        ),
      title: z
        .string()
        .max(MAX_TEXT_FORM_TITLE_CHARS)
        .optional()
        .describe('Anzeigename (create; bei create mit brief optional, update)'),
      brief: draftRecipeBodySchema.shape.description
        .optional()
        .describe('Beschreibung, was das neue Rezept tun soll (create ohne examples)'),
      instructions: z
        .string()
        .max(MAX_TEXT_FORM_STYLE_CHARS)
        .optional()
        .describe(
          'Neue Anweisungen (Stilblock) eines eigenen Rezepts, vollständig statt als Diff (update)'
        ),
      textType: textFormTypeSchema
        .optional()
        .describe('Textsorte der Beispiele, wenn sie zu einer passt (create)'),
      examples: z
        .array(z.string().max(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS))
        .max(MAX_TEXT_FORM_EXAMPLES)
        .optional()
        .describe('Beispieltexte der Person, je Eintrag ein Text (create, add_examples)'),
      description: textFormDescriptionSchema
        .optional()
        .describe('Kurzbeschreibung für die Agentura/mention-Auswahl (create, update)'),
      iconKey: textFormIconKeySchema
        .optional()
        .describe(
          'Icon-Schlüssel aus dem Icon-Katalog (create, update); ein unbekannter Schlüssel wird auf ein Standardicon geklemmt'
        ),
      confirm: z
        .boolean()
        .default(false)
        .describe('Nur bei delete: erst true setzen, nachdem die Person zugestimmt hat.'),
      limit: z.number().int().min(1).max(60).default(40),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const { action } = args;

      if (action === 'list') return listRecipes(userId, args.limit);
      if (action === 'create') return createTextForm(userId, args);

      // Alle weiteren Aktionen zielen auf EINE Mention.
      const mention = args.mention?.trim() ? normalizeTextFormMention(args.mention) : '';
      if (!mention) return { error: 'Diese Aktion braucht mention (aus list, Feld ref).' };

      if (action === 'get') return getRecipe(userId, mention);

      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;

      // Geteilte Textformen sind lesbar, aber fremd — ergänzen und löschen darf
      // nur die Eigentümer*in; die Repository-Queries prüfen das ohnehin, aber
      // die Antwort soll sagen, WARUM.
      const own = (await deps.listTextForms(userId)).find(
        (f) => f.mention === mention && !f.sharedFromGroup
      );
      if (!own) return { error: NOT_FOUND };

      if (action === 'update') return updateTextForm(userId, own, args);
      if (action === 'add_examples') return addExamples(userId, own, args.examples);

      // delete
      // Kein Mensch am Lauf: der `confirm=true`-Zweischritt bestätigt sich hier
      // selbst, und die Karte, die fragen würde, ginge an einen stummen Sink.
      if (!threadId) return { error: 'Löschen ist in diesem Kontext nicht möglich.' };
      if (!args.confirm) {
        const ask = `Soll die Textform „${own.title}" (@${own.mention}) wirklich gelöscht werden? Frage die Person und rufe delete erst mit confirm=true erneut auf.`;
        groundNote(sourceRegistry, 'Bestätigung nötig', ask);
        return { needsConfirmation: true, note: ask };
      }
      const deleted = await deps.deleteTextForm(userId, own.mention);
      if (!deleted) return { error: NOT_FOUND };
      const note = hasSystemRecipe(own.mention)
        ? `Textform „${own.title}" wurde gelöscht — @${own.mention} nutzt wieder die mitgelieferten Vorgaben.`
        : `Textform „${own.title}" (@${own.mention}) wurde gelöscht.`;
      groundNote(sourceRegistry, 'Gelöscht', note);
      return { ok: true, note };
    },
  });

  async function lvIdsFor(userId: string): Promise<readonly string[] | null> {
    // Der Chat-State trägt die Profilrollen; der MCP-Ctx nicht. Ohne Rollen
    // ließe `checkRecipeOverride` alles durch („nicht bekannt"), und jede*r
    // könnte sich per MCP auf das Rezept eines fremden Landesverbands setzen —
    // darum werden sie hier nachgeladen, wie es die HTTP-Route tut.
    const roles: readonly RoleLandesverbandInput[] =
      state.userRoles ?? (await deps.loadUserRoles(userId));
    return landesverbandIdsForRoles(roles, userLocale ?? 'de-DE');
  }

  // -------------------------------------------------------------------------
  // list — Katalog (System + eigene), Überschreibungen markiert
  // -------------------------------------------------------------------------

  async function listRecipes(userId: string, limit: number): Promise<Record<string, unknown>> {
    const [catalog, forms] = await Promise.all([
      deps.recipeCatalog({ userLocale, userId, roles: state.userRoles ?? null }),
      deps.listTextForms(userId),
    ]);
    // Presets und Rezept-Stile stehen nicht als eigene Zeile im Katalog — sie
    // sind die Zeile des Systemrezepts, nur mit eigenem Rumpf. Hier sichtbar
    // machen, sonst weiß das Modell nicht, dass „presse" für diese Person
    // nicht die Standardvorgaben meint.
    const overridden = new Map(
      forms.filter((f) => f.kind !== 'custom' && !f.sharedFromGroup).map((f) => [f.mention, f])
    );
    const results = catalog.slice(0, limit).map((e) => {
      const override = e.source === 'system' ? overridden.get(e.mention) : undefined;
      const snippet = override
        ? `${e.description} · eigener Stil hinterlegt („${override.title}"), ersetzt die mitgelieferten Vorgaben`
        : e.description;
      return makeRow(
        e.title,
        e.source === 'system' ? recipeUrl(e.mention) : RECIPES_SETTINGS_URL,
        e.source === 'system' ? TYPE_SYSTEM : TYPE_USER,
        snippet,
        e.mention
      );
    });
    if (results.length === 0) {
      const note = `Es sind keine Rezepte verfügbar. Eigene Textformen lassen sich hier mit create oder in der Agentura (${RECIPES_SETTINGS_URL}) anlernen.`;
      groundNote(sourceRegistry, 'Rezepte', note);
      return { resultCount: 0, results: [], note };
    }
    groundRows(sourceRegistry, results);
    return {
      resultCount: results.length,
      results,
      ...(catalog.length > limit ? { note: `Nur die ersten ${limit} von ${catalog.length}.` } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // get — eigene Textform mit Stilblock; Systemrezept nur mit Frontmatter
  // -------------------------------------------------------------------------

  async function getRecipe(userId: string, mention: string): Promise<Record<string, unknown>> {
    const form = (await deps.listTextForms(userId)).find((f) => f.mention === mention);
    if (form) return describeTextForm(form);

    const entry = (
      await deps.recipeCatalog({ userLocale, userId, roles: state.userRoles ?? null })
    ).find((e) => e.mention === mention);
    if (!entry) return { error: `Kein Rezept und keine eigene Textform „${mention}" gefunden.` };

    const url = recipeUrl(entry.mention);
    const lines = [
      `Rezept „${entry.title}" (@${entry.mention}) — ${url}`,
      `Beschreibung: ${entry.description}`,
      SYSTEM_BODY_NOTE,
    ];
    sourceRegistry.register([
      { source: 'eigene-inhalte', title: `Rezept: ${entry.title}`, content: lines.join('\n'), url },
    ]);
    return {
      recipe: {
        mention: entry.mention,
        title: entry.title,
        description: entry.description,
        source: 'system',
        readOnly: true,
        note: SYSTEM_BODY_NOTE,
        url,
      },
    };
  }

  function describeTextForm(form: TextForm): Record<string, unknown> {
    const url = RECIPES_SETTINGS_URL;
    const style = truncate(form.styleBlock, STYLE_ANSWER_CHARS);
    const styleTruncated = style.length < form.styleBlock.replace(/\s+/g, ' ').trim().length;
    const examples = form.examples
      .slice(0, EXAMPLE_PREVIEW_COUNT)
      .map((e) => truncate(e.content, EXAMPLE_PREVIEW_CHARS));
    const overrides = hasSystemRecipe(form.mention);
    const lines = [
      `Textform „${form.title}" (@${form.mention}) — ${url}`,
      `Art: ${KIND_LABEL[form.kind]}${overrides ? ` — ersetzt die Vorgaben von @${form.mention}` : ''}`,
      `Beschreibung: ${form.description ?? '—'}`,
      `Sichtbarkeit: ${visibilityLabel(form)}`,
      `Textsorte: ${form.textType ? textTypeLabel(form.textType) : '—'}`,
      `Beispiele: ${form.examples.length}${examples.length ? ` — ${examples.map((e) => `„${e}"`).join(' · ')}` : ''}`,
      `Angelernt am: ${form.analyzedAt ? form.analyzedAt.slice(0, 10) : '—'}`,
      ...(form.sharedFromGroup
        ? [`Geteilt aus Projekt „${form.sharedFromGroup}" — nur benutzbar, nicht änderbar.`]
        : []),
      `Stilblock${styleTruncated ? ' (gekürzt)' : ''}: ${style}`,
    ];
    sourceRegistry.register([
      {
        source: 'eigene-inhalte',
        title: `Textform: ${form.title}`,
        content: lines.join('\n'),
        url,
      },
    ]);
    return {
      recipe: {
        mention: form.mention,
        title: form.title,
        source: 'user',
        kind: form.kind,
        kindLabel: KIND_LABEL[form.kind],
        textType: form.textType,
        textTypeLabel: form.textType ? textTypeLabel(form.textType) : null,
        description: form.description,
        iconKey: form.iconKey,
        visibility: visibilityLabel(form),
        overridesSystemRecipe: overrides,
        exampleCount: form.examples.length,
        examples,
        styleBlock: style,
        styleTruncated,
        analyzedAt: form.analyzedAt,
        sharedFromGroup: form.sharedFromGroup,
        readOnly: form.sharedFromGroup != null,
        url,
      },
    };
  }

  // -------------------------------------------------------------------------
  // create — aus Beispielen (analysieren) oder aus brief (entwerfen) → speichern (direkt)
  // -------------------------------------------------------------------------

  async function createTextForm(
    userId: string,
    args: {
      title?: string | undefined;
      mention?: string | undefined;
      textType?: TextFormType | undefined;
      brief?: string | undefined;
      examples?: string[] | undefined;
      description?: string | undefined;
      iconKey?: string | undefined;
    }
  ): Promise<Record<string, unknown>> {
    const forbidden = refuseForbiddenAction(state);
    if (forbidden) return forbidden;

    // Beispiele schlagen die Beschreibung: wer eigene Texte mitgibt, will den
    // eigenen Stil angelernt haben, nicht einen erfundenen.
    const brief = args.brief?.trim() ?? '';
    const fromBrief = brief !== '' && !(args.examples ?? []).some((e) => e.trim());

    let examples: Array<{ content: string }> = [];
    if (!fromBrief) {
      if (!args.title?.trim()) return { error: 'create braucht title — den Namen der Textform.' };
      const normalized = normalizeExamples(args.examples);
      if ('error' in normalized) {
        return {
          error: `${normalized.error} Ohne Beispiele geht create mit brief — einer Beschreibung, was das Rezept tun soll.`,
        };
      }
      examples = normalized;
    }

    const ownForms = await deps.listTextForms(userId);

    let draft: DraftedRecipeSpec | null = null;
    if (fromBrief) {
      try {
        draft = await deps.draftRecipeSpec({
          messages: [{ role: 'user', content: brief }],
          takenMentions: collectTakenMentions(ownForms),
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          error: `Der Entwurf für das Rezept ist fehlgeschlagen (${reason}). Es wurde nichts gespeichert — später erneut versuchen oder in der Agentura (${RECIPE_CREATOR_URL}) anlegen.`,
        };
      }
      if (!draft.styleBlock) {
        return { error: 'Der Entwurf hat keine Anweisungen ergeben. Es wurde nichts gespeichert.' };
      }
    }

    // Explizit genannte Felder gewinnen gegen den Entwurf — wie bei `user_agents`.
    const title = (args.title?.trim() || draft?.title || '').slice(0, MAX_TEXT_FORM_TITLE_CHARS);
    const requested = args.mention?.trim()
      ? normalizeTextFormMention(args.mention)
      : (draft?.mention ?? deriveRecipeMention(title));

    // Welche Art entsteht — dieselbe Regel wie `userTextFormsContractRouter.save`.
    // Sie läuft VOR der Kollisionsprüfung, weil sie die Mention noch
    // verschiebt: ein zurückgezogenes Kürzel löst auf seinen Nachfolger auf
    // (`presse-hessen` → `presse-hessen-partei`). Gespeichert und geprüft wird
    // deshalb `verdict.mention`, nicht die hier abgeleitete — sonst legte das
    // Werkzeug eine Zeile an, die keine Mention je erreicht.
    const verdict = resolveTextFormKind({
      mention: requested,
      textType: args.textType ?? null,
      lvIds: await lvIdsFor(userId),
    });
    if (!verdict.ok) {
      // Zwei verschiedene Fehlerarten teilen sich hier einen Status: eine
      // ungültige Custom-Mention (Formfehler) und ein Systemrezept, das sich
      // so nicht überschreiben lässt (Zuteilung/Berechtigung) — nur Letzteres
      // gehört zu `hasSystemRecipe`.
      if (hasSystemRecipe(requested)) {
        return {
          error: `${verdict.message} Ein mitgeliefertes Rezept lässt sich so nicht überschreiben — wähle eine andere Mention, dann entsteht eine zusätzliche Textform.`,
        };
      }
      return { error: `Ungültige Mention „${requested}": ${verdict.message}` };
    }
    const { kind, textType, mention } = verdict;

    // Eine Mention gehört genau einer Zeile; `upsert` würde die bestehende
    // still ersetzen — mitsamt allen Beispielen, die die Person dort schon
    // gesammelt hat. Dafür gibt es update und add_examples.
    const existing = ownForms.find((f) => f.mention === mention && !f.sharedFromGroup);
    if (existing) {
      return {
        error: `Die Textform „${existing.title}" (@${mention}) gibt es schon. Ändern geht mit update, Beispiele nachschieben mit add_examples, neu anfangen mit delete.`,
      };
    }

    const description = args.description?.trim() || draft?.description || null;
    const iconKey = clampIconKey(args.iconKey) ?? draft?.iconKey ?? null;

    let styleBlock: string;
    let model: string | null;
    if (draft) {
      styleBlock = draft.styleBlock;
      model = null;
    } else {
      const analyzed = await analyzeSafely(textFormLabel(textType, title), examples);
      if ('error' in analyzed) return analyzed;
      styleBlock = analyzed.styleBlock;
      model = analyzed.model;
    }

    const form = await deps.upsertTextForm(userId, {
      kind,
      textType,
      mention,
      title,
      examples,
      styleBlock,
      model,
      description,
      iconKey,
    });
    const origin = draft
      ? 'aus deiner Beschreibung angelegt'
      : `aus ${examples.length} Beispiel${examples.length === 1 ? '' : 'en'} angelernt`;
    const note =
      kind === 'custom'
        ? `Textform „${form.title}" ${origin} — im Chat als @${form.mention} nutzbar, ändern in der Agentura (${recipeEditUrl(form.mention)}).`
        : `Eigener Stil für @${form.mention} ${origin} — er ersetzt ab jetzt die mitgelieferten Vorgaben dieses Rezepts. Ändern in der Agentura (${RECIPES_SETTINGS_URL}).`;
    groundNote(sourceRegistry, 'Textform angelegt', note);
    return {
      ok: true,
      note,
      ...summarize(form),
      ...(draft ? { instructions: truncate(form.styleBlock, STYLE_ANSWER_CHARS) } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // update — Titel, Beschreibung, Icon, Anweisungen (direkt, owner-scoped)
  // -------------------------------------------------------------------------

  async function updateTextForm(
    userId: string,
    form: TextForm,
    args: {
      title?: string | undefined;
      description?: string | undefined;
      iconKey?: string | undefined;
      instructions?: string | undefined;
    }
  ): Promise<Record<string, unknown>> {
    const title = args.title?.trim();
    const description = args.description?.trim();
    const iconKey = clampIconKey(args.iconKey);
    const instructions = args.instructions?.trim();
    if (!title && !description && !iconKey && !instructions) {
      return {
        error: 'update braucht mindestens eines von title, description, iconKey, instructions.',
      };
    }

    const updated = await deps.upsertTextForm(userId, {
      kind: form.kind,
      textType: form.textType,
      mention: form.mention,
      title: title ? title.slice(0, MAX_TEXT_FORM_TITLE_CHARS) : form.title,
      examples: [...form.examples],
      // Handgeschriebene Anweisungen stammen aus keiner Analyse — wie am HTTP-Pfad kein Modell.
      styleBlock: instructions ? instructions.slice(0, MAX_TEXT_FORM_STYLE_CHARS) : form.styleBlock,
      model: instructions ? null : form.model,
      // `undefined` lässt das gespeicherte Feld stehen (`mergeOptionalColumn`).
      description: description || undefined,
      iconKey: iconKey ?? undefined,
    });
    const changed = [
      title && 'Titel',
      description && 'Beschreibung',
      iconKey && 'Icon',
      instructions && 'Anweisungen',
    ].filter(Boolean);
    const note = `Textform „${updated.title}" (@${updated.mention}) geändert: ${changed.join(', ')}.`;
    groundNote(sourceRegistry, 'Textform geändert', note);
    return { ok: true, note, ...summarize(updated) };
  }

  // -------------------------------------------------------------------------
  // add_examples — anhängen, neu analysieren, speichern (direkt)
  // -------------------------------------------------------------------------

  async function addExamples(
    userId: string,
    form: TextForm,
    raw: string[] | undefined
  ): Promise<Record<string, unknown>> {
    const examples = normalizeExamples(raw, form.examples);
    if ('error' in examples) return examples;

    const label = textFormLabel(form.textType, form.title);
    const analyzed = await analyzeSafely(label, examples);
    if ('error' in analyzed) return analyzed;

    const updated = await deps.upsertTextForm(userId, {
      kind: form.kind,
      textType: form.textType,
      mention: form.mention,
      title: form.title,
      examples,
      styleBlock: analyzed.styleBlock,
      model: analyzed.model,
    });
    const added = examples.length - form.examples.length;
    const note = `Textform „${updated.title}" (@${updated.mention}): ${added} Beispiel${added === 1 ? '' : 'e'} ergänzt, jetzt ${examples.length} — der Stil wurde neu analysiert.`;
    groundNote(sourceRegistry, 'Textform ergänzt', note);
    return { ok: true, note, ...summarize(updated) };
  }

  /**
   * Der Stilblock kommt aus einem Modellaufruf: fällt er aus, bekommt das
   * Modell einen weitergebbaren Fehler statt eines 500ers — und es wird nichts
   * gespeichert, denn eine Textform ohne Stilblock injiziert nichts.
   */
  async function analyzeSafely(
    label: string,
    examples: ReadonlyArray<{ content: string }>
  ): Promise<{ styleBlock: string; model: string } | { error: string }> {
    try {
      const { styleBlock, model } = await deps.analyzeTextForm(label, examples);
      // Der Contract deckelt den Stilblock; der Renderer hält sich daran, aber
      // die Zeile in der Datenbank soll es auch dann, wenn er einmal nicht tut.
      return { styleBlock: styleBlock.slice(0, MAX_TEXT_FORM_STYLE_CHARS), model };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        error: `Die Stilanalyse ist fehlgeschlagen (${reason}). Es wurde nichts gespeichert — später erneut versuchen oder in der Agentura (${RECIPES_SETTINGS_URL}) anlernen.`,
      };
    }
  }

  function summarize(form: TextForm): Record<string, unknown> {
    return {
      recipe: {
        mention: form.mention,
        title: form.title,
        source: 'user',
        kind: form.kind,
        kindLabel: KIND_LABEL[form.kind],
        textTypeLabel: form.textType ? textTypeLabel(form.textType) : null,
        description: form.description,
        iconKey: form.iconKey,
        visibility: visibilityLabel(form),
        overridesSystemRecipe: hasSystemRecipe(form.mention),
        exampleCount: form.examples.length,
        url: RECIPES_SETTINGS_URL,
      },
    };
  }
}
