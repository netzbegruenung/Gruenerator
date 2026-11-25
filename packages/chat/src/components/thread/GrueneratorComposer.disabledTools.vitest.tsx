/**
 * A switched-off search toggle holds for every message and thread until the
 * page reloads. It used to show only inside the plus menu, so a person who
 * turned Websuche off got answers without current sources and no hint why. The
 * composer names it now.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentStore } from '../../stores/chatStore';

import { GrueneratorComposer } from './GrueneratorComposer';

function mount(showToolToggles = true) {
  // eslint-disable-next-line require-yield -- the composer never sends here
  const run: ChatModelAdapter['run'] = async function* () {
    return;
  };

  function Harness() {
    const runtime = useLocalRuntime({ run });
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <GrueneratorComposer
          variant="pill"
          showMentions={false}
          showPlusMenu={false}
          showToolToggles={showToolToggles}
          showModelPicker={false}
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

beforeEach(() => {
  useAgentStore.setState({
    enabledTools: {
      search: true,
      web: true,
      examples: true,
      pressemitteilung_examples: true,
      research: true,
    },
  });
});

describe('GrueneratorComposer — switched-off search tools', () => {
  it('shows nothing while every switch is at its default', () => {
    mount();
    expect(screen.queryByText(/^Ohne /)).toBeNull();
  });

  it('names a switched-off Websuche, and the × turns it back on', async () => {
    useAgentStore.setState((s) => ({ enabledTools: { ...s.enabledTools, research: false } }));
    const user = userEvent.setup();
    mount();

    expect(screen.getByText('Ohne Websuche')).toBeInTheDocument();
    expect(screen.queryByText('Ohne Dokumentensuche')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Websuche wieder einschalten' }));

    expect(useAgentStore.getState().enabledTools.research).toBe(true);
    expect(screen.queryByText('Ohne Websuche')).toBeNull();
  });

  it('stays off on surfaces that do not own the search settings', () => {
    useAgentStore.setState((s) => ({ enabledTools: { ...s.enabledTools, search: false } }));
    mount(false);
    expect(screen.queryByText('Ohne Dokumentensuche')).toBeNull();
  });
});
