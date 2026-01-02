/**
 * Confidence analyzer for extracted parameters
 * Checks if parameters meet quality thresholds
 */

import type { ExtractedParameters, ConfidenceAnalysis } from '../types.js';

/**
 * Check if extracted parameters meet confidence thresholds for required fields
 */
export function analyzeParameterConfidence(
  params: ExtractedParameters,
  agent: string
): ConfidenceAnalysis {
  const analysis: ConfidenceAnalysis = {
    allRequiredPresent: true,
    lowConfidenceFields: [],
    missingFields: []
  };

  // Define minimum confidence thresholds for different fields
  const confidenceThresholds: Record<string, number> = {
    name: 0.7,
    thema: 0.5,
    details: 0.3
  };

  // Define required fields per agent
  const requiredFields: Record<string, string[]> = {
    'zitat': ['name'],
    'zitat_pure': ['name']
  };

  const requiredForAgent = requiredFields[agent] || [];

  for (const field of requiredForAgent) {
    const value = (params as unknown as Record<string, unknown>)[field];
    const confidence = params._parameterConfidence?.[field] || 0;
    const threshold = confidenceThresholds[field] || 0.5;

    // Check if field is missing or has low confidence
    if (!value || value === 'Unbekannt' || value === '') {
      analysis.missingFields.push(field);
      analysis.allRequiredPresent = false;
    } else if (confidence < threshold) {
      analysis.lowConfidenceFields.push({
        field,
        value,
        confidence,
        threshold
      });
      analysis.allRequiredPresent = false;
    }
  }

  return analysis;
}
