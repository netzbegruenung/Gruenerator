import React from 'react';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

interface KnowledgeSource {
  type: 'user' | 'group' | 'neutral';
  name?: string;
  [key: string]: unknown;
}

interface Instructions {
  [key: string]: string | undefined;
}

interface GroupDetails {
  instructions?: {
    custom_prompt?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface KnowledgeItem {
  [key: string]: unknown;
}

interface KnowledgeFormNoticeParams {
  source: KnowledgeSource;
  isLoadingGroupDetails: boolean;
  isInstructionsActive: boolean;
  instructions: Instructions;
  instructionType: string;
  groupDetailsData?: GroupDetails | null;
  availableKnowledge?: KnowledgeItem[];
}

/**
 * Creates a form notice element for knowledge/instruction status
 * @param params - Parameters for creating the notice
 * @returns Form notice element or null
 */
export const createKnowledgeFormNotice = ({
  source,
  isLoadingGroupDetails,
  isInstructionsActive,
  instructions,
  instructionType,
  groupDetailsData,
  availableKnowledge,
}: KnowledgeFormNoticeParams): React.ReactElement | null => {
  if (source.type === 'group' && isLoadingGroupDetails) {
    return null;
  }

  const noticeParts = [];
  let sourceNameForNotice = '';

  if (source.type === 'user') {
    sourceNameForNotice = 'Persönliche';
    if (isInstructionsActive && instructions[instructionType]) {
      noticeParts.push(`${sourceNameForNotice} Anweisungen`);
    } else if (instructions[instructionType]) {
      noticeParts.push(`${sourceNameForNotice} Anweisungen (inaktiv)`);
    }
  } else if (source.type === 'group') {
    sourceNameForNotice = source.name || 'Gruppe';
    if (groupDetailsData?.instructions?.custom_prompt) {
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
