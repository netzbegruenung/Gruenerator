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
 * Der Entwurf lebt im Overlay und wird erst beim Abschließen nach oben
 * gegeben. Das ist nicht nur Sparsamkeit: schriebe jeder Tastendruck in den
 * Zustand, wechselte das Feld beim ersten Marker mitten im Tippen den
 * Renderer, und der Editor würde unter der Hand abgeräumt.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { fontMarkSupport } from '../utils/fontMarkSupport';

import { RichTextField } from './RichTextField';

import type Konva from 'konva';

export interface OverlayBox {
  top: number;
  left: number;
  width: number;
  minHeight: number;
  scale: number;
}

/** Was ein Knoten mitgibt, wenn er bearbeitet werden will. */
export interface TextEditSession {
  /** Element-Id — der Knoten blendet sich aus, solange er bearbeitet wird. */
  id: string;
  box: OverlayBox;
  text: string;
  /** CSS-Stapel des Feldes; entscheidet, welche Schnitte angeboten werden. */
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fill: string;
  align: CSSProperties['textAlign'];
  lineHeight: number;
  onTextChange?: (value: string) => void;
}

interface TextEditorContextValue {
  open: (session: TextEditSession | null) => void;
  /** Id des Feldes, das gerade bearbeitet wird — sonst `null`. */
  editingId: string | null;
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
  const scale = node.getAbsoluteScale().x;
  return {
    top: stageBox.top + window.scrollY + position.y,
    left: stageBox.left + window.scrollX + position.x,
    width: width * scale,
    minHeight: height * scale,
    scale,
  };
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

export function CanvasTextEditorProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TextEditSession | null>(null);
  const [draft, setDraft] = useState('');

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

  const cancel = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    setSession(null);
  }, []);

  const value = useMemo(() => ({ open, editingId: session?.id ?? null }), [open, session?.id]);

  return (
    <TextEditorContext.Provider value={value}>
      {children}
      {session &&
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
              top: session.box.top,
              left: session.box.left,
              width: session.box.width,
              minHeight: session.box.minHeight,
              zIndex: 10000,
            }}
          >
            <RichTextField
              value={draft}
              onChange={setDraft}
              marks={fontMarkSupport(session.fontFamily)}
              autoFocus
              contentStyle={{
                fontSize: session.fontSize * session.box.scale,
                fontFamily: session.fontFamily,
                fontStyle: session.fontStyle.includes('italic') ? 'italic' : 'normal',
                fontWeight: session.fontStyle.includes('bold') ? 'bold' : 'normal',
                color: session.fill,
                textAlign: session.align,
                lineHeight: String(session.lineHeight),
              }}
              onBlur={commit}
              onEscape={cancel}
              onSubmit={commit}
            />
          </div>,
          document.body
        )}
    </TextEditorContext.Provider>
  );
}
