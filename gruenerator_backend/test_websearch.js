const { PromptBuilder } = require('./utils/promptBuilderCompat');

async function testWebSearch() {
  console.log('Testing SearXNG web search integration...');
  
  try {
    const builder = new PromptBuilder('social');
    
    // Set basic system role
    builder.setSystemRole('Du bist ein hilfreicher AI-Assistent für politische Kommunikation.');
    
    // Test web search with a simple query
    await builder.handleWebSearch('Hochwasserschutz Deutschland');
    
    // Build the prompt to check if textContent was added
    const prompt = builder.build();
    
    console.log('Context knowledge:', builder.getContext().knowledge);
    console.log('Web search sources:', builder.getWebSearchSources());
    
    if (builder.getContext().knowledge && builder.getContext().knowledge.length > 0) {
      const knowledgeText = builder.getContext().knowledge[0];
      if (knowledgeText.includes('AKTUELLE INFORMATIONEN:')) {
        console.log('✅ Web search content successfully added to context');
        console.log('Content length:', knowledgeText.length, 'characters');
      } else {
        console.log('❌ Web search content format unexpected');
      }
    } else {
      console.log('❌ No web search content found in context');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testWebSearch();