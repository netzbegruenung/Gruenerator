/**
 * Free-text sharepic creator — the drafting step (experimental).
 *
 * Two forced tool calls on Gemma 4 (Melious `:speed`, reasoning on), so only the knowledge a draft
 * needs reaches the prompt:
 *  1. `bedarf_melden` — the model names the country, the style-guide chapters
 *     and worked examples it wants, and what photos to search for. We load
 *     and search.
 *  2. `entwurf_abgeben` — with exactly those chapters, examples and hits in
 *     the prompt, the model writes the spec. `validateDraft` checks it against
 *     the schema AND the catalog; a rejection goes back as a repair turn.
 *
 * A fixed two-step sequence rather than an open tool loop: same on-demand
 * knowledge, but two calls with a known cost and no Melious stream quirks.
 */
import {
  isSharepicSceneRef,
  isSharepicUploadId,
  isSharepicVorlageRef,
  brandIdFor,
  SHAREPIC_BRAND_COLORS,
  slidePhotoFilename,
  type SharepicBerichtEintrag,
  type SharepicBrand,
  type SharepicCreatorLocale,
  type SharepicDraftFocus,
  type SharepicDraftResponse,
  type SharepicOwnPhoto,
  sharepicSpecSchema,
  type SharepicSlide,
  type SharepicSpec,
  sharepicFormLabel,
  type SharepicFormId,
} from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';
import { GEMMA_31B_ON_MELIOUS_SPEED } from '../ai/gemmaHosts.js';
import { aiObject, type AiObjectCall } from '../ai/generate.js';
import { getUnsplashService } from '../unsplash/UnsplashApiService.js';

import { weekdayId } from './briefFacts.js';
import { carouselLookProblems } from './carouselLook.js';
import { findStockPhotos, stockPhotoCredit, type FoundPhoto } from './catalog.js';
import { type DatumRepair, repairDatum } from './datumRepair.js';
import { type DraftFailure, DraftFailedError, sameFailure } from './draftFailure.js';
import { paintIllustrations, cutOutBilder, type SharepicPainters } from './draftPainting.js';
import { SCENE_PENDING, takeScene, type DraftScene } from './draftScene.js';
import {
  needsSchema,
  type Needs,
  NEEDS_SCHEMA,
  SPEC_SCHEMA,
  SPEC_SCHEMA_DE,
  specSchemaGjDe,
} from './draftSchemas.js';
import { fromZod, validateDraft } from './draftValidation.js';
import {
  ALTERNATIVES_NEED_MATERIAL,
  alsoCarousel,
  FORM_RECIPES,
  formCatalog,
  formHasMaterial,
  formMismatch,
  materialAsk,
  missingMaterial,
} from './forms.js';
import { repairOrt } from './ortRepair.js';
import {
  hasOwnPhoto,
  namesPhoto,
  OWN_PHOTO_RULE,
  ownPhotoGuard,
  photoRequestTexts,
} from './ownPhoto.js';
import {
  paletteHint,
  paletteHinweis,
  paletteSubstitutions,
  withPaletteColors,
} from './paletteColors.js';
import { ownPhotosText } from './photoAnalysis.js';
import { repairPhotoRefs } from './photoRefRepair.js';
import { withoutLocale, KEEP_THE_REST, focusHint } from './revisionPrompt.js';
import {
  driftProblems,
  restoreDroppedFields,
  specEditDrift,
  untouchedProblems,
  untouchedSlides,
} from './specEditGuard.js';
import { basicsText, chapterText, examplesText, systemPrompt } from './styleguide.js';
import { terminAnswerOf } from './terminGap.js';

const log = createLogger('sharepicCreator:draft');

/**
 * Gemma 4 on Melious `:speed` (infercom, DE), thinking. Measured 09.11.2026 on 15
 * briefs with reasoning on: `:balanced` went to the FI node every time (~45 tok/s,
 * median 51 s per draft, two first drafts lost their whole budget to thinking);
 * `:speed` writes ~180–270 tok/s. Without reasoning Gemma needed twice the repair
 * rounds and gave up on „Grün.“. Same price per token on both flavors.
 */
const PINNED = GEMMA_31B_ON_MELIOUS_SPEED;
/** Gemma on Melious knows on and off only; any level is the same think (09.11.2026). */
const REASONING = 'medium' as const;
/** Another model for a draft Gemma could not finish — not just its other host. Keeps
 *  its own low reasoning: the rescue is the fast way out, not a second long think. */
