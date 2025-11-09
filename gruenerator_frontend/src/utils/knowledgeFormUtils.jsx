import React from 'react';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Creates a form notice element for knowledge/instruction status
 * @param {Object} params - Parameters for creating the notice
 * @param {Object} params.source - Knowledge source from store
 * @param {boolean} params.isLoadingGroupDetails - Whether group details are loading
 * @param {boolean} params.isInstructionsActive - Whether instructions are active
 * @param {Object} params.instructions - User instructions object
 * @param {string} params.instructionType - Type of instruction ('antrag' or 'social')
 * @param {Object} params.groupDetailsData - Group details data
 * @param {Array} params.availableKnowledge - Available knowledge items
 * @returns {JSX.Element|null} Form notice element or null
 */
export const createKnowledgeFormNotice = ({
  source,
  isLoadingGroupDetails,
  isInstructionsActive,
  instructions,
  instructionType,
  groupDetailsData,
  availableKnowledge,
}) => {
  if (source.type === 'group' && isLoadingGroupDetails) {
    return null;
  }

  let noticeParts = [];
  let sourceNameForNotice = "";

  if (source.type === 'user') {
    sourceNameForNotice = "Persönliche";
    if (isInstructionsActive && instructions[instructionType]) {
      noticeParts.push(`${sourceNameForNotice} Anweisungen`);
    } else if (instructions[instructionType]) {
      noticeParts.push(`${sourceNameForNotice} Anweisungen (inaktiv)`);
    }
  } else if (source.type === 'group') {
    sourceNameForNotice = source.name || 'Gruppe';
    const groupInstructionKey = instructionType === 'antrag' ? 'custom_antrag_prompt' : 'custom_social_prompt';
    if (groupDetailsData?.instructions?.[groupInstructionKey]) {
      noticeParts.push(`Anweisungen der Gruppe "${sourceNameForNotice}"`);
    }
  }



  if (noticeParts.length === 0 && source.type === 'neutral') {
    return null;
  }

  if (noticeParts.length === 0) return null;

  const fullNoticeText = noticeParts.join('. ');

  return (
    <div className="custom-prompt-notice">
      <span>{fullNoticeText}.</span>
    </div>
  );
};
