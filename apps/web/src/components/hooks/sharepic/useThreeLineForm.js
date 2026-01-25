// src/hooks/sharepic/useThreeLineForm.js

import { useState } from 'react';

export const useThreeLineForm = () => {
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [line3, setLine3] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'line1') setLine1(value);
    if (name === 'line2') setLine2(value);
    if (name === 'line3') setLine3(value);
  };

  return {
    threeLineData: { line1, line2, line3 },
    handleThreeLineChange: handleChange,
  };
};
