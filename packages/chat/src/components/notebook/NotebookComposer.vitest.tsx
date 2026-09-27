/**
 * The notebook composer's depth control.
 *
 * Two things are pinned. First, all three tiers are offered — the menu used to
 * hardcode two `DropdownMenuRadioItem`s, so a tier added to the registry would
 * have been reachable by nobody. Second, the active tier is readable without
 * opening the menu: before this it was invisible everywhere in the UI, so
 * nothing on screen distinguished an answer built from one search from one built
 * from three. The trigger is always the settings glyph, so the accessible
 * name (and tooltip) is where the tier is spelled out.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NOTEBOOK_ANSWER_MODES, NOTEBOOK_COMPOSER_MODES } from '../../lib/notebookAnswerMode';
import { NOTEBOOK_DEPTHS } from '../../lib/notebookDepth';
import { axe } from '../../test-utils';

import { NotebookComposer } from './NotebookComposer';

import type { NotebookDepth } from '@gruenerator/contracts';

// The composer itself is assistant-ui's; only the leading slot is under test.
const composerProps: {
  showModelPicker?: boolean;
  onSearchSubmit?: (text: string) => void;
  disclaimer?: string;
  disclaimerCompact?: string;
}[] = [];
vi.mock('../thread/GrueneratorComposer', () => ({
  GrueneratorComposer: (props: {
    slots?: { leading?: React.ReactNode; sendAdornment?: React.ReactNode };
    showModelPicker?: boolean;
    onSearchSubmit?: (text: string) => void;
    disclaimer?: string;
    disclaimerCompact?: string;
  }) => {
    composerProps.push({
      showModelPicker: props.showModelPicker,
      onSearchSubmit: props.onSearchSubmit,
      disclaimer: props.disclaimer,
      disclaimerCompact: props.disclaimerCompact,
    });
    return (
      <div>
        <div data-testid="leading">{props.slots?.leading}</div>
        <div data-testid="send-adornment">{props.slots?.sendAdornment}</div>
      </div>
    );
  },
}));
vi.mock('@assistant-ui/store', () => ({
  useAuiState: () => false,
}));

function renderComposer(mode: NotebookDepth, onModeChange = vi.fn()) {
  render(<NotebookComposer mode={mode} onModeChange={onModeChange} />);
  return onModeChange;
}

describe('NotebookComposer — depth control', () => {
  it('carries the active tier in the trigger, not as a word', () => {
    renderComposer('ultra');
    // The label is gone from the pill; the accessible name is what still names
    // the tier, so dropping it would leave the setting unreadable entirely.
    expect(screen.getByRole('button', { name: /Suchtiefe: Ultra/ })).toBeInTheDocument();
    expect(screen.queryByText('Ultra')).not.toBeInTheDocument();
  });

  it('names the active tier in the trigger label for screen readers', () => {
    renderComposer('deep');
    expect(screen.getByRole('button', { name: /Suchtiefe: Mittel/ })).toBeInTheDocument();
  });

  it('offers every tier in the registry', async () => {
    const user = userEvent.setup();
    renderComposer('fast');
    await user.click(screen.getByRole('button'));

    const depth = await screen.findByRole('region', { name: 'Suchtiefe' });
    const items = within(depth).getAllByRole('button');
    expect(items).toHaveLength(NOTEBOOK_DEPTHS.length);
    for (const tier of NOTEBOOK_DEPTHS) {
      expect(within(depth).getByRole('button', { name: tier.label })).toBeVisible();
    }
  });

  it('marks exactly the active tier as pressed', async () => {
    const user = userEvent.setup();
    renderComposer('deep');
    await user.click(screen.getByRole('button'));

    const depth = await screen.findByRole('region', { name: 'Suchtiefe' });
    const pressed = within(depth)
      .getAllByRole('button')
      .filter((i) => i.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('Mittel');
  });

  it('reports the picked tier by its wire id, not its label', async () => {
    const user = userEvent.setup();
    const onModeChange = renderComposer('fast');
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByRole('button', { name: 'Ultra' }));

    await waitFor(() => expect(onModeChange).toHaveBeenCalledWith('ultra'));
  });

  it('says what each tier costs, so "Ultra" is not just a word', async () => {
    const user = userEvent.setup();
    renderComposer('ultra');
    await user.click(screen.getByRole('button'));

    const ultra = NOTEBOOK_DEPTHS.find((t) => t.depth === 'ultra')!;
    expect(await screen.findByText(ultra.description)).toBeVisible();
    for (const tier of NOTEBOOK_DEPTHS) {
      expect(screen.getByRole('button', { name: tier.label })).toHaveAttribute(
        'title',
        tier.description
      );
    }
  });

  it('hides the model picker — the depth is the notebook’s only quality choice', () => {
    composerProps.length = 0;
    renderComposer('deep');
    // Both dropdowns were labelled Klein/Mittel/Ultra and meant different
    // things; 'Automatisch' resolves to Ultra on notebooks anyway.
    expect(composerProps.at(-1)?.showModelPicker).toBe(false);
  });

  it('leaves the control out entirely when the surface does not offer it', () => {
    // The canvas-editor's in-section chat renders the same composer without a
    // mode; a tier pill there would claim a setting that does not exist.
    render(<NotebookComposer />);
    expect(screen.queryByText('Klein')).not.toBeInTheDocument();
  });
});

describe('NotebookComposer — filters', () => {
  const TYPES = {
    field: 'content_type',
    label: 'Typ',
    values: [
      { value: 'pm', count: 1047 },
      { value: 'wps', count: 501 },
    ],
    valueLabels: { pm: 'Pressemitteilungen', wps: 'Wahlprüfsteine' },
  };
  const THEMES = {
    field: 'themes',
    label: 'Thema',
    values: [{ value: 'klima', count: 80 }],
    valueLabels: { klima: 'Klima & Energie' },
  };

  function renderFilters(activeFilters: Record<string, string[]> = {}) {
    const onToggle = vi.fn();
    const onClearAll = vi.fn();
    render(
      <NotebookComposer
        mode="deep"
        onModeChange={vi.fn()}
        categoryFilters={{ fields: [TYPES, THEMES], activeFilters, onToggle, onClearAll }}
      />
    );
    return { onToggle, onClearAll };
  }

  it('shows every field as chips and toggles a value', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderFilters();
    await user.click(screen.getByRole('button', { name: /Einstellungen/ }));

    const themes = await screen.findByRole('region', { name: 'Thema' });
    await user.click(within(themes).getByRole('button', { name: /Klima & Energie/ }));
    expect(onToggle).toHaveBeenCalledWith('themes', 'klima');
  });

  it('counts the documents in scope from the single-valued type facet', async () => {
    const user = userEvent.setup();
    renderFilters({ content_type: ['pm'] });
    await user.click(screen.getByRole('button', { name: /Einstellungen/ }));
    expect(await screen.findByRole('button', { name: 'In 1.047 Quellen suchen' })).toBeVisible();
  });

  it('gives no number where multi-valued facets would overcount', async () => {
    const user = userEvent.setup();
    renderFilters({ themes: ['klima'] });
    await user.click(screen.getByRole('button', { name: /Einstellungen/ }));
    expect(await screen.findByRole('button', { name: 'Fertig' })).toBeVisible();
  });

  it('clears one field with its „Alle“ link and everything with Zurücksetzen', async () => {
    const user = userEvent.setup();
    const { onToggle, onClearAll } = renderFilters({ themes: ['klima'] });
    await user.click(screen.getByRole('button', { name: /Einstellungen/ }));

    const themes = await screen.findByRole('region', { name: 'Thema' });
    await user.click(within(themes).getByRole('button', { name: 'Alle' }));
    expect(onToggle).toHaveBeenCalledWith('themes', 'klima');

    await user.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('has no axe violations while open', async () => {
    const user = userEvent.setup();
    renderFilters({ content_type: ['pm'] });
    await user.click(screen.getByRole('button', { name: /Einstellungen/ }));
    await screen.findByRole('region', { name: 'Thema' });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('NotebookComposer — answer mode picker', () => {
  it('renders nothing beside send when the surface does not pass an answer mode', () => {
    // Grün-O-Mat and the canvas chat use the same composer without the props.
    render(<NotebookComposer mode="deep" onModeChange={vi.fn()} />);
    expect(screen.getByTestId('send-adornment')).toBeEmptyDOMElement();
  });

  it('sits beside send and names the current mode on its trigger', () => {
    render(
      <NotebookComposer
        mode="deep"
        onModeChange={vi.fn()}
        answerMode="auto"
        onAnswerModeChange={vi.fn()}
      />
    );
    const trigger = within(screen.getByTestId('send-adornment')).getByRole('button', {
      name: /Antwortmodus wählen – Magic Search/,
    });
    expect(trigger).toHaveTextContent(/^Magic$/);
  });

  it('offers every registry mode with the recommended badge and reports the wire id', async () => {
    const user = userEvent.setup();
    const onAnswerModeChange = vi.fn();
    render(
      <NotebookComposer
        mode="deep"
        onModeChange={vi.fn()}
        answerMode="chat"
        onAnswerModeChange={onAnswerModeChange}
      />
    );
    await user.click(screen.getByRole('button', { name: /Antwortmodus wählen/ }));

    const items = await screen.findAllByRole('menuitemradio');
    expect(items).toHaveLength(NOTEBOOK_ANSWER_MODES.length);
    expect(within(items[0]).getByText('Empfohlen')).toBeVisible();

    await user.click(screen.getByRole('menuitemradio', { name: /Präzision/ }));
    await waitFor(() => expect(onAnswerModeChange).toHaveBeenCalledWith('praezision'));
  });

  it('keeps the search depth in the left settings dropdown', () => {
    render(
      <NotebookComposer
        mode="ultra"
        onModeChange={vi.fn()}
        answerMode="auto"
        onAnswerModeChange={vi.fn()}
      />
    );
    expect(
      within(screen.getByTestId('leading')).getByRole('button', { name: /Suchtiefe: Ultra/ })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('send-adornment')).queryByRole('button', { name: /Suchtiefe/ })
    ).not.toBeInTheDocument();
  });
});

describe('NotebookComposer — settings trigger', () => {
  it('is labelled as the settings, whatever the tier', () => {
    renderComposer('deep');
    expect(
      screen.getByRole('button', { name: /^Einstellungen — Suchtiefe: Mittel$/ })
    ).toBeVisible();
  });

  it('stays the settings button where the surface has no tier', () => {
    render(<NotebookComposer />);
    expect(screen.getByRole('button', { name: 'Einstellungen' })).toBeVisible();
  });
});

describe('NotebookComposer — Manuell', () => {
  it('is offered only where the surface can search', async () => {
    const user = userEvent.setup();
    render(
      <NotebookComposer answerMode="auto" onAnswerModeChange={vi.fn()} onManualSubmit={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: /Antwortmodus wählen/ }));
    expect(await screen.findAllByRole('menuitemradio')).toHaveLength(
      NOTEBOOK_COMPOSER_MODES.length
    );
    expect(screen.getByRole('menuitemradio', { name: /Manuell/ })).toBeVisible();
  });

  it('is not offered in a running conversation', async () => {
    const user = userEvent.setup();
    render(<NotebookComposer answerMode="auto" onAnswerModeChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Antwortmodus wählen/ }));
    expect(await screen.findAllByRole('menuitemradio')).toHaveLength(NOTEBOOK_ANSWER_MODES.length);
    expect(screen.queryByRole('menuitemradio', { name: /Manuell/ })).not.toBeInTheDocument();
  });

  it('turns the composer into a search while selected', () => {
    composerProps.length = 0;
    const onManualSubmit = vi.fn();
    render(
      <NotebookComposer
        answerMode="manuell"
        onAnswerModeChange={vi.fn()}
        onManualSubmit={onManualSubmit}
      />
    );
    expect(composerProps.at(-1)?.onSearchSubmit).toBe(onManualSubmit);
    expect(composerProps.at(-1)?.disclaimer).toMatch(/ohne KI/);
  });

  it('leaves the model path alone in the other modes', () => {
    composerProps.length = 0;
    render(
      <NotebookComposer answerMode="auto" onAnswerModeChange={vi.fn()} onManualSubmit={vi.fn()} />
    );
    expect(composerProps.at(-1)?.onSearchSubmit).toBeUndefined();
  });

  it('shows a stored Manuell as the default where it is not offered', () => {
    // The preference is shared with the start page; in a conversation it sends
    // as the default, and the picker must say so.
    composerProps.length = 0;
    render(<NotebookComposer answerMode="manuell" onAnswerModeChange={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /Antwortmodus wählen – Magic Search/ })
    ).toBeVisible();
    expect(composerProps.at(-1)?.onSearchSubmit).toBeUndefined();
  });
});

describe('NotebookComposer — Magic Search', () => {
  function renderMagic(magicIntent: 'suche' | 'chat' | null, onManualSubmit = vi.fn()) {
    composerProps.length = 0;
    const view = render(
      <NotebookComposer
        answerMode="auto"
        onAnswerModeChange={vi.fn()}
        onManualSubmit={onManualSubmit}
        magicIntent={magicIntent}
      />
    );
    return { ...view, onManualSubmit };
  }

  it('searches instead of sending when it recognised a search', () => {
    // `onSearchSubmit` is what turns send into the magnifier and hands Enter
    // to the search instead of the thread.
    const { onManualSubmit } = renderMagic('suche');
    expect(composerProps.at(-1)?.onSearchSubmit).toBe(onManualSubmit);
    expect(composerProps.at(-1)?.disclaimer).toMatch(/ohne KI/);
  });

  it('sends when it recognised a chat', () => {
    renderMagic('chat');
    expect(composerProps.at(-1)?.onSearchSubmit).toBeUndefined();
    expect(composerProps.at(-1)?.disclaimer).toMatch(/KI-generierte/);
    expect(composerProps.at(-1)?.disclaimerCompact).toBeUndefined();
  });

  it('says on narrow screens too that a search runs without AI', () => {
    renderMagic('suche');
    expect(composerProps.at(-1)?.disclaimerCompact).toMatch(/ohne KI/);
    composerProps.length = 0;
    render(
      <NotebookComposer
        answerMode="manuell"
        onAnswerModeChange={vi.fn()}
        onManualSubmit={vi.fn()}
      />
    );
    expect(composerProps.at(-1)?.disclaimerCompact).toMatch(/ohne KI/);
  });

  it.each([
    ['suche', 'Suche'],
    ['chat', 'Chat'],
  ] as const)('names what it recognised to screen readers only (%s)', (intent, label) => {
    renderMagic(intent);
    const trigger = within(screen.getByTestId('send-adornment')).getByRole('button', {
      name: `Antwortmodus wählen – Magic Search · ${label}`,
    });
    // The send button shows the intent; the label stays short on every width.
    expect(trigger).toHaveTextContent(/^Magic$/);
  });

  it('keeps the suffix off the option list', async () => {
    const user = userEvent.setup();
    renderMagic('suche');
    await user.click(screen.getByRole('button', { name: /Antwortmodus wählen/ }));
    const item = await screen.findByRole('menuitemradio', { name: /Magic Search/ });
    expect(item).not.toHaveTextContent('· Suche');
  });

  it('behaves as before without an intent', () => {
    renderMagic(null);
    expect(composerProps.at(-1)?.onSearchSubmit).toBeUndefined();
    expect(
      screen.getByRole('button', { name: 'Antwortmodus wählen – Magic Search' })
    ).toBeVisible();
  });

  it('ignores the intent outside Magic Search and where the surface cannot search', () => {
    composerProps.length = 0;
    render(<NotebookComposer answerMode="auto" onAnswerModeChange={vi.fn()} magicIntent="suche" />);
    expect(composerProps.at(-1)?.onSearchSubmit).toBeUndefined();
    expect(
      screen.getByRole('button', { name: 'Antwortmodus wählen – Magic Search' })
    ).toBeVisible();
  });

  it('ignores the intent in the other modes', () => {
    composerProps.length = 0;
    render(
      <NotebookComposer
        answerMode="praezision"
        onAnswerModeChange={vi.fn()}
        onManualSubmit={vi.fn()}
        magicIntent="suche"
      />
    );
    expect(composerProps.at(-1)?.onSearchSubmit).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Antwortmodus wählen – Präzision' })).toBeVisible();
  });

  it('has no axe violations with the suffix', async () => {
    const { container } = renderMagic('suche');
    expect(await axe(container)).toHaveNoViolations();
  });
});
