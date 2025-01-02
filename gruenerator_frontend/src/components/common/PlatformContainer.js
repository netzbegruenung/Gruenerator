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
    startPlatformEdit, 
    finishPlatformEdit, 
    activePlatform,
    isEditing
  } = useContext(FormContext);

  const isEditingThis = isEditing && activePlatform === platform;

  const handleEdit = () => {
    if (activePlatform === platform) {
      finishPlatformEdit();
    } else {
      startPlatformEdit(platform);
    }
  };

  return (
    <div className={`platform-content ${isEditingThis ? 'editing' : ''}`}>
      <div className="platform-header">
        <div className="platform-title">
          {Icon && (
            <div className="platform-icon">
              <Icon size={20} />
            </div>
          )}
          <h3 className="platform-name">
            {isEditingThis ? "Grünerator Editor" : (title || platform)}
          </h3>
        </div>
        {showEditButton && (
          <ActionButtons 
            content={content}
            onEdit={handleEdit}
            isEditing={isEditingThis}
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