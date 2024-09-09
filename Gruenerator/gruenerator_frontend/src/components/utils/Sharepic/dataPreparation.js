import { DEFAULT_COLORS } from '../constants';

export const prepareDataForDreizeilenCanvas = (formData, modificationData) => {
    const formDataToSend = new FormData();

    console.log('Incoming formData:', formData);
    console.log('Incoming modificationData:', modificationData);
    
    // Textzeilen
    formDataToSend.append('line1', formData.line1 || '');
    formDataToSend.append('line2', formData.line2 || '');
    formDataToSend.append('line3', formData.line3 || '');
  
    // Schriftgröße
    formDataToSend.append('fontSize', modificationData.fontSize || formData.fontSize || '85');
  
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

// Credit hinzufügen
const credit = modificationData.credit || formData.credit || '';
formDataToSend.append('credit', credit);

console.log('Outgoing balkenOffset values:', Object.fromEntries(formDataToSend));

  // Sonnenblume Offset
  const sunflowerOffset = modificationData.sunflowerOffset || formData.sunflowerOffset || [0, 0];
  formDataToSend.append('sunflower_offset_x', sunflowerOffset[0].toString());
  formDataToSend.append('sunflower_offset_y', sunflowerOffset[1].toString());

  
    console.log('Outgoing balkenOffset values:', Object.fromEntries(formDataToSend));
  
    // Farben
  const colorScheme = modificationData.colorScheme ?? formData.colorScheme ?? DEFAULT_COLORS;

  colorScheme.forEach((color, index) => {
    formDataToSend.append(`colors_${index}_background`, color.background);
    formDataToSend.append(`colors_${index}_text`, color.text);
  });
  
    // Bild hinzufügen, wenn vorhanden
    if (formData.uploadedImage instanceof File) {
      formDataToSend.append('image', formData.uploadedImage);
    } else if (formData.selectedImage && formData.selectedImage.fullImageUrl) {
      // Hier müssten wir das Bild von der URL herunterladen und als File anhängen
      // Dies würde einen zusätzlichen Schritt erfordern, möglicherweise einen separaten API-Aufruf
    }
  
    return formDataToSend;
  };