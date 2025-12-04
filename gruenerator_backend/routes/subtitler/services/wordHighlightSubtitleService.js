const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('wordHighlightSu');

/**
 * DISABLED - Word Highlight Subtitle Service
 * 
 * THIS SERVICE IS CURRENTLY DISABLED
 * TikTok-style word highlighting functionality has been commented out
 * Only manual subtitle mode is supported
 * 
 * Original description:
 * Generates individual word subtitles from OpenAI word timestamps
 * for TikTok/CapCut style word-by-word highlighting.
 * Each word gets its own subtitle timing for precise highlighting.
 */

/**
 * Configuration for word highlight generation
 */
const CONFIG = {
    minWordDuration: 0.1,     // Minimum duration for any word (100ms)
    maxWordDuration: 2.0,     // Maximum duration for any word (2s)
    paddingBefore: 0.0,       // Small padding before word starts
    paddingAfter: 0.0,        // Small padding after word ends
    // Words to exclude from highlighting (articles, conjunctions, etc.)
    skipWords: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines'],
    centerAlignment: true     // Center alignment for TikTok style
};

/**
 * Validates word timestamps array
 * @param {Array} words - Array of word timestamp objects
 * @throws {Error} - If validation fails
 */
function validateWordTimestamps(words) {
    if (!Array.isArray(words)) {
        throw new Error('Word timestamps must be an array');
    }
    
    if (words.length === 0) {
        throw new Error('Word timestamps array cannot be empty');
    }
    
    // Check first few words for proper structure
    for (let i = 0; i < Math.min(3, words.length); i++) {
        const word = words[i];
        if (!word || typeof word.word !== 'string' || typeof word.start !== 'number' || typeof word.end !== 'number') {
            throw new Error(`Invalid word timestamp structure at index ${i}. Expected: {word: string, start: number, end: number}`);
        }
        
        if (word.start < 0 || word.end < 0 || word.start >= word.end) {
            throw new Error(`Invalid timing at index ${i}: start=${word.start}, end=${word.end}`);
        }
    }
}

/**
 * Clean word text for display (remove punctuation for better highlighting)
 * @param {string} word - The word to clean
 * @returns {string} - Cleaned word text
 */
function cleanWordForDisplay(word) {
    // Keep German umlauts and essential characters
    return word.replace(/[.!?,:;""''()[\]{}]/g, '').trim();
}

/**
 * Check if word should be skipped for highlighting
 * @param {string} word - The word to check
 * @returns {boolean} - Whether to skip this word
 */
function shouldSkipWord(word) {
    const cleanWord = cleanWordForDisplay(word).toLowerCase();
    return CONFIG.skipWords.includes(cleanWord) || cleanWord.length <= 1;
}

/**
 * Apply timing constraints to ensure proper word durations
 * @param {number} startTime - Original start time
 * @param {number} endTime - Original end time
 * @returns {object} - Adjusted timing: {start, end, duration}
 */
function applyTimingConstraints(startTime, endTime) {
    let adjustedStart = Math.max(0, startTime + CONFIG.paddingBefore);
    let adjustedEnd = endTime + CONFIG.paddingAfter;
    
    // Calculate duration and apply constraints
    let duration = adjustedEnd - adjustedStart;
    
    // Ensure minimum duration
    if (duration < CONFIG.minWordDuration) {
        const needed = CONFIG.minWordDuration - duration;
        adjustedEnd += needed;
        duration = CONFIG.minWordDuration;
    }
    
    // Ensure maximum duration
    if (duration > CONFIG.maxWordDuration) {
        adjustedEnd = adjustedStart + CONFIG.maxWordDuration;
        duration = CONFIG.maxWordDuration;
    }
    
    return {
        start: adjustedStart,
        end: adjustedEnd,
        duration: duration
    };
}

/**
 * Prevent overlapping between consecutive words
 * @param {Array} wordSegments - Array of word segments with timing
 * @returns {Array} - Word segments with overlap prevention
 */
function preventWordOverlaps(wordSegments) {
    const adjustedSegments = [...wordSegments];
    
    for (let i = 0; i < adjustedSegments.length - 1; i++) {
        const currentWord = adjustedSegments[i];
        const nextWord = adjustedSegments[i + 1];
        
        // If current word overlaps with next word, adjust current word's end time
        if (currentWord.end > nextWord.start) {
            currentWord.end = Math.max(nextWord.start - 0.05, currentWord.start + CONFIG.minWordDuration);
            currentWord.duration = currentWord.end - currentWord.start;
            
            log.debug(`[WordHighlight] Prevented overlap: word "${currentWord.text}" adjusted to end at ${currentWord.end.toFixed(2)}s`);
        }
    }
    
    return adjustedSegments;
}

/**
 * Generate word-by-word subtitle segments from OpenAI word timestamps
 * @param {Array} words - Array of word objects: {word: string, start: number, end: number}
 * @param {string} fullText - Complete transcribed text (for reference)
 * @returns {Array} - Array of word segments: {start: number, end: number, text: string, isHighlight: boolean}
 */
