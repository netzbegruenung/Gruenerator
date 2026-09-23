import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUTO_MODEL_ID } from '../../lib/resolveAutoModel';
import { useAgentStore } from '../../stores/chatStore';

import { type ComposerOption, ComposerOptionPicker } from './ComposerOptionPicker';
import { ModelPicker } from './ModelPicker';

type Id = 'a' | 'b' | 'c';

const OPTIONS: ComposerOption<Id>[] = [
  { id: 'a', name: 'Alpha', description: 'Erste Wahl', recommendedLabel: 'Empfohlen' },
  { id: 'b', name: 'Beta', shortName: 'B', description: 'Zweite Wahl' },
  { id: 'c', name: 'Gamma' },
];

function renderPicker(value: Id = 'b', onChange = vi.fn()) {
  render(
    <ComposerOptionPicker
      options={OPTIONS}
      value={value}
      onChange={onChange}
      sheetTitle="Option wählen"
      sectionTitle="Optionen"
      ariaLabel="Option wählen"
    />
  );
  return onChange;
}

const DESKTOP_WIDTH = window.innerWidth;

afterEach(() => {
  window.innerWidth = DESKTOP_WIDTH;
});

describe('ComposerOptionPicker', () => {
  it('names the trigger and shows the current option on it', () => {
    renderPicker('b');
    const trigger = screen.getByRole('button', { name: 'Option wählen' });
    expect(trigger).toHaveTextContent('Beta');
    // The compact label for narrow screens rides along.
    expect(trigger).toHaveTextContent('B');
  });

  it('lists every option, marks the recommended one, and reports a pick by id', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker('b');
    await user.click(screen.getByRole('button', { name: 'Option wählen' }));

    const items = await screen.findAllByRole('menuitem');
    expect(items).toHaveLength(OPTIONS.length);
    expect(within(items[0]).getByText('Empfohlen')).toBeVisible();
    expect(within(items[1]).getByText('Zweite Wahl')).toBeVisible();

    await user.click(screen.getByRole('menuitem', { name: /Gamma/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('c'));
  });

  it('highlights exactly the current option', async () => {
    const user = userEvent.setup();
    renderPicker('a');
    await user.click(screen.getByRole('button', { name: 'Option wählen' }));

    const items = await screen.findAllByRole('menuitem');
    const highlighted = items.filter((i) => i.className.includes('bg-primary-50'));
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveTextContent('Alpha');
  });

  it('takes a custom trigger label', () => {
    render(
      <ComposerOptionPicker
        options={OPTIONS}
        value="a"
        onChange={vi.fn()}
        sheetTitle="Option wählen"
        sectionTitle="Optionen"
        ariaLabel="Option wählen"
        triggerLabel={<span>Kurz</span>}
      />
    );
    expect(screen.getByRole('button', { name: 'Option wählen' })).toHaveTextContent('Kurz');
  });

  it('renders the mobile sheet with the section title below md', async () => {
    window.innerWidth = 400;
    const user = userEvent.setup();
    const onChange = renderPicker('a');
    await user.click(screen.getByRole('button', { name: 'Option wählen' }));

    expect(await screen.findByText('Optionen')).toBeVisible();
    await user.click(screen.getByText('Gamma'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('c'));
  });
});

describe('ModelPicker (wrapper over ComposerOptionPicker)', () => {
  it('keeps its trigger: "Auto" with the recommended accessible name', () => {
    useAgentStore.setState({ selectedModel: AUTO_MODEL_ID });
    render(<ModelPicker />);
    expect(
      screen.getByRole('button', { name: 'Modell wählen – Automatisch (empfohlen)' })
    ).toHaveTextContent('Auto');
  });

  it('offers Automatisch (Empfohlen) first and writes the pick to the store', async () => {
    useAgentStore.setState({ selectedModel: AUTO_MODEL_ID });
    const user = userEvent.setup();
    render(<ModelPicker />);
    await user.click(screen.getByRole('button', { name: /Modell wählen/ }));

    const items = await screen.findAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]).toHaveTextContent('Automatisch');
    expect(within(items[0]).getByText('Empfohlen')).toBeVisible();

    const second = items[1];
    const secondName = second.querySelector('span')?.textContent ?? '';
    await user.click(second);
    await waitFor(() => expect(useAgentStore.getState().selectedModel).not.toBe(AUTO_MODEL_ID));
    expect(screen.getByRole('button', { name: 'Modell wählen' })).toHaveTextContent(secondName);
  });
});
