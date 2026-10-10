/**
 * Der Bearbeiten-Overlay für Leinwand-Text — EINE Erscheinung für beide
 * Renderer, und zwar auf der DOM-Seite der Bühne.
 *
 * ## Warum nicht einfach ein Portal aus dem Knoten heraus
 *
 * Genau das war der Fehler, der die Werkzeugleiste unsichtbar machte.
 * `react-konva` bringt einen EIGENEN Reconciler mit; ein `createPortal` aus
 * einem Knoten heraus wird von IHM abgearbeitet, nicht von `react-dom`. Das
 * Ziel `document.body` ändert daran nichts: `<div>` und `<button>` werden zu
 * Konva-Knoten aufgelöst, Konva meldet „Konva has no node with the type div.
 * Group will be used instead", und tiptap bekommt in `EditorContent` eine
 * Konva-Gruppe statt eines Elements gereicht (`element.append is not a
 * function`). Im DOM landete nie etwas — auf KEINER Vorlage, auch nicht auf
 * den dreien, die schon `richText` trugen.
 *
 * Der alte `<textarea>`-Zweig funktionierte nur, weil er an React vorbeiging:
 * `document.createElement` + `appendChild`, rein imperativ.
 *
 * Deshalb liegt der Editor hier außerhalb der Bühne. Die Knoten melden
 * lediglich „bearbeite mich, hier ist meine Box"; gezeichnet wird der Editor
 * von `CanvasStage` als Geschwister des `<Stage>`, wo `react-dom` zuständig
 * ist.
 *
 * ## Ein Editor, nicht zwei
 *
 * Vorher hatte jeder Renderer seinen eigenen: `CanvasRichText` das
 * tiptap-Portal, `CanvasText` die handgebaute Textarea. Weil `CanvasText`
 * alles zeichnet, was noch keinen Marker trägt, sah ein frisches Feld die
 * Werkzeugleiste nie — und ohne Werkzeugleiste entsteht auch kein erster
 * Marker. Die Aufteilung der Renderer bleibt (ein Konva-Knoten für glatten
 * Text, eine Gruppe aus Läufen für ausgezeichneten); der Editor ist derselbe.
 *
 * ## Wer die Knöpfe zeigt
 *
 * Fett/Kursiv/… gehören zum Text, nicht zum Overlay. Im Editor zeigt sie die
 * Kontextleiste der Kopfleiste, neben Farbe, Schriftgröße und Ausrichtung
 * desselben Elements. Wo es keine Kopfleiste gibt, bleibt die schwebende
 * Karte über dem Text der einzige mögliche Ort.
 *
 * Wer von beiden, sagt nicht der Aufrufer, sondern der Wirt selbst: wer
 * `useCanvasTextFormatting` aufruft, MELDET SICH damit an, und die Karte
 * erscheint nur, solange niemand angemeldet ist. Ein Schalter am Provider
 * („über mir liegt eine Kopfleiste") wäre ein Versprechen, das der Aufrufer
 * brechen kann, ohne dass es auffällt — und genau das täte
 * `CanvasEditorInner`, sobald es die Kontextleiste gar nicht erst rendert:
 * der Text hätte dann überhaupt keine Schnitt-Knöpfe mehr, weder Leiste noch
 * Karte.
 *
 * Damit der Wirt den Editor erreicht, steht dieser Provider dort, wo auch die
 * Kopfleiste steht: an der Wurzel des Editors. Der Provider in `CanvasStage`
 * bleibt trotzdem stehen — er ist NESTFEST: findet er einen über sich, reicht
 * er seine Kinder unverändert durch. So bedient eine Bühne im Editor die
 * Kopfleiste, eine Bühne ohne Editor weiterhin sich selbst, und keine der
 * beiden weiß etwas von der anderen.
 *
 * Genau eine Sitzung ist zu jeder Zeit offen — dieselbe Reichweite, die
 * `selectedElement` längst hat. Vorher lag sie je Seite, eine Stufe zu eng.
 *
 * Der Entwurf lebt im Overlay und wird erst beim Abschließen nach oben
 * gegeben. Das ist nicht nur Sparsamkeit: schriebe jeder Tastendruck in den
 * Zustand, wechselte das Feld beim ersten Marker mitten im Tippen den
 * Renderer, und der Editor würde unter der Hand abgeräumt.
 */
