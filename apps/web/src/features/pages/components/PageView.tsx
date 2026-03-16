import React, { useState, useEffect, useMemo } from 'react';

import { cn } from '../../../utils/cn';
import { getReadingTime } from '../../../utils/readingTimeUtils';

import PageContent from './PageContent';
import PageHeader from './PageHeader';

interface ContentBlock {
  type:
    | 'paragraph'
    | 'heading2'
    | 'heading3'
    | 'heading4'
    | 'quote'
    | 'infoBox'
    | 'factBox'
    | 'callout'
    | 'timeline'
    | 'html';
  text?: string;
  author?: string;
  title?: string;
  items?: string[];
  variant?: string;
  content?: string;
  facts?: Array<{ number: string; label: string }>;
  buttonText?: string;
  buttonHref?: string;
  onClick?: () => void;
}

interface PageData {
  title?: string;
  subtitle?: string;
  author?: string;
  readTime?: string;
  content?: ContentBlock[];
  headerAlignment?: 'center' | 'left';
}

interface PageViewProps {
  pageId?: string;
  pageData?: PageData;
  children?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
}

const PageView = ({ pageId, pageData, children, loading = false, error = null }: PageViewProps) => {
  const [currentPage, setCurrentPage] = useState<PageData | null>(null);
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
  }, [
    currentPage?.content,
    currentPage?.readTime,
    pageData?.content,
    pageData?.readTime,
    children,
  ]);

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

  const containerClass =
    'max-w-[1200px] mx-auto py-xl px-md bg-background min-h-screen max-md:py-lg max-md:px-sm max-[480px]:py-md max-[480px]:px-xs min-[1025px]:py-2xl min-[1025px]:px-xl';
  const innerClass =
    'bg-background py-2xl px-xl max-md:py-xl max-md:px-md max-md:shadow-none max-md:rounded-none max-[480px]:py-lg max-[480px]:px-sm min-[769px]:max-[1024px]:rounded-xl min-[769px]:max-[1024px]:shadow-sm min-[769px]:max-[1024px]:transition-shadow min-[769px]:max-[1024px]:duration-300 min-[769px]:max-[1024px]:hover:shadow-md min-[1025px]:py-2xl min-[1025px]:px-[calc(var(--spacing-2xl)*1.5)]';

  if (error) {
    return (
      <div className={containerClass}>
        <div className={innerClass}>
          <div className="text-center py-2xl text-[var(--error-red)] bg-[var(--background-red-light)] rounded-lg my-xl">
            <h2>Fehler beim Laden der Seite</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={containerClass}>
        <div className={cn(innerClass, 'opacity-70')}>
          <div className="flex justify-center items-center min-h-[200px] text-grey-400 text-lg">
            Seite wird geladen...
          </div>
        </div>
      </div>
    );
  }

  // If children are provided, use them directly (for custom layouts)
  if (children) {
    return (
      <div className={containerClass}>
        <div className={innerClass}>{children}</div>
      </div>
    );
  }

  // If page data is provided, render structured page
  if (currentPage) {
    return (
      <div className={containerClass}>
        <div className={innerClass}>
          <PageHeader
            title={currentPage.title}
            subtitle={currentPage.subtitle}
            author={currentPage.author}
            readTime={calculatedReadingTime || undefined}
            alignment={currentPage.headerAlignment || 'center'}
          />
          <PageContent content={currentPage.content} />
        </div>
      </div>
    );
  }

  // Fallback for no content
  return (
    <div className={containerClass}>
      <div className={innerClass}>
        <div className="text-center py-2xl text-[var(--error-red)] bg-[var(--background-red-light)] rounded-lg my-xl">
          <h2>Seite nicht gefunden</h2>
          <p>Die angeforderte Seite konnte nicht geladen werden.</p>
        </div>
      </div>
    </div>
  );
};

export default PageView;
