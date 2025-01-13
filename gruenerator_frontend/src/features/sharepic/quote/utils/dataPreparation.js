import { DEFAULT_COLORS } from '../../../../components/utils/constants';

export const prepareDataForQuoteCanvas = (formData, modificationData) => {
    const formDataToSend = new FormData();
    
    console.log('Preparing quote data:', formData);
    console.log('Modification data:', modificationData);
    
    // Validierung
    if (!formData.quote || !formData.name) {
        throw new Error('Zitat und Name sind erforderlich');
    }
    
    // Zitat-Text und Name
    formDataToSend.append('quote', formData.quote);
    formDataToSend.append('name', formData.name);
    
    // Schriftgröße
    formDataToSend.append('fontSize', modificationData?.fontSize || formData.fontSize || '85');
    
    // Credit
    const credit = modificationData?.credit || formData.credit || '';
    formDataToSend.append('credit', credit);
    
    // Farben (vereinfacht, da Zitate nur einen Farbsatz brauchen)
    const colorScheme = modificationData?.colorScheme ?? formData.colorScheme ?? DEFAULT_COLORS;
    formDataToSend.append('background_color', colorScheme[0].background);
    formDataToSend.append('text_color', colorScheme[0].text);
    
    // Bild hinzufügen
    const imageToUse = modificationData?.image || formData.uploadedImage || formData.image;
    
    if (imageToUse instanceof Blob || imageToUse instanceof File) {
        console.log('Using image of type:', imageToUse.type);
        const imageFile = imageToUse instanceof File ? imageToUse : 
            new File([imageToUse], 'image.jpg', { type: imageToUse.type });
        formDataToSend.append('image', imageFile);
    } else {
        console.warn('No valid image found in form data');
    }
    
    console.log('Quote FormData prepared:', {
        hasImage: formDataToSend.has('image'),
        formDataEntries: Array.from(formDataToSend.entries()).map(([key, value]) => ({
            key,
            type: value instanceof Blob ? 'Blob' : value instanceof File ? 'File' : typeof value,
            value: value instanceof Blob || value instanceof File ? '[File]' : value
        }))
    });
    
    return formDataToSend;
}; 