import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const check = vi.hoisted(() => vi.fn());
vi.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ sites: { checkSubdomain: check } }),
}));

import { useState } from 'react';

import { CreateSiteScreen } from './CreateSiteScreen';

const noop = () => {};

function Composer({
  onGenerate = noop,
  onFlyerUpload,
}: {
  onGenerate?: () => void;
  onFlyerUpload?: (file: File) => void;
}) {
  const [description, setDescription] = useState('');
  return (
    <CreateSiteScreen
      subdomain="anna"
      publicOrigin="https://grsites.de"
      onSubdomainChange={noop}
      description={description}
      onDescriptionChange={setDescription}
      onGenerate={onGenerate}
      onFlyerUpload={onFlyerUpload}
      isProcessing={false}
    />
  );
}

async function addressIsFree() {
  check.mockResolvedValue({ status: 200, body: { available: true } });
  expect(await screen.findByText('Diese Adresse ist frei')).toBeInTheDocument();
}

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
    expect(screen.getByRole('button', { name: /Seite generieren/ })).toBeDisabled();
  });

  it('reports a free address', async () => {
    check.mockResolvedValue({ status: 200, body: { available: true } });
    const user = userEvent.setup();
    render(<Screen />);
    await user.type(screen.getByLabelText('Adresse'), 'berta');
    expect(await screen.findByText('Diese Adresse ist frei')).toBeInTheDocument();
  });
});

describe('CreateSiteScreen composer', () => {
  beforeEach(() => check.mockReset());

  const PDF = () => new File(['x'], 'flyer.pdf', { type: 'application/pdf' });

  it('shows address, description and the file upload in one step', () => {
    check.mockResolvedValue({ status: 200, body: { available: true } });
    render(<Composer onFlyerUpload={noop} />);
    expect(screen.getByLabelText('Adresse')).toBeInTheDocument();
    expect(screen.getByLabelText('Beschreibung')).toBeEnabled();
    expect(screen.getByRole('button', { name: /Flyer \(PDF\)/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Weiter/ })).toBeNull();
  });

  it('locks everything and says why when nothing can be created', () => {
    check.mockResolvedValue({ status: 200, body: { available: true } });
    render(
      <CreateSiteScreen
        subdomain="anna"
        publicOrigin="https://grsites.de"
        onSubdomainChange={noop}
        description={'x'.repeat(80)}
        onDescriptionChange={noop}
        onGenerate={noop}
        onFlyerUpload={noop}
        isProcessing={false}
        disabledReason="Limit erreicht."
      />
    );
    expect(screen.getByText('Limit erreicht.')).toBeInTheDocument();
    expect(screen.getByLabelText('Beschreibung')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Seite generieren/ })).toBeDisabled();
  });

  it('generates from the text once it is long enough', async () => {
    const onGenerate = vi.fn();
    const onFlyerUpload = vi.fn();
    const user = userEvent.setup();
    render(<Composer onGenerate={onGenerate} onFlyerUpload={onFlyerUpload} />);
    await addressIsFree();
    expect(screen.getByRole('button', { name: /Seite generieren/ })).toBeDisabled();
    await user.click(screen.getByLabelText('Beschreibung'));
    await user.paste('x'.repeat(60));
    await user.click(screen.getByRole('button', { name: /Seite generieren/ }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onFlyerUpload).not.toHaveBeenCalled();
  });

  it('lets a chosen file replace the text, and the file can be removed again', async () => {
    const onGenerate = vi.fn();
    const onFlyerUpload = vi.fn();
    const user = userEvent.setup();
    render(<Composer onGenerate={onGenerate} onFlyerUpload={onFlyerUpload} />);
    await addressIsFree();
    const file = PDF();
    await user.upload(screen.getByLabelText('PDF-Datei auswählen', { selector: 'input' }), file);
    expect(screen.getByLabelText('Beschreibung')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Seite aus Datei generieren/ }));
    expect(onFlyerUpload).toHaveBeenCalledWith(file);
    expect(onGenerate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Datei entfernen' }));
    expect(screen.getByLabelText('Beschreibung')).toBeEnabled();
  });
});
