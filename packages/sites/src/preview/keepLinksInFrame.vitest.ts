// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { keepLinksInFrame } from './keepLinksInFrame';

function setup() {
  document.body.innerHTML =
    '<a id="in" href="#inhalt"><span id="label">Inhalt</span></a>' +
    '<a id="out" href="/anna/impressum">Impressum</a><p id="plain">x</p><section id="inhalt"></section>';
  const target = document.getElementById('inhalt') as HTMLElement;
  target.scrollIntoView = vi.fn();
  return target;
}

describe('keepLinksInFrame', () => {
  it('scrolls to an in-page anchor without navigating', () => {
    const target = setup();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: document.getElementById('label') });
    keepLinksInFrame(document, event);
    expect(event.defaultPrevented).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('blocks other links without scrolling', () => {
    const target = setup();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: document.getElementById('out') });
    keepLinksInFrame(document, event);
    expect(event.defaultPrevented).toBe(true);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it('follows no link from inside a field edited in place, and does not navigate', () => {
    const target = setup();
    const label = document.getElementById('label') as HTMLElement;
    label.setAttribute('data-inline-edit', '');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: label });
    keepLinksInFrame(document, event);
    expect(event.defaultPrevented).toBe(true);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it('leaves clicks outside links alone', () => {
    setup();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: document.getElementById('plain') });
    keepLinksInFrame(document, event);
    expect(event.defaultPrevented).toBe(false);
  });
});
