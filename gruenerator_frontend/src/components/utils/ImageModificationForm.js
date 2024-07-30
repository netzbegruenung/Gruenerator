// ImageModificationForm.js
import React from 'react';
import PropTypes from 'prop-types';

const ImageModificationForm = ({ instruction, setInstruction }) => {
  return (
    <div>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Geben Sie Ihre Anweisungen zur Bildmodifikation ein..."
        aria-label="Bildmodifikationsanweisungen"
      />
    </div>
  );
};

ImageModificationForm.propTypes = {
  instruction: PropTypes.string.isRequired,
  setInstruction: PropTypes.func.isRequired,
};

export default ImageModificationForm;
