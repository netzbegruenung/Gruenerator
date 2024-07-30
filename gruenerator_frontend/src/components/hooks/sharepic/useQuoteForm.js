// src/hooks/sharepic/useQuoteForm.js

import { useState } from 'react';

export const useQuoteForm = () => {
  const [quote, setQuote] = useState('');
  const [name, setName] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'quote') setQuote(value);
    if (name === 'name') setName(value);
  };

  return {
    quoteData: { quote, name },
    handleQuoteChange: handleChange
  };
};