import { useState, useCallback } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import apiClient from '../../../components/utils/apiClient';
import {
  IMAGE_STUDIO_TYPES,
  getTypeConfig
} from '../utils/typeConfig';

interface TextFormData {
  thema?: string;
  name?: string;
  source?: string;
  count?: number;
  [key: string]: unknown;
}

interface TemplateImageFormData {
  type?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  quote?: string;
  name?: string;
  header?: string;
  subheader?: string;
  body?: string;
  uploadedImage?: File | Blob | null;
  image?: File | Blob | null;
  fontSize?: number;
  colorScheme?: Array<{ background: string; text: string }>;
  balkenOffset?: number[];
  balkenGruppenOffset?: [number, number];
  sunflowerOffset?: [number, number];
  credit?: string;
  eventTitle?: string;
  beschreibung?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
  veranstaltungFieldFontSizes?: Record<string, number>;
  headline?: string;
  subtext?: string;
  headlineFontSize?: number;
  subtextFontSize?: number;
  gradientEnabled?: boolean;
  gradientOpacity?: number;
  [key: string]: unknown;
}

interface KiImageFormData {
  purePrompt?: string;
  sharepicPrompt?: string;
  prompt?: string;
  imagineTitle?: string;
  title?: string;
  variant?: string;
  uploadedImage?: File | Blob | null;
  precisionMode?: boolean;
  precisionInstruction?: string;
  selectedInfrastructure?: Array<{ label?: string; value: string }>;
  allyPlacement?: { label?: string; value: string };
  [key: string]: unknown;
}

interface TextGenerationResult {
  quote?: string;
  name?: string;
  mainSlogan?: { line1: string; line2: string; line3: string };
  alternatives: Array<Record<string, string>>;
  searchTerms?: string[];
  header?: string;
  subheader?: string;
  body?: string;
  eventTitle?: string;
  beschreibung?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
  headline?: string;
  subtext?: string;
}

interface UseImageGenerationReturn {
  generateText: (type: string, formData: TextFormData) => Promise<TextGenerationResult | null>;
  generateAlternatives: (type: string, formData: TextFormData) => Promise<TextGenerationResult | null>;
  generateImage: (type: string, formData: TemplateImageFormData | KiImageFormData) => Promise<string>;
  generateTemplateImage: (type: string, formData: TemplateImageFormData) => Promise<string>;
  generateKiImage: (type: string, formData: KiImageFormData) => Promise<string>;
  loading: boolean;
  alternativesLoading: boolean;
  error: string;
  setError: (error: string) => void;
}

