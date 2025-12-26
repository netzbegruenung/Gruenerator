import { useState, useCallback } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import apiClient from '../../../components/utils/apiClient';
import {
  IMAGE_STUDIO_TYPES,
  getTypeConfig
} from '../utils/typeConfig';

export const useImageGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const quoteSubmit = useApiSubmit('zitat_claude');
  const dreizeilenSubmit = useApiSubmit('dreizeilen_claude');
  const infoSubmit = useApiSubmit('info_claude');
  const zitatPureSubmit = useApiSubmit('zitat_pure_claude');
  const veranstaltungSubmit = useApiSubmit('veranstaltung_claude');
  const text2SharepicSubmit = useApiSubmit('sharepic/text2sharepic/generate-ai');

  const generateText = useCallback(async (type, formData) => {
    const config = getTypeConfig(type);
    if (!config?.hasTextGeneration) {
      return null;
    }

    setLoading(true);
    setError('');

    try {
      let submitFn;
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
      const errorMessage = err.response?.data?.message || err.message || 'Ein Fehler ist aufgetreten';
      setError(errorMessage);
      console.error("Error generating text:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [quoteSubmit, dreizeilenSubmit, infoSubmit, zitatPureSubmit, veranstaltungSubmit]);

  const generateTemplateImage = useCallback(async (type, formData) => {
    const config = getTypeConfig(type);

    if (type === IMAGE_STUDIO_TYPES.TEXT2SHAREPIC) {
      const requestData = {
        description: formData.description,
        mood: formData.mood || undefined
      };

      const response = await text2SharepicSubmit.submitForm(requestData);

      if (!response || !response.image) {
        throw new Error('Keine Bilddaten empfangen');
      }

      return response.image;
    }

    const formDataToSend = new FormData();
    const needsImageUpload = config?.requiresImage;

    if (needsImageUpload) {
      const imageToUse = formData.uploadedImage || formData.image;
      if (!imageToUse) {
        throw new Error('Kein Bild ausgewahlt');
      }

      const imageFile = imageToUse instanceof File ? imageToUse :
        new File([imageToUse], 'image.jpg', { type: imageToUse.type || 'image/jpeg' });
      formDataToSend.append('image', imageFile);
    }

    if (type === IMAGE_STUDIO_TYPES.ZITAT || type === IMAGE_STUDIO_TYPES.ZITAT_PURE) {
      if (!formData.quote || !formData.name) {
        throw new Error('Zitat und Name sind erforderlich');
      }
      formDataToSend.append('quote', formData.quote);
      formDataToSend.append('name', formData.name);
      // Send fontSize - use 'quoteFontSize' for zitat_pure_canvas compatibility
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
      // Per-field font sizes in pixels (backend accepts direct px values)
      const fontSizesPx = formData.veranstaltungFieldFontSizes || {};
      formDataToSend.append('fontSizeEventTitle', String(fontSizesPx.eventTitle || 94));
      formDataToSend.append('fontSizeBeschreibung', String(fontSizesPx.beschreibung || 62));
      formDataToSend.append('fontSizeWeekday', String(fontSizesPx.weekday || 57));
      formDataToSend.append('fontSizeDate', String(fontSizesPx.date || 55));
      formDataToSend.append('fontSizeTime', String(fontSizesPx.time || 55));
      formDataToSend.append('fontSizeLocationName', String(fontSizesPx.locationName || 42));
      formDataToSend.append('fontSizeAddress', String(fontSizesPx.address || 42));
    } else {
      formDataToSend.append('line1', formData.line1 || '');
      formDataToSend.append('line2', formData.line2 || '');
      formDataToSend.append('line3', formData.line3 || '');

      const fieldsToAdd = {
        type: config?.legacyType || formData.type,
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
  }, [text2SharepicSubmit]);

  const generateKiImage = useCallback(async (type, formData) => {
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
      } else if (type === IMAGE_STUDIO_TYPES.GREEN_EDIT && formData.selectedInfrastructure?.length > 0) {
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

      // The API returns image object with base64 property containing the data URI
      return response.data.image.base64 || response.data.image;
    }

    throw new Error('Unbekannter KI-Typ');
  }, []);

  const validateFormData = useCallback((type, formData) => {
    const config = getTypeConfig(type);

    if (!config) {
      return 'Unbekannter Bildtyp';
    }

    if (config.usesFluxApi) {
      if (type === IMAGE_STUDIO_TYPES.PURE_CREATE) {
        if (!formData.purePrompt && !formData.prompt) {
          return 'Bitte gib eine Beschreibung ein';
        }
      } else if (type === IMAGE_STUDIO_TYPES.KI_SHAREPIC) {
        if (!formData.sharepicPrompt && !formData.prompt) {
          return 'Bitte gib eine Beschreibung ein';
        }
      } else if (type === IMAGE_STUDIO_TYPES.GREEN_EDIT ||
                 type === IMAGE_STUDIO_TYPES.ALLY_MAKER ||
                 type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT) {
        if (!formData.uploadedImage) {
          return 'Bitte lade zuerst ein Bild hoch';
        }
      }
    } else {
      if (config.requiresImage && !formData.uploadedImage && !formData.image) {
        return 'Bitte lade zuerst ein Bild hoch';
      }

      if (type === IMAGE_STUDIO_TYPES.ZITAT || type === IMAGE_STUDIO_TYPES.ZITAT_PURE) {
        if (!formData.quote) {
          return 'Bitte gib ein Zitat ein';
        }
        if (!formData.name) {
          return 'Bitte gib den Namen der zitierten Person ein';
        }
      }

      if (type === IMAGE_STUDIO_TYPES.INFO) {
        if (!formData.header) {
          return 'Bitte gib einen Header ein';
        }
        if (!formData.body) {
          return 'Bitte gib einen Body-Text ein';
        }
      }

      if (type === IMAGE_STUDIO_TYPES.VERANSTALTUNG) {
        if (!formData.eventTitle) {
          return 'Bitte gib einen Event-Titel ein';
        }
        if (!formData.weekday || !formData.date || !formData.time) {
          return 'Bitte gib Wochentag, Datum und Uhrzeit ein';
        }
        if (!formData.locationName || !formData.address) {
          return 'Bitte gib Veranstaltungsort und Adresse ein';
        }
      }
    }

    return null;
  }, []);

  const generateImage = useCallback(async (type, formData) => {
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
        return await generateKiImage(type, formData);
      } else {
        return await generateTemplateImage(type, formData);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Ein Fehler ist aufgetreten';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [generateTemplateImage, generateKiImage, validateFormData]);

  return {
    generateText,
    generateImage,
    generateTemplateImage,
    generateKiImage,
    loading,
    error,
    setError
  };
};

export default useImageGeneration;
