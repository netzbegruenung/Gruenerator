import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ToolCallUI } from './ToolCallUI';

/**
 * The regression these guard: `rezept_laden` had no entry in TOOL_METADATA or
 * UI_TOOL_NAMES, so it rendered as a grey magnifying-glass pill labelled
 * literally "rezept_laden", with „Lade Schreibvorgaben…" shown as if it were a
 * search query, expanding to a <dl> dump of the model-facing payload.
 */
describe('ToolCallUI — the formerly unregistered tools', () => {
  const recipeResult = {
    geladen: true,
    rezept: 'presse',
    titel: 'Pressemitteilung',
    hinweis: 'Die Schreibvorgaben stehen dir ab jetzt zur Verfügung.',
  };

  it('never shows the raw wire name', () => {
    render(
      <ToolCallUI
        toolName="rezept_laden"
        args={{ rezept: 'presse' }}
        state="result"
        result={recipeResult}
      />
    );
    expect(screen.queryByText(/rezept_laden/)).not.toBeInTheDocument();
    expect(screen.getByText('Schreibvorgaben')).toBeInTheDocument();
  });

  it('summarises the outcome by recipe title on the collapsed card', () => {
    render(
      <ToolCallUI
        toolName="rezept_laden"
        args={{ rezept: 'presse' }}
        state="result"
        result={recipeResult}
      />
    );
    expect(screen.getByText('Rezept: Pressemitteilung')).toBeInTheDocument();
  });

  it('shows the present-tense verb while running and the resting label when done', () => {
    const { rerender } = render(
      <ToolCallUI toolName="rezept_laden" args={{ rezept: 'presse' }} state="call" />
    );
    expect(screen.getByText('Lade Schreibvorgaben')).toBeInTheDocument();

    rerender(
      <ToolCallUI
        toolName="rezept_laden"
        args={{ rezept: 'presse' }}
        state="result"
        result={recipeResult}
      />
    );
    expect(screen.getByText('Schreibvorgaben')).toBeInTheDocument();
  });

  it('reads the subject from the tool own arg name, not only from `query`', () => {
    render(<ToolCallUI toolName="rezept_laden" args={{ rezept: 'presse' }} state="call" />);
    expect(screen.getByText('presse')).toBeInTheDocument();
  });

  it('keeps the model-facing instruction out of the body', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallUI
        toolName="rezept_laden"
        args={{ rezept: 'presse' }}
        state="result"
        result={recipeResult}
      />
    );
    await user.click(screen.getByRole('button'));
    expect(screen.queryByText(/stehen dir ab jetzt zur Verfügung/)).not.toBeInTheDocument();
    expect(screen.getByText(/Rezept „Pressemitteilung" geladen/)).toBeInTheDocument();
  });

  it('surfaces every create_pdf self-check problem, which no other surface shows', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallUI
        toolName="create_pdf"
        args={{ prompt: 'Antrag' }}
        state="result"
        result={{
          document: { title: 'Antrag.pdf' },
          felder: ['name'],
          probleme: ['Feld „datum" blieb leer'],
        }}
      />
    );
    expect(screen.getByText(/1 Hinweis aus der Prüfung/)).toBeInTheDocument();
    await user.click(screen.getByRole('button'));
    expect(screen.getByText(/blieb leer/)).toBeInTheDocument();
  });
});

describe('ToolCallUI — disclosure behaviour', () => {
  it('stays in the tab order while running but does not open', async () => {
    const user = userEvent.setup();
    render(<ToolCallUI toolName="rezept_laden" args={{ rezept: 'presse' }} state="call" />);
    const trigger = screen.getByRole('button');
    // The old implementation used `disabled`, dropping a running card out of the
    // tab order entirely — the same bug McpToolUI already fixed.
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles open once the result has arrived', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallUI
        toolName="create_board"
        args={{}}
        state="result"
        result={{ board: { boardId: 'b-1', title: 'Wahlkampf 2026' } }}
      />
    );
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Board „Wahlkampf 2026" erstellt/)).toBeInTheDocument();
  });
});

/**
 * The green tick was unconditional: `{!running && <CheckIcon …/>}`. A tool that
 * failed therefore rendered a success glyph, with the failure text beside it in
 * the same muted grey used for "3 Suchen". Both halves are asserted here.
 */
describe('ToolCallUI — a failed call must not look successful', () => {
  const failed = { error: 'Für dieses Rezept liegen keine Schreibvorgaben vor.' };

  it('shows no success tick when the call failed', () => {
    const { container } = render(
      <ToolCallUI
        toolName="rezept_laden"
        args={{ rezept: 'presse' }}
        state="result"
        result={failed}
      />
    );
    expect(container.querySelector('.text-emerald-500')).toBeNull();
  });

  it('still shows the success tick when the call succeeded', () => {
    const { container } = render(
      <ToolCallUI
        toolName="rezept_laden"
        args={{ rezept: 'presse' }}
        state="result"
        result={{ geladen: true, titel: 'Pressemitteilung' }}
      />
    );
    expect(container.querySelector('.text-emerald-500')).not.toBeNull();
  });

  it('recognises the live-only ok:false channel, which carries no error string', () => {
    const { container } = render(
      <ToolCallUI toolName="rezept_laden" args={{}} state="result" result={{ ok: false }} />
    );
    expect(container.querySelector('.text-emerald-500')).toBeNull();
  });

  it('colours the collapsed one-liner as an error, not as neutral status', () => {
    const { container } = render(
      <ToolCallUI
        toolName="rezept_laden"
        args={{ rezept: 'presse' }}
        state="result"
        result={failed}
      />
    );
    // The summary line doubles as the failure text; it must not read as the
    // same muted grey used for "3 Suchen".
    const line = container.querySelector('.text-destructive');
    expect(line).not.toBeNull();
    expect(line?.textContent).toMatch(/keine Schreibvorgaben vor/);
  });

  it('opens to a real error card, not a bare paragraph', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ToolCallUI
        toolName="rezept_laden"
        args={{ rezept: 'presse' }}
        state="result"
        result={failed}
      />
    );
    expect(container.querySelector('[data-slot="tool-error"]')).toBeNull();
    await user.click(screen.getByRole('button'));
    expect(container.querySelector('[data-slot="tool-error"]')).not.toBeNull();
  });
});