function generateWordSegments(words, fullText) {
    validateWordTimestamps(words);
    
    log.debug(`[WordHighlightService] Processing ${words.length} words for individual highlighting`);
    
    const wordSegments = [];
    
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const cleanedText = cleanWordForDisplay(word.word);
        
        // Skip empty words or words that failed cleaning
        if (!cleanedText) {
            log.debug(`[WordHighlight] Skipping empty word at index ${i}: "${word.word}"`);
            continue;
        }
        
        // Apply timing constraints
        const timing = applyTimingConstraints(word.start, word.end);
        
        // Determine if this word should be highlighted
        const isHighlight = !shouldSkipWord(word.word);
        
        const segment = {
            start: timing.start,
            end: timing.end,
            text: cleanedText,
            originalText: word.word, // Keep original for context
            duration: timing.duration,
            isHighlight: isHighlight,
            wordIndex: i
        };
        
        wordSegments.push(segment);
        
        // Log details for first few and last few words for debugging
        const isDebugWord = i < 3 || i >= words.length - 3;
        if (isDebugWord) {
            log.debug(`[WordHighlight] Word ${i}: "${segment.text}" (${timing.start.toFixed(2)}s-${timing.end.toFixed(2)}s, highlight: ${isHighlight})`);
        }
    }
    
    // Prevent overlaps between consecutive words
    const finalSegments = preventWordOverlaps(wordSegments);
    
    log.debug(`[WordHighlightService] Generated ${finalSegments.length} word segments`);
    log.debug(`[WordHighlightService] Highlighted words: ${finalSegments.filter(s => s.isHighlight).length}`);
    
    return finalSegments;
}

/**
 * Format time for subtitle output (M:SS.s format)
 * @param {number} timeInSeconds - Time in seconds
 * @returns {string} - Formatted time string
 */
function formatTime(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const wholeSeconds = Math.floor(timeInSeconds % 60);
    const fractionalSecond = Math.floor((timeInSeconds % 1) * 10);
    return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${fractionalSecond}`;
}

/**
 * Format word segments into subtitle text format
 * @param {Array} segments - Array of word segment objects
 * @returns {string} - Formatted subtitle text
 */
function formatWordSegmentsToSubtitleText(segments) {
    return segments
        .map(segment => {
            const startTime = formatTime(segment.start);
            const endTime = formatTime(segment.end);
            // Add metadata for word highlighting mode
            const metadata = segment.isHighlight ? ' [HIGHLIGHT]' : ' [STATIC]';
            return `${startTime} - ${endTime}${metadata}\n${segment.text}`;
        })
        .join('\n\n');
}

/**
 * Main function to generate word highlight subtitles from word timestamps
 * @param {string} fullText - Complete transcribed text (for reference)
 * @param {Array} words - Array of word timestamp objects from OpenAI
 * @returns {string} - Formatted subtitle text ready for display
 */
async function generateWordHighlightSubtitles(fullText, words) {
    try {
        log.debug(`[WordHighlightService] Starting word highlight subtitle generation`);
        log.debug(`[WordHighlightService] Input: ${fullText.length} chars, ${words.length} words`);
        
        // Log first few words for debugging
        log.debug(`[WordHighlightService] First 3 words:`, 
            words.slice(0, 3).map(w => `"${w.word}": ${w.start.toFixed(2)}s-${w.end.toFixed(2)}s`));
        
        // Generate individual word segments
        const segments = generateWordSegments(words, fullText);
        
        // Format segments into subtitle text
        const subtitleText = formatWordSegmentsToSubtitleText(segments);
        
        // Log summary
        log.debug(`[WordHighlightService] Generated ${segments.length} word segments`);
        log.debug(`[WordHighlightService] Average duration: ${(segments.reduce((sum, s) => sum + s.duration, 0) / segments.length).toFixed(2)}s`);
        
        // Log first segment for verification
        if (segments.length > 0) {
            const firstSegment = segments[0];
            log.debug(`[WordHighlightService] First segment: ${formatTime(firstSegment.start)}-${formatTime(firstSegment.end)} "${firstSegment.text}" (highlight: ${firstSegment.isHighlight})`);
        }
        
        return subtitleText;
        
    } catch (error) {
        log.error('[WordHighlightService] Error generating word highlight subtitles:', error.message);
        throw new Error(`Word highlight subtitle generation failed: ${error.message}`);
    }
}

module.exports = {
    generateWordHighlightSubtitles,
    CONFIG,
    // Export utility functions for testing
    generateWordSegments,
    formatWordSegmentsToSubtitleText,
    validateWordTimestamps,
    cleanWordForDisplay,
    shouldSkipWord,
    applyTimingConstraints,
    preventWordOverlaps,
    formatTime
}; 