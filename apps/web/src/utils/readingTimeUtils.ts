import React from 'react';

// Reading time result
interface ReadingTimeResult {
  minutes: number;
  words: number;
}

// Reading time stats
interface ReadingTimeStats {
  text: string;
  minutes: number;
  time: number;
  words: number;
}

// Options for reading time calculation
interface ReadingTimeOptions {
  wordsPerMinute?: number;
  includeSeconds?: boolean;
}

// Content block types for structured content
interface ContentBlock {
  type: string;
  text?: string;
  title?: string;
  content?: string;
  author?: string;
  items?: Array<string | { text?: string }>;
  facts?: Array<{ number?: string; label?: string }>;
  buttonText?: string;
  date?: string;
}

// Browser-compatible reading time calculation
// Avoids Node.js dependencies that cause "util.inherits is not a function" errors
const calculateReadingTimeFromText = (
  text: string,
  wordsPerMinute: number = 200
): ReadingTimeResult => {
  if (!text || typeof text !== 'string') {
    return { minutes: 0, words: 0 };
  }

  // Count words (similar to reading-time package logic)
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  const minutes = words / wordsPerMinute;

  return { minutes, words };
};

/**
 * Extract text content from React children (JSX elements)
 * Recursively traverses React nodes to extract readable text
 */
const extractTextFromReactChildren = (children: React.ReactNode): string => {
  let text = '';

  React.Children.forEach(children, (child) => {
    if (typeof child === 'string') {
      text += child + ' ';
    } else if (typeof child === 'number') {
      text += child.toString() + ' ';
    } else if (React.isValidElement(child)) {
      // Handle React elements by extracting props.children recursively
      const props = child.props as {
        children?: React.ReactNode;
        text?: string;
        title?: string;
        subtitle?: string;
        author?: string;
        content?: string;
      };
      if (props && props.children) {
        text += extractTextFromReactChildren(props.children) + ' ';
      }

      // Extract text from common text-containing props
      if (props) {
        const { text: propsText, title, subtitle, author, content } = props;
        if (propsText) text += propsText + ' ';
        if (title) text += title + ' ';
        if (subtitle) text += subtitle + ' ';
        if (author) text += author + ' ';
        if (content && typeof content === 'string') text += content + ' ';
      }
    } else if (Array.isArray(child)) {
      text += extractTextFromReactChildren(child) + ' ';
    }
  });

  return text;
};

/**
 * Extract text from structured content blocks
 * Handles the array-based content format used in PageContent
 */
const extractTextFromStructuredBlocks = (blocks: ContentBlock[]): string => {
  let text = '';

  blocks.forEach((block) => {
    switch (block.type) {
      case 'paragraph':
      case 'heading2':
      case 'heading3':
      case 'heading4':
        if (block.text) text += block.text + ' ';
        break;

      case 'quote':
        if (block.text) text += block.text + ' ';
        if (block.author) text += block.author + ' ';
        break;

      case 'infoBox':
        if (block.title) text += block.title + ' ';
        if (block.content) text += block.content + ' ';
        if (block.items && Array.isArray(block.items)) {
          block.items.forEach((item) => {
            if (typeof item === 'string') {
              text += item + ' ';
            } else if ((item as { text?: string }).text) {
              text += (item as { text: string }).text + ' ';
            }
          });
        }
        break;

      case 'factBox':
        if (block.facts && Array.isArray(block.facts)) {
          block.facts.forEach((fact) => {
            if (fact.number) text += fact.number + ' ';
            if (fact.label) text += fact.label + ' ';
          });
        }
        break;

      case 'callout':
        if (block.title) text += block.title + ' ';
        if (block.text) text += block.text + ' ';
        if (block.buttonText) text += block.buttonText + ' ';
        break;

      case 'timeline':
        if (block.items && Array.isArray(block.items)) {
          block.items.forEach((item) => {
            const timelineItem = item as { date?: string; title?: string; content?: string };
            if (timelineItem.date) text += timelineItem.date + ' ';
            if (timelineItem.title) text += timelineItem.title + ' ';
            if (timelineItem.content) text += timelineItem.content + ' ';
          });
        }
        break;

      case 'html':
        if (block.content) {
          // Strip HTML tags and extract text
          const htmlText = block.content.replace(/<[^>]*>/g, '');
          text += htmlText + ' ';
        }
        break;

      default:
        // Try to extract any text-like properties
        if (block.text) text += block.text + ' ';
        if (block.content && typeof block.content === 'string') {
          text += block.content + ' ';
        }
        break;
    }
  });

  return text;
};

