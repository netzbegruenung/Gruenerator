const MIRROR_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'wordSpacing',
  'textIndent',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderWidth',
  'boxSizing',
  'width',
] as const;

export interface CaretCoords {
  x: number;
  y: number;
}

/**
 * Compute the pixel (x, y) position of a caret offset inside a textarea,
 * relative to the viewport (using getBoundingClientRect of the mirror span).
 */
export function getCaretCoords(textarea: HTMLTextAreaElement, caretOffset: number): CaretCoords {
  const mirror = document.createElement('div');
  const style = getComputedStyle(textarea);

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'hidden';

  for (const prop of MIRROR_PROPS) {
    (mirror.style as unknown as Record<string, string>)[prop] = (
      style as unknown as Record<string, string>
    )[prop];
  }

  const textBefore = textarea.value.slice(0, caretOffset);
  mirror.textContent = textBefore;

  const marker = document.createElement('span');
  marker.textContent = '\u200b'; // zero-width space
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  mirror.style.top = `${textareaRect.top + window.scrollY}px`;
  mirror.style.left = `${textareaRect.left + window.scrollX}px`;

  const markerRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    x: markerRect.left,
    y: markerRect.top,
  };
}
