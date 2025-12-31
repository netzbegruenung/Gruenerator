import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from './PageHeader';
import PageContent from './PageContent';
import { getReadingTime } from '../../../utils/readingTimeUtils';

const PageView = ({ 
    pageId, 
    pageData, 
    children,
    loading = false,
    error = null 
}) => {
    const [currentPage, setCurrentPage] = useState(null);
    const [isLoading, setIsLoading] = useState(loading);

    // Calculate reading time automatically if not provided
    // Preserves existing readTime if specified, otherwise calculates from content
    const calculatedReadingTime = useMemo(() => {
        // Priority 1: Use explicit readTime from current page
        if (currentPage?.readTime) {
            return currentPage.readTime;
        }
        
        // Priority 2: Use explicit readTime from pageData
        if (pageData?.readTime) {
            return pageData.readTime;
        }
        
        // Priority 3: Calculate from content automatically
        const content = currentPage?.content || pageData?.content;
        if (content || children) {
            try {
                return getReadingTime(content, children);
            } catch (error) {
                console.warn('Error calculating reading time:', error);
                return null;
            }
        }
        
        return null;
    }, [currentPage?.content, currentPage?.readTime, pageData?.content, pageData?.readTime, children]);

    useEffect(() => {
        if (pageData) {
            setCurrentPage(pageData);
            setIsLoading(false);
        } else if (pageId && !children) {
            // In a real implementation, this would fetch page data
            setIsLoading(true);
            setTimeout(() => {
                // Mock data loading
                setCurrentPage(null);
                setIsLoading(false);
            }, 1000);
        }
    }, [pageId, pageData]);

    if (error) {
        return (
            <div className="page-view-container">
                <div className="page-view__inner">
                    <div className="page-view__error">
                        <h2>Fehler beim Laden der Seite</h2>
                        <p>{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="page-view-container">
                <div className="page-view__inner page-view--loading">
                    <div className="page-view__loading">
                        Seite wird geladen...
                    </div>
                </div>
            </div>
        );
    }

    // If children are provided, use them directly (for custom layouts)
    if (children) {
        return (
            <div className="page-view-container">
                <div className="page-view__inner">
                    {children}
                </div>
            </div>
        );
    }

    // If page data is provided, render structured page
    if (currentPage) {
        return (
            <div className="page-view-container">
                <div className="page-view__inner">
                    <PageHeader 
                        title={currentPage.title}
                        subtitle={currentPage.subtitle}
                        author={currentPage.author}
                        readTime={calculatedReadingTime}
                        alignment={currentPage.headerAlignment || 'center'}
                    />
                    <PageContent content={currentPage.content} />
                </div>
            </div>
        );
    }

    // Fallback for no content
    return (
        <div className="page-view-container">
            <div className="page-view__inner">
                <div className="page-view__error">
                    <h2>Seite nicht gefunden</h2>
                    <p>Die angeforderte Seite konnte nicht geladen werden.</p>
                </div>
            </div>
        </div>
    );
};

export default PageView;