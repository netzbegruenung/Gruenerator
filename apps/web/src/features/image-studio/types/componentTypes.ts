import { type ComponentType, type ChangeEvent } from 'react';

import { type TypeConfig } from '../utils/typeConfig/types';

import { type FormDataUpdate } from './storeTypes';

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
  path?: string;
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
  updateFormData: (data: FormDataUpdate) => void;
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
  | 'universal-edit'
  | 'pure-create';
