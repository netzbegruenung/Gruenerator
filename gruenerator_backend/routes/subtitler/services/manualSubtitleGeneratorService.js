/**
 * Manual Subtitle Generator Service
 *
 * Generates 2-second intelligent subtitle segments from OpenAI word timestamps
 * without using Claude AI. Uses punctuation detection and timing rules for
 * optimal readability.
 */

const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('manualSubtitle');

/**
 * Configuration for manual subtitle generation - Optimal Short Subtitles
 */
const CONFIG = {
    targetDuration: 1.8,     // Longer duration for better readability
    maxDuration: 2.5,        // Allow longer segments
    minDuration: 1.0,        // Minimum duration for comfortable reading
    minDurationPunctuation: 1.0,  // Minimum duration for punctuation-ended segments
    strongPunctuation: ['.', '!', '?'],  // Always end segment
    weakPunctuation: [',', ';', ':'],    // End segment if >min duration
    maxWordsPerSegment: 4,   // Max 4 words per segment for readability
    longWordThreshold: 15,   // Words longer than this get their own segment
    // Natural break words for smart phrase breaking
    breakWords: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
                 'von', 'zu', 'mit', 'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'für', 'ohne', 'gegen',
                 'und', 'oder', 'aber', 'doch', 'jedoch', 'sowie', 'als', 'wie', 'wenn', 'weil', 'dass', 'da']
};

/**
 * Detects if a word ends with punctuation
 * @param {string} word - The word to check
 * @returns {object} - { hasStrong: boolean, hasWeak: boolean, cleanWord: string }
 */
function detectPunctuation(word) {
    const cleanWord = word.trim();
    const lastChar = cleanWord.slice(-1);
    
    return {
        hasStrong: CONFIG.strongPunctuation.includes(lastChar),
        hasWeak: CONFIG.weakPunctuation.includes(lastChar),
        cleanWord: cleanWord
    };
}

/**
 * Formats time in seconds to MM:SS.s format for precision
 * @param {number} timeInSeconds - Time in seconds
 * @returns {string} - Formatted time string (MM:SS.s)
 */
