import { AlternativesSection } from '../sidebar';
import { HiSparkles } from 'react-icons/hi';
import type { SectionConfig } from './types';
import type { DreizeilenAlternative } from './dreizeilen.types';

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

export type AlternativesConfig<TState, TActions> =
    | StringAlternativesConfig<TState, TActions>
    | StructuredAlternativesConfig<TState, TActions>;

// ============================================================================
// SECTION FACTORY
// ============================================================================

export function createAlternativesSection<TState, TActions = unknown>(
    config: AlternativesConfig<TState, TActions>
): SectionConfig<TState, TActions, Record<string, unknown>> {
    return {
        component: AlternativesSection,
        propsFactory: (state: TState, actions: TActions) => {
            if (config.type === 'string') {
                return {
                    alternatives: config.getAlternatives(state),
                    currentQuote: config.getCurrentValue(state),
                    onAlternativeSelect: config.getSelectAction(actions),
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
