import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const sites = vi.hoisted(() => ({
  getSiteByHandle: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
  listSites: vi.fn(),
}));

vi.mock('@gruenerator/shared/api', () => ({ getContractsClient: () => ({ sites }) }));
vi.mock('@gruenerator/collab', () => ({ removeDocCache: vi.fn() }));

import { CurrentSiteProvider, siteHandleKey, useSite, useSiteByHandle } from './useSite';

const site = (subdomain: string) => ({ id: 's1', subdomain, site_title: 'Anna' });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sites.getSiteByHandle.mockResolvedValue({
    status: 200,
    body: { site: site('anna'), public_origin: 'https://grsites.de' },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <CurrentSiteProvider
        value={{ site: site('anna') as never, role: 'admin', public_origin: 'https://grsites.de' }}
      >
        {children}
      </CurrentSiteProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useSite', () => {
  it('a renamed address lands in the open entry and under the new address', async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => ({ byHandle: useSiteByHandle('anna'), site: useSite() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.byHandle.site?.subdomain).toBe('anna'));

    sites.updateSite.mockResolvedValue({ status: 200, body: { site: site('anna-wien') } });
    await act(() => result.current.site.updateSite({ id: 's1', data: { subdomain: 'anna-wien' } }));

    // The editor still on /sites/anna now sees the new address and moves there.
    await waitFor(() => expect(result.current.byHandle.site?.subdomain).toBe('anna-wien'));
    expect(client.getQueryData(siteHandleKey('anna-wien'))).toMatchObject({
      site: { subdomain: 'anna-wien' },
    });
  });

  it('a missing site reads as null, not as an error', async () => {
    const { wrapper } = setup();
    sites.getSiteByHandle.mockResolvedValue({ status: 404, body: { error: 'x' } });
    const { result } = renderHook(() => useSiteByHandle('bert'), { wrapper });
    await waitFor(() => expect(result.current.site).toBeNull());
    expect(result.current.error).toBeNull();
  });

  it('useSite outside the editor throws', () => {
    const client = new QueryClient();
    expect(() =>
      renderHook(() => useSite(), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      })
    ).toThrow(/CurrentSiteProvider/);
  });
});