const RESCUE = { provider: 'mistral', model: 'mistral-large-4' } as const;
const RESCUE_ATTEMPTS = 2;

/** No slide with a background kind and typed items: nothing the person asked for went wrong. */
export function lacksStructure(input: unknown): boolean {
  const slides = (input as { slides?: unknown } | null)?.slides;
  if (!Array.isArray(slides) || !slides.length) return true;
  return slides.some((slide: { background?: { kind?: unknown }; items?: unknown } | null) => {
    if (typeof slide?.background?.kind !== 'string') return true;
    return (
      !Array.isArray(slide.items) ||
      slide.items.some((item: { type?: unknown } | null) => typeof item?.type !== 'string')
    );
  });
}

/** Every photo a draft shows: backgrounds and `bild` sources. */
function photoNames(slides: readonly SharepicSlide[]): string[] {
  return slides.flatMap((slide) =>
    [
      slide.background.kind !== 'farbe' ? slide.background.filename : '',
      ...slide.items.map((item) => (item.type === 'bild' ? item.quelle : '')),
    ].filter(Boolean)
  );
}

function describePhotos(photos: FoundPhoto[]): string {
  return photos.map((p) => `- ${p.filename}: ${p.alt_text}`).join('\n');
}

export { DraftFailedError };
export { textsOf } from './slideTexts.js';
export { SCENE_PENDING, takeScene, type DraftScene } from './draftScene.js';
export { type SharepicPainters } from './draftPainting.js';
export { isQuoteBrief, namesSpeaker, spelledNumbers } from './briefFacts.js';
export { validateDraft, bridgeProblems } from './draftValidation.js';

const DRAFT_ATTEMPTS = 3;
const POINTS_AT_ATTACHMENT =
  /(?<!\p{L})(?:anhang|angeh[äa]ngt\p{L}*|mein(?:em|en)?\s+foto)(?!\p{L})/iu;
const COLLAGE_GRUND = 'Die Szene mit dir ließ sich nicht malen.';
const PHOTO_GROUND_GRUND =
  'Die Szene mit dir ließ sich nicht malen – dein Foto ist jetzt der Hintergrund.';

/** At most one `foto` entry per photo; the last written is the most specific. */
export function oneFotoPerId(bericht: readonly SharepicBerichtEintrag[]): SharepicBerichtEintrag[] {
  return bericht.filter(
    (e, i) =>
      e.art !== 'foto' ||
      !bericht.slice(i + 1).some((later) => later.art === 'foto' && later.id === e.id)
  );
}

/**
 * `defaultLocale` is the user's profile country; the model may switch it when
 * the request clearly belongs to the other country. A revision keeps the
 * draft's country. `order` is the person's own request when `prompt` carries
 * more (the chat's conversation material).
 */