import { PLAIN_STYLE, splitListItems } from '@gruenerator/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { fontMarkSupport } from '../utils/fontMarkSupport';
import { DEFAULT_TEXT_MARKER } from '../utils/markerColors';
import { stageCssScale } from '../utils/stageCssScale';
import {
  fontStyleForRun,
  measureTextWidthWithFont,
  type TextAccent,
  type TextMarker,
} from '../utils/textUtils';

import { RichTextField } from './RichTextField';
import { type OfferedMarks } from './TextFormatControls';

import type { Editor } from '@tiptap/react';
import type Konva from 'konva';

export interface OverlayBox {
  top: number;
  left: number;
  width: number;
  minHeight: number;
  scale: number;
}

/** Ohne offene Sitzung trägt niemand einen Schnitt. */
const NO_MARKS: OfferedMarks = { bold: false, italic: false, accent: false, marker: false };

/**
 * Untergrenze für die gespiegelte Deckkraft. Der Regler der Kopfleiste geht
 * bis 0; ein Feld, das dort steht, wäre als Editor nicht mehr zu sehen.
 */
const LOWEST_LEGIBLE_OPACITY = 0.2;

export interface OverlayAnchor {
  node: Konva.Node;
  width: number;
  height: number;
}

/** Was ein Knoten mitgibt, wenn er bearbeitet werden will. */
export interface TextEditSession {
  /** Element-Id — der Knoten blendet sich aus, solange er bearbeitet wird. */
  id: string;
  box: OverlayBox;
  /** Knoten und Entwurfsmaße, aus denen `box` neu vermessen wird, sobald sich die Leinwand bewegt. */
  anchor?: OverlayAnchor;
  text: string;
  /** CSS-Stapel des Feldes; entscheidet, welche Schnitte angeboten werden. */
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fill: string;
  align: CSSProperties['textAlign'];
  lineHeight: number;
  /** Deckkraft des Feldes — die Kopfleiste stellt sie, also zeigt der Editor sie. */
  opacity: number;
  /** Stil der `==Akzent==`-Läufe; ohne ihn bietet der Editor keinen Akzent an. */
  accent?: TextAccent | null;
  /** Stil der `++Marker++`-Läufe; ohne ihn bietet der Editor keinen Marker an. */
  marker?: TextMarker | null;
  onTextChange?: (value: string) => void;
}

interface TextEditorContextValue {
  open: (session: TextEditSession | null) => void;
  /** Id des Feldes, das gerade bearbeitet wird — sonst `null`. */
  editingId: string | null;
  /** Der lebende tiptap-Editor, sobald er steht. */
  editor: Editor | null;
  /** Welche Schnitte die Schrift des bearbeiteten Feldes trägt, und ob es einen Akzent hat. */
  marks: OfferedMarks;
  /** Meldet einen Wirt an, der die Knöpfe zeigt; gibt das Abmelden zurück. */
  claimHost: () => () => void;
}

const TextEditorContext = createContext<TextEditorContextValue | null>(null);

/**
 * Geometrie eines Knotens in Fensterkoordinaten — dieselbe Rechnung, die
 * beide Renderer vorher je für sich anstellten.
 */
export function overlayBoxForNode(
  node: Konva.Node,
  width: number,
  height: number
): OverlayBox | null {
  const stage = node.getStage();
  if (!stage) return null;
  const stageBox = stage.container().getBoundingClientRect();
  const position = node.getAbsolutePosition();
  // Der Maßstab des KNOTENS, nicht der der Bühne. Bei einem Format, dessen
  // Entwurfsmaße von den Ausgabemaßen abweichen (Story, Präsentation, Flyer,
  // Plakat), legt `CanvasStage` eine zusätzlich skalierte Gruppe um den
  // Entwurf. `stage.scaleX()` kennt die nicht — der Editor stünde dort zwar
  // an der richtigen Stelle, aber in der falschen Größe.
  const cssScale = stageCssScale(stage, stageBox);
  const scale = node.getAbsoluteScale().x * cssScale;
  return {
    top: stageBox.top + window.scrollY + position.y * cssScale,
    left: stageBox.left + window.scrollX + position.x * cssScale,
    width: width * scale,
    minHeight: height * scale,
    scale,
  };
}

