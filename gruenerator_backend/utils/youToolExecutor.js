const fetch = require('node-fetch');

// Core Tools Definition
const CORE_TOOLS = [
  {
    name: "generate_social_content",
    description: "Erstellt Social Media Inhalte für verschiedene Plattformen (Facebook, Twitter, Instagram, Pressemitteilungen)",
    input_schema: {
      type: "object",
      properties: {
        thema: { type: "string", description: "Hauptthema des Inhalts" },
        details: { type: "string", description: "Zusätzliche Details und Kontext" },
        platforms: { 
          type: "array", 
          items: { type: "string", enum: ["facebook", "twitter", "instagram", "pressemitteilung"] },
          description: "Zielplattformen für den Inhalt"
        },
        customPrompt: { type: "string", description: "Spezifische Anweisungen vom Nutzer" }
      },
      required: ["thema"]
    }
  },
  {
    name: "generate_political_speech",
    description: "Erstellt politische Reden für verschiedene Anlässe und Zielgruppen",
    input_schema: {
      type: "object",
      properties: {
        anlass: { type: "string", description: "Anlass der Rede (z.B. Stadtrat, Wahlkampf, Veranstaltung)" },
        thema: { type: "string", description: "Hauptthema der Rede" },
        zielgruppe: { type: "string", description: "Zielgruppe der Rede" },
        dauer: { type: "string", description: "Gewünschte Dauer der Rede" },
        customPrompt: { type: "string", description: "Spezifische Anweisungen vom Nutzer" }
      },
      required: ["thema"]
    }
  },
  {
    name: "generate_municipal_proposal",
    description: "Erstellt kommunalpolitische Anträge für Stadtrat, Gemeinderat oder andere Gremien",
    input_schema: {
      type: "object",
      properties: {
        titel: { type: "string", description: "Titel des Antrags" },
        thema: { type: "string", description: "Hauptthema des Antrags" },
        details: { type: "string", description: "Detaillierte Beschreibung und Begründung" },
        gremium: { type: "string", description: "Zielgremium (z.B. Stadtrat, Ausschuss)" },
        customPrompt: { type: "string", description: "Spezifische Anweisungen vom Nutzer" }
      },
      required: ["thema"]
    }
  },
  {
    name: "generate_universal_content",
    description: "Erstellt allgemeine politische Inhalte, Texte oder beantwortet Fragen zu grünen Themen",
    input_schema: {
      type: "object",
      properties: {
        anfrage: { type: "string", description: "Die vollständige Anfrage des Nutzers" },
        kontext: { type: "string", description: "Zusätzlicher Kontext oder Hintergrund" },
        texttyp: { 
          type: "string", 
          enum: ["artikel", "blog", "newsletter", "flyer", "allgemein"],
          description: "Art des gewünschten Textes"
        }
      },
      required: ["anfrage"]
    }
  }
];

// Tool Execution Functions
async function executeGenerateSocialContent(input, req) {
  const { thema, details, platforms, customPrompt } = input;
  
  const formData = {
    thema,
    details: details || '',
    platforms: platforms || ['facebook', 'twitter', 'instagram'],
    customPrompt: customPrompt || ''
  };
  
  console.log('[YouToolExecutor] Calling claude_social with:', formData);
  
  // Use aiWorkerPool directly instead of fetch to avoid circular calls
  const result = await req.app.locals.aiWorkerPool.processRequest({
    type: 'social',
    systemPrompt: "Du bist ein erfahrener Social Media Manager für Bündnis 90/Die Grünen.",
    messages: [{
      role: 'user',
      content: customPrompt || `Erstelle Social Media Inhalte zum Thema "${thema}"${details ? ` mit folgenden Details: ${details}` : ''} für die Plattformen: ${formData.platforms.join(', ')}.`
    }],
    options: {
      max_tokens: 4000,
      temperature: 0.9
    }
  });
  
  return result;
}

async function executeGeneratePoliticalSpeech(input, req) {
  const { anlass, thema, zielgruppe, dauer, customPrompt } = input;
  
  const prompt = customPrompt || `Erstelle eine Rede zum Thema "${thema}"${anlass ? ` für den Anlass "${anlass}"` : ''}${zielgruppe ? ` für die Zielgruppe "${zielgruppe}"` : ''}${dauer ? ` mit einer Dauer von "${dauer}"` : ''}.`;
  
  console.log('[YouToolExecutor] Calling claude_rede with prompt:', prompt);
  
  const result = await req.app.locals.aiWorkerPool.processRequest({
    type: 'rede',
    systemPrompt: "Du bist ein erfahrener Redenschreiber für Bündnis 90/Die Grünen.",
    messages: [{
      role: 'user',
      content: prompt
    }],
    options: {
      max_tokens: 4000,
      temperature: 0.3
    }
  });
  
  return result;
}

async function executeGenerateMunicipalProposal(input, req) {
  const { titel, thema, details, gremium, customPrompt } = input;
  
  const prompt = customPrompt || `Erstelle einen kommunalpolitischen Antrag zum Thema "${thema}"${titel ? ` mit dem Titel "${titel}"` : ''}${details ? `. Details: ${details}` : ''}${gremium ? ` für das Gremium "${gremium}"` : ''}.`;
  
  console.log('[YouToolExecutor] Calling antraege with prompt:', prompt);
  
  const result = await req.app.locals.aiWorkerPool.processRequest({
    type: 'antrag',
    systemPrompt: "Du bist ein erfahrener Kommunalpolitiker von Bündnis 90/Die Grünen.",
    messages: [{
      role: 'user',
      content: prompt
    }],
    options: {
      max_tokens: 4000,
      temperature: 0.3
    }
  });
  
  return result;
}

async function executeGenerateUniversalContent(input, req) {
  const { anfrage, kontext, texttyp } = input;
  
  const prompt = `${anfrage}${kontext ? ` Kontext: ${kontext}` : ''}${texttyp ? ` Texttyp: ${texttyp}` : ''}`;
  
  console.log('[YouToolExecutor] Calling claude_universal with prompt:', prompt);
  
  const result = await req.app.locals.aiWorkerPool.processRequest({
    type: 'universal',
    systemPrompt: "Du bist ein vielseitiger Assistent für politische Inhalte von Bündnis 90/Die Grünen.",
    messages: [{
      role: 'user',
      content: prompt
    }],
    options: {
      max_tokens: 4000,
      temperature: 0.7
    }
  });
  
  return result;
}

// Tool Executor Class
class YouToolExecutor {
  constructor() {
    this.tools = new Map([
      ['generate_social_content', executeGenerateSocialContent],
      ['generate_political_speech', executeGeneratePoliticalSpeech],
      ['generate_municipal_proposal', executeGenerateMunicipalProposal],
      ['generate_universal_content', executeGenerateUniversalContent]
    ]);
  }
  
  async executeTool(toolName, input, req) {
    const executor = this.tools.get(toolName);
    if (!executor) {
      throw new Error(`Tool ${toolName} not found`);
    }
    
    try {
      console.log(`[YouToolExecutor] Executing tool: ${toolName}`, input);
      const result = await executor(input, req);
      console.log(`[YouToolExecutor] Tool ${toolName} completed successfully`);
      
      return {
        success: true,
        content: result.content || result,
        metadata: result.metadata || {}
      };
    } catch (error) {
      console.error(`[YouToolExecutor] Tool ${toolName} failed:`, error);
      return {
        success: false,
        error: error.message,
        toolName
      };
    }
  }
}

module.exports = { YouToolExecutor, CORE_TOOLS }; 