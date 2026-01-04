import type { RefObject, ChangeEvent } from 'react';
import type { VeranstaltungFieldFontSizes, SloganAlternative } from '../../../stores/imageStudioStore';

export interface FieldConfigField {
  name: string;
  label: string;
  placeholder?: string;
}

export interface FieldConfig {
  showImageUpload?: boolean;
  showGroupedFontSizeControl?: boolean;
  previewFields?: FieldConfigField[];
  showPreviewLabels?: boolean;
  showCredit?: boolean;
  showFontSizeControl?: boolean;
  showColorControls?: boolean;
  showAdvancedEditing?: boolean;
  showAutoSave?: boolean;
  showSocialGeneration?: boolean;
  showAlternatives?: boolean;
}

export type SloganAlternativeWithIndex = SloganAlternative & {
  _index: number;
};

export interface PreviewValues {
  line1?: string;
  line2?: string;
  line3?: string;
  quote?: string;
  header?: string;
  subheader?: string;
  body?: string;
  eventTitle?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
  [key: string]: string | undefined;
}

export interface ColorSchemeItem {
  background: string;
  text?: string;
}

export interface ColorScheme {
  primary?: string;
  secondary?: string;
  background?: string;
  text?: string;
  [key: string]: string | undefined;
}

export interface TemplateResultEditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  fieldConfig: FieldConfig | null;
  currentImagePreview: string | null;
  fileInputRef: RefObject<HTMLInputElement>;
  handleImageChange: (e: ChangeEvent<HTMLInputElement>) => void;
  previewValues: PreviewValues;
  handleChange: (e: { target: { name: string; value: string } }) => void;
  displayAlternatives: SloganAlternativeWithIndex[];
  isAlternativesOpen: boolean;
  setIsAlternativesOpen: (open: boolean) => void;
  handleSloganSwitch: (alt: SloganAlternativeWithIndex, index: number) => void;
  getAlternativePreview: (alt: SloganAlternativeWithIndex) => string;
  credit?: string;
  fontSize?: number;
  colorScheme?: ColorSchemeItem[] | ColorScheme;
  balkenOffset?: number[];
  balkenGruppenOffset?: [number, number];
  sunflowerOffset?: [number, number];
  veranstaltungFieldFontSizes?: VeranstaltungFieldFontSizes;
  handleControlChange: (name: string, value: unknown) => void;
  handleFieldFontSizeChange: (fieldName: string, value: number) => void;
  isAdvancedEditingOpen?: boolean;
  toggleAdvancedEditing?: () => void;
  type?: string;
  loading?: boolean;
  onRegenerate: () => void;
  onGenerateAlternatives?: () => void;
  alternativesLoading?: boolean;
}

export interface TemplateResultLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  altText?: string;
}

export interface TemplateResultStepProps {
  onRegenerate: () => void;
  loading?: boolean;
  onGoBackToCanvas?: () => void;
}

export interface TemplateResultActionButtonsProps {
  generatedImageSrc: string;
  loading: boolean;
  galleryEditMode: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  hasGeneratedText: boolean;
  copied: boolean;
  updateSuccess: boolean;
  isSharing: boolean;
  socialLoading: boolean;
  isAltTextLoading: boolean;
  canNativeShare: boolean;
  isUpdating: boolean;
  onDownload: () => void;
  onShare: () => void;
  onGalleryUpdate: () => void;
  onNavigateToGallery: () => void;
  onOpenEditPanel: () => void;
  onTextButtonClick: () => void;
  onShareToInstagram: () => void;
}

export interface ShareMetadata {
  [key: string]: unknown;
  sharepicType: string;
  hasOriginalImage: boolean;
  content: Record<string, unknown>;
  styling: {
    fontSize?: number;
    colorScheme?: ColorSchemeItem[] | ColorScheme;
    balkenOffset?: number[];
    balkenGruppenOffset?: [number, number];
    sunflowerOffset?: [number, number];
    credit?: string;
  };
  searchTerms?: string[];
  sloganAlternatives?: SloganAlternative[];
  kiConfig?: {
    kiType: string;
    prompt: string | null;
    variant: string | null;
    imagineTitle: string | null;
  };
}

export { SloganAlternative, VeranstaltungFieldFontSizes };
