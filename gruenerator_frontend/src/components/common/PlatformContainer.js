import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { FormContext } from '../utils/FormContext';
import ActionButtons from './ActionButtons';

const PlatformContainer = ({
  platform,
  icon: Icon,
  children,
  content,
  title,
  showEditButton = false
}) => {
  const { 
    isEditing,
    handleEdit,
    handleSave
  } = useContext(FormContext);

  const handlePlatformEdit = () => {
    if (isEditing) {
      handleSave(platform);
    } else {
      handleEdit(platform);
    }
  };

  return (
    <div className={`platform-content ${isEditing ? 'editing' : ''}`}>
      <div className="platform-header">
        <div className="platform-title">
          {Icon && (
            <div className="platform-icon">
              <Icon size={20} />
            </div>
          )}
          <h3 className="platform-name">
            {isEditing ? "Grünerator Editor" : (title || platform)}
          </h3>
        </div>
        {showEditButton && (
          <ActionButtons 
            content={content}
            onEdit={handlePlatformEdit}
            isEditing={isEditing}
            allowEditing={true}
            hideEditButton={false}
            showExport={false}
            className="platform-actions platform-edit-buttons"
          />
        )}
      </div>
      <div className="platform-body">
        <div className="generated-content-wrapper">
          {children}
        </div>
      </div>
    </div>
  );
};

PlatformContainer.propTypes = {
  platform: PropTypes.string.isRequired,
  icon: PropTypes.elementType,
  children: PropTypes.node.isRequired,
  content: PropTypes.string,
  title: PropTypes.string,
  showEditButton: PropTypes.bool,
};

export default PlatformContainer; 