# Content Examples Integration Guide

## Overview

This guide describes the integration of the ContentExamplesService with the PromptBuilder system, providing a clean, maintainable approach to including relevant examples in AI prompts.

## Architecture

### Components

1. **ContentExamplesService** (`services/contentExamplesService.js`)
   - Handles vector similarity search for relevant examples
   - Manages caching and fallback strategies
   - Returns examples with similarity scores and metadata

2. **PromptBuilderWithExamples** (`utils/promptBuilderWithExamples.js`)
   - Extends base PromptBuilder with dedicated examples support
   - Provides configurable formatting options
   - Handles example truncation and relevance labeling

3. **Integration Helper** (`addExamplesFromService`)
   - Async helper function to fetch and add examples
   - Handles errors gracefully without breaking prompt building
   - Provides consistent logging

## Usage

### Basic Integration

```javascript
import { PromptBuilderWithExamples, addExamplesFromService } from '../utils/promptBuilderWithExamples';

// Create builder with examples support
const builder = new PromptBuilderWithExamples('social')
  .enableDebug(process.env.NODE_ENV === 'development')
  .configureExamples({
    maxExamples: 3,
    maxCharactersPerExample: 400,
    includeSimilarityInfo: true,
    formatStyle: 'structured'
  });

// Add examples from service
await addExamplesFromService(builder, 'instagram', searchQuery, {
  limit: 3,
  useCache: true
});
```

### Configuration Options

#### Examples Configuration

```javascript
builder.configureExamples({
  maxExamples: 5,              // Maximum number of examples to include
  maxCharactersPerExample: 500, // Max characters per example
  includeSimilarityInfo: true,  // Include relevance information
  formatStyle: 'structured'      // 'structured', 'inline', or 'minimal'
});
```

#### Format Styles

1. **Structured** (Default)
   - Full formatting with headers, relevance info, and metadata
   - Best for complex prompts requiring detailed context
   
2. **Inline**
   - Simple numbered list format
   - Good for quick reference examples
   
3. **Minimal**
   - Just the content with minimal formatting
   - Best when examples should blend with other content

### Manual Examples Addition

```javascript
// Add examples manually
const examples = [
  {
    id: '123',
    content: 'Example content here...',
    title: 'Example Title',
    similarity_score: 0.85,
    metadata: {
      categories: ['category1'],
      tags: ['tag1', 'tag2']
    }
  }
];

builder.addExamples(examples, {
  formatStyle: 'inline'
});
```

## Prompt Structure

Examples are inserted in the following hierarchy:

```
SYSTEM MESSAGE
  - Role
  - Constraints
  - Formatting

USER MESSAGES
  1. Documents (if present)
  2. Main Content:
     - WISSEN (Knowledge)
     - BEISPIELE (Examples) ← NEW
     - ANWEISUNGEN (Instructions)
     - ANFRAGE (Request)
```

## Migration Strategy

### Phase 1: Pilot Routes (Completed)
- ✅ Implement PromptBuilderWithExamples
- ✅ Update claude_social.js as pilot
- ✅ Validate examples integration

### Phase 2: Gradual Rollout
1. **High-Value Routes First**
   - `claude_universal.js` - Universal text generation
   - `claude_gruene_jugend.js` - Youth content
   - `antrag_simple.js` - Political proposals

2. **Update Pattern**
   ```javascript
   // Old
   const { PromptBuilder } = require('../utils/promptBuilder');
   const builder = new PromptBuilder('type');
   
   // New
   const { PromptBuilderWithExamples } = require('../utils/promptBuilderWithExamples');
   const builder = new PromptBuilderWithExamples('type');
   ```

3. **Add Examples Where Relevant**
   ```javascript
   // Only add examples where they provide value
   if (shouldIncludeExamples(requestType)) {
     await addExamplesFromService(builder, contentType, query);
   }
   ```

### Phase 3: Optimization
- Monitor example usage and effectiveness
- Tune similarity thresholds per content type
- Optimize caching strategies
- Add metrics collection

## Best Practices

### 1. Content Type Mapping

Map user-facing types to example types:

```javascript
const exampleTypeMapping = {
  'social_instagram': 'instagram',
  'social_facebook': 'facebook',
  'political_motion': 'antrag',
  'speech': 'rede'
};
```

### 2. Query Construction

Build effective search queries:

```javascript
// Combine multiple fields for better matches
const searchQuery = [
  thema,
  details,
  keywords
].filter(Boolean).join(' ');
```

### 3. Error Handling

Always handle example fetching failures gracefully:

```javascript
try {
  await addExamplesFromService(builder, type, query);
} catch (error) {
  console.warn('Examples fetch failed, continuing without examples');
  // Continue building prompt without examples
}
```

### 4. Performance Considerations

- Use caching for frequently requested examples
- Limit example count based on prompt size
- Consider async fetching for multiple platforms

## Monitoring and Debugging

### Debug Output

Enable debug mode to see examples in prompt:

```javascript
builder.enableDebug(true);
```

Output includes:
- Examples count
- Format style
- Content length per example
- Relevance scores

### Logging

Key log points:
- `[ContentExamplesService]` - Service operations
- `[PromptBuilderWithExamples]` - Builder operations
- `[route_name]` - Route-specific integration

## Future Enhancements

### Short-term
- [ ] Add example quality scoring
- [ ] Implement example deduplication
- [ ] Add platform-specific formatting

### Medium-term
- [ ] Machine learning for example selection
- [ ] User feedback integration
- [ ] A/B testing framework

### Long-term
- [ ] Auto-generate examples from successful outputs
- [ ] Cross-platform example adaptation
- [ ] Multi-language example support

## Troubleshooting

### No Examples Found
1. Check vector search service is running
2. Verify embeddings are generated
3. Check similarity threshold settings
4. Ensure examples exist in database

### Examples Not Appearing in Prompt
1. Verify builder is PromptBuilderWithExamples
2. Check examples were added successfully
3. Review debug output for issues
4. Ensure proper formatting style

### Performance Issues
1. Enable caching in ContentExamplesService
2. Reduce maxExamples count
3. Use async fetching for multiple types
4. Monitor embedding generation time

## Support

For questions or issues:
- Check debug logs first
- Review this guide
- Contact backend team for assistance