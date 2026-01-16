/**
 * ZitatMultiPage - Multi-page wrapper for Zitat canvas
 * 
 * Renders all pages stacked vertically (scrollable), no pagination.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { GenericCanvas } from './GenericCanvas';
import { useMultiPageCanvas } from '../hooks';
import { loadCanvasConfig } from '../configs/configLoader';
import type { FullCanvasConfig } from '../configs/types';
import './ZitatMultiPage.css';

interface ZitatMultiPageProps {
    initialProps: {
        quote?: string;
        name?: string;
        imageSrc?: string;
        alternatives?: string[];
    };
    onExport: (base64: string) => void;
    onCancel: () => void;
    callbacks?: Record<string, (val: unknown) => void>;
}

function ZitatMultiPageContent({
    config,
    initialProps,
    onExport,
    onCancel,
    callbacks = {},
}: {
    config: FullCanvasConfig;
    initialProps: ZitatMultiPageProps['initialProps'];
    onExport: (base64: string) => void;
    onCancel: () => void;
    callbacks?: Record<string, (val: unknown) => void>;
}) {
    const {
        pages,
        addPage,
        removePage,
        canAddMore,
        pageCount,
    } = useMultiPageCanvas({
        config,
        initialProps,
        maxPages: 10,
    });

    // Handle export for a specific page
    const handleExport = useCallback((base64: string, _pageIndex: number) => {
        onExport(base64);
    }, [onExport]);

    return (
        <div className="zitat-multipage">
            {/* Render all pages stacked vertically */}
            {pages.map((page, index) => (
                <div key={page.id} className="zitat-multipage__page">
                    {/* Canvas - all pages render bare for consistent styling */}
                    <GenericCanvas
                        key={page.id}
                        config={config}
                        initialProps={page.state}
                        onExport={(base64) => handleExport(base64, index)}
                        onCancel={onCancel}
                        callbacks={callbacks}
                        onAddPage={index === pages.length - 1 && canAddMore ? addPage : undefined}
                        bare={false}
                        onDelete={pageCount > 1 && index > 0 ? () => removePage(page.id) : undefined}
                    />
                </div>
            ))}
        </div>
    );
}

export function ZitatMultiPage(props: ZitatMultiPageProps) {
    const [config, setConfig] = useState<FullCanvasConfig | null>(null);

    // Load config dynamically
    useEffect(() => {
        loadCanvasConfig('zitat')
            .then(setConfig)
            .catch((error) => {
                console.error('Failed to load zitat config:', error);
            });
    }, []);

    // Show loading state while config loads
    if (!config) {
        return <div>Lädt Editor...</div>;
    }

    return <ZitatMultiPageContent {...props} config={config} />;
}

export default ZitatMultiPage;
