import { useState, useCallback, useRef } from 'react';
import { processText } from '../components/utils/apiClient';
import { detectUrls, getNewUrls, getUrlDomain } from '../utils/urlDetection';

/**
 * Custom hook for URL crawling functionality
 * Manages state for detected URLs, crawling progress, and error handling
 * 
 * @param {Array<string>} initialUrls - URLs that are already processed
 * @returns {Object} Hook interface with state and methods
 */
export const useUrlCrawler = (initialUrls = []) => {
  const [crawledUrls, setCrawledUrls] = useState([]);
  const [crawlingUrls, setCrawlingUrls] = useState([]);
  const [crawlErrors, setCrawlErrors] = useState({});
  const processedUrlsRef = useRef(new Set(initialUrls));
  const inFlightUrlsRef = useRef(new Set());

  /**
   * Crawls a single URL and returns the attachment object
   * @param {string} url - URL to crawl
   * @param {boolean} usePrivacyMode - Whether to use privacy mode
   * @returns {Promise<Object|null>} Crawled attachment object or null on failure
   */
  const crawlUrl = useCallback(async (url, usePrivacyMode = false) => {
    // Skip if already processed
    if (processedUrlsRef.current.has(url)) {
      console.log(`[useUrlCrawler] URL already processed, skipping: ${url}`);
      return null;
    }

    // Skip if a crawl for this URL is already in-flight
    if (inFlightUrlsRef.current.has(url)) {
      console.log(`[useUrlCrawler] URL already being processed, skipping duplicate start: ${url}`);
      return null;
    }

    console.log(`[useUrlCrawler] Starting crawl for: ${url} (privacy: ${usePrivacyMode})`);
    
    inFlightUrlsRef.current.add(url);
    setCrawlingUrls(prev => (prev.includes(url) ? prev : [...prev, url]));
    setCrawlErrors(prev => ({ ...prev, [url]: null }));

    try {
      console.log(`[useUrlCrawler] Sending crawl request to /crawl-url for: ${url}`);
      const response = await processText('/crawl-url', {
        url,
        usePrivacyMode
      });

      if (response.success) {
        processedUrlsRef.current.add(url);
        setCrawledUrls(prev => {
          const exists = prev.some(item => item.url === response.attachment.url);
          if (exists) {
            return prev.map(item => item.url === response.attachment.url ? response.attachment : item);
          }
          return [...prev, response.attachment];
        });
        setCrawlingUrls(prev => prev.filter(u => u !== url));
        setCrawlErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[url];
          return newErrors;
        });
        
        console.log(`[useUrlCrawler] Successfully crawled: ${url} (${response.attachment.metadata?.wordCount || 0} words)`);
        return response.attachment;
      } else {
        throw new Error(response.error || 'Crawling failed');
      }
    } catch (error) {
      console.error(`[useUrlCrawler] Failed to crawl ${url}:`, error);
      
      // Map technical errors to user-friendly messages
      let userFriendlyError = error.message;
      
      if (error.response?.status === 400) {
        userFriendlyError = 'Ungültige URL oder Inhalt nicht verfügbar';
      } else if (error.response?.status === 429) {
        userFriendlyError = 'Zu viele Anfragen - bitte warten Sie einen Moment';
      } else if (error.response?.status >= 500) {
        userFriendlyError = 'Serverfehler - bitte versuchen Sie es später erneut';
      } else if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
        userFriendlyError = 'Zeitüberschreitung - die Seite antwortet nicht';
      } else if (error.message.includes('Network Error')) {
        userFriendlyError = 'Netzwerkfehler - bitte überprüfen Sie Ihre Verbindung';
      }

      setCrawlErrors(prev => ({
        ...prev,
        [url]: userFriendlyError
      }));
      setCrawlingUrls(prev => prev.filter(u => u !== url));
      return null;
    } finally {
      inFlightUrlsRef.current.delete(url);
    }
  }, []);

  /**
   * Detects new URLs in text and crawls them automatically
   * @param {string} text - Text content to analyze
   * @param {boolean} usePrivacyMode - Whether to use privacy mode
   * @returns {Promise<Array>} Array of successfully crawled attachments
   */
  const detectAndCrawlUrls = useCallback(async (text, usePrivacyMode = false) => {
    const newUrls = getNewUrls(text, Array.from(processedUrlsRef.current));
    
    if (newUrls.length === 0) {
      return [];
    }

    console.log(`[useUrlCrawler] Detected ${newUrls.length} new URLs:`, newUrls);

    // Crawl URLs in parallel with a maximum of 5 concurrent requests
    const crawlPromises = newUrls.slice(0, 5).map(url => crawlUrl(url, usePrivacyMode));
    const results = await Promise.allSettled(crawlPromises);
    
    const successfulCrawls = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    console.log(`[useUrlCrawler] Successfully crawled ${successfulCrawls.length} of ${newUrls.length} URLs`);
    
    return successfulCrawls;
  }, [crawlUrl]);

  /**
   * Retries crawling a failed URL
   * @param {string} url - URL to retry
   * @param {boolean} usePrivacyMode - Whether to use privacy mode
   * @returns {Promise<Object|null>} Crawled attachment or null
   */
  const retryUrl = useCallback(async (url, usePrivacyMode = false) => {
    console.log(`[useUrlCrawler] Retrying URL: ${url}`);
    
    // Remove from processed URLs to allow retry
    processedUrlsRef.current.delete(url);
    
    // Clear previous error
    setCrawlErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[url];
      return newErrors;
    });
    
    return await crawlUrl(url, usePrivacyMode);
  }, [crawlUrl]);

  /**
   * Removes a crawled URL from the list
   * @param {string} url - URL to remove
   */
  const removeCrawledUrl = useCallback((url) => {
    console.log(`[useUrlCrawler] Removing crawled URL: ${url}`);
    
    setCrawledUrls(prev => prev.filter(item => item.url !== url));
    processedUrlsRef.current.delete(url);
    
    // Clear any errors for this URL
    setCrawlErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[url];
      return newErrors;
    });
  }, []);

  /**
   * Gets summary statistics about crawling status
   * @returns {Object} Summary object with counts and status
   */
  const getSummary = useCallback(() => {
    const totalProcessed = processedUrlsRef.current.size;
    const totalCrawled = crawledUrls.length;
    const totalCrawling = crawlingUrls.length;
    const totalErrors = Object.keys(crawlErrors).length;
    
    return {
      totalProcessed,
      totalCrawled,
      totalCrawling,
      totalErrors,
      isActive: totalCrawling > 0,
      hasErrors: totalErrors > 0
    };
  }, [crawledUrls.length, crawlingUrls.length, crawlErrors]);

  /**
   * Clears all crawled URLs and resets state
   */
  const reset = useCallback(() => {
    console.log('[useUrlCrawler] Resetting all crawled URLs');
    
    setCrawledUrls([]);
    setCrawlingUrls([]);
    setCrawlErrors({});
    processedUrlsRef.current.clear();
  }, []);

  /**
   * Gets URLs that are currently being processed (crawling)
   * @returns {Array<string>} URLs currently being crawled
   */
  const getCurrentlyCrawlingUrls = useCallback(() => {
    return [...crawlingUrls];
  }, [crawlingUrls]);

  /**
   * Gets errors for specific URLs or all errors
   * @param {string} url - Optional specific URL to get error for
   * @returns {string|Object} Error message for URL or all errors
   */
  const getErrors = useCallback((url = null) => {
    if (url) {
      return crawlErrors[url] || null;
    }
    return { ...crawlErrors };
  }, [crawlErrors]);

  /**
   * Checks if a URL has been processed (successfully or with error)
   * @param {string} url - URL to check
   * @returns {boolean} True if URL has been processed
   */
  const isUrlProcessed = useCallback((url) => {
    return processedUrlsRef.current.has(url);
  }, []);

  return {
    // State
    crawledUrls,
    crawlingUrls,
    crawlErrors,
    
    // Computed state
    isCrawling: crawlingUrls.length > 0,
    hasErrors: Object.keys(crawlErrors).length > 0,
    hasCrawledContent: crawledUrls.length > 0,
    
    // Methods
    crawlUrl,
    detectAndCrawlUrls,
    retryUrl,
    removeCrawledUrl,
    reset,
    
    // Utility methods
    getSummary,
    getCurrentlyCrawlingUrls,
    getErrors,
    isUrlProcessed
  };
};

export default useUrlCrawler;