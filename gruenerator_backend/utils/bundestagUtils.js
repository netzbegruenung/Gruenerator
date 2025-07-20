const bundestagApiClient = require('../services/bundestagApiClient');

/**
 * Enhances selected Bundestag documents with full text content
 * @param {Array} selectedDocuments - Array of selected documents from frontend
 * @returns {Promise<Object>} Enhanced documents with full text organized by type
 */
async function enhanceDocumentsWithFullText(selectedDocuments) {
  if (!selectedDocuments || selectedDocuments.length === 0) {
    return null;
  }

  try {
    console.log(`[BundestagUtils] Processing ${selectedDocuments.length} selected parliamentary documents...`);
    
    // Fetch full text for each selected document
    const documentsWithFullText = await Promise.all(
      selectedDocuments.map(async (doc) => {
        try {
          console.log(`[BundestagAPI] Fetching full text for ${doc.type} ${doc.id}`);
          const fullDocument = await bundestagApiClient.getDocumentById(doc.id, doc.type);
          
          // Merge the original document metadata with full text
          return {
            ...doc,
            text: fullDocument.text || '',
            // Update other fields with fresh data from API
            titel: fullDocument.titel || doc.title,
            dokumentnummer: fullDocument.dokumentnummer || doc.nummer,
            datum: fullDocument.datum || doc.date,
            wahlperiode: fullDocument.wahlperiode || doc.wahlperiode
          };
        } catch (error) {
          console.error(`[BundestagAPI] Failed to fetch full text for document ${doc.id}:`, error.message);
          // Return original document without full text if fetch fails
          return {
            ...doc,
            text: '',
            fetchError: error.message
          };
        }
      })
    );
    
    // Transform documents with full text into the expected format
    const enhancedDocuments = {
      query: 'user_selected',
      results: {
        drucksachen: documentsWithFullText.filter(doc => doc.type === 'drucksache'),
        plenarprotokolle: documentsWithFullText.filter(doc => doc.type === 'plenarprotokoll'),
        vorgaenge: documentsWithFullText.filter(doc => doc.type === 'vorgang')
      },
      totalResults: documentsWithFullText.length
    };
    
    // Log success statistics
    const documentsWithText = documentsWithFullText.filter(doc => doc.text && doc.text.length > 0);
    const documentsWithErrors = documentsWithFullText.filter(doc => doc.fetchError);
    
    console.log(`[BundestagUtils] Enhanced ${enhancedDocuments.totalResults} documents:`);
    console.log(`  - ${documentsWithText.length} with full text`);
    console.log(`  - ${documentsWithErrors.length} with fetch errors`);
    
    return enhancedDocuments;
    
  } catch (error) {
    console.error('[BundestagUtils] Document enhancement error:', error.message);
    throw error;
  }
}

/**
 * Formats enhanced Bundestag documents for use in AI prompts
 * @param {Object} enhancedDocuments - Enhanced documents from enhanceDocumentsWithFullText
 * @returns {string} Formatted text for AI prompts
 */
function formatDocumentsForPrompt(enhancedDocuments) {
  if (!enhancedDocuments || enhancedDocuments.totalResults === 0) {
    return '';
  }
  
  let formattedDocs = '\n\n--- PARLAMENTARISCHE DOKUMENTE ---\n\n';
  
  if (enhancedDocuments.results.drucksachen.length > 0) {
    formattedDocs += 'DRUCKSACHEN:\n';
    enhancedDocuments.results.drucksachen.forEach((doc, index) => {
      formattedDocs += `${index + 1}. ${doc.title}\n`;
      formattedDocs += `   Nummer: ${doc.dokumentnummer || doc.nummer || 'N/A'}, Wahlperiode: ${doc.wahlperiode || 'N/A'}\n`;
      formattedDocs += `   Datum: ${doc.datum || doc.date || 'N/A'}\n`;
      if (doc.text && doc.text.length > 0) {
        // Send full document content to Claude for comprehensive analysis
        formattedDocs += `   Inhalt: ${doc.text}\n`;
      } else if (doc.fetchError) {
        formattedDocs += `   Hinweis: Volltext nicht verfügbar (${doc.fetchError})\n`;
      }
      formattedDocs += '\n';
    });
  }
  
  if (enhancedDocuments.results.plenarprotokolle.length > 0) {
    formattedDocs += 'PLENARPROTOKOLLE:\n';
    enhancedDocuments.results.plenarprotokolle.forEach((doc, index) => {
      formattedDocs += `${index + 1}. ${doc.title}\n`;
      formattedDocs += `   Nummer: ${doc.dokumentnummer || doc.nummer || 'N/A'}, Wahlperiode: ${doc.wahlperiode || 'N/A'}\n`;
      formattedDocs += `   Datum: ${doc.datum || doc.date || 'N/A'}\n`;
      if (doc.text && doc.text.length > 0) {
        // Send full document content to Claude for comprehensive analysis
        formattedDocs += `   Volltext: ${doc.text}\n`;
      } else if (doc.fetchError) {
        formattedDocs += `   Hinweis: Volltext nicht verfügbar (${doc.fetchError})\n`;
      }
      formattedDocs += '\n';
    });
  }
  
  formattedDocs += '--- ENDE PARLAMENTARISCHE DOKUMENTE ---\n';
  return formattedDocs;
}

/**
 * Complete workflow: enhance documents and format for AI prompts
 * @param {Array} selectedDocuments - Array of selected documents from frontend
 * @returns {Promise<Object>} Object with enhancedDocuments and formattedText
 */
async function processBundestagDocuments(selectedDocuments) {
  const enhancedDocuments = await enhanceDocumentsWithFullText(selectedDocuments);
  const formattedText = formatDocumentsForPrompt(enhancedDocuments);
  
  return {
    enhancedDocuments,
    formattedText
  };
}

module.exports = {
  enhanceDocumentsWithFullText,
  formatDocumentsForPrompt,
  processBundestagDocuments
};