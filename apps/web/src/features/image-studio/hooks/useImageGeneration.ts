import { generateSharepicText, type SharepicTextType } from '@gruenerator/shared/image-studio';
import { useState, useCallback } from 'react';

import apiClient from '../../../components/utils/apiClient';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { IMAGE_STUDIO_TYPES, getTypeConfig } from '../utils/typeConfig';

interface TextFormData {
  thema?: string;
  name?: string;
  source?: string;
  count?: number;
  smartCount?: boolean;
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
  label?: string;
}

/**
 * Studio-ID → Backend-Typ, der zugleich das letzte Pfadsegment ist.
 * `null` für alles ohne Textgenerierung.
 *
 * Hier standen bis eben sieben handgeschriebene `*ApiResponse`-Interfaces, und
 * gleich zwei davon beschrieben eine Form, die es nie gab: `InfoApiResponse`
 * erwartete header/body auf oberster Ebene, wo der Draht sie unter `mainInfo`
 * nestet — jede Info-Generierung endete deshalb in „Unerwartete
 * Antwortstruktur von der API". Die Formen kommen jetzt aus dem Vertrag.
 */
function toSharepicTextType(type: string): SharepicTextType | null {
  switch (type) {
    case IMAGE_STUDIO_TYPES.ZITAT:
      return 'zitat';
    case IMAGE_STUDIO_TYPES.ZITAT_PURE:
      return 'zitat_pure';
    case IMAGE_STUDIO_TYPES.INFO:
      return 'info';
    case IMAGE_STUDIO_TYPES.VERANSTALTUNG:
      return 'veranstaltung';
    case IMAGE_STUDIO_TYPES.SIMPLE:
      return 'simple';
    case IMAGE_STUDIO_TYPES.SLIDER:
      return 'slider';
    default:
      return 'dreizeilen';
  }
}

interface UseImageGenerationReturn {
  generateText: (type: string, formData: TextFormData) => Promise<TextGenerationResult | null>;
  generateImage: (
    type: string,
    formData: TemplateImageFormData | KiImageFormData
  ) => Promise<string>;
  generateTemplateImage: (type: string, formData: TemplateImageFormData) => Promise<string>;
  generateKiImage: (type: string, formData: KiImageFormData) => Promise<string>;
  loading: boolean;
  error: string;
  setError: (error: string) => void;
}

