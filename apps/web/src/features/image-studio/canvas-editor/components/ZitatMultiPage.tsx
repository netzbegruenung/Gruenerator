/**
 * ZitatMultiPage - Multi-page wrapper for Zitat canvas
 * 
 * Renders all pages stacked vertically (scrollable), no pagination.
 */

import React, { useCallback } from 'react';
import { GenericCanvas } from './GenericCanvas';
import { useMultiPageCanvas } from '../hooks';
import { zitatFullConfig } from '../configs/zitat_full.config';
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
    callbacks?: Record<string, (val: any) => void>;
}

export function ZitatMultiPage({
    initialProps,
    onExport,
    onCancel,
    callbacks = {},
}: ZitatMultiPageProps) {
    const {
        pages,
        addPage,
        removePage,
        canAddMore,
        pageCount,
    } = useMultiPageCanvas({
        config: zitatFullConfig,
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
                        config={zitatFullConfig}
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

export default ZitatMultiPage;
