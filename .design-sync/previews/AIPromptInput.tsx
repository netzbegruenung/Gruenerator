import { AIPromptInput } from '@gruenerator/ui';

// AIPromptInput is a fully controlled chat-style prompt input: textarea + a
// toolbar row (left) and an action button (right). With value < 3 chars the
// action is a mic (Spracheingabe); with text it becomes the send arrow. Example
// pills render inline in the toolbar row while the input is empty. Handlers are
// no-ops so the card renders the given state statically.

// Tiny inline toolbar glyphs (dependency-free; the component sizes child svgs).
const Paperclip = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);
const Sparkles = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" />
  </svg>
);

const toolbar = (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      color: 'var(--muted-foreground, #71717a)',
    }}
  >
    <Paperclip />
    <Sparkles />
  </div>
);

const examples = [
  { label: 'Wahlkampf', text: 'Plane eine Wahlkampfstrategie für ' },
  { label: 'Veranstaltung', text: 'Organisiere eine Veranstaltung zum Thema ' },
  { label: 'Kampagne', text: 'Erstelle einen Kampagnenplan für ' },
];

// Idle: empty input shows the placeholder, the toolbar, the example pills and
// the mic action button.
export function LeererPrompt() {
  return (
    <AIPromptInput
      value=""
      onChange={() => {}}
      onSubmit={() => {}}
      placeholder="Frag den Grünerator…"
      toolbar={toolbar}
      examples={examples}
    />
  );
}

// Filled: text entered → the send arrow becomes active, pills are hidden.
export function MitEingabe() {
  return (
    <AIPromptInput
      value="Schreibe eine Pressemitteilung zum neuen Radwegekonzept der Grünen Musterstadt mit Zitat unserer Fraktionsvorsitzenden."
      onChange={() => {}}
      onSubmit={() => {}}
      placeholder="Frag den Grünerator…"
      toolbar={toolbar}
      examples={examples}
    />
  );
}

// Loading: submit fired → spinner action button, input disabled.
export function Generiert() {
  return (
    <AIPromptInput
      value="Entwirf einen Antrag zur Förderung kommunaler Solardächer."
      onChange={() => {}}
      onSubmit={() => {}}
      placeholder="Frag den Grünerator…"
      toolbar={toolbar}
      isLoading
    />
  );
}
