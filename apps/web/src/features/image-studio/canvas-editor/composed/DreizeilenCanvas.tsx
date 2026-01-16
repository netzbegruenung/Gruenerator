/**
 * DreizeilenCanvas - Config-based 3-line slogan canvas
 *
 * Refactored from 1,107-line monolithic component to simple wrapper
 * using GenericCanvas with dreizeilen_full.config
 *
 * Migration completed: Phase 1-6 of refactoring plan
 * - Phase 1: Constants extracted to dreizeilen.constants.ts
 * - Phase 2: Types defined in dreizeilen.types.ts
 * - Phase 3: Full config created in dreizeilen_full.config.tsx
 * - Phase 4: Hooks extracted (useFontLoader, useLayerOrdering)
 * - Phase 5: Component refactored to use GenericCanvas (this file)
 * - Phase 6: Balken rendering integrated via BalkenInstance
 */

import React, { useState, useEffect } from 'react';
import { GenericCanvas } from '../components/GenericCanvas';
import { loadCanvasConfig } from '../configs/configLoader';
import type { FullCanvasConfig } from '../configs/types';
import type { DreizeilenFullState, DreizeilenFullActions, DreizeilenAlternative } from '../configs/dreizeilen.types';
import type { StockImageAttribution } from '../../services/imageSourceService';

// Re-export types for backward compatibility
export type { DreizeilenAlternative } from '../configs/dreizeilen.types';
export type { DreizeilenFullState as DreizeilenState };

export interface DreizeilenCanvasProps {
    // Text content
    line1: string;
    line2: string;
    line3: string;

    // Optional initial state
    imageSrc?: string;
    alternatives?: DreizeilenAlternative[];
    colorSchemeId?: string;
    fontSize?: number;
    balkenWidthScale?: number;
    sunflowerVisible?: boolean;

    // Callbacks
    onExport: (base64: string) => void;
    onSave?: (base64: string) => void;
    onCancel: () => void;
    onLine1Change?: (line: string) => void;
    onLine2Change?: (line: string) => void;
    onLine3Change?: (line: string) => void;
    onFontSizeChange?: (size: number) => void;
    onColorSchemeChange?: (id: string) => void;
    onImageSrcChange?: (src: string) => void;
    onStateChange?: (state: DreizeilenFullState) => void;
    onReset?: () => void;

    // Multi-page support
    onAddPage?: () => void;
    onDelete?: () => void;
    bare?: boolean;
}

/**
 * DreizeilenCanvas - Config-driven 3-line slogan canvas
 *
 * Renders 3 lines of text on parallelogram bars (Balken) with:
 * - Configurable color schemes
 * - Background image support
 * - Sunflower decoration
 * - Icons, shapes, and additional text elements
 * - Layer ordering and transformations
 *
 * @example
 * ```tsx
 * <DreizeilenCanvas
 *   line1="Für eine"
 *   line2="bessere"
 *   line3="Zukunft"
 *   onExport={(base64) => console.log('Exported:', base64)}
 *   onCancel={() => navigate('/gallery')}
 * />
 * ```
 */
export function DreizeilenCanvas({
    line1,
    line2,
    line3,
    imageSrc,
    alternatives = [],
    colorSchemeId,
    fontSize,
    balkenWidthScale,
    sunflowerVisible = true,
    onExport,
    onSave,
    onCancel,
    onLine1Change,
    onLine2Change,
    onLine3Change,
    onFontSizeChange,
    onColorSchemeChange,
    onImageSrcChange,
    onStateChange,
    onReset,
    onAddPage,
    onDelete,
    bare,
}: DreizeilenCanvasProps) {
    const [config, setConfig] = useState<FullCanvasConfig | null>(null);

    // Load config dynamically
    useEffect(() => {
        loadCanvasConfig('dreizeilen')
            .then(setConfig)
            .catch((error) => {
                console.error('Failed to load dreizeilen config:', error);
            });
    }, []);

    // Show loading state while config loads
    if (!config) {
        return <div>Lädt Editor...</div>;
    }

    // Map component props to config's initialProps format
    const initialProps = {
        line1,
        line2,
        line3,
        currentImageSrc: imageSrc,
        alternatives,
        colorSchemeId,
        fontSize,
        balkenWidthScale,
        sunflowerVisible,
    };

    // Map component callbacks to config's callback format
    const callbacks: Record<string, ((val: unknown) => void) | undefined> = {
        onLine1Change: onLine1Change as ((val: unknown) => void) | undefined,
        onLine2Change: onLine2Change as ((val: unknown) => void) | undefined,
        onLine3Change: onLine3Change as ((val: unknown) => void) | undefined,
        onFontSizeChange: onFontSizeChange as ((val: unknown) => void) | undefined,
        onColorSchemeChange: onColorSchemeChange as ((val: unknown) => void) | undefined,
        onImageSrcChange: onImageSrcChange as ((val: unknown) => void) | undefined,
        onReset: onReset as ((val: unknown) => void) | undefined,
    };

    return (
        <GenericCanvas<DreizeilenFullState, DreizeilenFullActions>
            config={config as unknown as FullCanvasConfig<DreizeilenFullState, DreizeilenFullActions>}
            initialProps={initialProps}
            onExport={onExport}
            onSave={onSave}
            onCancel={onCancel}
            callbacks={callbacks}
            onAddPage={onAddPage}
            onDelete={onDelete}
            bare={bare}
        />
    );
}
