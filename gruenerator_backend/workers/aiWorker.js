const { parentPort } = require('worker_threads');
const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
require('dotenv').config();

class ConcurrentRequestManager {
  constructor() {
    this.queue = [];
    this.activeRequests = new Set();
    this.maxConcurrentRequests = 25;  // Erhöht auf 25 gleichzeitige Anfragen
    this.rateLimit = {
      requests: new Map(),
      maxRequests: 500,   // Erhöht auf 500 Anfragen
      timeWindow: 60000   // Pro Minute (60000 ms)
    };
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000, // Basis-Verzögerung in Millisekunden
      maxDelay: 30000  // Maximale Verzögerung in Millisekunden
    };
  }

  async add(data) {
    return new Promise((resolve, reject) => {
      const request = { data, resolve, reject };
      this.queue.push(request);
      this.processQueue();
    });
  }

  async processQueue() {
    // Wenn zu viele aktive Requests, warte
    if (this.activeRequests.size >= this.maxConcurrentRequests) {
      return;
    }

    // Verarbeite alle wartenden Anfragen
    while (this.queue.length > 0 && this.activeRequests.size < this.maxConcurrentRequests) {
      if (!this.checkRateLimit()) {
        // Warte und versuche später erneut
        setTimeout(() => this.processQueue(), 100);
        return;
      }

      const request = this.queue.shift();
      const requestId = Date.now() + Math.random();
      this.activeRequests.add(requestId);

      this.processRequest(request, requestId)
        .finally(() => {
          this.activeRequests.delete(requestId);
          this.processQueue(); // Verarbeite weitere Anfragen
        });
    }
  }

  async processRequest(request, requestId) {
    let retryCount = 0;
    
    while (true) {
      try {
        const result = await processAIRequest(request.data);
        request.resolve(result);
        return;
      } catch (error) {
        if (this.shouldRetry(error, retryCount)) {
          const delay = this.calculateBackoff(retryCount);
          console.log(`Retry ${retryCount + 1} nach ${delay}ms für Request ${requestId}`);
          await this.wait(delay);
          retryCount++;
        } else {
          request.reject(error);
          return;
        }
      }
    }
  }

  checkRateLimit() {
    const now = Date.now();
    const windowStart = now - this.rateLimit.timeWindow;
    
    // Bereinige alte Einträge
    for (const [timestamp] of this.rateLimit.requests) {
      if (timestamp < windowStart) {
        this.rateLimit.requests.delete(timestamp);
      }
    }

    if (this.rateLimit.requests.size >= this.rateLimit.maxRequests) {
      return false;
    }

    this.rateLimit.requests.set(now, true);
    return true;
  }

  shouldRetry(error, retryCount) {
    // Prüfe nur auf HTTP Status Codes und Retry Count
    return (
      retryCount < this.retryConfig.maxRetries && 
      (error.status >= 500 || error.status === 429)
    );
  }

  calculateBackoff(retryCount) {
    // Exponentieller Backoff mit Jitter
    const exponentialDelay = Math.min(
      this.retryConfig.maxDelay,
      this.retryConfig.baseDelay * Math.pow(2, retryCount)
    );
    
    // Füge zufälligen Jitter hinzu (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.floor(exponentialDelay + jitter);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const requestManager = new ConcurrentRequestManager();
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function processAIRequest(data, retryCount = 0) {
  const { type, prompt, options = {}, systemPrompt, messages, useBackupProvider } = data;
  
  try {
    let result;
    if (useBackupProvider === true) {
      console.log('[AI Worker] Using backup provider (OpenAI)');
      result = await processWithOpenAI(data);
    } else {
      console.log('[AI Worker] Using primary provider (Claude)', { useBackupProvider });
      
      // Entferne betas aus den options
      const { betas, ...cleanOptions } = options;
      
      const defaultConfig = {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.3
      };
      // Typ-spezifische Konfigurationen
      const typeConfigs = {
        'presse': {
          system: "Du bist ein erfahrener Pressesprecher...",
          temperature: 0.4
        },
        'social': {
          system: "Du bist ein Social Media Manager...",
          temperature: 0.5
        },
        'rede': {
          system: "Du bist ein Redenschreiber...",
          temperature: 0.3
        },
        'antragsversteher': {
          system: "Du bist ein Experte für politische Anträge...",
          temperature: 0.2
        },
        'wahlprogramm': {
          system: "Du bist ein Experte für Wahlprogramme...",
          temperature: 0.2
        },
        'text_adjustment': {
          system: "Du bist ein Experte für Textoptimierung...",
          temperature: 0.3
        }
      };

      // Kombiniere Default-Config mit Typ-spezifischer Config und benutzerdefinierten Optionen
      let requestConfig = {
        ...defaultConfig,
        ...(typeConfigs[type] || {}),
        ...cleanOptions,
        system: systemPrompt || (typeConfigs[type]?.system || defaultConfig.system)
      };

      // Konfiguriere die Anfrage-Header
      const headers = {};
      
      // Setze den PDF-Beta-Header nur für PDF-Anfragen
      if (type === 'antragsversteher' && betas?.includes('pdfs-2024-09-25')) {
        headers['anthropic-beta'] = 'pdfs-2024-09-25';
        console.log('[AI Worker] PDF Beta Header aktiviert');
      }

      // Verwende die übergebenen Messages oder erstelle neue
      if (messages) {
        requestConfig.messages = messages;
      } else if (prompt) {
        requestConfig.messages = [{
          role: "user",
          content: prompt
        }];
      }

      // Sende Anfrage mit Headers
      result = await anthropic.messages.create(requestConfig, { headers });
      
      // Strukturiere Claude-Response
      result = {
        content: result.content[0].text,
        success: true,
        metadata: {
          provider: 'claude',
          timestamp: new Date().toISOString(),
          backupRequested: false,
          isPdfRequest: type === 'antragsversteher' && betas?.includes('pdfs-2024-09-25')
        }
      };
    }

    return result;

  } catch (error) {
    console.error(`AI Worker Error:`, error.message);
    throw error;
  }
}

async function processWithOpenAI(data) {
  const { prompt, systemPrompt, messages, type } = data;
  
  console.log('[AI Worker] OpenAI Request:', {
    type,
    hasSystemPrompt: !!systemPrompt,
    messageCount: messages?.length || 1,
    model: 'gpt-4o-2024-08-06'
  });
  
  const openAIMessages = [];
  
  // Spezielle Behandlung für Social Media Anfragen
  if (type === 'social') {
    // System Message hinzufügen
    openAIMessages.push({
      role: 'system',
      content: systemPrompt || 'You are a Social Media Manager for Bündnis 90/Die Grünen. Create social media post suggestions for the specified platforms, adapting the content and style to each platform. Provide your response in a structured JSON format.'
    });

    // Konvertiere die komplexen Messages in einfache Textformate für OpenAI
    if (messages) {
      messages.forEach(msg => {
        openAIMessages.push({
          role: msg.role,
          content: Array.isArray(msg.content) 
            ? msg.content.map(c => c.text).join('\n')
            : msg.content
        });
      });
    }
  } else {
    // Standard-Verarbeitung für andere Anfragen
    if (systemPrompt) {
      openAIMessages.push({ role: 'system', content: systemPrompt });
    }
    if (messages) {
      openAIMessages.push(...messages);
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: openAIMessages,
      temperature: 0.9,
      max_tokens: 4000,
      response_format: type === 'social' ? { type: "json_object" } : undefined
    });

    // Strukturierte Response
    return {
      content: response.choices[0].message.content,
      success: true,
      metadata: {
        provider: 'openai',
        timestamp: new Date().toISOString(),
        backupRequested: true,
        type: type
      }
    };
  } catch (error) {
    console.error('[AI Worker] OpenAI Error:', error);
    throw new Error(`OpenAI Error: ${error.message}`);
  }
}

parentPort.on('message', async (data) => {
  try {
    const result = await requestManager.add(data);
    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message
    });
  }
});