export async function draftSharepic(
  prompt: string,
  defaultLocale: SharepicCreatorLocale,
  current: SharepicSpec | null = null,
  ownPhotos: readonly SharepicOwnPhoto[] = [],
  /** Without them (no user) a scene becomes a colour and an illustration an icon. */
  painters: SharepicPainters = {},
  /** The form the request named or the user picked; the creator chooses when null. */
  named: SharepicFormId | null = null,
  /** What the person asked for this turn — the request's own dates belong on the sharepic. */
  order: string = prompt,
  /** With `current`: the slide (and elements) the change request is about. */
  focus: SharepicDraftFocus | null = null,
  /** The planner's brief, when it spells out a change `order` only confirms ("ja, mach das"). */
  brief: string | null = null,
  /** The request asks for a single image: a first draft gets exactly one slide. */
  oneSlide = false,
  /**
   * Whose design a first draft wears (the chat's „GJ-Design“, a GJ Vorlage);
   * null: the party's. A revision keeps the draft's own.
   */
  brand: SharepicBrand | null = null,
  /** A revision of a draft whose report said the Termin was missing: it still is, until a datum appears. */
  priorMissingTermin = false
): Promise<SharepicDraftResponse> {
  // The brief as validation reads it: a revision's draft counts as given.
  const given = current ? `${prompt}\n${JSON.stringify(current)}` : prompt;
  // A named form whose material is missing would fail every attempt: ask for it instead.
  const ask = named ? missingMaterial(named, given) : null;
  if (named && ask) {
    throw new DraftFailedError(`${named}: Material fehlt (${ask})`, {
      kind: 'material',
      form: named,
      ask,
    });
  }
  // A revision's `given` carries the draft as JSON, which no weekday pattern reads.
  const keptWeekdays = new Set(
    (current?.slides ?? []).flatMap((slide) => {
      const id = slide.datum?.weekday ? weekdayId(slide.datum.weekday) : null;
      return id ? [id] : [];
    })
  );
  const fixed = current?.locale ?? null;
  const design = current ? (current.brand ?? null) : brand;
  const single = oneSlide && !current;
  const countryHint = fixed
    ? `Land: ${fixed} (steht fest).`
    : `Land: Standard ist ${defaultLocale} (Profil der Person). Nimm das andere Land nur, wenn der Auftrag eindeutig dorthin gehört — Orte, Landesorganisationen, typische Begriffe („Gemeinderat in Graz“ → de-AT, „Kreistag in Bayern“ → de-DE).`;
  // A revision keeps the draft and changes only what was asked for.
  const task = current
    ? `Aktueller Entwurf:\n${JSON.stringify(withoutLocale(current))}\n\nÄnderungswunsch:\n${prompt}${focusHint(current, focus)}\n\n${KEEP_THE_REST}${hasOwnPhoto(current) ? `\n${OWN_PHOTO_RULE}` : ''}`
    : `Auftrag:\n${prompt}`;
  const build = current
    ? 'Ändere den Entwurf wie gewünscht und gib ihn vollständig mit entwurf_abgeben ab. Lass alles andere unverändert.'
    : `Baue jetzt das Sharepic – ${single ? 'genau eine Slide' : 'eine Slide oder ein Karussell'} – und gib es mit entwurf_abgeben ab.`;

  const needs = await aiObject<Needs>({
    lane: 'sharepic_creator',
    pinned: PINNED,
    reasoning: REASONING,
    system: systemPrompt(fixed ?? defaultLocale, design),
    prompt: `${task}${ownPhotos.length ? `\n\n${ownPhotosText(ownPhotos)}` : ''}\n\n${countryHint}\n\n## Formen\n${formCatalog()}\n\n${named ? `Die Form steht fest: \`${named}\`. Nenne als alternativen zwei andere, die auch passen würden.` : `Wähle die Form, die den Inhalt am besten trägt, und zwei andere als alternativen.${single ? ' Der Auftrag will ein einzelnes Bild: wähle eine Form mit genau einer Slide, kein Karussell und kein Interview.' : ''}`} ${ALTERNATIVES_NEED_MATERIAL}\n\nBevor du baust: Welche Form, für welches Land, welche Beispiele und Kapitel brauchst du, und wonach soll gesucht werden?`,
    toolName: 'bedarf_melden',
    toolDescription:
      'Melde Form, Alternativen, Land, passende Beispiele, Kapitel und die Suchbegriffe für ein Foto.',
    schema: NEEDS_SCHEMA,
    validate: (input) => fromZod(needsSchema, input),
    maxOutputTokens: 8000,
    label: 'sharepicCreator:needs',
  });
  if (!needs.ok) {
    throw new DraftFailedError(needs.error, { kind: needs.cause ? 'provider' : 'structure' });
  }
  log.info(`needs ${JSON.stringify(needs.data)}`);
  const locale = fixed ?? needs.data.land;
  // A chip whose form the brief cannot fill would only fail on every attempt.
  const fillable = [...new Set(needs.data.alternativen)].filter((f) => formHasMaterial(f, given));
  // The model's own pick is held to the same: no material, no form that fails on every attempt.
  const picked =
    named ??
    (formHasMaterial(needs.data.form, given) ? needs.data.form : (fillable[0] ?? 'einzelbild'));
  const swappedFrom = !named && picked !== needs.data.form ? needs.data.form : null;
  if (swappedFrom) {
    log.info(`form ${needs.data.form} lacks material → ${picked}`);
  }
  const chosen =
    single && (picked === 'karussell' || picked === 'interview') ? 'einzelbild' : picked;
  const alternativen = fillable.filter((f) => f !== chosen);
  // A revision keeps its form unless the request names one.
  const form = current ? named : chosen;
  const recipe = form ? FORM_RECIPES[form] : null;

  // A revision's chapters and examples pushed rebuilds (headline → list, #4252):
  // it keeps its form, so only a form the request names brings its own.
  const wanted = current ? { kapitel: [], anlass: [] } : needs.data;
  const chapters = [...new Set([...(recipe?.kapitel ?? []), ...wanted.kapitel])];
  const photos = await findStockPhotos(needs.data.fotos_suchen);

  const context = [
    basicsText(locale, design),
    ownPhotos.length ? ownPhotosText(ownPhotos) : '',
    ...chapters.map(chapterText),
    examplesText(
      locale,
      [...new Set([...(recipe?.anlass ?? []), ...wanted.anlass])].slice(0, 3),
      design
    ),
    needs.data.fotos_suchen.length
      ? photos.length
        ? `## Gefundene Fotos (filename: Motiv)\n${describePhotos(photos)}`
        : '## Gefundene Fotos\nKein Foto passt zum Thema. Nimm eine Markenfarbe als Hintergrund (kein Foto).'
      : '',
  ].filter(Boolean);

  // Images painted for this draft before, and a Vorlage's own photos, stay usable in a revision.
  const keptImage = (ref: string) => isSharepicSceneRef(ref) || isSharepicVorlageRef(ref);
  const keptScenes = (current?.slides ?? []).flatMap((slide) => [
    ...(slide.background.kind !== 'farbe' && keptImage(slide.background.filename)
      ? [slide.background.filename]
      : []),
    ...slide.items.flatMap((item) =>
      item.type === 'infografik'
        ? item.punkte.flatMap((p) => (p.bild ? [p.bild] : []))
        : item.type === 'bild'
          ? [item.quelle, item.freisteller ?? ''].filter(keptImage)
          : []
    ),
  ]);
  // A Vorlage ships its cut-out; the cut-out painter cannot load a `vorlage:` photo.
  const shippedCutOuts = new Map(
    (current?.slides ?? []).flatMap((slide) =>
      slide.items.flatMap((item) =>
        item.type === 'bild' && item.freisteller && isSharepicVorlageRef(item.freisteller)
          ? [[item.quelle, item.freisteller] as const]
          : []
      )
    )
  );
  const currentPhotos = photoNames(current?.slides ?? []);
  // Own photos already on the draft stay usable in a revision, even without the photo list.
  const keptUploads = currentPhotos.filter(isSharepicUploadId);
  // So do its live stock photos, which this process may never have searched.
  const livePhotos = [...photos.filter((p) => p.live).map((p) => p.filename), ...currentPhotos];
  // Without a painter a Faktenbild cannot get its scene; it falls back to a colour.
  const checkForm = form === 'faktenbild' && !painters.scene ? null : form;
  // "Karussell mit Bingo": both hold — three slides and the bingo.
  const carouselToo = !current && alsoCarousel(order, form);
  const palette = paletteSubstitutions(order, locale, design);
  const colourHint = palette.length ? `\n\n${paletteHint(palette)}` : '';
  // What the guard lets change: the request and its brief, never the conversation material.
  const asked = brief ? `${order}\n${brief}` : order;
  // An own photo goes only when the request names it (#4253) — never read from `prompt`,
  // whose researched sources may say „Bild“ anywhere.
  type Drafted = {
    spec: SharepicSpec;
    scene: DraftScene | null;
    kept: string | null;
    /** What this attempt dropped from `datum` and `ort` as not in the order. */
    repairs?: DatumRepair[];
  };

  // A scene may paint the person in only from a photo the server can read and that shows one.
  const personable = new Set(
    painters.scene && painters.cutOut
      ? ownPhotos.filter((p) => p.url && p.analysis.personen >= 1).map((p) => p.id)
      : []
  );
  const ownPhotoUnused = () =>
    `Du hast ein eigenes Foto mitgebracht (${ownPhotos.map((p) => p.id).join(', ')}) – setz es ein: als Hintergrund, als bild (auch ausschnitt "freigestellt") oder als "person" in der szene.`;
  // The raw answer, before the schema: an own photo anywhere in it counts as used.
  const usesOwnPhoto = (input: unknown) => {
    const raw = JSON.stringify(input);
    return ownPhotos.some((p) => raw.includes(JSON.stringify(p.id)));
  };
  // What the draft may name from the search: a typo in one of these gets repaired.
  const listedPhotos = [...photos.map((p) => p.filename), ...currentPhotos];
  const photoGuard = ownPhotoGuard<Drafted>(current, photoRequestTexts(order, brief));
  // A revision filling in a missing Termin (chat gap answer or Studio words): weekday and place go on the card.
  const terminAntwort = terminAnswerOf(order, current);
  // What the last checkable attempt got wrong, for the person's text if every attempt fails.
  // „Not your request" only while no attempt has delivered a draft to check.
  let failure: DraftFailure = { kind: 'structure' };
  // The last two validation errors: the same one twice means the model will not fix it.
  const lastErrors: string[] = [];
  const draftCall: AiObjectCall<Drafted> = {
    lane: 'sharepic_creator',
    pinned: PINNED,
    system: `${systemPrompt(locale, design)}\n\n${context.join('\n\n')}`,
    prompt: `${task}${colourHint}\n\n${form ? `Form: ${sharepicFormLabel(form)}${carouselToo ? ' im Karussell (2–8 Slides)' : ''} – ${FORM_RECIPES[form].wann}.\n\n` : ''}${build}`,
    toolName: 'entwurf_abgeben',
    toolDescription: 'Gib den fertigen Sharepic-Entwurf ab.',
    schema:
      locale !== 'de-DE'
        ? SPEC_SCHEMA
        : design === 'gruene-jugend'
          ? specSchemaGjDe()
          : SPEC_SCHEMA_DE,
    validate: (input, attempt, attempts) => {
      if (!lacksStructure(input)) failure = { kind: 'content' };
      const taken = takeScene(withPaletteColors(input, locale, design), personable);
      if (!taken.ok) return taken;
      const datumFixed = repairDatum(taken.input, given, keptWeekdays);
      const ortFixed = repairOrt(datumFixed.input, given);
      const photoFixed = repairPhotoRefs(ortFixed.input, listedPhotos);
      // Not reported to the person, unlike datum/ort: those repairs drop words of the
      // order, this one only corrects the model's copy of a name the person never saw.
      for (const r of photoFixed.repairs) log.info(`repaired foto "${r.from}" → "${r.to}"`);
      const repaired = {
        input: photoFixed.input,
        repairs: [...datumFixed.repairs, ...ortFixed.repairs],
      };
      for (const r of repaired.repairs) {
        log.info(`repaired ${r.feld} "${r.wert}" (slide ${r.slide + 1})`);
      }
      // Contact data already on the draft counts as given.
      const checked = validateDraft(
        repaired.input,
        locale,
        given,
        [...ownPhotos.map((p) => p.id), ...keptUploads],
        taken.scene ? [SCENE_PENDING, ...keptScenes] : keptScenes,
        order,
        livePhotos,
        design,
        painters.cutOut ? ownPhotos.filter((p) => p.url).map((p) => p.id) : [],
        terminAntwort
      );
      if (!checked.ok) {
        // Told only after every other check passed, the own photo never reached a model stuck on
        // an invented stock name (06.11.2026): it comes with the first error.
        return !current && ownPhotos.length && !usesOwnPhoto(input)
          ? { ok: false, error: `${checked.error}\n${ownPhotoUnused()}` }
          : checked;
      }
      const notSingle =
        single &&
        checked.value.slides.length !== 1 &&
        `${sharepicFormLabel(form!)}: genau eine Slide – der Auftrag will ein einzelnes Bild.`;
      const formWrong =
        checkForm && formMismatch(checkForm, checked.value, taken.scene !== null, given);
      const carouselWrong =
        carouselToo && formMismatch('karussell', checked.value, taken.scene !== null, given);
      const mismatch = notSingle || formWrong || carouselWrong;
      if (mismatch) {
        const failed = notSingle || formWrong ? form! : 'karussell';
        // Named only when the brief lacks it: a quote can fail with its speaker given.
        const ask = formHasMaterial(failed, given) ? null : materialAsk(failed);
        failure = { kind: 'form', form: failed, ...(ask && { ask }) };
        return { ok: false, error: `Der Auftrag ist ein Sharepic der Form ${mismatch}` };
      }
      // A new carousel holds one look; the last attempt passes rather than fail the draft.
      const look = !current && attempt < attempts ? carouselLookProblems(checked.value) : null;
      if (look) return { ok: false, error: look };
      // Live 05.11.2026: „Auf dem Bild soll ich (Anhang) …“ got a generic surfer. The last attempt passes; the net reports.
      // Only a photo of ONE person is that person: a crowd in a landscape is no one to paint in
      // (live 06.11.2026, a meadow behind a sunflower became a collage).
      const firstPersonable = ownPhotos.find(
        (p) => personable.has(p.id) && p.analysis.personen === 1
      )?.id;
      if (
        !current &&
        attempt < attempts &&
        taken.scene &&
        !taken.scene.person &&
        firstPersonable &&
        (namesPhoto(order) || POINTS_AT_ATTACHMENT.test(order))
      ) {
        return {
          ok: false,
          error: `Der Auftrag will die Person aus dem eigenen Foto in der Szene: setz in der szene "person": "${firstPersonable}".`,
        };
      }
      // Photos brought along on a first draft are the request: a draft that uses none is sent back.
      if (!current && attempt < attempts && ownPhotos.length) {
        const used = new Set(photoNames(checked.value.slides));
        if (taken.scene?.person) used.add(taken.scene.person);
        if (!ownPhotos.some((p) => used.has(p.id))) return { ok: false, error: ownPhotoUnused() };
      }
      // Like a drift: the last attempt passes, the reply then says the slide stayed.
      const untouched =
        current && attempt < attempts ? untouchedSlides(current, checked.value, asked) : [];
      if (untouched.length) return { ok: false, error: untouchedProblems(untouched) };
      const drifts = current ? specEditDrift(current, checked.value, asked, focus) : [];
      let value: Drafted = {
        spec: checked.value,
        scene: taken.scene,
        kept: null,
        repairs: repaired.repairs,
      };
      if (drifts.length) {
        // The model's last attempt restores, also after attempts that never got here.
        if (attempt < attempts) return { ok: false, error: driftProblems(drifts, current!) };
        // Out of repair turns: keep what was asked, put back what was dropped.
        const restored = restoreDroppedFields(checked.value, drifts);
        value = {
          spec: restored.spec,
          scene: taken.scene,
          kept: restored.hinweis,
          repairs: repaired.repairs,
        };
      }
      // The own photo last: it may undo a drift restore's background choice, never the reverse.
      return photoGuard.check(value);
    },
    attempts: DRAFT_ATTEMPTS,
    // A carousel of up to eight slides, plus the thinking: Melious bills reasoning
    // against this budget. Measured 09.11.2026: two drafts on :balanced spent all 5000 on
    // thinking and returned nothing; on :speed one draft used 4986 of 5000.
    maxOutputTokens: 10000,
    label: 'sharepicCreator:draft',
  };
  const tracked: typeof draftCall = {
    ...draftCall,
    validate: (input, attempt, attempts) => {
      const result = draftCall.validate(input, attempt, attempts);
      if (!result.ok) lastErrors.push(result.error);
      return result;
    },
  };
  let draft = await aiObject({ ...tracked, reasoning: REASONING });
  // Repairs on the same model repeat its mistake — three identical `{}` at
  // temperature 0 (21.10.2026). A draft it could not finish gets one round on
  // another model before the person reads a failure. Not after an outage: the
  // lane's fallback chain has already tried that model.
  // The same validation error twice is not luck: the second model would make it too (~55 s lost, 05.11.2026).
  const [prev, last] = lastErrors.slice(-2);
  const repeats = failure.kind !== 'structure' && !!prev && !!last && sameFailure(prev, last);
  if (!draft.ok && !draft.cause && !photoGuard.fallback(draft.error) && !repeats) {
    log.warn(`draft failed on ${PINNED.model}, retrying on ${RESCUE.model}: ${draft.error}`);
    draft = await aiObject({ ...tracked, pinned: RESCUE, attempts: RESCUE_ATTEMPTS });
  }
  // Every attempt dropped the own photo: keep it and say so rather than fail.
  const photoKept = draft.ok ? null : photoGuard.fallback(draft.error);
  if (!draft.ok && !photoKept) {
    throw new DraftFailedError(draft.error, draft.cause ? { kind: 'provider' } : failure);
  }
  const accepted = draft.ok ? draft.data : photoKept!;

  // A revision keeps the draft's format unless the model names one.
  const drafted = accepted.spec;
  let spec = current?.format && !drafted.format ? { ...drafted, format: current.format } : drafted;
  let hinweis: string | null = null;
  const bericht: SharepicBerichtEintrag[] = [];
  if (form) {
    bericht.push({
      art: 'form',
      form,
      von: named ? 'person' : 'creator',
      ...(swappedFrom && { statt: swappedFrom }),
    });
  }
  for (const r of accepted.repairs ?? []) {
    bericht.push({ art: 'repariert', feld: r.feld, wert: r.wert.slice(0, 60) });
  }
  const scene = accepted.scene;
  let collageId: string | null = null;
  if (scene) {
    const background = spec.slides[scene.slide]!.background;
    const textSeite = background.kind === 'foto' ? background.textSeite : 'unten';
    const painted = painters.scene
      ? await painters.scene(
          {
            motiv: scene.motiv,
            textSeite,
            format: spec.format,
            ...(scene.person && { person: scene.person }),
          },
          ...(scene.person ? [ownPhotos] : [])
        )
      : ({ ok: false, hinweis: null } as const);
    // The colour-ground note is false when the person's own photo becomes the ground below.
    let photoGround: SharepicSpec | null = null;
    if (!painted.ok && scene.person) {
      const own = ownPhotos.find((p) => p.id === scene.person);
      const candidate: SharepicSpec = {
        ...spec,
        slides: spec.slides.map((slide, i) =>
          i === scene.slide
            ? {
                ...slide,
                background: {
                  kind: 'foto',
                  filename: scene.person!,
                  textSeite: own?.analysis.ruhigeSeite ?? textSeite,
                },
              }
            : slide
        ),
      };
      if (sharepicSpecSchema.safeParse(candidate).success) photoGround = candidate;
    }
    if (!painted.ok && !photoGround) {
      hinweis = painted.hinweis;
      if (painted.hinweis) bericht.push({ art: 'gestaltung', text: painted.hinweis });
    }
    if (photoGround) {
      spec = photoGround;
      bericht.push({
        art: 'foto',
        id: scene.person!,
        status: 'verwendet',
        grund: PHOTO_GROUND_GRUND,
      });
    } else
      spec = {
        ...spec,
        slides: spec.slides.map((slide, i) =>
          i !== scene.slide
            ? slide
            : painted.ok
              ? { ...slide, background: { kind: 'foto', filename: painted.ref, textSeite } }
              : {
                  ...slide,
                  // The block sat beside the scene; on a plain colour it belongs in the middle.
                  position: 'mitte',
                  background: {
                    kind: 'farbe',
                    color: SHAREPIC_BRAND_COLORS[brandIdFor(spec.locale, spec.brand)][0]!,
                  },
                }
        ),
      };
    if (scene.person && !photoGround) {
      const id = scene.person;
      const placed = (ausschnitt: 'freigestellt' | 'karte') => {
        const next: SharepicSpec = {
          ...spec,
          slides: spec.slides.map((slide, i) =>
            i === scene.slide
              ? {
                  ...slide,
                  items: [
                    ...slide.items,
                    { type: 'bild', quelle: id, ausschnitt, filter: 'original' },
                  ],
                }
              : slide
          ),
        };
        // A bild needs a colour ground and few neighbours; the schema decides.
        return sharepicSpecSchema.safeParse(next).success ? next : null;
      };
      if (painted.ok) {
        bericht.push({ art: 'foto', id, status: 'in_szene' });
      } else {
        // The scene is a photo ground and a `bild` stands on a colour, so the photo does not
        // go beside a scene painted without the person; it stands on the colour instead.
        const grund = COLLAGE_GRUND;
        const cut = placed('freigestellt');
        const card = cut ? null : placed('karte');
        const next = cut ?? card;
        if (next) spec = next;
        // The cut-out below reports a cut photo itself; the entry is rewritten there.
        if (cut) collageId = id;
        else {
          bericht.push(
            card
              ? {
                  art: 'foto',
                  id,
                  status: 'verwendet',
                  grund: `${grund} Dein Foto steht als Karte auf dem Sharepic.`,
                }
              : {
                  art: 'foto',
                  id,
                  status: 'nicht_verwendet',
                  grund: `${grund} Das Foto passt nicht auf diese Slide.`,
                }
          );
        }
      }
    }
  }
  const illustrated = await paintIllustrations(spec, painters.illustrations);
  const cut = await cutOutBilder(illustrated.spec, painters.cutOut, shippedCutOuts, ownPhotos);
  spec = cut.spec;
  // Judged on the outcome: the form check reads the conversation too, so the order alone could be wrong.
  if (
    (form === 'veranstaltung' || priorMissingTermin) &&
    !spec.slides.some((slide) => slide.datum)
  ) {
    bericht.push({ art: 'fehlt', fakt: 'termin' });
  }
  // Foto entries first: the cap below must never drop them.
  bericht.unshift(
    ...cut.fotoEintraege.map((e): SharepicBerichtEintrag => {
      if (e.art !== 'foto' || e.id !== collageId) return e;
      // One entry per photo: the scene failed, and the cut-out either worked or did not.
      return e.status === 'freigestellt'
        ? { ...e, status: 'collage', grund: COLLAGE_GRUND }
        : e.status === 'ungeschnitten'
          ? {
              ...e,
              grund:
                'Die Szene mit dir ließ sich nicht malen, und freistellen hat auch nicht geklappt.',
            }
          : e;
    })
  );
  // No own photo may vanish unreported (live: a first draft painted a generic surfer and said nothing).
  const reported = new Set(bericht.flatMap((e) => (e.art === 'foto' ? [e.id] : [])));
  const shown = new Set(photoNames(spec.slides));
  let unused = ownPhotos.filter((p) => !shown.has(p.id) && !reported.has(p.id));
  if (!current && unused.length === ownPhotos.length && unused.length) {
    const first = unused[0]!;
    const head = spec.slides[0]!;
    const painted =
      head.background.kind !== 'farbe' && isSharepicSceneRef(head.background.filename);
    if (!painted) {
      const candidate: SharepicSpec = {
        ...spec,
        slides: spec.slides.map((slide, i) =>
          i === 0
            ? {
                ...slide,
                background: {
                  kind: 'foto',
                  filename: first.id,
                  textSeite: first.analysis.ruhigeSeite ?? 'unten',
                },
              }
            : slide
        ),
      };
      if (sharepicSpecSchema.safeParse(candidate).success) {
        spec = candidate;
        bericht.unshift({
          art: 'foto',
          id: first.id,
          status: 'verwendet',
          grund: 'Ich habe dein Foto als Hintergrund eingesetzt.',
        });
        unused = unused.slice(1);
      }
    }
  }
  bericht.unshift(
    ...unused.map((p): SharepicBerichtEintrag => ({
      art: 'foto',
      id: p.id,
      status: 'nicht_verwendet',
      grund: 'Es passte nicht in diesen Entwurf – sag mir, wo es hin soll.',
    }))
  );
  const paletteNote = paletteHinweis(palette);
  if (paletteNote) bericht.push({ art: 'gestaltung', text: paletteNote.slice(0, 300) });
  hinweis =
    [
      paletteNote,
      hinweis ?? illustrated.hinweis,
      cut.hinweis,
      accepted.kept,
      photoKept?.hinweis ?? (draft.ok ? photoGuard.note() : null),
    ]
      .filter(Boolean)
      .join(' ') || null;
  // Unsplash counts a photo as used once it lands on a draft (API Terms).
  for (const name of new Set(photoNames(spec.slides))) {
    const location = photos.find((p) => p.filename === name)?.live?.attribution.downloadLocation;
    if (location) {
      getUnsplashService()
        .trackDownload(location)
        .catch((error: unknown) => log.warn(`download tracking failed: ${String(error)}`));
    }
  }
  const credits = await Promise.all(
    spec.slides.map(async (slide) => {
      const photo = slidePhotoFilename(slide);
      return photo &&
        !isSharepicUploadId(photo) &&
        !isSharepicSceneRef(photo) &&
        !isSharepicVorlageRef(photo)
        ? stockPhotoCredit(photo)
        : null;
    })
  );
  return {
    spec,
    ...(hinweis && { hinweis }),
    ...(form && { form }),
    bericht: oneFotoPerId(bericht).slice(0, 20),
    ...(alternativen.length && { alternativen: alternativen.slice(0, 2) }),
    chapters,
    attributions: credits.map((credit) =>
      credit
        ? {
            photographer: credit.photographer,
            profileUrl: credit.profileUrl,
            photoUrl: credit.photoUrl,
          }
        : null
    ),
  };
}
