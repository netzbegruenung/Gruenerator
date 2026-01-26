import { DEFAULT_COLORS } from '../components/utils/constants';

interface ColorSchemeItem {
  background: string;
  text?: string;
}

interface FormDataInput {
  quote?: string;
  name?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  fontSize?: string | number;
  credit?: string;
  balkenOffset?: number[];
  balkenGruppenOffset?: number[];
  sunflowerOffset?: number[];
  colorScheme?: ColorSchemeItem[];
  uploadedImage?: Blob | File | string;
  selectedImage?: { fullImageUrl?: string };
  image?: Blob | File | string;
}

interface ModificationData {
  fontSize?: string | number;
  credit?: string;
  balkenOffset?: number[];
  balkenGruppenOffset?: number[];
  sunflowerOffset?: number[];
  colorScheme?: ColorSchemeItem[];
  image?: Blob | File | string;
}

export type CanvasType = 'dreizeilen' | 'quote' | 'quote_pure' | 'info';

export const prepareDataForCanvas = (
  formData: FormDataInput,
  modificationData: ModificationData,
  type: CanvasType = 'dreizeilen'
): FormData => {
  const formDataToSend = new FormData();

  if (type === 'quote') {
    if (!formData.quote || !formData.name) {
      throw new Error('Zitat und Name sind erforderlich');
    }
    formDataToSend.append('quote', formData.quote);
    formDataToSend.append('name', formData.name);
  } else {
    formDataToSend.append('line1', formData.line1 || '');
    formDataToSend.append('line2', formData.line2 || '');
    formDataToSend.append('line3', formData.line3 || '');
  }

  formDataToSend.append('fontSize', String(modificationData.fontSize || formData.fontSize || '85'));

  const credit = modificationData.credit || formData.credit || '';
  formDataToSend.append('credit', credit);

  if (type === 'dreizeilen') {
    let balkenOffset = modificationData.balkenOffset || formData.balkenOffset || [50, -100, 50];
    if (!Array.isArray(balkenOffset)) {
      balkenOffset = [50, -100, 50];
    }
    balkenOffset.forEach((offset, index) => {
      formDataToSend.append(`balkenOffset_${index}`, offset.toString());
    });

    const balkenGruppenOffset = modificationData.balkenGruppenOffset ||
      formData.balkenGruppenOffset || [0, 0];
    formDataToSend.append('balkenGruppe_offset_x', balkenGruppenOffset[0].toString());
    formDataToSend.append('balkenGruppe_offset_y', balkenGruppenOffset[1].toString());

    const sunflowerOffset = modificationData.sunflowerOffset || formData.sunflowerOffset || [0, 0];
    formDataToSend.append('sunflower_offset_x', sunflowerOffset[0].toString());
    formDataToSend.append('sunflower_offset_y', sunflowerOffset[1].toString());
  }

  const colorScheme =
    modificationData.colorScheme ?? formData.colorScheme ?? (DEFAULT_COLORS as ColorSchemeItem[]);

  if (type === 'quote') {
    formDataToSend.append('background_color', colorScheme[0].background);
    formDataToSend.append('text_color', colorScheme[0].text || '#FFFFFF');
  } else {
    colorScheme.forEach((color, index) => {
      formDataToSend.append(`colors_${index}_background`, color.background);
      formDataToSend.append(`colors_${index}_text`, color.text || '#FFFFFF');
    });
  }

  const imageToUse = modificationData.image || formData.uploadedImage || formData.image;

  if (imageToUse && typeof imageToUse !== 'string') {
    const imageFile =
      imageToUse instanceof File
        ? imageToUse
        : new File([imageToUse], 'image.jpg', { type: imageToUse.type });
    formDataToSend.append('image', imageFile);
  }

  return formDataToSend;
};

export const prepareDataForDreizeilenCanvas = (
  formData: FormDataInput,
  modificationData: ModificationData
): FormData => {
  return prepareDataForCanvas(formData, modificationData, 'dreizeilen');
};

export const prepareDataForQuoteCanvas = (
  formData: FormDataInput,
  modificationData: ModificationData
): FormData => {
  return prepareDataForCanvas(formData, modificationData, 'quote');
};
