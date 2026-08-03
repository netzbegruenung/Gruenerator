// jsdom implementiert `window.matchMedia` nicht — der Aufruf wirft
// "not a function". Jede Komponente, die `useIsMobile()` (oder sonst eine
// Media Query) liest, stürzt damit im Test ab, statt eine Verzweigung zu
// wählen. Dieser Stub wertet die Breitenformen tatsächlich gegen
// `window.innerWidth` aus (jsdom-Vorgabe: 1024), damit ein Test die Mobil-
// Verzweigung durch Setzen von `window.innerWidth` erreichen kann.
//
// Zwillingsdatei: packages/chat/src/test/match-media.ts — beim Ändern beide.

const WIDTH_RULE = /\((?:(min|max)-width:\s*|width\s*(<=?|>=?|=)\s*)([\d.]+)(px|rem)\)/;

function evaluate(query: string): boolean {
  const match = WIDTH_RULE.exec(query);
  if (!match) return false;
  const [, minmax, operator, rawValue, unit] = match;
  const threshold = unit === 'rem' ? Number(rawValue) * 16 : Number(rawValue);
  const width = window.innerWidth;
  if (minmax === 'min') return width >= threshold;
  if (minmax === 'max') return width <= threshold;
  switch (operator) {
    case '<':
      return width < threshold;
    case '<=':
      return width <= threshold;
    case '>':
      return width > threshold;
    case '>=':
      return width >= threshold;
    default:
      return width === threshold;
  }
}

export function installMatchMediaStub() {
  window.matchMedia = (query: string): MediaQueryList => {
    const listeners = new Set<EventListener>();
    const add = (_type: string, listener: EventListener) => void listeners.add(listener);
    const remove = (_type: string, listener: EventListener) => void listeners.delete(listener);
    // Test-Double an einer DOM-Grenze: die Overloads von addEventListener sind
    // generisch, ein Objektliteral erfüllt sie nicht ohne Cast.
    return {
      get matches() {
        return evaluate(query);
      },
      media: query,
      onchange: null,
      addEventListener: add,
      removeEventListener: remove,
      addListener: (listener: EventListener) => void listeners.add(listener),
      removeListener: (listener: EventListener) => void listeners.delete(listener),
      dispatchEvent: (event: Event) => {
        listeners.forEach((listener) => listener(event));
        return true;
      },
    } as unknown as MediaQueryList;
  };
}
