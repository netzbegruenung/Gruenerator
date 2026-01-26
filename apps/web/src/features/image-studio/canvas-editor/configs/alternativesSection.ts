
import { HiSparkles } from 'react-icons/hi';

import { AlternativesSection } from '../sidebar';

import type { DreizeilenAlternative } from './dreizeilen.types';
import type { SectionConfig } from './types';
import type React from 'react';

// ============================================================================
// SHARED TAB CONSTANT
// ============================================================================

export const alternativesTab = {
  id: 'alternatives' as const,
  icon: HiSparkles,
  label: 'Alternativen',
  ariaLabel: 'Alternative Texte',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface StringAlternativesConfig<TState, TActions> {
  type: 'string';
  getAlternatives: (state: TState) => string[];
  getCurrentValue: (state: TState) => string;
  getSelectAction: (actions: TActions) => (alt: string) => void;
}

export interface StructuredAlternativesConfig<TState, TActions> {
  type: 'structured';
  getAlternatives: (state: TState) => DreizeilenAlternative[];
  getCurrentLine1: (state: TState) => string;
  getCurrentLine2: (state: TState) => string;
  getCurrentLine3: (state: TState) => string;
  getSelectAction: (actions: TActions) => (alt: DreizeilenAlternative) => void;
}

export interface TwoTextAlternative {
  id?: string;
  headline: string;
  subtext: string;
}

export interface TwoTextAlternativesConfig<TState, TActions> {
  type: 'two-text';
  getAlternatives: (state: TState) => TwoTextAlternative[];
  getCurrentHeadline: (state: TState) => string;
  getCurrentSubtext: (state: TState) => string;
  getSelectAction: (actions: TActions) => (alt: TwoTextAlternative) => void;
}

export type AlternativesConfig<TState, TActions> =
  | StringAlternativesConfig<TState, TActions>
  | StructuredAlternativesConfig<TState, TActions>
  | TwoTextAlternativesConfig<TState, TActions>;

// ============================================================================
// SECTION FACTORY
// ============================================================================

export function createAlternativesSection<TState, TActions = unknown>(
  config: AlternativesConfig<TState, TActions>
): SectionConfig<TState, TActions, Record<string, unknown>> {
  return {
    component: AlternativesSection as unknown as React.ComponentType<Record<string, unknown>>,
    propsFactory: (state: TState, actions: TActions) => {
      if (config.type === 'string') {
        return {
          alternatives: config.getAlternatives(state),
          currentQuote: config.getCurrentValue(state),
          onAlternativeSelect: config.getSelectAction(actions),
        };
      } else if (config.type === 'two-text') {
        return {
          alternatives: config.getAlternatives(state),
          currentHeadline: config.getCurrentHeadline(state),
          currentSubtext: config.getCurrentSubtext(state),
          onSelectTwoTextAlternative: config.getSelectAction(actions),
        };
      } else {
        return {
          alternatives: config.getAlternatives(state),
          currentLine1: config.getCurrentLine1(state),
          currentLine2: config.getCurrentLine2(state),
          currentLine3: config.getCurrentLine3(state),
          onSelectAlternative: config.getSelectAction(actions),
        };
      }
    },
  };
}

// ============================================================================
// DISABLED TABS HELPER
// ============================================================================

export function isAlternativesEmpty<TState>(
  state: TState,
  getAlternatives: (s: TState) => unknown[]
): boolean {
  const alts = getAlternatives(state);
  return !alts || alts.length === 0;
}