/** iOS zoomt in Eingabefelder unter 16px; kleinere Schrift wird deshalb hochskaliert gerendert und per `transform` zurückgenommen. */
const MIN_EDITOR_FONT_PX = 16;

function sameBox(a: OverlayBox, b: OverlayBox): boolean {
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.minHeight === b.minHeight &&
    a.scale === b.scale
  );
}

/**
 * Die Box des bearbeiteten Knotens, nachgeführt, solange die Sitzung offen
 * ist. Das Overlay hängt an `document.body`, die Leinwand aber nicht: auf
 * Mobilgeräten scrollt sie in `.canvas-editor-layout__main`, und Zoom sowie
 * das Mobile-Sheet verschieben und skalieren den Seiten-Container per CSS
 * (`--canvas-zoom`, `--canvas-sheet-shift`, `--canvas-sheet-scale`). Ohne
 * Nachführen bliebe der Editor stehen, während der Text darunter wegfährt.
 *
 * Höchstens einmal je Frame vermessen; während der Container seine
 * `transform`-Transition abspielt, in jedem Frame.
 */
function useAnchoredOverlayBox(session: TextEditSession | null): OverlayBox | null {
  // An den Anker gebunden: öffnet ein anderes Feld, gilt sofort dessen
  // `box`, nicht für einen Durchlauf noch die nachgeführte des vorigen.
  const [followed, setFollowed] = useState<{ anchor: OverlayAnchor; box: OverlayBox } | null>(null);
  const anchor = session?.anchor;

  useEffect(() => {
    if (!anchor) return;
    const current = anchor;
    const pages = current.node
      .getStage()
      ?.container()
      .closest<HTMLElement>('.heterogeneous-multipage__pages-container');
    let frame = 0;
    let transitioning = false;

    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    function measure() {
      frame = 0;
      const next = overlayBoxForNode(current.node, current.width, current.height);
      if (next) {
        setFollowed((prev) =>
          prev?.anchor === current && sameBox(prev.box, next)
            ? prev
            : { anchor: current, box: next }
        );
      }
      if (transitioning) schedule();
    }
    const onTransitionRun = (event: TransitionEvent) => {
      if (event.target !== pages || event.propertyName !== 'transform') return;
      transitioning = true;
      schedule();
    };
    const onTransitionStop = (event: TransitionEvent) => {
      if (event.target !== pages || event.propertyName !== 'transform') return;
      transitioning = false;
      schedule();
    };

    // Capture-Phase: `scroll` blubbert nicht, so kommt das Scrollen jedes
    // Vorfahren an, nicht nur das des Fensters.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    const observer = new MutationObserver(schedule);
    if (pages) {
      observer.observe(pages, { attributes: true, attributeFilter: ['style', 'data-zooming'] });
      pages.addEventListener('transitionrun', onTransitionRun);
      pages.addEventListener('transitionend', onTransitionStop);
      pages.addEventListener('transitioncancel', onTransitionStop);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      observer.disconnect();
      pages?.removeEventListener('transitionrun', onTransitionRun);
      pages?.removeEventListener('transitionend', onTransitionStop);
      pages?.removeEventListener('transitioncancel', onTransitionStop);
    };
  }, [anchor]);

  if (!session) return null;
  return followed && followed.anchor === anchor ? followed.box : session.box;
}

/**
 * Ruft ein Knoten auf, um den Editor zu öffnen. Ohne Provider passiert
 * nichts — eine Bühne ohne Editor-Schicht ist eine reine Anzeige (die
 * Vorschaubilder etwa), kein Fehler.
 */
export function useCanvasTextEditor(id: string | undefined) {
  const context = useContext(TextEditorContext);
  return {
    open: context?.open ?? (() => {}),
    // Ohne Id gibt es kein „dieses Feld" — zwei namenlose Knoten hielten
    // sich sonst gegenseitig für den, der gerade bearbeitet wird.
    isEditing: id !== undefined && id !== '' && context?.editingId === id,
  };
}

