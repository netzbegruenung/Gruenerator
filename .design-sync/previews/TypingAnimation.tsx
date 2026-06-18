import { TypingAnimation } from '@gruenerator/ui';

// The "assistant is composing" indicator shown while the Grünerator drafts a
// Pressemitteilung. startOnView=false so the static capture types immediately.
export function Composing() {
  return (
    <div
      style={{
        width: 460,
        padding: 24,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        fontSize: 22,
        fontWeight: 600,
        color: 'var(--foreground)',
        lineHeight: 1.3,
      }}
    >
      <TypingAnimation startOnView={false} cursorStyle="line" duration={0}>
        Grünerator schreibt deine Pressemitteilung…
      </TypingAnimation>
    </div>
  );
}

// A bold headline treatment with the block cursor — the kind of animated hero
// line used on a Kampagnen-Landingpage.
export function Headline() {
  return (
    <div
      style={{
        width: 460,
        padding: 24,
        borderRadius: 12,
        background: 'var(--secondary-600, #5F8575)',
        color: '#fff',
        fontSize: 30,
        fontWeight: 700,
        lineHeight: 1.2,
      }}
    >
      <TypingAnimation startOnView={false} cursorStyle="block" duration={0}>
        Klimaschutz, der wirkt.
      </TypingAnimation>
    </div>
  );
}
