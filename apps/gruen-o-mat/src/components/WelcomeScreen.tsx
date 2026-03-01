import { Leaf, MessageCircleQuestion, FileText, Scale } from 'lucide-react';

const SUGGESTIONS = [
  {
    icon: <Leaf className="size-4 text-primary" />,
    text: 'Was ist die Position der Grünen zum Klimaschutz?',
  },
  {
    icon: <Scale className="size-4 text-primary" />,
    text: 'Was sagen die Grünen zur Kindergrundsicherung?',
  },
  {
    icon: <FileText className="size-4 text-primary" />,
    text: 'Welche Positionen gibt es zur Energiewende?',
  },
  {
    icon: <MessageCircleQuestion className="size-4 text-primary" />,
    text: 'Was fordern die Grünen im Bereich Bildung?',
  },
];

export function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center pt-12 pb-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Leaf className="size-8 text-primary" />
      </div>

      <h2 className="mb-2 text-2xl font-semibold text-foreground">Willkommen beim Grün-O-Mat</h2>
      <p className="mb-8 max-w-md text-foreground-muted">
        Stell Fragen zu Positionen und Programmen von Bündnis 90/Die Grünen. Die Antworten basieren
        auf offiziellen Dokumenten von gruene.de.
      </p>

      <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.text}
            type="button"
            className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-surface-hover"
            onClick={() => {
              const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder]');
              if (textarea) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype,
                  'value'
                )?.set;
                nativeInputValueSetter?.call(textarea, s.text);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.focus();
              }
            }}
          >
            {s.icon}
            <span className="text-foreground">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
