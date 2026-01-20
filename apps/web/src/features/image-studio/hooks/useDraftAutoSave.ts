import { useEffect, useRef, useCallback } from 'react';
import debounce from 'lodash/debounce';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useAutoSaveStore } from './useAutoSaveStore';
import { useShareStore } from '@gruenerator/shared/share';
import { getTypeConfig, getTemplateFieldConfig } from '../utils/typeConfig';
import { useImageHelpers } from './useImageHelpers';
import { useStepFlow } from './useStepFlow';

export const useDraftAutoSave = (): void => {
    const {
        type,
        generatedImageSrc,
        galleryEditMode
    } = useImageStudioStore();

    const {
        autoSaveStatus,
        autoSavedShareToken,
        lastAutoSavedImageSrc,
        setAutoSaveStatus,
        setAutoSavedShareToken,
        setLastAutoSavedImageSrc
    } = useAutoSaveStore();

    const { createImageShare, updateImageShare } = useShareStore();
    const { getOriginalImageBase64, buildShareMetadata } = useImageHelpers();
    const { getFieldValue } = useStepFlow();

    const typeConfig = getTypeConfig(type || '');
    const fieldConfig = getTemplateFieldConfig(type || '');

    // Use refs to store latest values for the debounced function
    const latestRefs = useRef({
        type,
        typeConfig,
        fieldConfig,
        galleryEditMode,
        autoSaveStatus,
        autoSavedShareToken,
        lastAutoSavedImageSrc,
        generatedImageSrc,
        getOriginalImageBase64,
        buildShareMetadata,
        createImageShare,
        updateImageShare,
        setAutoSaveStatus,
        setAutoSavedShareToken,
        setLastAutoSavedImageSrc,
        getFieldValue
    });

    // Update refs on render
    useEffect(() => {
        latestRefs.current = {
            type,
            typeConfig,
            fieldConfig,
            galleryEditMode,
            autoSaveStatus,
            autoSavedShareToken,
            lastAutoSavedImageSrc,
            generatedImageSrc,
            getOriginalImageBase64,
            buildShareMetadata,
            createImageShare,
            updateImageShare,
            setAutoSaveStatus,
            setAutoSavedShareToken,
            setLastAutoSavedImageSrc,
            getFieldValue
        };
    }, [type, typeConfig, fieldConfig, galleryEditMode, autoSaveStatus, autoSavedShareToken, lastAutoSavedImageSrc, generatedImageSrc, getOriginalImageBase64, buildShareMetadata, createImageShare, updateImageShare, setAutoSaveStatus, setAutoSavedShareToken, setLastAutoSavedImageSrc, getFieldValue]);

    const performSave = useCallback(async () => {
        const refs = latestRefs.current;

        // Safety checks
        if (refs.galleryEditMode) return; // Don't auto-save if editing existing gallery item (handle separately?)
        if (refs.autoSaveStatus === 'saving') return;
        if (!refs.generatedImageSrc && !refs.autoSavedShareToken) return; // Need an image to start

        // If we have no changes and already saved?
        // We check purely by triggering this function (debounced).

        console.log('[useDraftAutoSave] Starting save...');
        refs.setAutoSaveStatus('saving');

        try {
            const originalImage = await refs.getOriginalImageBase64();
            const metadata = refs.buildShareMetadata();
            const title = refs.typeConfig?.label || 'Draft';
            const imageSrc = refs.generatedImageSrc || refs.lastAutoSavedImageSrc || '';

            if (!imageSrc) {
                // Can't save without image?
                refs.setAutoSaveStatus('idle');
                return;
            }

            if (refs.autoSavedShareToken) {
                // UPDATE existing
                await refs.updateImageShare({
                    shareToken: refs.autoSavedShareToken,
                    title,
                    metadata: metadata ?? undefined,
                    imageBase64: imageSrc,
                });
                console.log('[useDraftAutoSave] Update successful');
            } else {
                // CREATE new
                const share = await refs.createImageShare({
                    imageData: imageSrc,
                    title,
                    imageType: refs.typeConfig?.legacyType || refs.type || '',
                    metadata: metadata,
                    originalImage: originalImage ?? undefined,
                    // status: 'draft' // If supported
                });
                if (share?.shareToken) {
                    console.log('[useDraftAutoSave] Create successful:', share.shareToken);
                    refs.setAutoSavedShareToken(share.shareToken);
                }
            }

            refs.setLastAutoSavedImageSrc(imageSrc);
            refs.setAutoSaveStatus('saved');

            // Revert to idle after delay?
            setTimeout(() => refs.setAutoSaveStatus('idle'), 2000);

        } catch (error) {
            console.error('[useDraftAutoSave] Save failed:', error);
            refs.setAutoSaveStatus('error');
        }
    }, []);

    // Debounced save for metadata updates
    const debouncedSave = useCallback(
        debounce(() => {
            performSave();
        }, 2000),
        [performSave]
    );

    // Trigger save when generatedImageSrc changes (immediate or debounced?)
    // If user clicked "Save", we want immediate feedback.
    useEffect(() => {
        if (generatedImageSrc && generatedImageSrc !== lastAutoSavedImageSrc) {
            performSave(); // Immediate save for image changes
        }
    }, [generatedImageSrc, lastAutoSavedImageSrc, performSave]);

    // Trigger save when form values change (debounced)
    // We need to listen to form values. getFieldValue retrieves them, but doesn't trigger effect?
    // We need the values in dependency array.
    // useStepFlow returns `getFieldValue` but not the values themselves exposed for effect dependencies.
    // Actually, useStepFlow has `flowSteps` which contains values?
    // Or we can subscribe to the store? `useImageStudioStore` or `useFormStateStore`.

    // For now, let's assume we rely on `generatedImageSrc` trigger primarily.
    // To support "Early Draft" (metadata only):
    // We need access to form state.

};
