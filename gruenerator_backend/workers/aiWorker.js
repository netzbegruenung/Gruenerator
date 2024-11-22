const { parentPort } = require('worker_threads');
const { Anthropic } = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');
require('dotenv').config();
const winston = require('winston');

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
        console.log(`Request ${requestId} erfolgreich nach ${retryCount} Versuchen`);
        request.resolve(result);
        return;
      } catch (error) {
        console.error(`Versuch ${retryCount + 1} fehlgeschlagen für Request ${requestId}:`, {
          error: error.message,
          statusCode: error.status,
          requestType: request.data.type
        });
        logger.error({
          message: `Fehler bei der Verarbeitung der Anfrage ${requestId}`,
          error: {
            message: error.message,
            statusCode: error.status,
            requestType: request.data.type
          }
        });
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
    // Erweiterte Fehlerprüfung
    if (error.status === 400 || error.status === 401 || error.status === 403) {
      return false; // Keine Wiederholung bei Client-Fehlern
    }
    
    if (error.status >= 500 && retryCount < this.retryConfig.maxRetries) {
      return true; // Server-Fehler wiederholen
    }
    
    // Bestehende Prüfung
    return (
      retryCount < this.retryConfig.maxRetries &&
      this.retryableErrors.some(errType => 
        error.message.toLowerCase().includes(errType.toLowerCase()) ||
        error.status === parseInt(errType)
      )
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

// OpenAI Client initialisieren
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Mapping für Modelle
const MODEL_MAPPING = {
  'claude-3-5-sonnet-20241022': 'gpt-4o', // Updated model to gpt-4o
};

// Logger konfigurieren
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/ai-errors.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/ai-requests.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Funktion zum Konvertieren der Anfrage für OpenAI
async function processOpenAIRequest(data, retryCount = 0) {
  const { type, prompt, options = {}, systemPrompt, messages } = data;
  
  try {
    const openaiConfig = {
      model: MODEL_MAPPING[options.model] || 'gpt-4o', // Updated model to gpt-4o
      max_tokens: options.max_tokens || 8000,
      temperature: options.temperature || 0.9,
      messages: []
    };

    // System Message hinzufügen
    if (systemPrompt) {
      openaiConfig.messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // Nachrichten oder Prompt hinzufügen
    if (messages) {
      openaiConfig.messages.push(...messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })));
    } else if (prompt) {
      openaiConfig.messages.push({
        role: 'user',
        content: prompt
      });
    }

    console.log(`[OpenAI Fallback] Versuche Request für ${type}`, openaiConfig);
    const response = await openai.chat.completions.create(openaiConfig);

    return {
      success: true,
      result: response.choices[0].message.content,
      type: type,
      provider: 'openai' // Kennzeichnung des Backup-Providers
    };
  } catch (error) {
    console.error(`OpenAI Fallback Error (${type}):`, error.message);
    logger.error({
      message: `OpenAI Fallback Fehler (${type})`,
      error: error.message
    });
    throw error;
  }
}

