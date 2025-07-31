import { DEFAULT_COLORS } from '../../../../components/utils/constants';

// Unified data preparation function for both dreizeilen and quote types
export const prepareDataForCanvas = (formData, modificationData, type = 'dreizeilen') => {
    const formDataToSend = new FormData();

    console.log(`Preparing ${type} data:`, formData);
    console.log('Modification data:', modificationData);
    
    // Type-specific validation and text data
    if (type === 'quote') {
        // Validation for quote type
        if (!formData.quote || !formData.name) {
            throw new Error('Zitat und Name sind erforderlich');
        }
        
        // Quote-specific text data
        formDataToSend.append('quote', formData.quote);
        formDataToSend.append('name', formData.name);
    } else {
        // Dreizeilen text data
        formDataToSend.append('line1', formData.line1 || '');
        formDataToSend.append('line2', formData.line2 || '');
        formDataToSend.append('line3', formData.line3 || '');
    }
  
    // Schriftgröße
    formDataToSend.append('fontSize', modificationData.fontSize || formData.fontSize || '85');
  
    // Credit (common to both types)
    const credit = modificationData.credit || formData.credit || '';
    formDataToSend.append('credit', credit);

    // Dreizeilen-specific offsets (not used for quotes)
    if (type === 'dreizeilen') {
        // Balken-Offsets
        let balkenOffset = modificationData.balkenOffset || formData.balkenOffset || [50, -100, 50];
        if (!Array.isArray(balkenOffset)) {
            console.warn('balkenOffset is not an array. Using default value:', balkenOffset);
            balkenOffset = [50, -100, 50];
        }
        balkenOffset.forEach((offset, index) => {
            formDataToSend.append(`balkenOffset_${index}`, offset.toString());
        });

        console.log('Applied balkenOffset:', balkenOffset);

        // Balken Gruppe Offset
        const balkenGruppenOffset = modificationData.balkenGruppenOffset || formData.balkenGruppenOffset || [0, 0];
        formDataToSend.append('balkenGruppe_offset_x', balkenGruppenOffset[0].toString());
        formDataToSend.append('balkenGruppe_offset_y', balkenGruppenOffset[1].toString());

        // Sonnenblume Offset
        const sunflowerOffset = modificationData.sunflowerOffset || formData.sunflowerOffset || [0, 0];
        formDataToSend.append('sunflower_offset_x', sunflowerOffset[0].toString());
        formDataToSend.append('sunflower_offset_y', sunflowerOffset[1].toString());
    }

  
    console.log(`${type} FormData prepared:`, Object.fromEntries(formDataToSend));
  
    // Colors - different handling for each type
    const colorScheme = modificationData.colorScheme ?? formData.colorScheme ?? DEFAULT_COLORS;
    
    if (type === 'quote') {
        // Quote uses single color set
        formDataToSend.append('background_color', colorScheme[0].background);
        formDataToSend.append('text_color', colorScheme[0].text);
    } else {
        // Dreizeilen uses multiple color sets
        colorScheme.forEach((color, index) => {
            formDataToSend.append(`colors_${index}_background`, color.background);
            formDataToSend.append(`colors_${index}_text`, color.text);
        });
    }
  
    // Bild hinzufügen, wenn vorhanden
    console.log('Checking image sources:', {
      uploadedImage: formData.uploadedImage,
      selectedImage: formData.selectedImage,
      image: formData.image,
      modificationImage: modificationData.image
    });

    const imageToUse = modificationData.image || formData.uploadedImage || formData.image;
    
    if (imageToUse instanceof Blob || imageToUse instanceof File) {
      console.log('Using image of type:', imageToUse.type);
      // Konvertiere Blob zu File wenn nötig
      const imageFile = imageToUse instanceof File ? imageToUse : new File([imageToUse], 'image.jpg', { type: imageToUse.type });
      formDataToSend.append('image', imageFile);
    } else if (formData.selectedImage && formData.selectedImage.fullImageUrl) {
      console.warn('Unsplash image handling not implemented yet');
    } else {
      console.warn('No valid image found in form data');
    }

    console.log(`${type} FormData before sending:`, {
      hasImage: formDataToSend.has('image'),
      formDataEntries: Array.from(formDataToSend.entries()).map(([key, value]) => ({
        key,
        type: value instanceof Blob ? 'Blob' : value instanceof File ? 'File' : typeof value,
        value: value instanceof Blob || value instanceof File ? '[File]' : value
      }))
    });
  
    return formDataToSend;
};

// Backward compatibility exports
export const prepareDataForDreizeilenCanvas = (formData, modificationData) => {
    return prepareDataForCanvas(formData, modificationData, 'dreizeilen');
};

export const prepareDataForQuoteCanvas = (formData, modificationData) => {
    return prepareDataForCanvas(formData, modificationData, 'quote');
};