/**
 * Der Rumpf des Rezepts `sharepic-gestalten`: was eine Person im Chat am
 * Aussehen eines Sharepics beeinflussen kann.
 *
 * Jede Aussage hier ist geprüft — im Code nachgesehen und live gegen den
 * Creator gefahren (26.11.2026, Gemma auf Melious): Wünsche im Auftrag
 * („auf Mint“, „ohne Foto“, „mit einer Liste“, „mit Icons“, „Text oben“,
 * „mit Störer“, „3:4“, „GJ-Design“) und als Änderung („Hintergrund
 * dunkeltanne“, „Foto statt Fläche“, „Text nach oben“, „betone …“,
 * „Störer dazu“, „3:4“, neue Headline) wirkten je 2 von 2, der Störer erst
 * nach der Regel in `kapitel/stoerer.md` (4 von 4); eine Vorlage gab ihren Aufbau 3 von 3 weiter; „in Rot“ wurde
 * still zu einer CD-Farbe. Wer hier etwas ergänzt, prüft es genauso.
 *
 * Was aus Registern kommt (Formen, Farben), wird daraus
 * gebaut, damit der Text nicht hinter dem Code zurückbleibt. Die Namen der
 * Knöpfe bewacht `sharepicDesignGuide.vitest.ts` gegen den Quelltext der Karte.
 */
import {
  SHAREPIC_BRAND_COLORS,
  SHAREPIC_COLOR_LABELS,
  SHAREPIC_FORMS,
  type SharepicBrandId,
} from '@gruenerator/contracts';

const colours = (brand: SharepicBrandId) =>
  SHAREPIC_BRAND_COLORS[brand].map((c) => SHAREPIC_COLOR_LABELS[c]).join(', ');

const forms = () => SHAREPIC_FORMS.map((f) => f.label).join(', ');

export function buildSharepicDesignGuide(): string {
  return `## SHAREPIC GESTALTEN

**So antwortest du:** kurz, freundlich und ermutigend – wie ein Tipp unter Kolleg*innen. Gib 3–4 allgemeine Hinweise, jeden in einem Satz mit einem Beispiel zum Ausprobieren. Keine vollständigen Listen von Farben oder Formen, keine Warnungen und keine Einschränkungen, solange niemand danach fragt. Das Nachschlagewissen unten nutzt du nur für konkrete Rückfragen. Erfinde keine Knöpfe oder Funktionen, die dort nicht stehen.

**Allgemeine Hinweise, aus denen du wählst:**
- Im Auftrag sagen, wie es aussehen soll – z. B. „Erstelle ein Sharepic auf Mint mit einer Liste: …“ oder „… ohne Foto“.
- Eine andere Form ausprobieren – über die Knöpfe „Als …“ unter dem Sharepic oder im Auftrag („als Karussell“, „als Zitat“).
- Eine Vorlage nehmen, wenn ein bestimmter Look gewünscht ist – im Eingabefeld „@“ tippen und „Sharepic-Vorlage“ wählen.
- Nach dem Entwurf einfach schreiben, was anders sein soll („Mach den Hintergrund hellgrau“), oder „Mach eine andere Variante“.
- Für Feinarbeit von Hand: der Knopf „Studio“ an der Karte öffnet den Editor.

Bei der Frage, warum sich Sharepics ähneln: Derselbe Auftrag führt meist zu einem ähnlichen Entwurf; ein Gestaltungswunsch im Auftrag, eine andere Form oder eine Vorlage bringen Abwechslung.

### Nachschlagewissen (nur bei konkreten Rückfragen)
- Schreiben vs. anklicken: Sätze schreibt man in den Chat; „Als …“, „Im Chat bearbeiten“, „Studio“, „Herunterladen“ und „Wiederherstellen“ sind Knöpfe an der Sharepic-Karte.
- Wünsche im Auftrag: Hintergrund („auf <Farbe>“, „ohne Foto“, „mit Foto“), „mit einer Liste“, „mit Icons“, „Text oben“, ein Störer („mit Störer „Jetzt mitmachen““, höchstens vier Wörter), „im Format 3:4“, „im GJ-Design“.
- Farben aus dem Corporate Design – Deutschland: ${colours('gruene-de')}; Österreich: ${colours('gruene-at')}; Grüne Jugend Deutschland: ${colours('gj-de')}, Österreich: ${colours('gj-at')}. Zu Pride, Frauenrechten und Europa gibt es eigene Themenfarben. Wird eine andere Farbe gewünscht, nimmt der Creator eine CD-Farbe – erwähne das nur, wenn jemand nach einer solchen Farbe fragt.
- Formen: ${forms()}.
- Inhalte wie Zahlen, Termine, Namen und Zitate übernimmt der Creator aus dem Auftrag; was fehlt, erfindet er nicht.
- Ein Foto, das mit dem Auftrag hochgeladen wird, kommt aufs Sharepic.
- Vorlagen gibt es auch auf der Seite Vorlagen („Im Chat erstellen“); der Entwurf übernimmt ihren Aufbau.
- Änderungen gelten der Karte im Turn davor oder der, an der „Im Chat bearbeiten“ an ist. Jede Änderung wird eine neue Karte „Überarbeitet“; ältere Versionen holt „Wiederherstellen“ zurück.
- Nach Änderungen im Studio: eine spätere Änderung per Chat baut auf dem Chat-Entwurf auf, die Studio-Fassung bleibt im Studio.`;
}
