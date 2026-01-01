import MistralWebSearchService from '../../services/mistralWebSearchService.js';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('search');

const mistralSearchService = new MistralWebSearchService();

export const search = async (req, res) => {
  const { query, options = {} } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({
      status: 'error',
      message: 'Suchbegriff ist erforderlich'
    });
  }

  try {
    log.debug('\n=== MISTRAL WEB SEARCH REQUEST START ===');
    log.debug('Query:', query);
    log.debug('Options:', options);

    const agentType = 'content';
    const searchResults = await mistralSearchService.performWebSearch(query, agentType);

    log.debug('\n=== MISTRAL WEB SEARCH RESPONSE START ===');
    log.debug('Anzahl der Quellen:', searchResults.sourcesCount || 0);
    log.debug('Content Länge:', searchResults.textContent?.length || 0);

    if (searchResults.sources && searchResults.sources.length > 0) {
      searchResults.sources.forEach((source, index) => {
        log.debug(`\nMistral Quelle ${index + 1}:`);
        log.debug('URL:', source.url);
        log.debug('Titel:', source.title);
        log.debug('Domain:', source.domain);
        log.debug('Snippet Länge:', source.snippet?.length || 0);
      });
    }
    log.debug('=== MISTRAL WEB SEARCH RESPONSE END ===\n');

    if (!searchResults || !searchResults.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Ungültiges Suchergebnis'
      });
    }

    const processedResults = (searchResults.sources || []).map(source => ({
      url: source.url,
      title: source.title,
      content: source.snippet || searchResults.textContent
    }));

    return res.json({
      results: processedResults,
      status: 'success'
    });

  } catch (error) {
    log.error('Mistral Web Search API Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fehler bei der Suche'
    });
  }
};