// Modifizierte processAIRequest Funktion mit erweitertem Logging
async function processAIRequest(data, retryCount = 0) {
  const requestId = Date.now() + Math.random().toString(36).substring(7);
  
  logger.info({
    message: 'Starting AI request',
    requestId,
    type: data.type,
    provider: 'anthropic',
    attempt: retryCount + 1
  });

  const maxRetries = 3;
  const { type, prompt, options = {}, systemPrompt, messages } = data;
  
  try {
    const defaultConfig = {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 8000,
      temperature: 0.9
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
      ...options,
      system: systemPrompt || (typeConfigs[type]?.system || defaultConfig.system)
    };

    if (messages) {
      requestConfig.messages = messages;
    } else if (prompt) {
      requestConfig.messages = [{
        role: "user",
        content: prompt
      }];
    }

    // Spezielle Behandlung für bestimmte Typen
    if (type === 'antragsversteher' && options.betas) {
      requestConfig.betas = options.betas;
    }

    const startTime = Date.now();
    const response = await anthropic.messages.create(requestConfig);
    
    logger.info({
      message: 'AI request successful',
      requestId,
      type: data.type,
      provider: 'anthropic',
      attempt: retryCount + 1,
      duration: Date.now() - startTime
    });

    if (response?.content?.length > 0) {
      const textContent = response.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('');
      
      return {
        success: true,
        result: textContent,
        type: type,
        provider: 'anthropic',
        requestId
      };
    }

    throw new Error('Ungültiges Antwortformat von der API');
  } catch (error) {
    logger.error({
      message: 'AI request failed',
      requestId,
      type: data.type,
      provider: 'anthropic',
      attempt: retryCount + 1,
      error: {
        message: error.message,
        status: error.status,
        stack: error.stack
      }
    });

    // Backup-Provider Versuch
    if (!data.isBackupAttempt && (
      // Client Fehler
      error.status === 400 || // Bad Request
      error.status === 401 || // Unauthorized
      error.status === 403 || // Forbidden
      error.status === 404 || // Not Found
      error.status === 405 || // Method Not Allowed
      error.status === 406 || // Not Acceptable
      error.status === 408 || // Request Timeout
      error.status === 413 || // Payload Too Large
      error.status === 422 || // Unprocessable Entity
      error.status === 429 || // Too Many Requests
      
      // Server Fehler
      error.status >= 500 || // Alle 500er Fehler
      
      // API-spezifische Fehler
      error.message.includes('rate_limit') ||
      error.message.includes('timeout') ||
      error.message.includes('invalid_request') ||
      error.message.includes('invalid_api_key') ||
      error.message.includes('model_not_found') ||
      error.message.includes('context_length_exceeded') ||
      error.message.includes('content_filter') ||
      error.message.includes('tokens_exceeded') ||
      
      // Netzwerk Fehler
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENETUNREACH' ||
      error.code === 'ENOTFOUND' ||
      
      // Allgemeine Fehler
      error.message.includes('network') ||
      error.message.includes('connection') ||
      error.message.includes('socket') ||
      error.message.includes('unexpected') ||
      error.message.includes('unavailable') ||
      error.message.includes('overloaded')
    )) {
      logger.info({
        message: 'Attempting backup provider',
        requestId,
        type: data.type,
        error: {
          status: error.status,
          code: error.code,
          message: error.message
        }
      });

      try {
        return await processOpenAIRequest({
          ...data,
          isBackupAttempt: true,
          requestId
        });
      } catch (backupError) {
        logger.error({
          message: 'Backup provider failed',
          requestId,
          type: data.type,
          provider: 'openai',
          error: {
            message: backupError.message,
            status: backupError.status,
            code: backupError.code,
            stack: backupError.stack
          }
        });
        // Werfe den ursprünglichen Fehler, wenn der Backup auch fehlschlägt
        throw error;
      }
    }

    // Retry-Logik für bestimmte Fehler
    if (retryCount < maxRetries && (
      error.status === 429 || // Too Many Requests
      error.status >= 500 || // Server Fehler
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET' ||
      error.message.includes('rate_limit') ||
      error.message.includes('timeout') ||
      error.message.includes('overloaded') ||
      error.message.includes('unavailable')
    )) {
      const delay = this.calculateBackoff(retryCount);
      logger.info({
        message: `Retry attempt ${retryCount + 1} after ${delay}ms`,
        requestId,
        type: data.type,
        error: error.message
      });
      await this.wait(delay);
      return processAIRequest(data, retryCount + 1);
    }
    
    throw error;
  }
}

// Bedingter Export für Tests
if (parentPort) {
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
} else {
  // Export für Tests
  module.exports = {
    processAIRequest,
    processOpenAIRequest,
    requestManager,
    logger
  };
}

class CircuitBreaker {
  constructor() {
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.threshold = 5;
    this.resetTimeout = 30000; // 30 Sekunden
  }

  async executeRequest(request) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await request();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'OPEN';
      }
      throw error;
    }
  }
}