export const useImageGeneration = (): UseImageGenerationReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateText = useCallback(
    async (type: string, formData: TextFormData): Promise<TextGenerationResult | null> => {
      const config = getTypeConfig(type);
      if (!config?.hasTextGeneration) {
        return null;
      }

      const textType = toSharepicTextType(type);
      if (!textType) {
        return null;
      }

      setLoading(true);
      setError('');

      try {
        const body = {
          thema: formData.thema ?? null,
          name: formData.name ?? null,
          source: 'image-studio',
          count: formData.count || 1,
          ...(textType === 'slider' && formData.smartCount ? { smartCount: true } : {}),
        };

        switch (textType) {
          case 'simple': {
            const r = await generateSharepicText('simple', body);
            return {
              headline: r.mainSimple.headline,
              subtext: r.mainSimple.subtext,
              alternatives: r.alternatives,
            };
          }

          case 'zitat':
          case 'zitat_pure': {
            const r = await generateSharepicText(textType, body);
            return {
              quote: r.quote,
              name: formData.name,
              // Auf dem Draht sind das nackte Strings; die Ergebnisansicht
              // erwartet Objekte mit `quote`.
              alternatives: r.alternatives.map((quote) => ({ quote })),
            };
          }

          case 'info': {
            const r = await generateSharepicText('info', body);
            return {
              header: r.mainInfo.header,
              subheader: r.mainInfo.subheader,
              body: r.mainInfo.body,
              alternatives: r.alternatives,
              searchTerms: r.searchTerms,
            };
          }

          case 'veranstaltung': {
            const r = await generateSharepicText('veranstaltung', body);
            return {
              eventTitle: r.mainEvent.eventTitle,
              beschreibung: r.mainEvent.beschreibung,
              weekday: r.mainEvent.weekday,
              date: r.mainEvent.date,
              time: r.mainEvent.time,
              locationName: r.mainEvent.locationName,
              address: r.mainEvent.address,
              alternatives: r.alternatives,
              searchTerms: r.searchTerms,
            };
          }

          case 'slider': {
            const r = await generateSharepicText('slider', body);
            return {
              label: r.mainSlider.label || 'Wusstest du?',
              headline: r.mainSlider.headline,
              subtext: r.mainSlider.subtext,
              alternatives: r.alternatives,
              searchTerms: r.searchTerms,
            };
          }

          case 'dreizeilen': {
            const r = await generateSharepicText('dreizeilen', body);
            return {
              mainSlogan: r.mainSlogan,
              alternatives: r.alternatives,
              searchTerms: r.searchTerms,
            };
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten';
        setError(errorMessage);
        console.error('Error generating text:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const generateTemplateImage = useCallback(
    async (type: string, formData: TemplateImageFormData): Promise<string> => {
      const config = getTypeConfig(type);

      const formDataToSend = new FormData();
      const needsImageUpload = config?.requiresImage;

      if (needsImageUpload) {
        const imageToUse = formData.uploadedImage || formData.image;
        if (!imageToUse) {
          throw new Error('Kein Bild ausgewahlt');
        }

        const imageFile =
          imageToUse instanceof File
            ? imageToUse
            : new File([imageToUse], 'image.jpg', {
                type: (imageToUse as Blob).type || 'image/jpeg',
              });
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

        const combinedBody =
          formData.subheader && formData.body
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
          sunflower_offset_y: formData.sunflowerOffset?.[1] || '0',
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

      const response = await apiClient.post<{ image: string }>(endpoint, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data.image;
    },
    []
  );

  const generateKiImage = useCallback(
    async (type: string, formData: KiImageFormData): Promise<string> => {
      const config = getTypeConfig(type);

      if (!config?.usesFluxApi) {
        throw new Error('Dieser Typ verwendet keine KI-Bildgenerierung');
      }

      const endpoint = config?.endpoints?.generate;
      if (!endpoint) {
        throw new Error('Kein Generate-Endpoint fur diesen Typ konfiguriert');
      }

      if (type === IMAGE_STUDIO_TYPES.PURE_CREATE || type === IMAGE_STUDIO_TYPES.AI_EDITOR) {
        const { selectedImageSize } = useImageStudioStore.getState();

        const requestData = {
          prompt: formData.purePrompt || formData.prompt,
          variant: formData.variant || 'illustration-pure',
          ...(selectedImageSize && {
            width: selectedImageSize.width,
            height: selectedImageSize.height,
          }),
        };

        const response = await apiClient.post<{ image: { base64: string } }>(endpoint, requestData);

        if (!response.data?.image?.base64) {
          throw new Error('Keine Bilddaten empfangen');
        }

        return response.data.image.base64;
      }

      if (type === IMAGE_STUDIO_TYPES.GREEN_EDIT || type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT) {
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
        } else if (
          type === IMAGE_STUDIO_TYPES.GREEN_EDIT &&
          formData.selectedInfrastructure?.length
        ) {
          textInstruction = formData.selectedInfrastructure
            .map((i) => i.label || i.value)
            .join(', ');
        }

        formDataToSend.append('text', textInstruction);
        const isPrecision = type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT || formData.precisionMode;
        formDataToSend.append('precision', isPrecision ? 'true' : 'false');
        formDataToSend.append('type', type);

        const response = await apiClient.post<{ image: string | { base64: string } }>(
          endpoint,
          formDataToSend,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        if (!response.data?.image) {
          throw new Error('Keine Bilddaten empfangen');
        }

        const img = response.data.image;
        return typeof img === 'string' ? img : img.base64;
      }

      throw new Error('Unbekannter KI-Typ');
    },
    []
  );

  const validateFormData = useCallback(
    (type: string, formData: TemplateImageFormData | KiImageFormData): string | null => {
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
        } else if (
          type === IMAGE_STUDIO_TYPES.GREEN_EDIT ||
          type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT
        ) {
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
    },
    []
  );

  const generateImage = useCallback(
    async (type: string, formData: TemplateImageFormData | KiImageFormData): Promise<string> => {
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
        let errorMessage = 'Ein Fehler ist aufgetreten';
        if (err instanceof Error) {
          errorMessage = err.message;
        } else if (typeof err === 'object' && err !== null && 'response' in err) {
          const errObj = err as Record<string, unknown>;
          const response = errObj.response as Record<string, unknown> | undefined;
          errorMessage =
            ((response?.data as Record<string, unknown>)?.message as string) || errorMessage;
        }
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [generateTemplateImage, generateKiImage, validateFormData]
  );

  return {
    generateText,
    generateImage,
    generateTemplateImage,
    generateKiImage,
    loading,
    error,
    setError,
  };
};

export default useImageGeneration;