/**
 * Für den Wirt der Formatierungsknöpfe (die Kontextleiste). Der Aufruf IST
 * die Anmeldung: solange dieser Hook irgendwo im Baum hängt, lässt das
 * Overlay seine eigene Karte weg — zwei Leisten für dieselbe Handlung wären
 * eine zu viel, keine wäre eine zu wenig.
 *
 * Angemeldet wird unabhängig davon, ob gerade etwas bearbeitet wird. Sonst
 * fiele die Anmeldung mit dem Öffnen der Sitzung zusammen und die Karte
 * blitzte für einen Durchlauf auf. Die Kontextleiste steht ohnehin schon,
 * wenn ein Element ausgewählt ist — und ausgewählt ist es, bevor der
 * Doppelklick den Editor öffnet.
 *
 * Liefert `null`, solange nichts bearbeitet wird.
 */
export function useCanvasTextFormatting(): {
  editor: Editor;
  marks: OfferedMarks;
  editingId: string;
} | null {
  const context = useContext(TextEditorContext);
  const claimHost = context?.claimHost;
  useEffect(() => claimHost?.(), [claimHost]);
  if (!context || !context.editor || !context.editingId) return null;
  return { editor: context.editor, marks: context.marks, editingId: context.editingId };
}

/**
 * Wird gerade ein Text bearbeitet? Meldet sich — anders als
 * `useCanvasTextFormatting` — NICHT als Wirt an, die Karte bleibt also, wo sie ist.
 */
export function useIsCanvasTextEditing(): boolean {
  return useContext(TextEditorContext)?.editingId != null;
}

/**
 * Nestfest: liegt schon ein Provider darüber, reicht dieser seine Kinder
 * unverändert durch. Die Prüfung MUSS hier stehen und nicht im Rumpf von
 * `TextEditorRoot` — ein vorzeitiges `return` nach den Zustands-Hooks wäre
 * ein bedingter Hook-Aufruf.
 */
export function CanvasTextEditorProvider({ children }: { children: ReactNode }) {
  const existing = useContext(TextEditorContext);
  if (existing) return <>{children}</>;
  return <TextEditorRoot>{children}</TextEditorRoot>;
}

