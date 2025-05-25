const express = require('express');
const router = express.Router();
const { tavilyService } = require('../utils/searchUtils');
const { HTML_FORMATTING_INSTRUCTIONS, MARKDOWN_CHAT_INSTRUCTIONS, JSON_OUTPUT_FORMATTING_INSTRUCTIONS } = require('../utils/promptUtils');

const WEB_SEARCH_TOOL_NAME = "web_search";
const PROPOSE_TEXT_EDIT_TOOL_NAME = "propose_text_edit";

// Helper function for robust string normalization for comparison
const normalizeStringForCompare = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/\r\n|\r/g, '\n') // Normalize newlines to \n
            .replace(/[ \t]+/g, ' ')    // Collapse multiple spaces/tabs to a single space
            .trim();                    // Trim leading/trailing whitespace
};

router.post('/', async (req, res) => {
  // mode can be: 'editSelected', 'thinkGlobal', 'searchExplicit'
  const { message, currentText, selectedText, chatHistory, mode = 'thinkGlobal' } = req.body;
  console.log('[claude_chat] Received request. Mode:', mode);
  console.log('[claude_chat] Received currentText from request body:', JSON.stringify(currentText));
  console.log('[claude_chat] Received selectedText from request body:', JSON.stringify(selectedText));
  console.log('[claude_chat] Received message from request body:', JSON.stringify(message));

  const validationErrors = {};
  
  if (!message?.trim()) {
    validationErrors.message = 'Nachricht ist erforderlich';
  }

  // currentText is required for 'editSelected' and 'thinkGlobal'
  if ((mode === 'editSelected' || mode === 'thinkGlobal') && !currentText?.trim()) {
    validationErrors.currentText = 'Text ist für diesen Modus erforderlich';
  }
  
  // selectedText is required for 'editSelected'
  if (mode === 'editSelected' && (selectedText === undefined || selectedText === null || !selectedText?.trim())) {
    validationErrors.selectedText = 'Markierter Text ist für den Modus editSelected erforderlich';
  }
  // selectedText, if provided for other modes, must be valid
  if (mode !== 'editSelected' && selectedText !== undefined && selectedText !== null && !selectedText?.trim()) {
    validationErrors.selectedText = 'Markierter Text ist ungültig';
  }

  if (Object.keys(validationErrors).length > 0) {
    return res.status(400).json({
      error: 'Validierungsfehler',
      details: validationErrors,
      code: 'VALIDATION_ERROR'
    });
  }

  const getTextWithContext = (text, position, length, contextSize = 50) => {
    const start = Math.max(0, position - contextSize);
    const end = Math.min(text.length, position + length + contextSize);
    return {
      beforeContext: text.slice(start, position),
      text: text.slice(position, position + length),
      afterContext: text.slice(position + length, end)
    };
  };

  const analyzePunctuation = (text) => {
    const startsWithPunctuation = /^[.!?•\-,]/.test(text);
    const endsWithPunctuation = /[.!?•\-,]$/.test(text);
    const type = text.startsWith('•') ? 'bullet' : 
                text.includes('.') ? 'sentence' : 
                text.includes('\n') ? 'paragraph' : 'phrase';
    
    return { startsWithPunctuation, endsWithPunctuation, type };
  };

  const splitMessages = (text) => {
    if (typeof text !== 'string') return [String(text)];
    return text.split('%%%MSG_SPLIT%%%').map(msg => msg.trim()).filter(msg => msg.length > 0);
  };

  const tools = [
    {
      name: WEB_SEARCH_TOOL_NAME,
      description: "Führt eine Websuche durch, um aktuelle Informationen oder spezifische Fragen zu beantworten, die nicht aus dem gegebenen Text oder allgemeinem Wissen beantwortet werden können. Benutze dies, wenn der User explizit nach einer Suche fragt oder wenn du externe Informationen benötigst.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Die Suchanfrage, die an die Suchmaschine gesendet werden soll."
          }
        },
        required: ["query"]
      }
    },
    {
      name: PROPOSE_TEXT_EDIT_TOOL_NAME,
      description: "Schlägt eine spezifische Textänderung im gesamten Dokument vor. Benutze dieses Tool, nachdem du den genauen Original-Textabschnitt (`text_to_find`), der geändert werden soll, identifiziert und den neuen Text (`replacement_text`) dafür formuliert hast. Gib den zu findenden Text so exakt und lang wie nötig an, um Eindeutigkeit sicherzustellen. Liefere optional auch einen kurzen Kontext (`context_before`, `context_after`), der vor und nach dem `text_to_find` steht, um die Genauigkeit zu erhöhen, besonders wenn `text_to_find` kurz oder mehrdeutig ist.",
      input_schema: {
        type: "object",
        properties: {
          "text_to_find": {
            type: "string",
            description: "Der exakte Originaltextabschnitt, der im aktuellen Dokument gefunden und ersetzt werden soll. Dieser String muss buchstabengetreu im Dokument vorkommen."
          },
          "replacement_text": {
            type: "string",
            description: "Der neue Text, der den 'text_to_find' ersetzen soll."
          },
          "occurrence_index": {
            type: "integer",
            description: "Optional. Falls 'text_to_find' mehrfach im Dokument vorkommt (und durch Kontext nicht eindeutig ist), gib an, die wievielte Instanz (1-basiert) gemeint ist. Standard ist 1.",
            default: 1
          },
          "context_before": {
            type: "string",
            description: "Optional. Einige Wörter oder ein kurzer Satz, der direkt vor 'text_to_find' im Originaltext steht. Hilft bei der eindeutigen Identifizierung."
          },
          "context_after": {
            type: "string",
            description: "Optional. Einige Wörter oder ein kurzer Satz, der direkt nach 'text_to_find' im Originaltext steht. Hilft bei der eindeutigen Identifizierung."
          }
        },
        required: ["text_to_find", "replacement_text"]
      }
    }
  ];

  try {
    let systemPrompt, userPrompt, apiMessages, requestOptions = {};

    if (mode === 'searchExplicit') {
      // This mode directly uses Tavily without going through Claude's tool use initially
      try {
        const searchQuery = `${message} antworte auf deutsch`;
        console.log(`[claude_chat] Explicit search query: ${searchQuery}`);

        const searchResults = await tavilyService.search(searchQuery, {
          includeAnswer: "advanced", // Requesting an answer from Tavily
          maxResults: 5
        });

        const messagesToReturn = [];
        if (searchResults.answer) {
          messagesToReturn.push(searchResults.answer);
        }
        if (searchResults.results && searchResults.results.length > 0) {
          searchResults.results.forEach(result => {
            messagesToReturn.push(`[${result.title}](${result.url})`);
          });
        }

        return res.json({
          responseType: 'searchResults',
          response: messagesToReturn.length > 0 ? messagesToReturn : ["Keine direkten Suchergebnisse gefunden."],
          textAdjustment: null
        });
      } catch (searchError) {
        console.error('[claude_chat] Error during explicit search:', searchError);
        return res.status(500).json({ error: `Fehler bei der expliziten Suche: ${searchError.message}` });
      }
    } else if (mode === 'thinkGlobal') {
      systemPrompt = "Du bist ein hilfreicher und proaktiver Assistent von Bündnis 90/Die Grünen. Deine Aufgabe ist es, Nutzern Feedback, Tipps und hilfreiche Anmerkungen zu ihrem Text zu geben oder allgemeine Fragen zu beantworten. Formuliere deine Antworten in der Du-Form und verwende gendergerechte Sprache.\n\n"
        + "Wenn die Nutzeranfrage eine Textänderung impliziert, die sich auf den gesamten Text bezieht (und kein Textabschnitt explizit markiert wurde):\n"
        + "1. Identifiziere präzise den zu ändernden Original-Textabschnitt (`text_to_find`).\n"
        + "2. Formuliere den neuen Text (`replacement_text`).\n"
        + "3. Liefere optional, aber empfohlen (besonders bei kurzem oder mehrdeutigem `text_to_find`), einen kurzen Kontext (`context_before` und `context_after`), der den `text_to_find` im Originaltext umgibt. Dieser Kontext sollte *exakt* dem Text im Dokument entsprechen, inklusive relevanter Satzzeichen und ggf. Zeilenumbrüche, und unmittelbar an `text_to_find` angrenzen (z.B. bis zu 10-15 Wörter oder eine Zeile).\n"
        + "4. Verwende dann das `propose_text_edit`-Tool, um diese Änderung vorzuschlagen.\n\n"
        + "Nutze das `web_search`-Tool, wenn du externe Informationen benötigst, um die Anfrage bestmöglich zu beantworten oder wenn der Nutzer explizit danach fragt und keine Textänderung im Vordergrund steht.\n\n"
        + "Wenn du das `propose_text_edit`-Tool verwendest und ein Fehler vom System zurückgemeldet wird (erkennbar am `status: \"error\"` im `tool_result`):\n"
        + "1. Analysiere GENAU die Fehlermeldung (speziell `error_type` und `message` aus dem `tool_result`).\n"
        + "2. Du MUSST ZWINGEND eine präzise, klärende Frage an den Nutzer stellen, um das Problem zu beheben. ANTWORTE NICHT allgemein oder versuche, das Problem ohne Rückfrage zu lösen. Deine Aufgabe ist es, die für eine korrekte Tool-Anwendung nötigen Informationen vom Nutzer zu erhalten.\n"
        + "   Beispiele für direkte Fragen an den Nutzer:\n"
        + "   - Bei `error_type: \"not_found\"`: \"Ich konnte den Textabschnitt, den du ändern möchtest, leider nicht finden. Kannst du mir den genauen Wortlaut des zu ändernden Textes nennen oder ihn im Text markieren?\"\n"
        + "   - Bei `error_type: \"ambiguous\"` oder `error_type: \"occurrence_out_of_bounds\"`: \"Ich habe den Text '[text_to_find]' mehrfach gefunden. Welche Fundstelle genau möchtest du ändern? Die erste, zweite, oder kannst du mir zusätzlichen Kontext geben (z.B. was direkt davor oder danach steht)?\" (Ersetze [text_to_find] mit dem tatsächlichen Text.)\n"
        + "   - Bei `error_type: \"occurrence_not_found_with_context\"`: \"Ich habe zwar den Text '[text_to_find]' gefunden, aber nicht mit dem von dir genannten Kontext. Es gab [N] passende Instanzen des Textes, aber keine passte zum Kontext. Kannst du den Kontext präzisieren oder mir sagen, die wievielte Instanz des Textes gemeint ist?\" (Ersetze [text_to_find] und [N] mit Werten aus der Fehlermeldung.)\n"
        + "   - Bei `error_type: \"context_mismatch\"`: \"Der Kontext, den du für den Textabschnitt '[text_to_find]' angegeben hast, stimmt nicht mit dem Inhalt im Dokument überein. Der von dir genannte Text vor/nach der Stelle ist '[Claudes context]', im Dokument steht aber '[Actual context snippet from error message if available]'. Kannst du den Kontext bitte korrigieren oder den zu ändernden Text genauer beschreiben?\" (Ersetze Platzhalter mit tatsächlichen Werten.)\n"
        + "3. Warte IMMER auf die Antwort des Nutzers, bevor du einen neuen Versuch mit dem `propose_text_edit`-Tool unternimmst, es sei denn, die Antwort des Nutzers liefert dir bereits alle Informationen für einen korrigierten, eindeutigen Tool-Aufruf. Wiederhole nicht einfach den fehlerhaften Tool-Aufruf.";
      userPrompt = `${chatHistory ? 'Bisherige Konversation:\n' + chatHistory + '\n\n' : ''}${currentText ? 'Hier ist der Text des Nutzers (dies ist die alleinige Quelle für Text und Kontext bei Änderungen):\n"' + currentText + '"\n\n' : ''}Nutzer*innen-Anfrage: ${message}\n\n${MARKDOWN_CHAT_INSTRUCTIONS} Gib eine hilfreiche und konstruktive Antwort oder schlage eine Textänderung vor, falls angebracht. Deine Antwort darf maximal 1.000 Zeichen pro Nachrichtenblock haben.`;
      apiMessages = [{ role: "user", content: userPrompt }];
      requestOptions = { tools }; // Provide the tools to Claude
    } else { // 'editSelected' mode
      systemPrompt = "Du bist ein präziser Textbearbeitungs-Assistent von Bündnis 90/Die Grünen.";
      userPrompt = `${chatHistory ? 'Bisherige Konversation:\n' + chatHistory + '\n\n' : ''}Hier ist der aktuelle Text: "${currentText}"
        
Zu bearbeitender Abschnitt: "${selectedText}"

Änderungswunsch von Nutzer*in: ${message}

Bearbeite den Text im Sinne grüner Werte und gendergerechter Sprache. 
Wichtig: Deine Erklärungen in der \"response\"-Eigenschaft des JSON dürfen maximal 1.000 Zeichen pro Nachrichtenblock haben.

${JSON_OUTPUT_FORMATTING_INSTRUCTIONS}`;
      apiMessages = [{ role: "user", content: userPrompt }];
    }

    let claudeResponseContent;
    let requiresToolExecution = false;
    let toolInput = null;
    let toolCallDetails = null;

    // First call to Claude
    console.log(`[claude_chat] Initial call to Claude. Mode: ${mode}. Message: ${message}`);
    let result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt,
      messages: apiMessages,
      ...(Object.keys(requestOptions).length > 0 && { options: requestOptions })
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    console.log(`[claude_chat] Full result object from aiWorkerPool:`, JSON.stringify(result, null, 2)); // Log the full result object
    
    // Extract tool_calls from raw_content_blocks if stop_reason is tool_use
    let actual_tool_calls = null;
    if (result.stop_reason === 'tool_use' && result.raw_content_blocks && Array.isArray(result.raw_content_blocks)) {
      actual_tool_calls = result.raw_content_blocks.filter(block => block.type === 'tool_use');
      if (actual_tool_calls.length === 0) actual_tool_calls = null; // Ensure it's null if no tool_use blocks found
    }

    console.log(`[claude_chat] Claude's initial response details: stop_reason='${result.stop_reason}', extracted_tool_calls='${JSON.stringify(actual_tool_calls || null)}'`);

    // Check if Claude wants to use a tool
    if (mode === 'thinkGlobal' && result.stop_reason === 'tool_use' && actual_tool_calls) {
      // Prefer propose_text_edit if available, otherwise web_search
      const proposeEditCall = actual_tool_calls.find(tc => tc.name === PROPOSE_TEXT_EDIT_TOOL_NAME);
      const webSearchCall = actual_tool_calls.find(tc => tc.name === WEB_SEARCH_TOOL_NAME);

      if (proposeEditCall) {
        toolCallDetails = proposeEditCall;
        console.log(`[claude_chat] Claude wants to use tool: ${toolCallDetails.name} with input:`, toolCallDetails.input);
      } else if (webSearchCall) {
        toolCallDetails = webSearchCall;
        console.log(`[claude_chat] Claude wants to use tool: ${toolCallDetails.name} with input:`, toolCallDetails.input);
      }

      if (toolCallDetails) {
        requiresToolExecution = true;
        toolInput = toolCallDetails.input;
        // Add Claude's tool_use request to the conversation history for the next call
        apiMessages.push({ role: "assistant", content: [{ type: "tool_use", id: toolCallDetails.id, name: toolCallDetails.name, input: toolCallDetails.input }] });
      }
    }

    if (requiresToolExecution && toolCallDetails && toolInput) {
      let toolResultContent;
      let toolErrorOccurred = false;

      // Execute PROPOSE_TEXT_EDIT_TOOL
      if (toolCallDetails.name === PROPOSE_TEXT_EDIT_TOOL_NAME) {
        console.log(`[claude_chat] Executing tool '${PROPOSE_TEXT_EDIT_TOOL_NAME}' with input:`, toolInput);
        const {
          text_to_find,
          replacement_text,
          occurrence_index = 1, // Default to 1 as per plan
          context_before = '',
          context_after = ''
        } = toolInput;

        if (!text_to_find || typeof replacement_text === 'undefined') {
          console.error('[claude_chat] Invalid input for propose_text_edit: text_to_find or replacement_text missing.');
          toolResultContent = { status: "error", error_type: "invalid_input", message: "Fehlende erforderliche Parameter 'text_to_find' oder 'replacement_text' für das propose_text_edit Tool." };
          toolErrorOccurred = true;
        } else {
          // Find the text and its range
          let matchIndex = -1;
          let currentMatch = 0;
          let searchStartIndex = 0;
          const normalizedCurrentText = currentText; // Assuming currentText is already plain text

          // Helper to check context if provided
          const checkContext = (originalIndex, originalTextToFindLength) => {
            // Claude's context (unnormalized, for length calculation)
            const claudeOriginalContextBefore = toolInput.context_before || ''; 
            const claudeOriginalContextAfter = toolInput.context_after || '';
        
            // Normalize Claude's context for comparison
            const claudeNormContextBefore = normalizeStringForCompare(claudeOriginalContextBefore);
            const claudeNormContextAfter = normalizeStringForCompare(claudeOriginalContextAfter);
        
            if (!claudeNormContextBefore && !claudeNormContextAfter) return true; // No context provided by Claude
        
            let contextMatch = true;
        
            if (claudeNormContextBefore) {
                // Extract from original currentText using the length of Claude's original context_before
                const docExtractLengthBefore = claudeOriginalContextBefore.length;
                const extractedDocContextBefore = currentText.substring(Math.max(0, originalIndex - docExtractLengthBefore), originalIndex);
                const normalizedExtractedDocContextBefore = normalizeStringForCompare(extractedDocContextBefore);
        
                if (normalizedExtractedDocContextBefore !== claudeNormContextBefore) {
                    console.log(`[claude_chat] ### Context_before mismatch DETECTED ###`);
                    console.log(`[claude_chat] Claude's original context_before: "${claudeOriginalContextBefore}" (Length: ${claudeOriginalContextBefore.length})`);
                    console.log(`[claude_chat] Claude's normalized context_before (claudeNormContextBefore): "${claudeNormContextBefore}"`);
                    console.log(`[claude_chat] Document's extracted context_before (raw): "${extractedDocContextBefore}" (Extracted Length: ${docExtractLengthBefore})`);
                    console.log(`[claude_chat] Document's normalized context_before (normalizedExtractedDocContextBefore): "${normalizedExtractedDocContextBefore}"`);
                    contextMatch = false;
                }
            }
        
            if (claudeNormContextAfter && contextMatch) { // Only check after_context if before_context matched (or wasn't provided)
                // Extract from original currentText using the length of Claude's original context_after
                const docExtractLengthAfter = claudeOriginalContextAfter.length;
                const extractedDocContextAfter = currentText.substring(originalIndex + originalTextToFindLength, originalIndex + originalTextToFindLength + docExtractLengthAfter);
                const normalizedExtractedDocContextAfter = normalizeStringForCompare(extractedDocContextAfter);
                
                if (normalizedExtractedDocContextAfter !== claudeNormContextAfter) {
                    console.log(`[claude_chat] ### Context_after mismatch DETECTED ###`);
                    console.log(`[claude_chat] Claude's original context_after: "${claudeOriginalContextAfter}" (Length: ${claudeOriginalContextAfter.length})`);
                    console.log(`[claude_chat] Claude's normalized context_after (claudeNormContextAfter): "${claudeNormContextAfter}"`);
                    console.log(`[claude_chat] Document's extracted context_after (raw): "${extractedDocContextAfter}" (Extracted Length: ${docExtractLengthAfter})`);
                    console.log(`[claude_chat] Document's normalized context_after (normalizedExtractedDocContextAfter): "${normalizedExtractedDocContextAfter}"`);
                    contextMatch = false;
                }
            }
            return contextMatch;
        };
          
          const potentialMatches = [];
          while (searchStartIndex < normalizedCurrentText.length) {
            const foundIdx = normalizedCurrentText.indexOf(text_to_find, searchStartIndex);
            if (foundIdx === -1) break;
            
            potentialMatches.push({ index: foundIdx, length: text_to_find.length });
            if (checkContext(foundIdx, text_to_find.length)) {
              currentMatch++;
              if (currentMatch === occurrence_index) {
                matchIndex = foundIdx;
                break;
              }
            }
            searchStartIndex = foundIdx + text_to_find.length;
          }
          
          console.log(`[claude_chat] Searching for "${text_to_find}" (occurrence ${occurrence_index}). Found at index: ${matchIndex}. Context before: "${context_before}", after: "${context_after}". Total potential matches: ${potentialMatches.length}, Context-validated matches for occurrence: ${currentMatch}`);


          if (matchIndex !== -1) {
            // Text found, proceed to prepare response for frontend
            console.log(`[claude_chat] Text found for edit: "${text_to_find}" at index ${matchIndex}. Replacement: "${replacement_text}"`);
            const textAdjustment = {
              type: 'selected', // Treat as selected as we have a precise range
              newText: replacement_text,
              range: {
                index: matchIndex,
                length: text_to_find.length
              },
              context: getTextWithContext(currentText, matchIndex, text_to_find.length), // Adjusted getTextWithContext to accept length
              punctuation: analyzePunctuation(text_to_find)
            };
            // We will construct the final response for the frontend later,
            // after potentially calling Claude again with this successful tool "execution result".
            // For now, we need a tool_result content that Claude can process.
            // This content should signal success or provide data for Claude to formulate its final chat message.
            toolResultContent = { status: "success", message: "Textänderung vorbereitet.", applied_change: { original: text_to_find, new: replacement_text } };
            
            // Construct the final response for the frontend directly
            // This avoids a second call to Claude if the tool use was successful for text_edit
            const finalResponseForFrontend = {
                response: ["Ich habe deinen Text wie gewünscht angepasst."], // Default message, Claude might override this if we call it again
                textAdjustment: textAdjustment,
                fullText: currentText // Optional, as per plan
            };
            console.log('[claude_chat] Constructed editSelected mode response payload directly after successful propose_text_edit tool:', finalResponseForFrontend);
            return res.json(finalResponseForFrontend); // Return directly

          } else {
            // Text not found or not the correct occurrence
            toolErrorOccurred = true;
            if (potentialMatches.length > 0 && currentMatch < occurrence_index) {
                 console.warn(`[claude_chat] Text "${text_to_find}" found ${potentialMatches.length} times, but occurrence ${occurrence_index} with matching context not found (validated matches: ${currentMatch}).`);
                 toolResultContent = { status: "error", error_type: "occurrence_not_found_with_context", message: `Der Textabschnitt '${text_to_find}' wurde zwar gefunden, aber nicht die ${occurrence_index}-te Instanz mit dem angegebenen Kontext. Es gab ${currentMatch} passende Instanzen. Bitte präzisiere den Kontext oder die Instanz.` };
            } else if (potentialMatches.length > 0 && occurrence_index > potentialMatches.length) {
              console.warn(`[claude_chat] Text "${text_to_find}" found ${potentialMatches.length} times, but requested occurrence ${occurrence_index} is out of bounds.`);
              toolResultContent = { status: "error", error_type: "occurrence_out_of_bounds", message: `Der Textabschnitt '${text_to_find}' wurde ${potentialMatches.length} Mal gefunden, aber die ${occurrence_index}. Instanz existiert nicht. Bitte wähle eine Instanz zwischen 1 und ${potentialMatches.length}.` };
            } else if (potentialMatches.length > 0) {
                console.warn(`[claude_chat] Text "${text_to_find}" found ${potentialMatches.length} times, but not matching context for occurrence ${occurrence_index}.`);
                toolResultContent = { status: "error", error_type: "context_mismatch", message: `Der Textabschnitt '${text_to_find}' (Instanz ${occurrence_index}) wurde gefunden, aber der angegebene Kontext davor oder danach stimmt nicht überein. Bitte überprüfe den Kontext.` };
            } else {
              console.warn(`[claude_chat] Text to find "${text_to_find}" not found in currentText.`);
              toolResultContent = { status: "error", error_type: "not_found", message: `Der angegebene Abschnitt '${text_to_find}' konnte nicht im Text gefunden werden. Bitte präzisiere den Text oder den Kontext.` };
            }
          }
        }
      // Execute WEB_SEARCH_TOOL
      } else if (toolCallDetails.name === WEB_SEARCH_TOOL_NAME) {
        // ... (existing web search logic)
        let combinedResults = "";
        if (searchResults.answer) {
            combinedResults += `Antwort der Suche: ${searchResults.answer}\n\n`;
        }
        if (searchResults.results && searchResults.results.length > 0) {
            combinedResults += "Gefundene Quellen:\n";
            searchResults.results.forEach(r => {
                combinedResults += `- Titel: ${r.title}\n  URL: ${r.url}\n  Inhalt (Auszug): ${r.content ? r.content.substring(0, 200) + '...' : 'Kein Inhalt verfügbar.'}\n`;
            });
        }
        toolResultContent = combinedResults || "Keine Ergebnisse für die Suche gefunden.";
        console.log("[claude_chat] Tool execution result:", toolResultContent);
      }

      // Add tool result to messages and call Claude again if there was an error with propose_text_edit OR it was a web_search
      if (toolErrorOccurred || toolCallDetails.name === WEB_SEARCH_TOOL_NAME) {
        apiMessages.push({
          role: "user", // Role is 'user' for tool_result message
          content: [
            {
              type: "tool_result",
              tool_use_id: toolCallDetails.id,
              content: JSON.stringify(toolResultContent), // Send JSON string for Claude to parse if needed
              is_error: toolErrorOccurred 
            }
          ]
        });

        console.log("[claude_chat] Calling Claude again with tool results (or error for propose_text_edit). API Messages:", JSON.stringify(apiMessages, null, 2));
        result = await req.app.locals.aiWorkerPool.processRequest({
          type: 'text_adjustment',
          systemPrompt, // Re-send system prompt
          messages: apiMessages, // Send updated messages including tool use and result
          ...(Object.keys(requestOptions).length > 0 && { options: requestOptions }) // Re-send tools in options
        });

        if (!result.success) {
          return res.status(500).json({ error: result.error });
        }
        claudeResponseContent = result.content;
      }
    } else {
      // No tool execution needed or tool call was not for web_search, or it's not 'thinkGlobal' mode
      claudeResponseContent = result.content;
    }
    
    // Process final response from Claude
    try {
      if (mode === 'thinkGlobal') { // This will now also handle responses after a tool_result for propose_text_edit errors
        console.log('[claude_chat] Handling thinkGlobal final response. Claude Raw Content:', claudeResponseContent);
        const responseMessages = splitMessages(claudeResponseContent);
        return res.json({
          response: responseMessages, 
          textAdjustment: null // No direct text adjustment if Claude is just chatting after a tool error/web search
        });
      }

      // 'editSelected' mode
      const parsedResponse = typeof claudeResponseContent === 'string'
        ? JSON.parse(claudeResponseContent.replace(/```json\n|\n```/g, ''))
        : claudeResponseContent;

      if (!parsedResponse.response || !parsedResponse.textAdjustment) {
        throw new Error('Invalid response format for editSelected mode, missing response or textAdjustment.');
      }
      
      console.log('[claude_chat] Handling editSelected mode response. Claude Raw Parsed Response:', parsedResponse.response); 
      const responseMessages = splitMessages(parsedResponse.response);

      const responsePayload = {
        response: responseMessages,
        textAdjustment: {
          type: parsedResponse.textAdjustment.type,
          newText: parsedResponse.textAdjustment.newText,
          range: parsedResponse.textAdjustment.type === 'selected' && selectedText ? {
            index: currentText.indexOf(selectedText),
            length: selectedText?.length || 0
          } : {
            index: 0,
            length: currentText.length
          },
          context: parsedResponse.textAdjustment.type === 'selected' && selectedText ?
            getTextWithContext(currentText, currentText.indexOf(selectedText), selectedText?.length || 0) :
            { beforeContext: '', text: currentText, afterContext: '' },
          punctuation: analyzePunctuation(parsedResponse.textAdjustment.type === 'selected' && selectedText ?
            selectedText : currentText)
        },
        fullText: currentText
      };

      console.log('[claude_chat] Constructed editSelected mode response payload:', responsePayload);
      res.json(responsePayload);
    } catch (parseError) {
      console.error('[claude_chat] Error processing AI final response:', parseError, 'Raw content:', claudeResponseContent);
      res.status(400).json({
        error: 'Error processing AI final response',
        details: parseError.message,
        content: claudeResponseContent, 
        mode: mode
      });
    }

  } catch (error) {
    console.error('Fehler bei der Chat-Anfrage:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Verarbeitung der Chat-Anfrage',
      details: error.message,
      type: error.name
    });
  }
});

module.exports = router; 