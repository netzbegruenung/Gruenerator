import { Button } from '@gruenerator/ui';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

/**
 * Zeichenzähler — live character/word counter with per-platform social-media
 * limits. 1:1 port of the Grünerator design-system prototype
 * (Zeichenzaehler-Tool.dc.html): input card + Übersicht stats + expandable
 * Social-Media limits. Interactive controls use the shared @gruenerator/ui
 * Button; card surfaces mirror the prototype's inline-styled divs and read from
 * the app's theme tokens (var(--color-*)) so light/dark both work.
 */

// Brand icon path data (24×24 viewBox), inlined from the prototype — these are
// vendor marks not present in the app icon set.
const IC = {
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  bluesky:
    'M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z',
  mastodon:
    'M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.335-2.35 1.006-3.122.691-.77 1.6-1.164 2.732-1.164 1.311 0 2.302.5 2.962 1.502l.638 1.06.638-1.06c.66-1.002 1.65-1.502 2.96-1.502 1.13 0 2.04.395 2.732 1.164.671.773 1.006 1.813 1.006 3.122z',
  instagram:
    'M7.0301.984c-1.305.061-2.196.271-2.976.58-.807.31-1.49.738-2.163 1.412-.673.674-1.1 1.358-1.416 2.164-.309.78-.52 1.671-.582 2.976-.062 1.305-.076 1.72-.076 5.062s.015 3.756.079 5.062c.062 1.305.272 2.196.58 2.976.31.807.738 1.49 1.412 2.163.674.673 1.358 1.1 2.164 1.416.78.309 1.671.52 2.976.582 1.305.062 1.72.076 5.062.076s3.756-.015 5.062-.079c1.305-.061 2.197-.272 2.977-.58.807-.31 1.49-.738 2.163-1.412.673-.674 1.1-1.359 1.416-2.164.309-.78.52-1.671.582-2.976.062-1.306.076-1.72.076-5.062s-.015-3.756-.079-5.062c-.061-1.305-.272-2.197-.58-2.977-.31-.806-.738-1.49-1.412-2.163-.674-.673-1.359-1.1-2.164-1.416-.78-.309-1.671-.52-2.976-.582-1.306-.062-1.72-.076-5.062-.076s-3.756.015-5.062.079zm.14 20.452c-1.196-.053-1.845-.251-2.278-.418-.573-.223-.98-.49-1.41-.92-.428-.428-.695-.834-.918-1.407-.168-.433-.366-1.082-.42-2.279-.058-1.29-.07-1.678-.07-4.94 0-3.26.012-3.65.07-4.94.053-1.196.252-1.845.419-2.278.223-.574.49-.98.92-1.41.428-.428.834-.695 1.407-.918.433-.168 1.082-.366 2.278-.421 1.291-.058 1.679-.07 4.94-.07 3.262 0 3.65.012 4.942.07 1.196.054 1.845.252 2.277.419.574.223.98.49 1.41.92.428.428.695.833.918 1.407.168.433.366 1.082.421 2.278.058 1.291.07 1.679.07 4.94 0 3.263-.012 3.65-.07 4.941-.054 1.197-.252 1.845-.419 2.279-.223.573-.49.98-.92 1.409-.428.428-.834.695-1.407.918-.433.168-1.082.366-2.278.421-1.291.058-1.679.07-4.941.07-3.261 0-3.649-.012-4.94-.07zM16.153 5.808a1.44 1.44 0 102.881.001 1.44 1.44 0 00-2.881-.001zM5.838 12a6.162 6.162 0 1012.324 0 6.162 6.162 0 00-12.324 0zM8 12a4 4 0 118.001 0A4 4 0 018 12z',
  linkedin:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  facebook:
    'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
} as const;

interface Platform {
  id: string;
  name: string;
  limit: number;
  opt: [number, number];
  icon: string;
}

