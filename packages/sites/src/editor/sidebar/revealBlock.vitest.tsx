import { afterEach, describe, expect, it, vi } from 'vitest';

import { revealBlock } from './revealBlock';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function frameWith(html: string): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  frame.contentDocument!.body.innerHTML = html;
  return frame;
}

describe('revealBlock', () => {
  it('scrolls the block inside the preview frame into view', () => {
    const frame = frameWith('<section data-block-id="b2">Themen</section>');
    const block = frame.contentDocument!.querySelector('section')!;
    block.scrollIntoView = vi.fn();
    revealBlock('b2');
    expect(block.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('waits a few frames for a block that renders after the draft changed', () => {
    const frame = frameWith('');
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    revealBlock('late');
    frame.contentDocument!.body.innerHTML = '<section data-block-id="late"></section>';
    const block = frame.contentDocument!.querySelector('section')!;
    block.scrollIntoView = vi.fn();
    frames.shift()?.(0);
    expect(block.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
