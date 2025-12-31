export type SourceType = 'neutral' | 'user' | 'group';

export interface Source {
  type: SourceType;
  id: string | null;
  name: string | null;
}

export type InstructionType =
  | 'antrag'
  | 'antragGliederung'
  | 'social'
  | 'universal'
  | 'gruenejugend'
  | 'rede'
  | 'buergeranfragen';

export interface Instructions {
  antrag: string | null;
  antragGliederung: string | null;
  social: string | null;
  universal: string | null;
  gruenejugend: string | null;
  rede: string | null;
  buergeranfragen: string | null;
}

export interface UIConfig {
  enableDocuments: boolean;
  enableTexts: boolean;
  enableSourceSelection: boolean;
}

export interface DocumentExtractionInfo {
  documentId?: string;
  progress?: number;
  message?: string;
  [key: string]: unknown;
}

export type GeneratorMode = 'privacy' | 'balanced' | 'pro' | 'ultra';

export interface GeneratorSelectionState {
  source: Source;
  instructionType: InstructionType | null;
  instructions: Instructions;
  isInstructionsActive: boolean;
  availableDocuments: Array<{ id: string; [key: string]: unknown }>;
  selectedDocumentIds: string[];
  isLoadingDocuments: boolean;
  isExtractingDocumentContent: boolean;
  documentExtractionInfo: DocumentExtractionInfo | null;
  availableTexts: Array<{ id: string; [key: string]: unknown }>;
  selectedTextIds: string[];
  isLoadingTexts: boolean;
  uiConfig: UIConfig;
  activeComponentName: string | null;
  defaultModes: Record<string, GeneratorMode>;
  useWebSearch: boolean;
  usePrivacyMode: boolean;
  useProMode: boolean;
  useUltraMode: boolean;
  useAutomaticSearch: boolean;
}

export interface FeatureState {
  useWebSearchTool: boolean;
  usePrivacyMode: boolean;
  useProMode: boolean;
  useUltraMode: boolean;
  useAutomaticSearch: boolean;
  useBedrock: boolean;
}

export interface SelectedIds {
  documentIds: string[];
  textIds: string[];
}
