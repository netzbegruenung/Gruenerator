/**
 * Was aus dem Text eines Social-Posts die Kennzahlen macht, die auf der Karte
 * stehen (Zeichenzahl, Hashtags).
 *
 * Die Datei erzeugte einmal den Post selbst — die Texthälfte des Verdikts
 * `social_post`. Das Verdikt ist 08/2026 stillgelegt (die Textsorte trägt das
 * Rezept), und mit ihm sind `generateSocialPostText` und die
 * Format-Extraktion gefallen. Der Parser bleibt, weil `socialPostEditService`
 * ihn braucht: die Posts aus der Zeit davor sind weiter bearbeitbar, und ihre
 * neue Fassung muss dieselben Kennzahlen bekommen.
 */

const HASHTAG_PATTERN = /#[^\s#.,;!?()[\]{}"']+/g;

/**
 * Deterministic post-processing of the LLM output. No JSON round-trip —
 * emojis/newlines make structured output fragile; the prompt already demands
 * "nur der fertige Post inklusive Hashtags".
 */
export function parseSocialPostText(raw: string): {
  text: string;
  hashtags: string[];
  charCount: number;
} {
  // Strip code fences and lead-in/meta lines some models still emit.
  let text = raw.trim();
  const fenced = text.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  if (fenced?.[1]) text = fenced[1].trim();
  text = text.replace(/^(hier ist (dein|der) post[^\n]*|dein post:)\s*\n+/i, '').trim();

  const hashtags = Array.from(new Set(text.match(HASHTAG_PATTERN) ?? []));
  return { text, hashtags, charCount: text.length };
}
