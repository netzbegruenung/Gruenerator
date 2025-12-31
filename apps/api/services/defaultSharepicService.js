const { generateSharepicForChat } = require('../routes/chat/services/sharepicGenerationService');

/**
 * Generate 3 default sharepics: dreizeilen (with AI image), quote_pure, and info
 * @param {Object} expressReq - Express request object
 * @param {Object} requestBody - Request body with thema, details, etc.
 * @returns {Array} Array of 3 generated sharepics
 */
const generateDefaultSharepics = async (expressReq, requestBody) => {
  console.log('[DefaultSharepicService] Starting generation of 3 default sharepics');

  try {
    // Generate all 3 types in parallel using existing chat service
    const [dreizeilenResult, quotePureResult, infoResult] = await Promise.all([
      generateSharepicForChat(expressReq, 'dreizeilen', requestBody),
      generateSharepicForChat(expressReq, 'zitat_pure', {
        ...requestBody,
        name: 'Die Grünen', // Default author for quote_pure
        preserveName: true // Preserve the default name
      }),
      generateSharepicForChat(expressReq, 'info', requestBody)
    ]);

    console.log('[DefaultSharepicService] All 3 default sharepics generated successfully');

    // Extract sharepic data from chat service responses
    const sharepics = [
      {
        ...dreizeilenResult.content.sharepic,
        id: `default-dreizeilen-${Date.now()}`,
        createdAt: new Date().toISOString()
      },
      {
        ...quotePureResult.content.sharepic,
        id: `default-quote-pure-${Date.now()}`,
        createdAt: new Date().toISOString()
      },
      {
        ...infoResult.content.sharepic,
        id: `default-info-${Date.now()}`,
        createdAt: new Date().toISOString()
      }
    ];

    return {
      success: true,
      sharepics,
      metadata: {
        generationType: 'default',
        generatedCount: 3,
        types: ['dreizeilen', 'zitat_pure', 'info'],
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('[DefaultSharepicService] Error generating default sharepics:', error);
    throw new Error(`Failed to generate default sharepics: ${error.message}`);
  }
};

module.exports = {
  generateDefaultSharepics
};