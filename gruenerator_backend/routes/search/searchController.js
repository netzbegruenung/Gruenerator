const express = require('express');
const MistralWebSearchService = require('../../services/mistralWebSearchService');
const router = express.Router();
const mistralSearchService = new MistralWebSearchService();

router.post('/', async (req, res) => {
  const { query, options = {} } = req.body;
  
  if (!query || typeof query !== 'string') {
    return res.status(400).json({
      status: 'error',
      message: 'Suchbegriff ist erforderlich'
    });
  }

  try {
    console.log('\n=== MISTRAL WEB SEARCH REQUEST START ===');
    console.log('Query:', query);
    console.log('Options:', options);
    
    // Use 'content' agent type for comprehensive search results
    const agentType = 'content';
    const searchResults = await mistralSearchService.performWebSearch(query, agentType);
    
    console.log('\n=== MISTRAL WEB SEARCH RESPONSE START ===');
    console.log('Anzahl der Quellen:', searchResults.sourcesCount || 0);
    console.log('Content Länge:', searchResults.textContent?.length || 0);
    
    if (searchResults.sources && searchResults.sources.length > 0) {
      searchResults.sources.forEach((source, index) => {
        console.log(`\nMistral Quelle ${index + 1}:`);
        console.log('URL:', source.url);
        console.log('Titel:', source.title);
        console.log('Domain:', source.domain);
        console.log('Snippet Länge:', source.snippet?.length || 0);
      });
    }
    console.log('=== MISTRAL WEB SEARCH RESPONSE END ===\n');
    
    if (!searchResults || !searchResults.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Ungültiges Suchergebnis'
      });
    }
    
    // Process sources to match expected API format
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
    console.error('Mistral Web Search API Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fehler bei der Suche'
    });
  }
});

module.exports = router; 