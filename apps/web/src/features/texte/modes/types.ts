import type { GeneratorSetupConfig } from '../../../hooks/useGeneratorSetup';
import type { AIPromptInputExample, SettingConfig } from '@gruenerator/ui';

export type ModeState = Record<string, string | string[]>;

export interface ExtraFieldConfig {
  key: string;
  type: 'input' | 'textarea' | 'select';
  placeholder: string;
  label?: string;
  required?: boolean;
  options?: Array<{ id: string; label: string }>;
  condition?: (state: ModeState) => boolean;
}

export interface TagInputConfig {
  key: string;
  label: string;
  placeholder: string;
}

export interface ModeDefinition {
  id: string;
  endpoint: string;
  instructionType: GeneratorSetupConfig['instructionType'];
  componentName: string;
  defaultMode: 'balanced' | 'pro' | 'privacy';
  searchQueryFields: readonly string[];
  placeholder: string;
  /** Sub-settings rendered left of mode pills (dropdowns) */
  settings?: SettingConfig[];
  /** Tag inputs rendered left of mode pills */
  tagInputs?: TagInputConfig[];
  /** Extra fields rendered above the input */
  extraFields?: ExtraFieldConfig[];
  /** Example pills below the input */
  examples?: AIPromptInputExample[];
  /** Use usePresseSocialSubmit instead of useGenerator.submit */
  useCustomSubmit?: boolean;
  /** Show agent mode button in FeatureIcons */
  showAgentMode?: boolean;
  /** Render output as markdown */
  useMarkdown?: boolean;
  /** Map prompt field name (default: 'inhalt') */
  promptField?: string;
  /** Default values for settings/state */
  defaults?: ModeState;
  /** Build extra fields to pass to submit() from current state */
  buildSubmitFields?: (prompt: string, state: ModeState) => Record<string, unknown>;
}

export interface ModeGroupEntry {
  id: string;
  label: string;
  submodes?: string[];
}
