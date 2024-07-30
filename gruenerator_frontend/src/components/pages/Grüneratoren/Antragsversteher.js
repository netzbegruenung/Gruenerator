import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { PiFilePdf } from 'react-icons/pi';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import BaseForm from '../../common/BaseForm';
import { useFileHandling } from '../../utils/fileHandling';
import useFileUpload from '../../hooks/useFileUpload';
import { BUTTON_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';

const Antragsversteher = ({ showHeaderFooter = true }) => {
  const {
    file,
    fileName,
    dragging,
    error: fileError,
    handleFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useFileHandling(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text']);

  const { antrag, loading, success, error, uploadAndProcessFile, setError } = useFileUpload();
  const textSize = useDynamicTextSize(antrag, 1.2, 0.8, [1000, 2000]);
  const fileInputRef = useRef(null);

  const handleSubmit = () => {
    if (!file) {
      setError('Bitte wählen Sie eine Datei aus.');
      return;
    }
    uploadAndProcessFile(file);
  };

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="PDF hochladen"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error || fileError}
        generatedContent={antrag}
        textSize={textSize}
      >
        <div
          className={`file-upload ${dragging ? 'dragging' : ''} ${file ? 'file-selected' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
        >
          {file ? (
            <>
              <PiFilePdf size={50} />
              <p>{fileName}</p>
              <p
                className="change-file-text"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current.click();
                }}
                style={{ cursor: 'pointer', color: 'blue', textDecoration: 'underline' }}
              >
                {BUTTON_LABELS.CHANGE_FILE}
              </p>
            </>
          ) : (
            <>
              <PiFilePdf size={50} />
              <p>{FORM_PLACEHOLDERS.DRAG_AND_DROP}</p>
            </>
          )}
        </div>
        <input
          type="file"
          accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text"
          onChange={handleFileChange}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
      </BaseForm>
    </div>
  );
};

Antragsversteher.propTypes = {
  showHeaderFooter: PropTypes.bool,
};

export default Antragsversteher;
