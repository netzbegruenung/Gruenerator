import React, { lazy, Suspense, useCallback, useMemo } from 'react';

import { MasterCanvasEditor } from '../features/image-studio/canvas-editor/MasterCanvasEditor';

import type { SharepicDataItem } from './common/ImageDisplay';
import type { ImageStudioTemplateType } from '@gruenerator/shared/image-studio';

// Lazily load the actual modal component (assuming it exists or will be created)
// For now, let's assume a generic Modal wrapper.
// This is a placeholder for a generic modal that would typically contain the editor.
const GenericModal = lazy(() => import('./common/GenericModal'));

export interface SharepicMasterEditorModalProps {
  sharepic: SharepicDataItem;
  isOpen: boolean;
  onExport: (base64Image: string) => void;
  onCancel: () => void;
}

export function SharepicMasterEditorModal({
  sharepic,
  isOpen,
  onExport,
  onCancel,
}: SharepicMasterEditorModalProps) {
  // Extract relevant data for the MasterCanvasEditor
  // This mapping logic needs to be robust for all sharepic types
  const editorType = (sharepic.sharepicType as string) || (sharepic.type as string) || 'dreizeilen';

  const initialState = useMemo(() => {
    // This mapping depends heavily on how 'sharepic.metadata' is structured
    // and what each canvas component expects for its 'initialState'.
    // For now, let's make some assumptions based on common patterns.
    const state: Record<string, any> = {
      // Common text fields
      line1: sharepic.line1,
      line2: sharepic.line2,
      line3: sharepic.line3,
      quote: sharepic.quote,
      name: sharepic.name,
      headline: sharepic.headline,
      subtext: sharepic.subtext,
      header: sharepic.header,
      subheader: sharepic.subheader,
      body: sharepic.body,
      eventTitle: sharepic.eventTitle,
      beschreibung: sharepic.beschreibung,
      weekday: sharepic.weekday,
      date: sharepic.date,
      time: sharepic.time,
      locationName: sharepic.locationName,
      address: sharepic.address,

      // Modifications (example from Dreizeilen, extend as needed)
      fontSize: sharepic.fontSize,
      colorSchemeId: sharepic.colorSchemeId,
      sunflowerPos: sharepic.sunflowerPos,
      sunflowerSize: sharepic.sunflowerSize,
      sunflowerVisible: sharepic.sunflowerVisible,
      imageOffset: sharepic.imageOffset,
      imageScale: sharepic.imageScale,
      balkenOffset: sharepic.balkenOffset,
      balkenScale: sharepic.balkenScale,
      balkenWidthScale: sharepic.balkenWidthScale,
      gradientEnabled: sharepic.gradientEnabled,
      gradientOpacity: sharepic.gradientOpacity,
      assetVisibility: sharepic.assetVisibility,
      customQuoteFontSize: sharepic.customQuoteFontSize,
      customNameFontSize: sharepic.customNameFontSize,
      customQuoteWidth: sharepic.customQuoteWidth,
      customNameWidth: sharepic.customNameWidth,
      quoteMarkPos: sharepic.quoteMarkPos,
      quoteMarkSize: sharepic.quoteMarkSize,
      // ... other specific modifications
    };

    // Filter out undefined values to avoid overwriting defaults in canvas components
    Object.keys(state).forEach((key) => state[key] === undefined && delete state[key]);
    return state;
  }, [sharepic]);

  // Determine the image source for the editor.
  // If the sharepic has an original_image (uploaded), use that.
  // Otherwise, use the generated image (sharepic.image) for contexts that require it.
  const editorImageSrc = useMemo(() => {
    // Priority: uploaded original image (for re-editing), then current generated image
    // For profilbild, image is the transparent image input
    if (sharepic.original_image) {
      return sharepic.original_image as string;
    } else if (sharepic.image) {
      return sharepic.image as string;
    }
    return undefined;
  }, [sharepic.original_image, sharepic.image]);

  if (!isOpen) {
    return null;
  }

  // A generic modal for the editor. Replace with your actual modal component.
  return (
    <GenericModal isOpen={isOpen} onClose={onCancel} title="Sharepic bearbeiten" size="fullscreen">
      <MasterCanvasEditor
        type={editorType}
        initialState={initialState}
        imageSrc={editorImageSrc} // Pass the appropriate image source
        onExport={onExport}
        onCancel={onCancel}
      />
    </GenericModal>
  );
}

// Basic modal styling (can be moved to a CSS file)
// This is a placeholder for your actual GenericModal styling
const style = document.createElement('style');
style.innerHTML = `
.generic-modal.fullscreen .modal-content {
  padding: 0;
}
.generic-modal.fullscreen .modal-body {
  height: 100vh;
  padding: 0;
}
`;
document.head.appendChild(style);