export const useImageGeneration = (): UseImageGenerationReturn => {
  const [loading, setLoading] = useState(false);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [error, setError] = useState('');

  const quoteSubmit = useApiSubmit('zitat_claude');
  const dreizeilenSubmit = useApiSubmit('dreizeilen_claude');
  const infoSubmit = useApiSubmit('info_claude');
  const zitatPureSubmit = useApiSubmit('zitat_pure_claude');
  const veranstaltungSubmit = useApiSubmit('veranstaltung_claude');
  const simpleSubmit = useApiSubmit('simple_claude');

  const generateText = useCallback(async (type: string, formData: TextFormData): Promise<TextGenerationResult | null> => {
    const config = getTypeConfig(type);
    if (!config?.hasTextGeneration) {
      return null;
    }

    setLoading(true);
    setError('');

    try {
      let submitFn: (data: Record<string, unknown>) => Promise<any>;
      let isQuoteType = false;
      let isInfoType = false;
      let isVeranstaltungType = false;
      let isSimpleType = false;

      switch (type) {
        case IMAGE_STUDIO_TYPES.ZITAT:
          submitFn = quoteSubmit.submitForm;
          isQuoteType = true;
          break;
        case IMAGE_STUDIO_TYPES.ZITAT_PURE:
          submitFn = zitatPureSubmit.submitForm;
          isQuoteType = true;
          break;
        case IMAGE_STUDIO_TYPES.INFO:
          submitFn = infoSubmit.submitForm;
          isInfoType = true;
          break;
        case IMAGE_STUDIO_TYPES.VERANSTALTUNG:
          submitFn = veranstaltungSubmit.submitForm;
          isVeranstaltungType = true;
          break;
        case IMAGE_STUDIO_TYPES.SIMPLE:
          submitFn = simpleSubmit.submitForm;
          isSimpleType = true;
          break;
        case IMAGE_STUDIO_TYPES.DREIZEILEN:
        default:
          submitFn = dreizeilenSubmit.submitForm;
          break;
      }

      const dataToSend = {
        ...formData,
        source: 'image-studio',
        count: formData.count || 1
      };

      const response = await submitFn(dataToSend);

      if (isSimpleType) {
        const mainSimple = response.mainSimple || response;
        if (!mainSimple || !mainSimple.headline) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        const result = {
          headline: mainSimple.headline,
          subtext: mainSimple.subtext || '',
          alternatives: response.alternatives || []
        };
        return result;
      } else if (isQuoteType) {
        if (!response || !response.quote) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          quote: response.quote,
          name: formData.name,
          alternatives: response.alternatives || []
        };
      } else if (isInfoType) {
        if (!response || !response.header || !response.body) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          header: response.header,
          subheader: response.subheader || '',
          body: response.body,
          alternatives: response.alternatives || [],
          searchTerms: response.searchTerms || []
        };
      } else if (isVeranstaltungType) {
        const mainEvent = response.mainEvent || response;
        if (!mainEvent || !mainEvent.eventTitle) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          eventTitle: mainEvent.eventTitle || '',
          beschreibung: mainEvent.beschreibung || '',
          weekday: mainEvent.weekday || '',
          date: mainEvent.date || '',
          time: mainEvent.time || '',
          locationName: mainEvent.locationName || '',
          address: mainEvent.address || '',
          alternatives: response.alternatives || [],
          searchTerms: response.searchTerms || []
        };
      } else {
        if (!response || !response.mainSlogan || !response.alternatives) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          mainSlogan: response.mainSlogan,
          alternatives: response.alternatives,
          searchTerms: response.searchTerms || []
        };
      }
    } catch (err) {
      const errorMessage = (err as any).response?.data?.message || (err as Error).message || 'Ein Fehler ist aufgetreten';
      setError(errorMessage);
      console.error("Error generating text:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [quoteSubmit, dreizeilenSubmit, infoSubmit, zitatPureSubmit, veranstaltungSubmit, simpleSubmit]);

  const generateAlternatives = useCallback(async (type: string, formData: TextFormData): Promise<TextGenerationResult | null> => {
    const config = getTypeConfig(type);
    if (!config?.hasTextGeneration) {
      return null;
    }

    setAlternativesLoading(true);
    setError('');

    try {
      let submitFn: (data: Record<string, unknown>) => Promise<any>;
      let isQuoteType = false;
      let isInfoType = false;
      let isVeranstaltungType = false;

      switch (type) {
        case IMAGE_STUDIO_TYPES.ZITAT:
          submitFn = quoteSubmit.submitForm;
          isQuoteType = true;
          break;
        case IMAGE_STUDIO_TYPES.ZITAT_PURE:
          submitFn = zitatPureSubmit.submitForm;
          isQuoteType = true;
          break;
        case IMAGE_STUDIO_TYPES.INFO:
          submitFn = infoSubmit.submitForm;
          isInfoType = true;
          break;
        case IMAGE_STUDIO_TYPES.VERANSTALTUNG:
          submitFn = veranstaltungSubmit.submitForm;
          isVeranstaltungType = true;
          break;
        case IMAGE_STUDIO_TYPES.DREIZEILEN:
        default:
          submitFn = dreizeilenSubmit.submitForm;
          break;
      }

      const dataToSend = {
        ...formData,
        source: 'image-studio',
        count: 5
      };

      const response = await submitFn(dataToSend);

      if (isQuoteType) {
        if (!response || !response.quote) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          quote: response.quote,
          name: formData.name,
          alternatives: response.alternatives || []
        };
      } else if (isInfoType) {
        if (!response || !response.header || !response.body) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          header: response.header,
          subheader: response.subheader || '',
          body: response.body,
          alternatives: response.alternatives || [],
          searchTerms: response.searchTerms || []
        };
      } else if (isVeranstaltungType) {
        const mainEvent = response.mainEvent || response;
        if (!mainEvent || !mainEvent.eventTitle) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          eventTitle: mainEvent.eventTitle || '',
          beschreibung: mainEvent.beschreibung || '',
          weekday: mainEvent.weekday || '',
          date: mainEvent.date || '',
          time: mainEvent.time || '',
          locationName: mainEvent.locationName || '',
          address: mainEvent.address || '',
          alternatives: response.alternatives || [],
          searchTerms: response.searchTerms || []
        };
      } else {
        if (!response || !response.mainSlogan || !response.alternatives) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          mainSlogan: response.mainSlogan,
          alternatives: response.alternatives,
          searchTerms: response.searchTerms || []
        };
      }
    } catch (err) {
      const errorMessage = (err as any).response?.data?.message || (err as Error).message || 'Ein Fehler ist aufgetreten';
      setError(errorMessage);
      console.error("Error generating alternatives:", err);
      throw err;
    } finally {
      setAlternativesLoading(false);
    }
  }, [quoteSubmit, dreizeilenSubmit, infoSubmit, zitatPureSubmit, veranstaltungSubmit, simpleSubmit]);

  const fetchAlternativesInBackground = useCallback(async (
    type: string,
    formData: TextFormData,
    onComplete: (alternatives: any[]) => void,
    onError?: (error: string) => void
  ) => {
    try {
      const dataToSend = {
        ...formData,
        source: 'image-studio',
        count: 5
      };

      let submitFn: (data: any) => Promise<any>;

      switch (type) {
        case IMAGE_STUDIO_TYPES.ZITAT:
          submitFn = quoteSubmit.submitForm;
          break;
        case IMAGE_STUDIO_TYPES.ZITAT_PURE:
          submitFn = zitatPureSubmit.submitForm;
          break;
        case IMAGE_STUDIO_TYPES.INFO:
          submitFn = infoSubmit.submitForm;
          break;
        case IMAGE_STUDIO_TYPES.VERANSTALTUNG:
          submitFn = veranstaltungSubmit.submitForm;
          break;
        case IMAGE_STUDIO_TYPES.SIMPLE:
          submitFn = simpleSubmit.submitForm;
          break;
        case IMAGE_STUDIO_TYPES.DREIZEILEN:
        default:
          submitFn = dreizeilenSubmit.submitForm;
          break;
      }

      const response = await submitFn(dataToSend);
      const alternatives = response.alternatives || [];

      if (alternatives.length > 0) {
        onComplete(alternatives);
      } else {
        onComplete([]);
      }

    } catch (err) {
      console.error('[Background alternatives] Fetch failed:', err);
      if (onError) {
        onError(err instanceof Error ? err.message : 'Unknown error');
      }
      onComplete([]);
    }
  }, [dreizeilenSubmit, quoteSubmit, infoSubmit, zitatPureSubmit, veranstaltungSubmit, simpleSubmit]);

  const generateTemplateImage = useCallback(async (type: string, formData: TemplateImageFormData): Promise<string> => {
    const config = getTypeConfig(type);

    const formDataToSend = new FormData();
    const needsImageUpload = config?.requiresImage;

    if (needsImageUpload) {
      const imageToUse = formData.uploadedImage || formData.image;
      if (!imageToUse) {
        throw new Error('Kein Bild ausgewahlt');
      }

      const imageFile = imageToUse instanceof File ? imageToUse :
        new File([imageToUse], 'image.jpg', { type: (imageToUse as Blob).type || 'image/jpeg' });
      formDataToSend.append('image', imageFile);
    }

    if (type === IMAGE_STUDIO_TYPES.ZITAT || type === IMAGE_STUDIO_TYPES.ZITAT_PURE) {
      if (!formData.quote || !formData.name) {
        throw new Error('Zitat und Name sind erforderlich');
      }
      formDataToSend.append('quote', formData.quote);
      formDataToSend.append('name', formData.name);
      const fontSizeParam = type === IMAGE_STUDIO_TYPES.ZITAT_PURE ? 'quoteFontSize' : 'fontSize';
      formDataToSend.append(fontSizeParam, String(formData.fontSize || 60));
    } else if (type === IMAGE_STUDIO_TYPES.INFO) {
      if (!formData.header || !formData.body) {
        throw new Error('Header und Body sind erforderlich');
      }
      formDataToSend.append('header', formData.header);

      const combinedBody = formData.subheader && formData.body
        ? `${formData.subheader}. ${formData.body}`
        : formData.subheader || formData.body || '';
      formDataToSend.append('body', combinedBody);
    } else if (type === IMAGE_STUDIO_TYPES.VERANSTALTUNG) {
      formDataToSend.append('eventTitle', formData.eventTitle || '');
      formDataToSend.append('beschreibung', formData.beschreibung || '');
      formDataToSend.append('weekday', formData.weekday || '');
      formDataToSend.append('date', formData.date || '');
      formDataToSend.append('time', formData.time || '');
      formDataToSend.append('locationName', formData.locationName || '');
      formDataToSend.append('address', formData.address || '');
      const fontSizesPx = formData.veranstaltungFieldFontSizes || {};
      formDataToSend.append('fontSizeEventTitle', String(fontSizesPx.eventTitle || 94));
      formDataToSend.append('fontSizeBeschreibung', String(fontSizesPx.beschreibung || 62));
      formDataToSend.append('fontSizeWeekday', String(fontSizesPx.weekday || 57));
      formDataToSend.append('fontSizeDate', String(fontSizesPx.date || 55));
      formDataToSend.append('fontSizeTime', String(fontSizesPx.time || 55));
      formDataToSend.append('fontSizeLocationName', String(fontSizesPx.locationName || 42));
      formDataToSend.append('fontSizeAddress', String(fontSizesPx.address || 42));
    } else if (type === IMAGE_STUDIO_TYPES.SIMPLE) {
      if (!formData.headline || !formData.subtext) {
        throw new Error('Headline und Subtext sind erforderlich');
      }
      formDataToSend.append('headline', formData.headline);
      formDataToSend.append('subtext', formData.subtext);
      formDataToSend.append('headlineFontSize', String(formData.headlineFontSize || 80));
      formDataToSend.append('subtextFontSize', String(formData.subtextFontSize || 50));
      formDataToSend.append('gradientEnabled', String(formData.gradientEnabled ?? true));
      formDataToSend.append('gradientOpacity', String(formData.gradientOpacity || 0.4));
    } else {
      formDataToSend.append('line1', formData.line1 || '');
      formDataToSend.append('line2', formData.line2 || '');
      formDataToSend.append('line3', formData.line3 || '');

      const fieldsToAdd: Record<string, string | number> = {
        type: config?.legacyType || formData.type || '',
        fontSize: formData.fontSize || '85',
        credit: formData.credit || '',
        balkenOffset_0: formData.balkenOffset?.[0] || '50',
        balkenOffset_1: formData.balkenOffset?.[1] || '-100',
        balkenOffset_2: formData.balkenOffset?.[2] || '50',
        balkenGruppe_offset_x: formData.balkenGruppenOffset?.[0] || '0',
        balkenGruppe_offset_y: formData.balkenGruppenOffset?.[1] || '0',
        sunflower_offset_x: formData.sunflowerOffset?.[0] || '0',
        sunflower_offset_y: formData.sunflowerOffset?.[1] || '0'
      };

      Object.entries(fieldsToAdd).forEach(([key, value]) => {
        formDataToSend.append(key, String(value));
      });

      if (formData.colorScheme && Array.isArray(formData.colorScheme)) {
        formData.colorScheme.forEach((color, index) => {
          if (formDataToSend.get(`line${index + 1}`)) {
            formDataToSend.append(`colors_${index}_background`, color.background);
            formDataToSend.append(`colors_${index}_text`, color.text);
          }
        });
      }
    }

    const endpoint = config?.endpoints?.canvas;
    if (!endpoint) {
      throw new Error('Kein Canvas-Endpoint fur diesen Typ konfiguriert');
    }

    const response = await apiClient.post(endpoint, formDataToSend, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data.image;
  }, []);

  const generateKiImage = useCallback(async (type: string, formData: KiImageFormData): Promise<string> => {
    const config = getTypeConfig(type);

    if (!config?.usesFluxApi) {
      throw new Error('Dieser Typ verwendet keine KI-Bildgenerierung');
    }

    const endpoint = config?.endpoints?.generate;
    if (!endpoint) {
      throw new Error('Kein Generate-Endpoint fur diesen Typ konfiguriert');
    }

    if (type === IMAGE_STUDIO_TYPES.PURE_CREATE) {
      const requestData = {
        prompt: formData.purePrompt || formData.prompt,
        variant: formData.variant || 'illustration-pure'
      };

      const response = await apiClient.post(endpoint, requestData);

      if (!response.data?.image?.base64) {
        throw new Error('Keine Bilddaten empfangen');
      }

      return response.data.image.base64;
    }

    if (type === IMAGE_STUDIO_TYPES.KI_SHAREPIC) {
      const requestData = {
        prompt: formData.sharepicPrompt || formData.prompt,
        title: formData.imagineTitle || formData.title,
        variant: formData.variant || 'light-top'
      };

      const response = await apiClient.post(endpoint, requestData);

      if (!response.data?.image?.base64) {
        throw new Error('Keine Bilddaten empfangen');
      }

      return response.data.image.base64;
    }

    if (type === IMAGE_STUDIO_TYPES.GREEN_EDIT ||
      type === IMAGE_STUDIO_TYPES.ALLY_MAKER ||
      type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT) {

      const imageToUse = formData.uploadedImage;
      if (!imageToUse) {
        throw new Error('Kein Bild ausgewahlt');
      }

      const formDataToSend = new FormData();
      formDataToSend.append('image', imageToUse);

      let textInstruction = '';
      if (type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT) {
        textInstruction = formData.precisionInstruction || '';
      } else if (formData.precisionMode && formData.precisionInstruction) {
        textInstruction = formData.precisionInstruction;
      } else if (type === IMAGE_STUDIO_TYPES.GREEN_EDIT && formData.selectedInfrastructure?.length) {
        textInstruction = formData.selectedInfrastructure.map(i => i.label || i.value).join(', ');
      } else if (type === IMAGE_STUDIO_TYPES.ALLY_MAKER && formData.allyPlacement) {
        textInstruction = `Regenbogen-Tattoo auf ${formData.allyPlacement.label || formData.allyPlacement.value}`;
      }

      formDataToSend.append('text', textInstruction);
      const isPrecision = type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT || formData.precisionMode;
      formDataToSend.append('precision', isPrecision ? 'true' : 'false');
      formDataToSend.append('type', type);

      const response = await apiClient.post(endpoint, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (!response.data?.image) {
        throw new Error('Keine Bilddaten empfangen');
      }

      return response.data.image.base64 || response.data.image;
    }

    throw new Error('Unbekannter KI-Typ');
  }, []);

  const validateFormData = useCallback((type: string, formData: TemplateImageFormData | KiImageFormData): string | null => {
    const config = getTypeConfig(type);

    if (!config) {
      return 'Unbekannter Bildtyp';
    }

    if (config.usesFluxApi) {
      const kiData = formData as KiImageFormData;
      if (type === IMAGE_STUDIO_TYPES.PURE_CREATE) {
        if (!kiData.purePrompt && !kiData.prompt) {
          return 'Bitte gib eine Beschreibung ein';
        }
      } else if (type === IMAGE_STUDIO_TYPES.KI_SHAREPIC) {
        if (!kiData.sharepicPrompt && !kiData.prompt) {
          return 'Bitte gib eine Beschreibung ein';
        }
      } else if (type === IMAGE_STUDIO_TYPES.GREEN_EDIT ||
        type === IMAGE_STUDIO_TYPES.ALLY_MAKER ||
        type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT) {
        if (!kiData.uploadedImage) {
          return 'Bitte lade zuerst ein Bild hoch';
        }
      }
    } else {
      const templateData = formData as TemplateImageFormData;
      if (config.requiresImage && !templateData.uploadedImage && !templateData.image) {
        return 'Bitte lade zuerst ein Bild hoch';
      }

      if (type === IMAGE_STUDIO_TYPES.ZITAT || type === IMAGE_STUDIO_TYPES.ZITAT_PURE) {
        if (!templateData.quote) {
          return 'Bitte gib ein Zitat ein';
        }
        if (!templateData.name) {
          return 'Bitte gib den Namen der zitierten Person ein';
        }
      }

      if (type === IMAGE_STUDIO_TYPES.INFO) {
        if (!templateData.header) {
          return 'Bitte gib einen Header ein';
        }
        if (!templateData.body) {
          return 'Bitte gib einen Body-Text ein';
        }
      }

      if (type === IMAGE_STUDIO_TYPES.VERANSTALTUNG) {
        if (!templateData.eventTitle) {
          return 'Bitte gib einen Event-Titel ein';
        }
        if (!templateData.weekday || !templateData.date || !templateData.time) {
          return 'Bitte gib Wochentag, Datum und Uhrzeit ein';
        }
        if (!templateData.locationName || !templateData.address) {
          return 'Bitte gib Veranstaltungsort und Adresse ein';
        }
      }

      if (type === IMAGE_STUDIO_TYPES.SIMPLE) {
        if (!templateData.headline) {
          return 'Bitte gib eine Headline ein';
        }
        if (!templateData.subtext) {
          return 'Bitte gib einen Subtext ein';
        }
      }
    }

    return null;
  }, []);

  const generateImage = useCallback(async (type: string, formData: TemplateImageFormData | KiImageFormData): Promise<string> => {
    setError('');

    const validationError = validateFormData(type, formData);
    if (validationError) {
      setError(validationError);
      throw new Error(validationError);
    }

    setLoading(true);

    try {
      const config = getTypeConfig(type);

      if (config?.usesFluxApi) {
        return await generateKiImage(type, formData as KiImageFormData);
      } else {
        return await generateTemplateImage(type, formData as TemplateImageFormData);
      }
    } catch (err) {
      const errorMessage = (err as any).response?.data?.message || (err as Error).message || 'Ein Fehler ist aufgetreten';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [generateTemplateImage, generateKiImage, validateFormData]);

  return {
    generateText,
    generateAlternatives,
    fetchAlternativesInBackground,
    generateImage,
    generateTemplateImage,
    generateKiImage,
    loading,
    alternativesLoading,
    error,
    setError
  };
};

export default useImageGeneration;
