/**
 * Zod-Schemas für die contract-basierten Texte-Generatoren
 * (`/api/texte/alttext`, `/api/texte/website`).
 *
 * Beide Formen standen vorher doppelt im Baum: `WebsiteContent` als Interface
 * in `apps/api/types/routes.ts` und `AiGeneratedContent` als handgeschriebene
 * Zweitkopie in `packages/sites/src/hooks/useSite.ts`. Hier ist jetzt die eine
 * Quelle — beide Seiten leiten über `z.infer` ab.
 */
import { z } from 'zod';

// ── Alt-Text ────────────────────────────────────────────────────────────────

export const altTextBodySchema = z.object({
  /** Bild als Base64 — mit oder ohne `data:`-Präfix, der Dienst nimmt beides. */
  imageBase64: z.string().min(1, 'Bild (imageBase64) ist erforderlich'),
  /**
   * Freiwilliger Kontext der Nutzer*in („Foto vom Parteitag in Wiesbaden").
   * `null` ist erlaubt, weil das Formular ein leeres Feld so überträgt.
   */
  imageDescription: z.string().nullish(),
});
export type AltTextBody = z.infer<typeof altTextBodySchema>;

export const altTextResponseSchema = z.object({
  altText: z.string(),
});
export type AltTextResponse = z.infer<typeof altTextResponseSchema>;

/** Instagram nimmt bis zu 20 Bilder je Karussell und 1000 Zeichen Alt-Text je Bild. */
export const SLIDE_ALT_TEXT_MAX_SLIDES = 20;
export const SLIDE_ALT_TEXT_MAX_CHARS = 1000;

export const slideAltTextBodySchema = z.object({
  slides: z
    .array(
      z.object({
        /** Die Seite als Bild (Data-URL oder Base64). */
        imageBase64: z.string().min(1),
        /**
         * Die Texte der Seite, so wie sie im Editor stehen. Das Modell übernimmt
         * daraus Schreibweise, Zahlen und Namen, statt sie aus Pixeln zu lesen.
         */
        texts: z.array(z.string()).max(200),
      })
    )
    .min(1)
    .max(SLIDE_ALT_TEXT_MAX_SLIDES),
});
export type SlideAltTextBody = z.infer<typeof slideAltTextBodySchema>;

export const slideAltTextResponseSchema = z.object({
  /** Je Seite ein Alt-Text, in Seitenreihenfolge; `null`, wo die Seite scheiterte. */
  altTexts: z.array(z.string().nullable()),
});
export type SlideAltTextResponse = z.infer<typeof slideAltTextResponseSchema>;

// ── Landing-Page-Inhalte ────────────────────────────────────────────────────

export const websiteThemeSchema = z.object({
  title: z.string(),
  content: z.string(),
  /** Vom Bildwähler nachgetragen; leer, wenn er nichts Passendes fand. */
  imageUrl: z.string().optional(),
});

export const websiteActionSchema = z.object({
  text: z.string(),
  link: z.string(),
  imageUrl: z.string().optional(),
});

/**
 * Die Struktur, die das Modell erzeugen soll — und an der der Server die
 * Antwort misst, bevor er sie weiterreicht. Vorher prüfte die Route nur, ob
 * die sechs Schlüssel überhaupt vorhanden waren; alles darunter war
 * ungeprüft und landete als `any` im Seitenbauer.
 */
export const websiteContentSchema = z.object({
  hero: z.object({
    heading: z.string(),
    text: z.string(),
  }),
  about: z.object({
    title: z.string(),
    content: z.string(),
  }),
  hero_image: z.object({
    title: z.string(),
    subtitle: z.string(),
    imageUrl: z.string().optional(),
  }),
  themes: z.array(websiteThemeSchema).min(1, 'Das themes-Array braucht mindestens einen Eintrag'),
  actions: z
    .array(websiteActionSchema)
    .min(1, 'Das actions-Array braucht mindestens einen Eintrag'),
  contact: z.object({
    title: z.string(),
    email: z.string(),
    backgroundImageUrl: z.string().optional(),
  }),
});
export type WebsiteContent = z.infer<typeof websiteContentSchema>;
export type WebsiteTheme = z.infer<typeof websiteThemeSchema>;
export type WebsiteAction = z.infer<typeof websiteActionSchema>;

export const websiteGenerateBodySchema = z.object({
  description: z.string().min(1, 'Bitte gib eine Beschreibung an'),
  email: z.string().optional(),
});
export type WebsiteGenerateBody = z.infer<typeof websiteGenerateBodySchema>;

export const websiteGenerateResponseSchema = z.object({
  json: websiteContentSchema,
  /** Modell-/Verbrauchsangaben des AI-Laufs; kein Konsument liest sie heute. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type WebsiteGenerateResponse = z.infer<typeof websiteGenerateResponseSchema>;

// ── Fehler ──────────────────────────────────────────────────────────────────

export const texteErrorSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});
export type TexteError = z.infer<typeof texteErrorSchema>;
