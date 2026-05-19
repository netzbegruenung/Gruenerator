import React, { useEffect, useRef, useState } from 'react';
import styles from './styles.module.css';

type Attachment = {
  url: string;
  filename: string;
};

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url, 'https://example.com').pathname;
    const last = pathname.split('/').filter(Boolean).pop();
    return last ?? 'bild';
  } catch {
    return 'bild';
  }
}

function transformTextNode(text: string): string {
  return text.replace(/\*innen\b/g, ':innen').replace(/\*in\b/g, ':in');
}

function nodeToSignal(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return transformTextNode(node.textContent || '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = Array.from(el.childNodes).map(nodeToSignal).join('');

  switch (tag) {
    case 'strong':
    case 'b':
      return inner.trim();

    case 'em':
    case 'i':
      return `_${inner.trim()}_`;

    case 'a': {
      const href = el.getAttribute('href') || '';
      const cleanedHref = href.replace(/^https?:\/\//, '');
      if (inner === href || inner === cleanedHref) {
        return cleanedHref;
      }
      return `${inner}: ${cleanedHref}`;
    }

    case 'code':
      return inner;

    case 'br':
      return '\n';

    case 'p':
      return `${inner}\n\n`;

    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `${inner.trim()}\n\n`;

    case 'li': {
      const parent = el.parentElement;
      if (parent?.tagName.toLowerCase() === 'ol') {
        const idx = Array.from(parent.children).indexOf(el) + 1;
        return `${idx}. ${inner.trim()}\n\n`;
      }
      return `• ${inner.trim()}\n`;
    }

    case 'ol':
    case 'ul':
      return inner;

    case 'hr':
      return '---\n\n';

    case 'blockquote':
      return inner;

    case 'img': {
      const alt = el.getAttribute('alt') || 'Bild';
      return `[${alt} — Bild separat in Signal anhängen]\n\n`;
    }

    default:
      return inner;
  }
}

function domToSignal(root: HTMLElement): string {
  const raw = Array.from(root.childNodes).map(nodeToSignal).join('');
  return raw.replace(/\n{3,}/g, '\n\n').trim();
}

type SignalMessageProps = {
  children: React.ReactNode;
};

export default function SignalMessage({ children }: SignalMessageProps): React.JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [attachment, setAttachment] = useState<Attachment | null>(null);

  useEffect(() => {
    if (!bodyRef.current) return;
    const img = bodyRef.current.querySelector('img');
    const src = img?.getAttribute('src');
    if (src) {
      setAttachment({ url: src, filename: filenameFromUrl(src) });
    } else {
      setAttachment(null);
    }
  }, [children]);

  async function handleCopy() {
    if (!bodyRef.current) return;
    const text = domToSignal(bodyRef.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 2500);
  }

  const buttonLabel =
    status === 'copied' ? 'Kopiert' : status === 'error' ? 'Fehler' : 'Für Signal kopieren';

  return (
    <aside className={styles.card} aria-label="Signal-Nachricht zum Kopieren">
      <header className={styles.header}>
        <span className={styles.label}>Signal-Vorschau</span>
        <div className={styles.actions}>
          {attachment && (
            <a
              href={attachment.url}
              download={attachment.filename}
              className={styles.downloadLink}
              aria-label={`Bild ${attachment.filename} herunterladen`}
            >
              Bild herunterladen
            </a>
          )}
          <button
            type="button"
            className={styles.button}
            onClick={handleCopy}
            aria-live="polite"
            data-status={status}
          >
            {buttonLabel}
          </button>
        </div>
      </header>
      <div className={styles.body} ref={bodyRef}>
        {children}
      </div>
      <footer className={styles.footer}>
        Beim Kopieren werden Links zu reinen URLs und der Genderstern zum Doppelpunkt. Fett wird
        weggelassen, weil Signal Markdown-Sternchen nicht rendert – bei Bedarf einzelne Begriffe im
        Chat manuell hervorheben.
        {attachment
          ? ' Das Bild lädst du mit dem zweiten Button herunter und hängst es in Signal an.'
          : ' Bilder bitte separat anhängen.'}
      </footer>
    </aside>
  );
}
