import { describe, expect, it } from 'vitest';

import AudioPlayer from './AudioPlayer';

import { axe, render } from '@/test-utils';

describe('AudioPlayer', () => {
  it('renders the native player with an accessible name', async () => {
    const { container } = render(<AudioPlayer src="/api/share/tok/stream" title="Ansage" />);
    const audio = container.querySelector('audio');
    expect(audio).toHaveAttribute('controls');
    expect(audio).toHaveAttribute('src', '/api/share/tok/stream');
    expect(audio).toHaveAttribute('aria-label', 'Ansage');
    expect(await axe(container)).toHaveNoViolations();
  });
});
