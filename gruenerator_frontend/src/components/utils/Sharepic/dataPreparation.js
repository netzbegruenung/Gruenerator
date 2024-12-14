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

    console.log('FormData before sending:', {
      hasImage: formDataToSend.has('image'),
      formDataEntries: Array.from(formDataToSend.entries()).map(([key, value]) => ({
        key,
        type: value instanceof Blob ? 'Blob' : value instanceof File ? 'File' : typeof value
      }))
    });
  
    return formDataToSend;
  };