const PLATFORMS: Platform[] = [
  { id: 'x', name: 'X (Twitter)', limit: 280, opt: [70, 100], icon: IC.x },
  { id: 'bluesky', name: 'Bluesky', limit: 300, opt: [100, 200], icon: IC.bluesky },
  { id: 'mastodon', name: 'Mastodon', limit: 500, opt: [150, 300], icon: IC.mastodon },
  { id: 'instagram', name: 'Instagram', limit: 2200, opt: [125, 250], icon: IC.instagram },
  { id: 'facebook', name: 'Facebook', limit: 63206, opt: [40, 80], icon: IC.facebook },
  { id: 'linkedin', name: 'LinkedIn', limit: 3000, opt: [150, 250], icon: IC.linkedin },
];

const GREEN = '#52907A';
const RED = '#dc2626';
const NEUTRAL = '#41514A';

const SAMPLE =
  'Klimaschutz beginnt vor Ort. Deshalb setzen wir uns für sichere Radwege, bezahlbaren Nahverkehr und mehr Grün in unseren Städten ein. Gemeinsam sorgen wir dafür, dass unsere Kommune lebenswert bleibt – für heutige und kommende Generationen. Jetzt mitmachen und die Zukunft gestalten!';

const READING_WPM = 200;
const SPEAKING_WPM = 130;

const NF = new Intl.NumberFormat('de-DE');

function computeMetrics(text: string) {
  const chars = text.length;
  const noSpace = text.replace(/\s/g, '').length;
  const words = (text.trim().match(/\S+/g) || []).length;
  const sMatch = (text.match(/[.!?…]+/g) || []).length;
  const sentences = sMatch > 0 ? sMatch : words > 0 ? 1 : 0;
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean).length;
  const readSec = words > 0 ? Math.round((words / READING_WPM) * 60) : 0;
  const speakSec = words > 0 ? Math.round((words / SPEAKING_WPM) * 60) : 0;
  return { chars, noSpace, words, sentences, paragraphs, readSec, speakSec };
}

