/**
 * A surface's own @-list (`mentionSource`), against the real assistant-ui
 * runtime: the notebook offers only its recipes under `@`, and a pick must
 * leave neither the typed `@…` nor a mention in the text — the text is the
 * notebook's search query.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type Mentionable } from '../../lib/mentionables';
import { type MentionSection } from '../../lib/mentionSections';

import { GrueneratorComposer } from './GrueneratorComposer';

const recipe = (mention: string, title: string): Mentionable => ({
  type: 'agent',
  category: 'skill',
  trigger: '@',
  identifier: `owner-${mention}`,
  title,
  description: '',
  avatar: '',
  backgroundColor: '#316049',
  mention,
});
const PM = recipe('presse-nrw', 'PM NRW');
const WPS = recipe('wahlpruefstein-nrw', 'Wahlprüfsteine NRW');

function mount(onSelect: (m: Mentionable) => void) {
  const adapter: ChatModelAdapter = {
    run: vi.fn<ChatModelAdapter['run']>(async function* () {
      yield { content: [{ type: 'text' as const, text: 'Antwort' }] };
    }),
  };
  const sections = (query: string): MentionSection[] => [
    {
      kind: 'flat',
      label: 'Rezepte für Nordrhein-Westfalen',
      items: [PM, WPS].filter((m) => m.title.toLowerCase().includes(query.toLowerCase())),
    },
  ];

  function Harness() {
    const runtime = useLocalRuntime(adapter);
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <GrueneratorComposer
          variant="pill"
          showMentions={false}
          showPlusMenu={false}
          showToolToggles={false}
          showModelPicker={false}
          mentionSource={{ sections, onSelect }}
        />
      </AssistantRuntimeProvider>
    );
  }

  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>
  );
}

describe('GrueneratorComposer — own mention source', () => {
  it('lists only the surface items and hands the pick over without leaving text', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mount(onSelect);
    const input = screen.getByRole('textbox');

    await user.type(input, 'Radwege @wahl');
    const list = await screen.findByRole('listbox');
    expect(list).toHaveTextContent('Wahlprüfsteine NRW');
    expect(list).not.toHaveTextContent('PM NRW');
    expect(list).not.toHaveTextContent('Werkzeuge');

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(WPS);
    await waitFor(() => expect(input).toHaveValue('Radwege '));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('moves through the list with the arrow keys', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mount(onSelect);

    await user.type(screen.getByRole('textbox'), '@');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith(WPS);
  });
});
