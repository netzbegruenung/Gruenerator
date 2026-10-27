// SPDX-License-Identifier: MPL-2.0
/**
 * Template registry — the lookup every editor surface opens a template by id
 * through.
 *
 * The editor ships no templates of its own: the host registers its catalogue
 * with `registerTemplates` at start-up, before anything looks one up, and can
 * add further ones the same way. A module-level register rather than a field
 * in `CanvasEditorServices`, because configs are loaded by hooks, routers and
 * offscreen roots that have no React context.
 *
 * Template ids are stored in users' documents, so a registered id is never
 * replaced: registering another definition under it throws.
 */

/** The id of a registered template. */
export type TemplateId = string;

/**
 * What any template must provide. `TConfig` is the config the host's editor
 * renders; the registry itself never looks inside it.
 */
export interface TemplateDefinition<TId extends string = string, TConfig = unknown> {
  id: TId;
  /**
   * Loads the template's config, lazily so each template is its own chunk.
   * `formatId` is the canvas's format; only templates that follow the format
   * read it, every other one keeps its own sheet.
   */
  load: (formatId?: string) => Promise<TConfig>;
}

/**
 * Picker metadata of a template. The host decides the category and audience
 * vocabularies and what an omitted audience means.
 */
export interface TemplatePickerInfo<
  TCategory extends string = string,
  TAudience extends string = string,
> {
  label: string;
  description: string;
  previewImage: string;
  category: TCategory;
  /** Audience gating; the host's picker defines the default. */
  audience?: TAudience;
  /**
   * Lays out on the canvas's own format (see `load`). Without it the
   * template has one fixed sheet and belongs only in documents of that format.
   */
  followsFormat?: true;
  /** Opened by its own host surface only, never offered in a picker. */
  hiddenFromPicker?: true;
}

/**
 * Declares a template. Identity at runtime; it keeps the id literal so a host
 * can derive its own id union from a list of definitions.
 */
export function defineTemplate<const TId extends string, TConfig = unknown>(
  definition: TemplateDefinition<TId, TConfig>
): TemplateDefinition<TId, TConfig> {
  return definition;
}

const templates = new Map<string, TemplateDefinition>();

/** A registered template, or undefined. */
export function getTemplate(id: string): TemplateDefinition | undefined {
  return templates.get(id);
}

/**
 * Adds templates to the registry. An id may be registered once (it is stored
 * in users' documents); registering the same definition again is a no-op.
 */
export function registerTemplates(...definitions: TemplateDefinition[]): void {
  for (const definition of definitions) {
    const existing = templates.get(definition.id);
    if (existing === definition) continue;
    if (existing) throw new Error(`Template "${definition.id}" is already registered`);
    templates.set(definition.id, definition);
  }
}