function fmtTime(sec: number): string {
  if (sec <= 0) return '0:00';
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

function badge(bg: string, fg?: string): CSSProperties {
  return {
    display: 'inline-block',
    padding: '3px 11px',
    borderRadius: '999px',
    fontSize: '12.5px',
    fontWeight: 700,
    color: fg || '#fff',
    background: bg,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}

const CARD_STYLE: CSSProperties = {
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: '20px',
};

const ZeichenzaehlerPage = () => {
  const [text, setText] = useState(SAMPLE);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const metrics = useMemo(() => computeMetrics(text), [text]);
  const chars = metrics.chars;

  const chips = useMemo(() => {
    const softBg = 'var(--color-grey-100)';
    const softFg = 'var(--color-muted-foreground)';
    return PLATFORMS.map((p) => {
      const rem = p.limit - chars;
      const over = rem < 0;
      const optimal = !over && chars >= p.opt[0] && chars <= p.opt[1];
      const iconColor = over ? RED : optimal ? GREEN : NEUTRAL;
      let remLabel: string;
      let badgeStyle: CSSProperties;
      if (over) {
        remLabel = NF.format(rem);
        badgeStyle = badge(RED);
      } else if (optimal) {
        remLabel = 'optimal';
        badgeStyle = badge(GREEN);
      } else if (chars < p.opt[0]) {
        remLabel = 'noch ' + NF.format(p.opt[0] - chars);
        badgeStyle = badge(softBg, softFg);
      } else {
        remLabel = NF.format(rem) + ' übrig';
        badgeStyle = badge(softBg, softFg);
      }
      return {
        id: p.id,
        name: p.name,
        icon: p.icon,
        iconColor,
        detailLabel:
          'Optimal ' +
          NF.format(p.opt[0]) +
          '–' +
          NF.format(p.opt[1]) +
          ' · max. ' +
          NF.format(p.limit),
        remLabel,
        badgeStyle,
      };
    });
  }, [chars]);

  const sg = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const stats = [
    { label: 'Mit Leerzeichen', v: NF.format(chars) },
    { label: 'Ohne Leerzeichen', v: NF.format(metrics.noSpace) },
    { label: sg(metrics.words, 'Wort', 'Wörter'), v: NF.format(metrics.words) },
    { label: sg(metrics.sentences, 'Satz', 'Sätze'), v: NF.format(metrics.sentences) },
    { label: sg(metrics.paragraphs, 'Absatz', 'Absätze'), v: NF.format(metrics.paragraphs) },
    { label: 'Lesezeit', v: fmtTime(metrics.readSec) },
    { label: 'Sprechzeit', v: fmtTime(metrics.speakSec) },
  ];

  // Clear any pending "Kopiert" reset on unmount so the timer can't fire
  // setCopied on a gone component.
  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const doCopy = () => {
    try {
      void navigator.clipboard.writeText(text || '');
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-background)',
        padding: '48px 24px 80px',
        boxSizing: 'border-box',
        color: 'var(--color-foreground)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <style>{`@keyframes zz-reveal { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div
        style={{
          width: '100%',
          maxWidth: '760px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Header */}
        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-primary)',
              marginBottom: '5px',
            }}
          >
            Grünerator
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: '30px',
              lineHeight: 1.1,
              color: 'var(--color-foreground-heading)',
            }}
          >
            Zeichenzähler
          </h1>
        </div>

        {/* Input card */}
        <div
          style={{
            ...CARD_STYLE,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Schreibe oder füge deinen Text ein …"
            spellCheck={false}
            style={{
              boxSizing: 'border-box',
              width: '100%',
              minHeight: '230px',
              padding: '18px 20px',
              margin: 0,
              fontFamily: 'inherit',
              fontSize: '16px',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              textAlign: 'left',
              resize: 'vertical',
              background: 'transparent',
              color: 'var(--color-foreground)',
              caretColor: 'var(--color-primary)',
              border: 'none',
              outline: 'none',
              appearance: 'none',
              borderRadius: '14px',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '4px',
              padding: '0 4px 4px',
            }}
          >
            <Button variant="ghost" size="sm" onClick={doCopy}>
              {copied ? 'Kopiert' : 'Kopieren'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setText('')}>
              Leeren
            </Button>
          </div>
        </div>

        {/* Übersicht */}
        <div style={{ ...CARD_STYLE, padding: '24px 26px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: '22px 18px',
              alignItems: 'flex-start',
            }}
          >
            {stats.map((s) => (
              <div key={s.label} style={{ minWidth: '52px' }}>
                <div
                  style={{
                    fontSize: '26px',
                    fontWeight: 800,
                    color: 'var(--color-foreground-heading)',
                    lineHeight: 1,
                  }}
                >
                  {s.v}
                </div>
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: 'var(--color-foreground)',
                    marginTop: '6px',
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Social Media */}
        <div style={{ ...CARD_STYLE, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={
              expanded ? 'Social-Media-Limits einklappen' : 'Social-Media-Limits anzeigen'
            }
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '34px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '24px',
              fontFamily: 'inherit',
            }}
          >
            {chips.map((c) => (
              <svg
                key={c.id}
                viewBox="0 0 24 24"
                width="26"
                height="26"
                aria-label={c.name}
                style={{ color: c.iconColor, flexShrink: 0, transition: 'color .2s' }}
              >
                <path d={c.icon} fill="currentColor" />
              </svg>
            ))}
          </button>

          {expanded && (
            <div style={{ padding: '4px 26px 22px', animation: 'zz-reveal .25s ease' }}>
              {chips.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px 0',
                    borderTop: '1px solid var(--color-border)',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    style={{ color: c.iconColor, flexShrink: 0 }}
                  >
                    <path d={c.icon} fill="currentColor" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '14.5px',
                        fontWeight: 600,
                        color: 'var(--color-foreground)',
                      }}
                    >
                      {c.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-muted-foreground)' }}>
                      {c.detailLabel}
                    </div>
                  </div>
                  <span style={c.badgeStyle}>{c.remLabel}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ZeichenzaehlerPage;
