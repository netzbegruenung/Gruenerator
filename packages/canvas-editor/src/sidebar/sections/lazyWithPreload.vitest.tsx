import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { lazyWithPreload } from './lazyWithPreload';

const Hello = ({ name }: { name: string }) => <p>Hallo {name}</p>;

describe('lazyWithPreload', () => {
  it('renders a preloaded component without suspending', async () => {
    const Section = lazyWithPreload(() => Promise.resolve(Hello));
    await Section.preload();

    render(
      <Suspense fallback={<p>lädt</p>}>
        <Section name="Welt" />
      </Suspense>
    );

    // Synchronously present: no fallback frame, so no Suspense reveal delay.
    expect(screen.getByText('Hallo Welt')).toBeTruthy();
    expect(screen.queryByText('lädt')).toBeNull();
  });

  it('falls back to lazy loading when nothing was preloaded', async () => {
    const Section = lazyWithPreload(() => Promise.resolve(Hello));

    render(
      <Suspense fallback={<p>lädt</p>}>
        <Section name="Welt" />
      </Suspense>
    );

    expect(screen.getByText('lädt')).toBeTruthy();
    expect(await screen.findByText('Hallo Welt')).toBeTruthy();
  });

  it('retries after a failed load instead of replaying the rejection', async () => {
    const load = vi
      .fn<() => Promise<typeof Hello>>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce(Hello);
    const Section = lazyWithPreload(load);

    await expect(Section.preload()).rejects.toThrow('chunk failed');
    await expect(Section.preload()).resolves.toBe(Hello);
    expect(load).toHaveBeenCalledTimes(2);

    render(<Section name="wieder da" />);
    expect(screen.getByText('Hallo wieder da')).toBeTruthy();
  });
});
