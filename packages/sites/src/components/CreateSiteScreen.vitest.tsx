import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const check = vi.hoisted(() => vi.fn());
vi.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ sites: { checkSubdomain: check } }),
}));

import { useState } from 'react';

import { CreateSiteScreen } from './CreateSiteScreen';

function Screen() {
  const [subdomain, setSubdomain] = useState('');
  return (
    <CreateSiteScreen
      subdomain={subdomain}
      publicOrigin="https://grsites.de"
      onSubdomainChange={setSubdomain}
      description=""
      onDescriptionChange={() => {}}
      onGenerate={() => {}}
      isProcessing={false}
      isGenerating={false}
    />
  );
}

describe('CreateSiteScreen address', () => {
  beforeEach(() => check.mockReset());

  it('shows grsites.de/<name> with the live check and no subdomain suffix', async () => {
    check.mockResolvedValue({ status: 200, body: { available: false } });
    const user = userEvent.setup();
    render(<Screen />);
    expect(screen.queryByText('.grsites.de')).toBeNull();
    expect(screen.getByText('grsites.de/')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Adresse'), 'anna');
    expect(await screen.findByText('Diese Adresse ist bereits vergeben')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Weiter/ })).toBeDisabled();
  });

  it('lets a free address continue', async () => {
    check.mockResolvedValue({ status: 200, body: { available: true } });
    const user = userEvent.setup();
    render(<Screen />);
    await user.type(screen.getByLabelText('Adresse'), 'berta');
    expect(await screen.findByText('Diese Adresse ist frei')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Weiter/ })).toBeEnabled());
  });
});