/**
 * Extract plain text from HTML string
 * Removes HTML tags and extracts readable content
 */
const extractTextFromHTML = (html: unknown): string => {
  if (typeof html !== 'string') return '';

  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, '') // Remove style blocks
    .replace(/<script[^>]*>.*?<\/script>/gis, '') // Remove script blocks
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

/**
 * Main function to extract text from various content formats
 * Handles structured blocks, React children, strings, and HTML
 */
const extractTextFromContent = (
  content: React.ReactNode | ContentBlock[] | string | null | undefined,
  children: React.ReactNode
): string => {
  let text = '';

  // Extract from React children (JSX)
  if (children) {
    text += extractTextFromReactChildren(children);
  }

  // Extract from structured content
  if (content) {
    if (Array.isArray(content)) {
      // Structured blocks format
      text += extractTextFromStructuredBlocks(content as ContentBlock[]);
    } else if (typeof content === 'string') {
      // Plain string or HTML string
      if (content.includes('<') && content.includes('>')) {
        // Looks like HTML
        text += extractTextFromHTML(content);
      } else {
        // Plain text
        text += content;
      }
    } else if (React.isValidElement(content)) {
      // React element
      text += extractTextFromReactChildren([content]);
    }
  }

  return text.trim();
};

/**
 * Format reading time for German locale
 * Handles singular/plural forms properly
 */
const formatReadingTime = (minutes: number): string => {
  if (minutes < 1) {
    return '< 1 Min. Lesezeit';
  }

  const roundedMinutes = Math.ceil(minutes);
  return `${roundedMinutes} Min. Lesezeit`;
};

/**
 * Calculate reading time from extracted text
 * Browser-compatible implementation with German formatting
 */
const calculateReadingTime = (text: string, options: ReadingTimeOptions = {}): string => {
  const {
    wordsPerMinute = 200, // Average reading speed in German
    includeSeconds = false,
  } = options;

  if (!text || text.trim().length === 0) {
    return '< 1 Min. Lesezeit';
  }

  try {
    const stats = calculateReadingTimeFromText(text, wordsPerMinute);

    if (includeSeconds) {
      // Return detailed format if needed
      const totalSeconds = Math.round(stats.minutes * 60);
      if (totalSeconds < 60) {
        return `${totalSeconds} Sekunden Lesezeit`;
      }
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')} Min. Lesezeit`;
    }

    return formatReadingTime(stats.minutes);
  } catch (error) {
    console.warn('Error calculating reading time:', error);
    return '< 1 Min. Lesezeit';
  }
};

/**
 * Main utility function to get reading time from page content
 * Automatically detects content format and calculates reading time
 */
export const getReadingTime = (
  content: React.ReactNode | ContentBlock[] | string | null | undefined,
  children: React.ReactNode,
  options: ReadingTimeOptions = {}
): string => {
  const text = extractTextFromContent(content, children);
  return calculateReadingTime(text, options);
};

/**
 * Get reading time stats (detailed information)
 * Returns detailed stats with browser-compatible implementation
 */
export const getReadingTimeStats = (
  content: React.ReactNode | ContentBlock[] | string | null | undefined,
  children: React.ReactNode,
  options: ReadingTimeOptions = {}
): ReadingTimeStats => {
  const { wordsPerMinute = 200 } = options;
  const text = extractTextFromContent(content, children);

  if (!text || text.trim().length === 0) {
    return {
      text: '< 1 Min. Lesezeit',
      minutes: 0,
      time: 0,
      words: 0,
    };
  }

  try {
    const stats = calculateReadingTimeFromText(text, wordsPerMinute);
    return {
      text: formatReadingTime(stats.minutes),
      minutes: stats.minutes,
      time: Math.round(stats.minutes * 60 * 1000), // time in milliseconds
      words: stats.words,
    };
  } catch (error) {
    console.warn('Error calculating reading time stats:', error);
    return {
      text: '< 1 Min. Lesezeit',
      minutes: 0,
      time: 0,
      words: 0,
    };
  }
};

/**
 * Extract just the text content (useful for debugging)
 */
export const extractText = (
  content: React.ReactNode | ContentBlock[] | string | null | undefined,
  children: React.ReactNode
): string => {
  return extractTextFromContent(content, children);
};

export default getReadingTime;