function TextEditorRoot({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TextEditSession | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState('');
  // Gezählt, nicht als Schalter: beim Wechsel zwischen Kontextleiste und
  // mobiler Zeile hängen An- und Abmeldung kurz gleichzeitig im selben
  // Durchlauf.
  const [hosts, setHosts] = useState(0);

  // Sobald der Editor geschlossen ist, darf sein Blur nichts mehr schreiben.
  // Beim Abräumen verschiebt tiptap das fokussierte contenteditable, der
  // Browser feuert dabei synchron `blur` — und `onBlur` hält noch die
  // Callbacks des letzten Renderns, also ein `commit` mit dem gerade
  // verworfenen Entwurf. Ein Guard auf `isConnected` hilft nicht: beim Feuern
  // hängt der Knoten noch im Dokument.
  const closed = useRef(false);
  const draftRef = useRef('');
  draftRef.current = draft;

  const open = useCallback((next: TextEditSession | null) => {
    if (!next) return;
    closed.current = false;
    setDraft(next.text);
    setSession(next);
  }, []);

  const commit = useCallback(() => {
    if (closed.current || !session) return;
    closed.current = true;
    setSession(null);
    if (draftRef.current !== session.text) session.onTextChange?.(draftRef.current);
  }, [session]);

  const box = useAnchoredOverlayBox(session);

  const realFontSize = session && box ? session.fontSize * box.scale : 0;
  const renderFontSize = Math.max(MIN_EDITOR_FONT_PX, realFontSize);
  const shrink = realFontSize > 0 ? realFontSize / renderFontSize : 1;

  const marks = useMemo(
    () =>
      session
        ? {
            ...fontMarkSupport(session.fontFamily),
            accent: !!session.accent,
            marker: !!session.marker,
          }
        : NO_MARKS,
    [session]
  );

  // Der Einzug einer Aufzählung, nach derselben Regel wie
  // `layoutRichTextBlock`: der breiteste Marker des Blocks samt Leerzeichen,
  // in der Schrift des Feldes gemessen. Er landet als CSS-Variable im Feld
  // (siehe `canvas-editor.css`) und leistet dort zweierlei — der Punkt steht
  // IM Feld statt links daneben, und der Editor bricht auf derselben Breite
  // um wie Leinwand und Export, der Text springt beim Schließen also nicht.
  //
  // Am Entwurf gemessen und danach skaliert, genau wie auf der Bühne: dort
  // rechnet der Renderer in Entwurfsmaßen, und die Gruppe darum skaliert.
  const listIndent = useMemo(() => {
    if (!session) return 0;
    const markers = splitListItems(draft)
      .map((item) => item.marker)
      .filter((marker): marker is string => marker !== null);
    if (markers.length === 0) return 0;
    const style = fontStyleForRun(session.fontStyle, PLAIN_STYLE);
    const widest = Math.max(
      ...markers.map((marker) =>
        measureTextWidthWithFont(`${marker} `, session.fontSize, session.fontFamily, style)
      )
    );
    return (widest * (box?.scale ?? 1)) / shrink;
  }, [draft, session, box?.scale, shrink]);

  const claimHost = useCallback(() => {
    setHosts((count) => count + 1);
    return () => setHosts((count) => count - 1);
  }, []);

  const value = useMemo(
    () => ({ open, editingId: session?.id ?? null, editor, marks, claimHost }),
    [open, session?.id, editor, marks, claimHost]
  );

  return (
    <TextEditorContext.Provider value={value}>
      {children}
      {session &&
        box &&
        // Jetzt ein echtes react-dom-Portal: der Provider steht AUSSERHALB
        // der Bühne, also ist react-dom zuständig. Nach `document.body`,
        // damit die Seitenkoordinaten aus `overlayBoxForNode` stimmen und
        // kein `overflow: hidden` der Leinwandfläche die Werkzeugleiste
        // abschneidet — die sitzt über dem Text und ragt bei einem Feld am
        // oberen Rand aus dem Sujet heraus.
        createPortal(
          <div
            style={{
              position: 'absolute',
              top: box.top,
              left: box.left,
              width: box.width,
              minHeight: box.minHeight,
              zIndex: 10000,
              pointerEvents: shrink < 1 ? 'none' : undefined,
            }}
          >
            <RichTextField
              value={draft}
              onChange={setDraft}
              marks={marks}
              showToolbar={hosts === 0}
              onEditorReady={setEditor}
              autoFocus
              contentStyle={{
                fontSize: renderFontSize,
                width: shrink < 1 ? box.width / shrink : undefined,
                transform: shrink < 1 ? `scale(${shrink})` : undefined,
                transformOrigin: 'top left',
                pointerEvents: 'auto',
                fontFamily: session.fontFamily,
                fontStyle: session.fontStyle.includes('italic') ? 'italic' : 'normal',
                fontWeight: session.fontStyle.includes('bold') ? 'bold' : 'normal',
                color: session.fill,
                textAlign: session.align,
                lineHeight: String(session.lineHeight),
                // Nicht ganz bis 0: die Deckkraft gehört zum Feld und wird
                // in derselben Leiste gestellt, aber der Editor ist Werkzeug,
                // nicht Sujet — bei 0 tippte man ins Unsichtbare.
                opacity: Math.max(session.opacity, LOWEST_LEGIBLE_OPACITY),
                // Eigene Eigenschaft; React typisiert sie nicht, reicht den
                // Wert aber unverändert durch.
                ...({
                  '--canvas-rte-list-indent': `${listIndent}px`,
                  '--canvas-rte-marker-fill': (session.marker ?? DEFAULT_TEXT_MARKER).fill,
                  '--canvas-rte-marker-color': (session.marker ?? DEFAULT_TEXT_MARKER).color,
                  ...(session.accent && {
                    '--canvas-rte-accent-color': session.accent.fill,
                    '--canvas-rte-accent-font': session.accent.fontFamily ?? session.fontFamily,
                    '--canvas-rte-accent-style': session.accent.fontStyle?.includes('italic')
                      ? 'italic'
                      : 'inherit',
                    '--canvas-rte-accent-weight': session.accent.fontStyle?.includes('bold')
                      ? 'bold'
                      : 'inherit',
                  }),
                } as CSSProperties),
              }}
              onBlur={commit}
              onEscape={commit}
              onSubmit={commit}
            />
          </div>,
          document.body
        )}
    </TextEditorContext.Provider>
  );
}
