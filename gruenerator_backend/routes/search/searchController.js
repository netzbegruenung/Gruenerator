const express = require('express');
const { tavily } = require("@tavily/core");
const router = express.Router();
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

router.post('/', async (req, res) => {
  const { query, options = {} } = req.body;
  
  if (!query || typeof query !== 'string') {
    return res.status(400).json({
      status: 'error',
      message: 'Suchbegriff ist erforderlich'
    });
  }

  try {
    const searchOptions = {
      includeAnswer: options.search_depth || "advanced",
      maxResults: Math.min(options.max_results || 10, 10),  // Limit auf 10 Ergebnisse
      include_raw_content: false  // Kein Raw Content mehr
    };
    
    console.log('\n=== TAVILY REQUEST START ===');
    console.log('Query:', query);
    console.log('Options:', searchOptions);
    
    const searchResults = await tvly.search(query, searchOptions);
    
    console.log('\n=== TAVILY RESPONSE START ===');
    console.log('Anzahl der Ergebnisse:', searchResults.results?.length || 0);
    console.log('\nRohdaten des ersten Ergebnisses:', JSON.stringify(searchResults.results[0], null, 2));
    searchResults.results?.forEach((result, index) => {
      console.log(`\nTavily Ergebnis ${index + 1}:`);
      console.log('URL:', result.url);
      console.log('Titel:', result.title);
      console.log('Content vorhanden:', !!result.content);
      console.log('Content Länge:', result.content?.length || 0);
      console.log('Verfügbare Felder:', Object.keys(result).join(', '));
    });
    console.log('=== TAVILY RESPONSE END ===\n');
    
    if (!searchResults || !Array.isArray(searchResults.results)) {
      return res.status(500).json({
        status: 'error',
        message: 'Ungültiges Suchergebnis'
      });
    }
    
    const processedResults = searchResults.results.map(result => ({
      url: result.url,
      title: result.title,
      content: result.content
    }));
    
    return res.json({
      results: processedResults,
      status: 'success'
    });
    
  } catch (error) {
    console.error('Tavily API Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fehler bei der Suche'
    });
  }
});

module.exports = router; 