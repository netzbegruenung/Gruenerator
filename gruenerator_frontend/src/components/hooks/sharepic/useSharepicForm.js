import { useState, useCallback } from 'react';
import { useQuoteForm } from './useQuoteForm';
import { useThreeLineForm } from './useThreeLineForm';
import { SHAREPIC_TYPES } from '../../utils/constants';

export const useSharepicForm = () => {
  const [thema, setThema] = useState('');
  const [details, setDetails] = useState('');
  const [type, setType] = useState(SHAREPIC_TYPES.QUOTE);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imageModificationInstruction, setImageModificationInstruction] = useState('');
  const [errors] = useState({});

  const { quoteData, handleQuoteChange } = useQuoteForm();
  const { threeLineData, handleThreeLineChange } = useThreeLineForm();
    
  const handleChange = useCallback((e) => {
    const { name, value, files } = e.target;
    console.log(`[SharepicGenerator] ${name} changed:`, value || files);
    switch (name) {
      case 'thema': setThema(value); break;
      case 'details': setDetails(value); break;
      case 'type': setType(value); break;
      case 'uploadedImage':
        if (files && files[0]) {
          setUploadedImage(files[0]);
        }
        break;
      case 'imageModificationInstruction':
        setImageModificationInstruction(value);
        break;
      default:
        if (type === 'Zitat') {
          handleQuoteChange(e);
        } else {
          handleThreeLineChange(e);
        }
    }
  }, [type, handleQuoteChange, handleThreeLineChange]);

  return {
    formData: {
      thema,
      details,
      type,
      uploadedImage,
      imageModificationInstruction,
      ...quoteData,
      ...threeLineData
    },
    handleChange,
    errors
  };
};