import { useShallow } from 'zustand/react/shallow';

import { useGeneratorSelectionStore } from '../stores/core/generatorSelectionStore';

import { useUserInstructions } from './useUserInstructions';

/**
 * Configuration for generator setup hook
 */
export interface GeneratorSetupConfig {
  /**
   * Instruction type for custom prompts
   * Maps to backend instruction categories
   */
  instructionType:
    | 'social'
    | 'antrag'
    | 'universal'
    | 'rede'
    | 'buergeranfragen'
    | 'leichte_sprache'
    | 'gruenejugend';

  /**
   * Component name for generated text storage
   * Used as key in generatedTextStore
   */
  componentName: string;
}

/**
 * Feature state flags for AI generation
 */
export interface FeatureState {
  readonly useWebSearchTool: boolean;
  readonly usePrivacyMode: boolean;
  readonly useProMode: boolean;
  readonly useUltraMode: boolean;
  readonly useBedrock: boolean;
}

/**
 * Return value from useGeneratorSetup hook
 */
export interface GeneratorSetupReturn {
  /**
   * Selected document IDs from knowledge system
   */
  readonly selectedDocumentIds: readonly string[];

  /**
   * Selected text IDs from text library
   */
  readonly selectedTextIds: readonly string[];

  /**
   * Whether custom instructions are active
   */
  readonly isInstructionsActive: boolean;

  /**
   * Current feature toggle states
   */
  readonly features: FeatureState;

  /**
   * User's custom prompt for this instruction type
   * null if instructions are inactive or not set
   */
  readonly customPrompt: string | null;

  /**
   * Function to get current feature state
   * Useful for dynamic feature checks
   */
  getFeatureState: () => FeatureState;
}

/**
 * Consolidates generator setup logic into a single hook
 *
 * This hook replaces 5-7 store subscriptions per generator with
 * a single batched hook using zustand's useShallow for optimal performance.
 *
 * **Replaces this pattern:**
 * ```typescript
 * const getFeatureState = useGeneratorSelectionStore(state => state.getFeatureState);
 * const selectedDocumentIds = useGeneratorSelectionStore(state => state.selectedDocumentIds);
 * const selectedTextIds = useGeneratorSelectionStore(state => state.selectedTextIds);
 * const isInstructionsActive = useGeneratorSelectionStore(state => state.isInstructionsActive);
 * const customPrompt = useUserInstructions('social', isInstructionsActive);
 * ```
 *
 * **With this:**
 * ```typescript
 * const setup = useGeneratorSetup({
 *   instructionType: 'social',
 *   componentName: 'presse-social'
 * });
 * ```
 *
 * @param config - Generator configuration
 * @returns Setup data with feature state, selections, and custom instructions
 *
 * @example
 * ```typescript
 * const setup = useGeneratorSetup({
 *   instructionType: 'social',
 *   componentName: 'presse-social'
 * });
 *
 * // Access individual values
 * console.log(setup.selectedDocumentIds); // string[]
 * console.log(setup.features.useWebSearchTool); // boolean
 * console.log(setup.customPrompt); // string | null
 *
 * // Get current feature state dynamically
 * const features = setup.getFeatureState();
 * ```
 */
export function useGeneratorSetup(config: GeneratorSetupConfig): GeneratorSetupReturn {
  // Batched store subscriptions using useShallow for optimal re-renders
  // This reduces 5 separate subscriptions to 1, improving performance
  // NOTE: Feature values must be selected directly (not via getFeatureState)
  // to ensure reactivity when they change after initial render
  const {
    selectedDocumentIds,
    selectedTextIds,
    isInstructionsActive,
    useWebSearch,
    usePrivacyMode,
    useProMode,
    useUltraMode,
  } = useGeneratorSelectionStore(
    useShallow((state) => ({
      selectedDocumentIds: state.selectedDocumentIds,
      selectedTextIds: state.selectedTextIds,
      isInstructionsActive: state.isInstructionsActive,
      useWebSearch: state.useWebSearch,
      usePrivacyMode: state.usePrivacyMode,
      useProMode: state.useProMode,
      useUltraMode: state.useUltraMode,
    }))
  );

  // Fetch user's custom instructions based on instruction type
  // Only fetches if instructions are active
  const customPrompt = useUserInstructions(config.instructionType, isInstructionsActive);

  // Build feature state from reactive store values
  const features: FeatureState = {
    useWebSearchTool: useWebSearch,
    usePrivacyMode,
    useProMode,
    useUltraMode,
    useBedrock: useUltraMode,
  };

  // Return all setup data with readonly types for safety
  return {
    selectedDocumentIds: selectedDocumentIds as readonly string[],
    selectedTextIds: selectedTextIds as readonly string[],
    isInstructionsActive,
    features,
    customPrompt,
    getFeatureState: () => features,
  };
}

/**
 * Type guard to check if a value is a valid instruction type
 *
 * @param value - Value to check
 * @returns True if value is a valid instruction type
 *
 * @example
 * ```typescript
 * if (isValidInstructionType(userInput)) {
 *   const setup = useGeneratorSetup({
 *     instructionType: userInput,
 *     componentName: 'my-generator'
 *   });
 * }
 * ```
 */
export function isValidInstructionType(
  value: unknown
): value is GeneratorSetupConfig['instructionType'] {
  return (
    typeof value === 'string' &&
    [
      'social',
      'antrag',
      'universal',
      'rede',
      'buergeranfragen',
      'leichte_sprache',
      'gruenejugend',
    ].includes(value)
  );
}
