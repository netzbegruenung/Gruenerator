// useGeneratePost.js
import { useState } from 'react';

import useApiSubmit from '../useApiSubmit';

const useGeneratePost = () => {
  const [postContent, setPostContent] = useState('');
  const { submitForm, loading, error } = useApiSubmit('/claude_social');

  const generatePost = async (formData) => {
    const content = await submitForm(formData);
    if (content) setPostContent(content);
    return content;
  };

  return { postContent, generatePost, loading, error };
};

export default useGeneratePost;
