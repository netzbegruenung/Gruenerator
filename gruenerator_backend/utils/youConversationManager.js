const { CORE_TOOLS } = require('./youToolExecutor');

class YouConversationManager {
  constructor(aiWorkerPool, toolExecutor) {
    this.aiWorkerPool = aiWorkerPool;
    this.toolExecutor = toolExecutor;
    this.maxIterations = 3;
  }
  
  async processConversation(prompt) {
    let messages = [{
      role: "user",
      content: prompt
    }];
    
    let iterations = 0;
    
    while (iterations < this.maxIterations) {
      iterations++;
      
      console.log(`[YouConversationManager] Iteration ${iterations}, calling Claude with tools`);
      
      // Call Claude with tools
      const result = await this.aiWorkerPool.processRequest({
        type: 'you_with_tools',
        systemPrompt: this.getSystemPrompt(),
        messages: messages,
        options: {
          model: "claude-3-7-sonnet-latest",
          max_tokens: 4000,
          temperature: 0.7,
          tools: CORE_TOOLS
        }
      });
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // Check if Claude wants to use a tool
      const toolUse = this.extractToolUse(result);
      
      if (!toolUse) {
        // No tool use, return final response
        console.log('[YouConversationManager] No tool use detected, returning final response');
        return {
          success: true,
          content: result.content,
          metadata: {
            ...result.metadata,
            iterations,
            toolUsed: null
          }
        };
      }
      
      console.log(`[YouConversationManager] Tool use detected: ${toolUse.name}`, toolUse.input);
      
      // Execute the tool
      const toolResult = await this.toolExecutor.executeTool(
        toolUse.name, 
        toolUse.input, 
        this.req
      );
      
      // Add tool use and result to conversation
      messages.push({
        role: "assistant",
        content: result.raw_content_blocks || [
          { type: "text", text: result.content || "" },
          { type: "tool_use", id: toolUse.id, name: toolUse.name, input: toolUse.input }
        ]
      });
      
      messages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(toolResult)
        }]
      });
      
      // If tool was successful and returned content, we can return
      if (toolResult.success && toolResult.content) {
        console.log(`[YouConversationManager] Tool execution successful, returning result`);
        return {
          success: true,
          content: toolResult.content,
          metadata: {
            ...toolResult.metadata,
            toolUsed: toolUse.name,
            iterations
          }
        };
      }
      
      // If tool failed, continue conversation to let Claude handle the error
      console.log(`[YouConversationManager] Tool execution failed, continuing conversation`);
    }
    
    throw new Error('Max iterations reached without successful completion');
  }
  
  extractToolUse(result) {
    if (result.stop_reason === 'tool_use' && result.raw_content_blocks) {
      return result.raw_content_blocks.find(block => block.type === 'tool_use');
    }
    return null;
  }
  
  getSystemPrompt() {
    const currentDate = new Date().toISOString().split('T')[0];
    
    return `Du bist ein intelligenter Assistent für politische Inhalte von Bündnis 90/Die Grünen. 

Deine Aufgabe ist es, Nutzeranfragen zu analysieren und das passende Tool zu verwenden:

1. **generate_social_content**: Für Social Media Posts, Pressemitteilungen, Online-Inhalte
   - Verwende wenn: Nutzer nach Social Media Inhalten, Posts, Tweets, Facebook-Beiträgen, Instagram-Content oder Pressemitteilungen fragt
   - Parameter: thema (erforderlich), details, platforms, customPrompt

2. **generate_political_speech**: Für Reden, Ansprachen, mündliche Beiträge
   - Verwende wenn: Nutzer nach Reden, Ansprachen, Statements für Veranstaltungen oder mündlichen Beiträgen fragt
   - Parameter: thema (erforderlich), anlass, zielgruppe, dauer, customPrompt

3. **generate_municipal_proposal**: Für Anträge, Beschlussvorlagen, kommunalpolitische Texte
   - Verwende wenn: Nutzer nach Anträgen, Beschlussvorlagen, kommunalpolitischen Dokumenten fragt
   - Parameter: thema (erforderlich), titel, details, gremium, customPrompt

4. **generate_universal_content**: Für allgemeine Texte, Artikel, Informationsmaterial
   - Verwende wenn: Nutzer nach allgemeinen Texten, Erklärungen, Artikeln oder Informationen fragt
   - Parameter: anfrage (erforderlich), kontext, texttyp

Analysiere die Nutzeranfrage sorgfältig und wähle das passende Tool. Fülle die Parameter so vollständig wie möglich aus, basierend auf der Anfrage.

Wenn die Anfrage unklar ist oder nicht eindeutig einer Kategorie zugeordnet werden kann, verwende generate_universal_content als Fallback.

Aktuelles Datum: ${currentDate}

Wichtig: Verwende IMMER eines der verfügbaren Tools. Antworte nicht direkt ohne Tool-Verwendung.`;
  }
}

module.exports = { YouConversationManager }; 