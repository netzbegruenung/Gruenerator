import { type ComponentType, type ChangeEvent } from 'react';

import { type TypeConfig } from '../utils/typeConfig/types';

export interface StartOption {
  id: string;
  category: string | null;
  subcategory: string | null;
  label: string;
  description: string;
  Icon: ComponentType;
  previewImage?: string;
  previewImageFallback?: string;
  isComingSoon?: boolean;
  isEarlyAccess?: boolean;
  directType?: string;
}

export interface FormErrors {
  thema?: string;
  description?: string;
  purePrompt?: string;
  sharepicPrompt?: string;
  uploadedImage?: string;
  precisionInstruction?: string;
  selectedInfrastructure?: string;
  [key: string]: string | undefined;
}

export interface ImageStudioFormSectionProps {
  type: string;
  currentStep: string;
  typeConfig: TypeConfig | null;
  formErrors: FormErrors;
  handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  updateFormData: (data: Record<string, any>) => void;
}

// Slogan alternative type for text generation results
export interface SloganAlternative {
  line1?: string;
  line2?: string;
  line3?: string;
  quote?: string;
  header?: string;
  subheader?: string;
  body?: string;
}

// URL type map keys
export type UrlTypeMapKey =
  | 'dreizeilen'
  | 'zitat'
  | 'zitat-pure'
  | 'info'
  | 'veranstaltung'
  | 'text2sharepic'
  | 'ki'
  | 'green-edit'
  | 'ally-maker'
  | 'universal-edit'
  | 'pure-create';