function formatTime(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const wholeSeconds = Math.floor(timeInSeconds % 60);
    const fractionalSecond = Math.floor((timeInSeconds % 1) * 10); // Single decimal place
    return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${fractionalSecond}`;
}

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
 * Groups words into 2-second segments with intelligent punctuation handling
 * @param {Array} words - Array of word objects: {word: string, start: number, end: number}
 * @param {string} fullText - Complete transcribed text for punctuation reference
 * @returns {Array} - Array of segments: {start: number, end: number, text: string}
 */
function groupWordsIntoSegments(words, fullText) {
    validateWordTimestamps(words);
    
    const segments = [];
    let currentSegment = {
        words: [],
        wordIndices: [], // Track word indices for text extraction
        start: words[0].start,
        end: words[0].start
    };
    
    log.debug(`Processing ${words.length} words`);

    // Build a comprehensive word position map for both punctuation detection and text extraction
    let textPosition = 0;
    const wordPositions = words.map((word, index) => {
        // German-aware word cleaning: only remove common punctuation, preserve umlauts
        const cleanWord = word.word.replace(/[.!?,:;""''()[\]{}]/g, ''); // Keep umlauts ä, ö, ü, ß

        const wordStart = fullText.toLowerCase().indexOf(cleanWord.toLowerCase(), textPosition);
        if (wordStart !== -1) {
            // Find the actual end of this word in the original text (including any punctuation)
            let wordEnd = wordStart + cleanWord.length;
            // Look ahead for punctuation immediately following this word (German-aware)
            while (wordEnd < fullText.length && /[.!?,:;""''()[\]{}]/.test(fullText[wordEnd])) {
                wordEnd++;
            }
            // Skip any trailing whitespace for the next search
            textPosition = wordEnd;
            while (textPosition < fullText.length && /\s/.test(fullText[textPosition])) {
                textPosition++;
            }
            
            return { 
                wordIndex: index, 
                textStart: wordStart, 
                textEnd: wordEnd,
                actualText: fullText.slice(wordStart, wordEnd)
            };
        }
        return null;
    }).filter(Boolean);
    
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const cleanWordLength = word.word.replace(/[.!?,:;""''()\[\]{}]/g, '').length;
        const isLongWord = cleanWordLength >= CONFIG.longWordThreshold;

        // If this is a long word and we already have words in the segment,
        // end the current segment first so the long word gets its own segment
        if (isLongWord && currentSegment.words.length > 0) {
            // Finalize current segment before the long word
            const firstWordIndex = currentSegment.wordIndices[0];
            const lastWordIndex = currentSegment.wordIndices[currentSegment.wordIndices.length - 1];
            const firstWordPos = wordPositions.find(pos => pos.wordIndex === firstWordIndex);
            const lastWordPos = wordPositions.find(pos => pos.wordIndex === lastWordIndex);

            let segmentText = '';
            if (firstWordPos && lastWordPos) {
                segmentText = fullText.slice(firstWordPos.textStart, lastWordPos.textEnd).trim();
            } else {
                segmentText = currentSegment.words.join(' ').trim();
            }

            segments.push({
                start: currentSegment.start,
                end: words[i - 1].end,
                text: segmentText,
                duration: words[i - 1].end - currentSegment.start,
                reason: 'before long word'
            });

            // Start fresh segment for the long word
            currentSegment = {
                words: [],
                wordIndices: [],
                start: word.start,
                end: word.start
            };
        }

        // Add word to current segment
        currentSegment.words.push(word.word);
        currentSegment.wordIndices.push(i);
        
        // --- START: Overlap Prevention & Smart Timing ---
        const nextWord = (i + 1 < words.length) ? words[i + 1] : null;

        // The absolute latest this segment can end is the start of the next word.
        // If there is no next word, allow it to extend freely.
        const maxAllowedEnd = nextWord ? nextWord.start : word.end + 5.0;

        // Start with the actual end time of the current word.
        let potentialEnd = word.end;

        // If the segment would be too short, try to extend it to the minimum duration.
        if (potentialEnd - currentSegment.start < CONFIG.minDuration) {
            potentialEnd = currentSegment.start + CONFIG.minDuration;
        }

        // Clamp the end time to prevent any overlap with the next word.
        // This is the crucial step that guarantees perfect timing for subsequent segments.
        currentSegment.end = Math.min(potentialEnd, maxAllowedEnd);
        // --- END: Overlap Prevention & Smart Timing ---
        
        // Calculate potential segment duration using corrected end time
        const potentialDuration = currentSegment.end - currentSegment.start;
        
        // Check for punctuation after this word in the full text
        let hasPunctuationAfter = false;
        let punctuationType = '';
        
        const wordPos = wordPositions.find(pos => pos.wordIndex === i);
        if (wordPos) {
            // Check if the actual text includes punctuation
            if (/[.!?]$/.test(wordPos.actualText)) {
                hasPunctuationAfter = true;
                punctuationType = 'strong';
            } else if (/[,;:]$/.test(wordPos.actualText)) {
                hasPunctuationAfter = true;
                punctuationType = 'weak';
            }
        }
        
        // Fallback: check the word itself for punctuation (German-aware)
        if (!hasPunctuationAfter) {
            const wordPunctuation = detectPunctuation(word.word);
            if (wordPunctuation.hasStrong || wordPunctuation.hasWeak) {
                hasPunctuationAfter = true;
                punctuationType = wordPunctuation.hasStrong ? 'strong' : 'weak';
            }
        }
        
        // Decision logic for ending current segment with smart phrase breaking
        let shouldEndSegment = false;
        let reason = '';

        // Rule 0: Long words (like "Sozialversicherungsbeiträge") get their own segment
        if (isLongWord) {
            shouldEndSegment = true;
            reason = 'long word';
        }
        // Rule 1: Max words per segment (Hard Limit)
        else if (currentSegment.words.length >= CONFIG.maxWordsPerSegment) {
            shouldEndSegment = true;
            reason = 'max words';
        }
        // Rule 2: Strong punctuation always ends segment immediately
        else if (hasPunctuationAfter && punctuationType === 'strong') {
            shouldEndSegment = true;
            reason = 'strong punctuation';
        }
        // Rule 3: Weak punctuation ends segment if >min duration
        else if (hasPunctuationAfter && punctuationType === 'weak' && potentialDuration >= CONFIG.minDurationPunctuation) {
            shouldEndSegment = true;
            reason = 'weak punctuation';
        }
        // Rule 4: Smart phrase breaking - target duration reached, look for natural break
        else if (potentialDuration >= CONFIG.targetDuration) {
            const smartBreakResult = findSmartBreakPoint(currentSegment, i, words, potentialDuration);
            if (smartBreakResult.shouldBreak) {
                shouldEndSegment = true;
                reason = smartBreakResult.reason;
            }
        }
        // Rule 5: Absolute maximum duration reached - force break
        else if (potentialDuration >= CONFIG.maxDuration) {
            shouldEndSegment = true;
            reason = 'max duration (forced)';
        }
        
        // If this is the last word, always end segment
        if (i === words.length - 1) {
            shouldEndSegment = true;
            reason = 'last word';
        }
        
        // End current segment and start new one
        if (shouldEndSegment) {
            // Extract actual text with punctuation from full text
            let segmentText = '';
            if (currentSegment.wordIndices.length > 0) {
                const firstWordIndex = currentSegment.wordIndices[0];
                const lastWordIndex = currentSegment.wordIndices[currentSegment.wordIndices.length - 1];
                
                const firstWordPos = wordPositions.find(pos => pos.wordIndex === firstWordIndex);
                const lastWordPos = wordPositions.find(pos => pos.wordIndex === lastWordIndex);
                
                if (firstWordPos && lastWordPos) {
                    // Extract the complete text segment with punctuation preserved
                    segmentText = fullText.slice(firstWordPos.textStart, lastWordPos.textEnd).trim();
                } else {
                    // Fallback to word joining if position mapping fails
                    segmentText = currentSegment.words.join(' ').trim();
                    log.warn('Position mapping failed, using word join fallback');
                }
            } else {
                segmentText = currentSegment.words.join(' ').trim();
            }
            
            const duration = currentSegment.end - currentSegment.start;
            
            segments.push({
                start: currentSegment.start,
                end: currentSegment.end,
                text: segmentText,
                duration: duration,
                reason: reason
            });

            // Start new segment (if not last word)
            if (i < words.length - 1) {
                const nextWord = words[i + 1];
                
                // Always use precise word timing for segment starts - no artificial rounding
                currentSegment = {
                    words: [],
                    wordIndices: [],
                    start: nextWord.start,
                    end: nextWord.start
                };
            }
        }
    }
    
    // Post-process segments to merge zero-duration ones intelligently
    // const mergedSegments = mergeZeroDurationSegments(segments); // This function is removed
    
    // Apply elastic timing to fill small gaps during continuous speech
    const finalSegments = applyElasticTiming(segments);
    
    return finalSegments;
}

/**
 * Finds the optimal break point for smart phrase breaking
 * Analyzes current segment and upcoming words to find natural linguistic boundaries
 * @param {Object} currentSegment - Current segment being built
 * @param {number} currentWordIndex - Index of current word being processed
 * @param {Array} words - Array of all word objects
 * @param {number} currentDuration - Current segment duration
 * @returns {Object} - {shouldBreak: boolean, reason: string}
 */
function findSmartBreakPoint(currentSegment, currentWordIndex, words, currentDuration) {
    // Strategy: Look ahead 1-3 words to find a natural break point
    const lookaheadWords = 3;
    const currentWord = words[currentWordIndex];
    
    // Check if current word is a natural break word (German-aware)
    const currentWordClean = currentWord.word.toLowerCase().replace(/[.!?,:;""''()[\]{}]/g, '');
    if (CONFIG.breakWords.includes(currentWordClean)) {
        return {
            shouldBreak: true,
            reason: `smart break (after "${currentWordClean}")`
        };
    }
    
    // Look ahead for break words in the next few words
    for (let i = 1; i <= lookaheadWords && (currentWordIndex + i) < words.length; i++) {
        const futureWord = words[currentWordIndex + i];
        const futureWordClean = futureWord.word.toLowerCase().replace(/[.!?,:;""''()[\]{}]/g, '');
        
        // Calculate what duration would be if we continue to this break word
        const futureDuration = futureWord.end - currentSegment.start;
        
        // If we find a break word and duration would still be reasonable
        if (CONFIG.breakWords.includes(futureWordClean) && futureDuration <= CONFIG.maxDuration) {
            return {
                shouldBreak: false, // Don't break yet, continue to the break word
                reason: `continuing to break word "${futureWordClean}"`
            };
        }
        
        // If duration would exceed max, break now instead of waiting
        if (futureDuration > CONFIG.maxDuration) {
            break;
        }
    }
    
    // Check for natural word gaps (pauses in speech) within current segment
    if (currentWordIndex > 0) {
        const prevWord = words[currentWordIndex - 1];
        const wordGap = currentWord.start - prevWord.end;
        
        // If there's a natural pause (>0.1s gap) between words, good break point
        if (wordGap > 0.1) {
            return {
                shouldBreak: true,
                reason: `smart break (natural pause: ${wordGap.toFixed(1)}s)`
            };
        }
    }
    
    // If no natural break found and we're close to target duration, break anyway
    if (currentDuration >= CONFIG.targetDuration * 0.85) { // 85% of target (more aggressive)
        return {
            shouldBreak: true,
            reason: 'smart break (target duration reached)'
        };
    }
    
    // Continue building segment
    return {
        shouldBreak: false,
        reason: 'continuing (no natural break found yet)'
    };
}

/**
 * Applies elastic timing to fill small gaps between segments during continuous speech
 * Extends segment end times to bridge gaps < 1.0s while preserving precise start times
 * @param {Array} segments - Array of segment objects
 * @returns {Array} - Segments with elastic timing applied
 */
function applyElasticTiming(segments) {
    if (segments.length === 0) return segments;
    
    const elasticSegments = [...segments]; // Create copy to avoid mutation
    const maxGapToFill = 0.6; // Fill gaps smaller than 0.6 seconds (adjusted for shorter segments)
    
    for (let i = 0; i < elasticSegments.length - 1; i++) {
        const currentSegment = elasticSegments[i];
        const nextSegment = elasticSegments[i + 1];
        
        // Calculate gap between current segment end and next segment start
        const gap = nextSegment.start - currentSegment.end;
        
        if (gap > 0 && gap < maxGapToFill) {
            // Small gap detected - extend current segment to bridge it
            const originalEnd = currentSegment.end;

            // Extend to just before next segment starts (leave 0.1s buffer)
            currentSegment.end = Math.max(nextSegment.start - 0.1, originalEnd);
            currentSegment.duration = currentSegment.end - currentSegment.start;
        }
        // If gap <= 0 or >= maxGapToFill, no action needed
    }
    
    return elasticSegments;
}

/**
 * Formats segments into the expected subtitle text format
 * @param {Array} segments - Array of segment objects
 * @returns {string} - Formatted subtitle text
 */
function formatSegmentsToSubtitleText(segments) {
    return segments
        .map(segment => {
            const startTime = formatTime(segment.start);
            const endTime = formatTime(segment.end);
            return `${startTime} - ${endTime}\n${segment.text}`;
        })
        .join('\n\n');
}

/**
 * Main function to generate manual subtitles from word timestamps
 * @param {string} fullText - Complete transcribed text (for reference)
 * @param {Array} words - Array of word timestamp objects from OpenAI
 * @returns {string} - Formatted subtitle text ready for display
 */
async function generateManualSubtitles(fullText, words) {
    try {
        // Generate segments using word grouping algorithm with full text for punctuation detection
        const segments = groupWordsIntoSegments(words, fullText);

        // Format segments into subtitle text
        const subtitleText = formatSegmentsToSubtitleText(segments);

        // Log summary
        const avgDuration = segments.length > 0 ? (segments.reduce((sum, s) => sum + s.duration, 0) / segments.length).toFixed(1) : 0;
        log.info(`Generated ${segments.length} segments, avg duration: ${avgDuration}s`);

        return subtitleText;

    } catch (error) {
        log.error(`Error generating manual subtitles: ${error.message}`);
        throw new Error(`Manual subtitle generation failed: ${error.message}`);
    }
}

module.exports = {
    generateManualSubtitles,
    CONFIG,
    // Export utility functions for testing
    detectPunctuation,
    formatTime,
    groupWordsIntoSegments,
    formatSegmentsToSubtitleText,
    validateWordTimestamps,
    findSmartBreakPoint,
    applyElasticTiming
};