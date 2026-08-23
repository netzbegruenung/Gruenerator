import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Image } from 'expo-image';

import { secureStorage } from '../../services/storage';
import { lightTheme } from '../../theme/colors';

import { SearchImagesSection } from './SearchImagesSection';

import type { SearchImage } from './searchImagesView';

jest.mock('../../services/storage', () => ({
  secureStorage: { getToken: jest.fn() },
}));
jest.mock('../../services/share', () => ({ openUrl: jest.fn() }));

const mockGetToken = secureStorage.getToken as jest.MockedFunction<typeof secureStorage.getToken>;

/**
 * The rule this component exists to keep: the phone must never fetch anything
 * from the source host. Everything below is a way of asking "did an `<Image>`
 * ever get pointed at `image.url`?" — the node-lane tests cover the view logic,
 * these cover what actually reaches the renderer.
 */

function image(n: number, proxied = true): SearchImage {
  return {
    title: `Bild ${n}`,
    url: `https://fremde-seite.de/${n}.jpg`,
    domain: 'fremde-seite.de',
    ...(proxied ? { proxyUrl: `/api/search-image?url=${n}&exp=1&sig=s` } : {}),
  };
}

/** Every `uri` handed to expo-image in this render. */
function renderedImageUris(): string[] {
  return screen.UNSAFE_queryAllByType(Image).map((node) => {
    const source = node.props.source as { uri?: string } | undefined;
    return source?.uri ?? '';
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SearchImagesSection', () => {
  it('renders nothing for an empty hit list', async () => {
    mockGetToken.mockResolvedValue('tok');
    const { toJSON } = render(<SearchImagesSection images={[]} theme={lightTheme} />);
    expect(toJSON()).toBeNull();
    // Let the token effect settle inside act — it resolves after the assertion
    // and would otherwise land as an unwrapped update.
    await act(async () => {});
  });

  it('loads thumbnails only through the same-origin proxy, never the source host', async () => {
    mockGetToken.mockResolvedValue('tok');
    render(<SearchImagesSection images={[image(1), image(2)]} theme={lightTheme} />);

    await waitFor(() => expect(renderedImageUris()).toHaveLength(2));
    for (const uri of renderedImageUris()) {
      expect(uri).toContain('/api/search-image');
      expect(uri).not.toContain('fremde-seite.de');
    }
  });

  it('sends the bearer token with the proxy request — the endpoint is behind auth', async () => {
    mockGetToken.mockResolvedValue('tok');
    render(<SearchImagesSection images={[image(1)]} theme={lightTheme} />);

    await waitFor(() => {
      const source = screen.UNSAFE_getAllByType(Image)[0]?.props.source as {
        headers?: Record<string, string>;
      };
      expect(source.headers?.Authorization).toBe('Bearer tok');
    });
  });

  it('degrades to links rather than to unauthenticated image requests', async () => {
    mockGetToken.mockResolvedValue(null);
    render(<SearchImagesSection images={[image(1)]} theme={lightTheme} />);

    await waitFor(() => expect(screen.getByText('1 gefundene Bildquelle')).toBeTruthy());
    expect(renderedImageUris()).toHaveLength(0);
    expect(screen.getByText('Bild 1')).toBeTruthy();
  });

  it('degrades to links when the backend signed no proxy path', async () => {
    mockGetToken.mockResolvedValue('tok');
    render(<SearchImagesSection images={[image(1, false)]} theme={lightTheme} />);

    await waitFor(() => expect(screen.getByText('Bild 1')).toBeTruthy());
    expect(renderedImageUris()).toHaveLength(0);
  });

  it('hangs the remaining hits on a counter instead of showing them all', async () => {
    mockGetToken.mockResolvedValue('tok');
    render(
      <SearchImagesSection
        images={[image(1), image(2), image(3), image(4), image(5)]}
        theme={lightTheme}
      />
    );

    await waitFor(() => expect(screen.getByText('+2')).toBeTruthy());
    expect(renderedImageUris()).toHaveLength(3);
  });

  it('states the rights position, in every render mode', async () => {
    mockGetToken.mockResolvedValue(null);
    render(<SearchImagesSection images={[image(1)]} theme={lightTheme} />);

    await waitFor(() =>
      expect(screen.getByText(/die Rechte liegen bei den Urheber\*innen/)).toBeTruthy()
    );
  });
});
