const { YouToolExecutor } = require('../utils/youToolExecutor');
const { YouConversationManager } = require('../utils/youConversationManager');

// Mock AI Worker Pool für Tests
class MockAIWorkerPool {
  async processRequest(data) {
    console.log('[MockAIWorkerPool] Processing request:', data.type);
    
    if (data.type === 'you_with_tools') {
      // Simuliere Claude's Tool Use Response
      return {
        success: true,
        content: null,
        stop_reason: 'tool_use',
        raw_content_blocks: [
          {
            type: 'text',
            text: 'Ich werde das passende Tool für deine Anfrage verwenden.'
          },
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'generate_social_content',
            input: {
              thema: 'Klimaschutz',
              details: 'Förderung erneuerbarer Energien in der Stadt',
              platforms: ['facebook', 'twitter']
            }
          }
        ],
        metadata: {
          provider: 'claude',
          timestamp: new Date().toISOString()
        }
      };
    } else {
      // Simuliere normale Backend-Responses
      return {
        success: true,
        content: `Mock-Antwort für ${data.type}: ${data.messages[0].content}`,
        metadata: {
          provider: 'mock',
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

// Mock Request Object
const mockReq = {
  app: {
    locals: {
      aiWorkerPool: new MockAIWorkerPool()
    }
  }
};

// Test Cases
const TEST_CASES = [
  {
    name: "Social Media Request",
    prompt: "Erstelle einen Facebook-Post über Klimaschutz in der Stadt",
    expectedTool: "generate_social_content"
  },
  {
    name: "Speech Request", 
    prompt: "Schreibe eine Rede für die Haushaltsberatung im Stadtrat",
    expectedTool: "generate_political_speech"
  },
  {
    name: "Municipal Proposal",
    prompt: "Erstelle einen Antrag zur Förderung des Radverkehrs",
    expectedTool: "generate_municipal_proposal"
  },
  {
    name: "Universal Content",
    prompt: "Erkläre mir die grüne Position zum Thema Digitalisierung",
    expectedTool: "generate_universal_content"
  }
];

async function runTests() {
  console.log('=== You Tool Use Tests ===\n');
  
  const toolExecutor = new YouToolExecutor();
  const conversationManager = new YouConversationManager(
    mockReq.app.locals.aiWorkerPool,
    toolExecutor
  );
  conversationManager.req = mockReq;
  
  for (const testCase of TEST_CASES) {
    console.log(`\n--- Test: ${testCase.name} ---`);
    console.log(`Prompt: "${testCase.prompt}"`);
    console.log(`Expected Tool: ${testCase.expectedTool}`);
    
    try {
      const result = await conversationManager.processConversation(testCase.prompt);
      
      console.log('✅ Test erfolgreich');
      console.log(`Tool verwendet: ${result.metadata.toolUsed || 'Keins'}`);
      console.log(`Iterationen: ${result.metadata.iterations}`);
      console.log(`Content-Länge: ${result.content?.length || 0} Zeichen`);
      console.log(`Content-Preview: ${result.content?.substring(0, 100)}...`);
      
    } catch (error) {
      console.log('❌ Test fehlgeschlagen');
      console.error('Fehler:', error.message);
    }
  }
  
  console.log('\n=== Tool Executor Tests ===\n');
  
  // Test einzelne Tools
  const toolTests = [
    {
      name: 'generate_social_content',
      input: {
        thema: 'Klimaschutz',
        details: 'Förderung erneuerbarer Energien',
        platforms: ['facebook', 'twitter']
      }
    },
    {
      name: 'generate_political_speech',
      input: {
        thema: 'Haushaltsberatung',
        anlass: 'Stadtrat',
        dauer: '5 Minuten'
      }
    },
    {
      name: 'generate_municipal_proposal',
      input: {
        thema: 'Radverkehr',
        titel: 'Förderung des Radverkehrs',
        gremium: 'Stadtrat'
      }
    },
    {
      name: 'generate_universal_content',
      input: {
        anfrage: 'Erkläre die grüne Position zur Digitalisierung',
        texttyp: 'artikel'
      }
    }
  ];
  
  for (const toolTest of toolTests) {
    console.log(`\n--- Tool Test: ${toolTest.name} ---`);
    
    try {
      const result = await toolExecutor.executeTool(
        toolTest.name,
        toolTest.input,
        mockReq
      );
      
      console.log('✅ Tool-Test erfolgreich');
      console.log(`Success: ${result.success}`);
      console.log(`Content-Länge: ${result.content?.length || 0} Zeichen`);
      
    } catch (error) {
      console.log('❌ Tool-Test fehlgeschlagen');
      console.error('Fehler:', error.message);
    }
  }
  
  console.log('\n=== Tests abgeschlossen ===');
}

// Tests ausführen
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests }; 