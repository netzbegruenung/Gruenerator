const fs = require('fs').promises;
const path = require('path');

class ImagePickerService {
  constructor() {
    this.imageCatalog = null;
    this.catalogPath = path.join(__dirname, '../public/sharepic_example_bg/image_alt_texts.json');
    this.cache = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.loadImageCatalog();
      this.initialized = true;
      console.log('[ImagePicker] Service initialized successfully');
    } catch (error) {
      console.error('[ImagePicker] Failed to initialize:', error);
      throw error;
    }
  }

  async loadImageCatalog() {
    try {
      const catalogData = await fs.readFile(this.catalogPath, 'utf8');
      this.imageCatalog = JSON.parse(catalogData);
      console.log(`[ImagePicker] Loaded ${this.imageCatalog.images.length} images from catalog`);
    } catch (error) {
      console.error('[ImagePicker] Failed to load image catalog:', error);
      throw new Error('Could not load image catalog');
    }
  }

  extractKeywords(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const textLower = text.toLowerCase();

    // Key themes for Green Party content
    const themeKeywords = {
      environment: ['klima', 'umwelt', 'natur', 'nachhaltig', 'öko', 'grün', 'climate', 'environment', 'nature', 'sustainable', 'green', 'erneuerbar', 'renewable', 'solar', 'wind', 'energie', 'energy'],
      transport: ['verkehr', 'zug', 'bahn', 'bus', 'fahrrad', 'öpnv', 'mobilität', 'transport', 'train', 'bicycle', 'mobility', 'public'],
      social: ['gleichberechtigung', 'vielfalt', 'pride', 'lgbtq', 'community', 'gemeinschaft', 'sozial', 'equality', 'diversity', 'rights', 'familie', 'family'],
      politics: ['europa', 'eu', 'demokratie', 'politik', 'wahl', 'europe', 'democracy', 'politics', 'election', 'union'],
      education: ['bildung', 'schule', 'lernen', 'wissen', 'education', 'school', 'learning', 'knowledge', 'student'],
      agriculture: ['landwirtschaft', 'bio', 'farm', 'essen', 'food', 'organic', 'agriculture', 'farming'],
      drought: ['dürre', 'trocken', 'wassermangel', 'drought', 'dry', 'crisis'],
      positive: ['erfolg', 'freude', 'hoffnung', 'zukunft', 'success', 'joy', 'hope', 'future', 'feier', 'celebration']
    };

    const extractedKeywords = [];
    const detectedThemes = [];

    // Extract themes
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      const matches = keywords.filter(keyword => textLower.includes(keyword));
      if (matches.length > 0) {
        detectedThemes.push(theme);
        extractedKeywords.push(...matches);
      }
    }

    // Extract individual words (filter out common words)
    const commonWords = ['der', 'die', 'das', 'und', 'oder', 'ein', 'eine', 'ist', 'sind', 'hat', 'haben', 'wird', 'werden', 'the', 'and', 'or', 'a', 'an', 'is', 'are', 'has', 'have', 'will', 'be'];
    const words = textLower.match(/\b\w{3,}\b/g) || [];
    const meaningfulWords = words.filter(word => !commonWords.includes(word));

    return {
      themes: detectedThemes,
      keywords: [...new Set([...extractedKeywords, ...meaningfulWords.slice(0, 10)])], // Limit to 10 most relevant words
      originalText: text
    };
  }

  filterByTags(analysis, maxCandidates = 10) {
    if (!this.imageCatalog || !this.imageCatalog.images) {
      throw new Error('Image catalog not loaded');
    }

    const images = this.imageCatalog.images;
    const scores = new Map();

    // Score each image based on keyword and theme matches
    images.forEach(image => {
      let score = 0;
      const imageTags = image.tags || [];
      const imageCategory = image.category || '';

      // Theme-category matching (high weight)
      if (analysis.themes.includes(imageCategory)) {
        score += 10;
      }

      // Keyword-tag matching
      analysis.keywords.forEach(keyword => {
        if (imageTags.some(tag => tag.includes(keyword) || keyword.includes(tag))) {
          score += 5;
        }
        // Check alt text for keyword matches
        if (image.alt_text && image.alt_text.toLowerCase().includes(keyword)) {
          score += 3;
        }
      });

      // Avoid negative imagery for positive contexts
      if (analysis.themes.includes('positive') && imageTags.some(tag => ['drought', 'crisis', 'warning'].includes(tag))) {
        score = Math.max(0, score - 15);
      }

      // Boost appropriate political imagery
      if (analysis.themes.includes('politics') && imageTags.includes('eu')) {
        score += 8;
      }

      // Boost LGBTQ+ imagery for social/diversity content
      if (analysis.themes.includes('social') && imageTags.includes('pride')) {
        score += 8;
      }

      if (score > 0) {
        scores.set(image, score);
      }
    });

    // Sort by score and return top candidates
    const sortedCandidates = Array.from(scores.entries())
      .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
      .slice(0, maxCandidates)
      .map(([image, score]) => ({ ...image, matchScore: score }));

    console.log(`[ImagePicker] Filtered to ${sortedCandidates.length} candidates from ${images.length} total images`);

    return sortedCandidates;
  }

  async rankWithLLM(text, candidates, aiWorkerPool, req = null) {
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidates provided for LLM ranking');
    }

    // If only one candidate, return it directly
    if (candidates.length === 1) {
      return {
        selectedImage: candidates[0],
        confidence: 0.8,
        reasoning: 'Single candidate matched filters',
        alternatives: []
      };
    }

    try {
      // Prepare data for AI worker
      const systemPrompt = `Du bist ein Experte für visuelle Kommunikation der Grünen Partei. Deine Aufgabe ist es, das beste Hintergrundbild für einen gegebenen Text auszuwählen.

Berücksichtige dabei:
1. Thematische Relevanz zum Text
2. Politische Angemessenheit für Grüne Inhalte
3. Visuelle Harmonie mit dem Text
4. Emotionale Wirkung der Bildkombination

Antworte NUR mit einem gültigen JSON-Objekt. Beginne deine Antwort direkt mit { und ende mit }.

Verwende das folgende Format:
{
  "selectedFilename": "dateiname.jpg",
  "confidence": 0.85,
  "alternativeFilenames": ["alternative1.jpg", "alternative2.jpg"]
}`;

      const imageList = candidates.map((img, index) =>
        `${index + 1}. Datei: ${img.filename}
   Kategorie: ${img.category}
   Tags: ${img.tags.join(', ')}
   Beschreibung: ${img.alt_text}
   Filter-Score: ${img.matchScore}`
      ).join('\n\n');

      const userPrompt = `Text für Sharepic: "${text}"

Verfügbare Bilder:
${imageList}

Wähle das beste Bild aus.`;

      const result = await aiWorkerPool.processRequest({
        type: 'image_picker',
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        options: {
          temperature: 0.2,
          max_tokens: 200,
          provider: 'mistral'
        }
      }, req);

      // Parse AI response
      let aiResponse;
      try {
        // Try to extract JSON from the response
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.warn('[ImagePicker] Failed to parse AI response, using fallback:', parseError);
        // Fallback to highest scoring candidate
        return {
          selectedImage: candidates[0],
          confidence: 0.6,
          reasoning: 'AI parsing failed, used highest-scored candidate',
          alternatives: candidates.slice(1, 4)
        };
      }

      // Find the selected image
      const selectedImage = candidates.find(img => img.filename === aiResponse.selectedFilename);
      if (!selectedImage) {
        console.warn('[ImagePicker] AI selected unknown image, using fallback');
        return {
          selectedImage: candidates[0],
          confidence: 0.6,
          reasoning: 'AI selected unknown image, used highest-scored candidate',
          alternatives: candidates.slice(1, 4)
        };
      }

      // Find alternatives
      const alternatives = aiResponse.alternativeFilenames
        ? aiResponse.alternativeFilenames
            .map(filename => candidates.find(img => img.filename === filename))
            .filter(Boolean)
        : candidates.filter(img => img.filename !== selectedImage.filename).slice(0, 3);

      return {
        selectedImage,
        confidence: Math.min(Math.max(aiResponse.confidence || 0.7, 0.1), 1.0),
        reasoning: 'AI selected',
        alternatives: alternatives.slice(0, 3)
      };

    } catch (error) {
      console.error('[ImagePicker] LLM ranking failed:', error);
      // Fallback to highest scoring candidate
      return {
        selectedImage: candidates[0],
        confidence: 0.5,
        reasoning: 'LLM ranking failed, used highest-scored candidate',
        alternatives: candidates.slice(1, 4)
      };
    }
  }

  async selectBestImage(text, aiWorkerPool, options = {}, req = null) {
    await this.initialize();

    if (!text || typeof text !== 'string') {
      throw new Error('Valid text is required for image selection');
    }

    // Check cache first
    const cacheKey = `${text.substring(0, 100)}_${JSON.stringify(options)}`;
    if (this.cache.has(cacheKey)) {
      console.log('[ImagePicker] Cache hit for text selection');
      return this.cache.get(cacheKey);
    }

    try {
      console.log(`[ImagePicker] Selecting image for text: "${text.substring(0, 100)}..."`);

      // Step 1: Extract keywords and themes
      const analysis = this.extractKeywords(text);
      console.log(`[ImagePicker] Detected themes: ${analysis.themes.join(', ')}`);
      console.log(`[ImagePicker] Extracted keywords: ${analysis.keywords.slice(0, 5).join(', ')}`);

      // Step 2: Filter by tags to get candidates
      const candidates = this.filterByTags(analysis, options.maxCandidates || 8);

      if (candidates.length === 0) {
        // No matches found, return a safe fallback
        const fallbackImage = this.imageCatalog.images.find(img =>
          img.tags.includes('sunflower') ||
          img.category === 'nature' ||
          img.tags.includes('nature')
        ) || this.imageCatalog.images[0];

        const result = {
          selectedImage: fallbackImage,
          confidence: 0.3,
          reasoning: 'No relevant matches found, using nature fallback',
          alternatives: [],
          metadata: {
            totalImages: this.imageCatalog.images.length,
            candidatesFound: 0,
            themes: analysis.themes,
            keywords: analysis.keywords.slice(0, 5)
          }
        };

        this.cache.set(cacheKey, result);
        return result;
      }

      // Step 3: Use LLM to rank candidates
      const ranking = await this.rankWithLLM(text, candidates, aiWorkerPool, req);

      const result = {
        ...ranking,
        metadata: {
          totalImages: this.imageCatalog.images.length,
          candidatesFound: candidates.length,
          themes: analysis.themes,
          keywords: analysis.keywords.slice(0, 5)
        }
      };

      // Cache the result
      this.cache.set(cacheKey, result);

      // Clear cache if it gets too large
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      console.log(`[ImagePicker] Selected: ${result.selectedImage.filename} (confidence: ${result.confidence})`);
      return result;

    } catch (error) {
      console.error('[ImagePicker] Error selecting image:', error);

      // Emergency fallback
      const fallbackImage = this.imageCatalog.images[0];
      return {
        selectedImage: fallbackImage,
        confidence: 0.1,
        reasoning: `Error occurred: ${error.message}`,
        alternatives: [],
        metadata: {
          error: error.message,
          totalImages: this.imageCatalog?.images?.length || 0,
          candidatesFound: 0,
          themes: [],
          keywords: []
        }
      };
    }
  }

  // Utility method to get image path
  getImagePath(filename) {
    return path.join(__dirname, '../public/sharepic_example_bg/', filename);
  }

  // Method to validate if image file exists
  async validateImageExists(filename) {
    try {
      const imagePath = this.getImagePath(filename);
      await fs.access(imagePath);
      return true;
    } catch {
      return false;
    }
  }

  // Method to clear cache (useful for testing)
  clearCache() {
    this.cache.clear();
    console.log('[ImagePicker] Cache cleared');
  }

  // Get service statistics
  getStats() {
    return {
      initialized: this.initialized,
      totalImages: this.imageCatalog?.images?.length || 0,
      cacheSize: this.cache.size,
      catalogPath: this.catalogPath
    };
  }
}

module.exports = new ImagePickerService();