/**
 * Document Structure Detector
 * Detects hierarchical structure in documents (chapters, sections, paragraphs)
 * for better context-aware chunking
 */

class DocumentStructureDetector {
  constructor() {
    // German document patterns
    this.patterns = {
      // Chapter patterns - more restrictive to avoid matching sections
      chapter: [
        /^(Kapitel|Chapter|Teil|Abschnitt)\s+([IVXLC]+|\d+)[\.:]\s*(.+)$/im,
        /^([IVXLC]+|\d+)[\.:]\s+(Kapitel|Chapter|Teil|Abschnitt)[\.:]\s*(.+)$/im,
        /^(Kapitel|Chapter|Teil|Abschnitt)\s+(\d+):\s*(.+)$/im,
        /^([IVXLC]+)[\.:]\s*([A-ZÄÖÜ][^.]*[^0-9])$/im, // Roman numerals with non-numbered titles
        /^(\d+)[\.:]\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\s]{10,50}[^0-9])$/im // Single digit with longer titles, no numbers at end
      ],
      
      // Section patterns (numbered)
      section: [
        /^(\d+(?:\.\d+)*)\s+(.+)$/m,
        /^([A-Z][\.:]\s*|\d+[\.:]\s*)(.+)$/m,
        /^(\d+\.\d+\.\d+)\s+(.+)$/m, // 1.1.1 format
        /^##\s+(.+)$/m, // Markdown H2
        /^###\s+(.+)$/m, // Markdown H3
        /^####\s+(.+)$/m // Markdown H4
      ],
      
      // Subsection patterns
      subsection: [
        /^(\d+\.\d+(?:\.\d+)*[\.:]*)\s+(.+)$/gm,
        /^([a-z]\)|[a-z][\.:]\s*)(.+)$/gm
      ],
      
      // Markdown headings
      markdown: [
        /^(#{1,6})\s+(.+)$/gm
      ],
      
      // List patterns
      list: [
        /^[\s]*[•\-\*]\s+(.+)$/m,
        /^[\s]*\d+[\.\)]\s+(.+)$/m,
        /^[\s]*[a-z][\.\)]\s+(.+)$/m
      ],
      
      // Table patterns
      table: [
        /^\|.+\|$/m,
        /^.+\t.+$/m,
        /^.+\s+\|\s+.+$/m // "Column | Column" format
      ],
      
      // Page break patterns
      pageBreak: [
        /^[\s]*[-=]{3,}[\s]*$/gm,
        /^\f/gm, // Form feed character
        /Seite\s+\d+/gim
      ]
    };
  }

  /**
   * Analyze document structure
   * @param {string} text - Full document text
   * @returns {Object} Structure analysis
   */
  analyzeStructure(text) {
    const lines = text.split('\n');
    const structure = {
      chapters: [],
      sections: [],
      lists: [],
      tables: [],
      pageBreaks: [],
      hierarchy: []
    };

    let currentChapter = null;
    let currentSection = null;
    let lineIndex = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        lineIndex++;
        continue;
      }

      // Detect sections FIRST (to avoid numbered sections being treated as chapters)
      const sectionMatch = this.detectSection(line);
      if (sectionMatch) {
        const section = {
          type: 'section',
          level: this.calculateSectionLevel(sectionMatch.number),
          title: sectionMatch.title,
          number: sectionMatch.number,
          startLine: lineIndex,
          startPosition: this.getPositionFromLine(text, lineIndex),
          parentChapter: currentChapter?.title
        };
        
        structure.sections.push(section);
        structure.hierarchy.push(section);
        
        if (currentChapter) {
          currentChapter.sections.push(section);
        }
        
        currentSection = section;
      }
      
      // Detect chapters (only if not already matched as section)
      else {
        const chapterMatch = this.detectChapter(line);
        if (chapterMatch) {
          currentChapter = {
            type: 'chapter',
            level: 1,
            title: chapterMatch.title,
            number: chapterMatch.number,
            startLine: lineIndex,
            startPosition: this.getPositionFromLine(text, lineIndex),
            sections: []
          };
          structure.chapters.push(currentChapter);
          structure.hierarchy.push(currentChapter);
          currentSection = null;
        }
      }

      // Detect lists
      const listMatch = this.detectList(line);
      if (listMatch) {
        structure.lists.push({
          type: 'list',
          content: listMatch.content,
          listType: listMatch.type,
          startLine: lineIndex,
          startPosition: this.getPositionFromLine(text, lineIndex),
          parentSection: currentSection?.title,
          parentChapter: currentChapter?.title
        });
      }

      // Detect tables
      if (this.isTableLine(line)) {
        structure.tables.push({
          type: 'table',
          startLine: lineIndex,
          startPosition: this.getPositionFromLine(text, lineIndex),
          parentSection: currentSection?.title,
          parentChapter: currentChapter?.title
        });
      }

      // Detect page breaks
      if (this.isPageBreak(line)) {
        structure.pageBreaks.push({
          type: 'pageBreak',
          startLine: lineIndex,
          startPosition: this.getPositionFromLine(text, lineIndex)
        });
      }

      lineIndex++;
    }

    return this.enhanceStructure(structure, text);
  }

  /**
   * Detect chapter headings
   */
  detectChapter(line) {
    for (const pattern of this.patterns.chapter) {
      const match = line.match(pattern);
      if (match) {
        const number = match[1] || match[2] || '';
        const title = (match[3] || match[2] || match[1] || '').trim();
        
        if (title) {
          return {
            number: number,
            title: title
          };
        }
      }
    }
    return null;
  }

  /**
   * Detect section headings
   */  
  detectSection(line) {
    for (const pattern of this.patterns.section) {
      const match = line.match(pattern);
      if (match && match[2]) {
        const title = match[2].trim();
        // Filter out false positives (too short, all caps, etc.)
        if (title.length >= 3 && title !== title.toUpperCase()) {
          return {
            number: (match[1] || '').trim(),
            title: title
          };
        }
      }
    }

    // Check markdown headings
    for (const pattern of this.patterns.markdown) {
      const match = line.match(pattern);
      if (match && match[2]) {
        return {
          number: match[1].length.toString(), // # count as level
          title: match[2].trim()
        };
      }
    }

    return null;
  }

  /**
   * Detect list items
   */
  detectList(line) {
    for (const pattern of this.patterns.list) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return {
          content: match[1].trim(),
          type: this.getListType(line)
        };
      }
    }
    return null;
  }

  /**
   * Check if line is part of a table
   */
  isTableLine(line) {
    return this.patterns.table.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is a page break
   */
  isPageBreak(line) {
    return this.patterns.pageBreak.some(pattern => pattern.test(line));
  }

  /**
   * Calculate hierarchical level for sections
   */
  calculateSectionLevel(numberString) {
    if (!numberString) return 2;
    
    // Count dots to determine depth (1.1 = level 2, 1.1.1 = level 3, etc.)
    const dots = (numberString.match(/\./g) || []).length;
    return Math.min(dots + 2, 6); // Cap at level 6
  }

  /**
   * Determine list type
   */
  getListType(line) {
    if (/^[\s]*\d+[\.\)]/.test(line)) return 'ordered';
    if (/^[\s]*[a-z][\.\)]/.test(line)) return 'alpha';
    return 'unordered';
  }

  /**
   * Get character position from line number
   */
  getPositionFromLine(text, lineNumber) {
    const lines = text.split('\n');
    let position = 0;
    for (let i = 0; i < lineNumber && i < lines.length; i++) {
      position += lines[i].length + 1; // +1 for newline
    }
    return position;
  }

  /**
   * Enhance structure with additional analysis
   */
  enhanceStructure(structure, text) {
    // Calculate section boundaries
    structure.hierarchy.forEach((item, index) => {
      const nextItem = structure.hierarchy[index + 1];
      if (nextItem) {
        item.endPosition = nextItem.startPosition - 1;
        item.endLine = nextItem.startLine - 1;
      } else {
        item.endPosition = text.length;
        item.endLine = text.split('\n').length - 1;
      }
      
      // Calculate content length
      item.contentLength = item.endPosition - item.startPosition;
      item.content = text.substring(item.startPosition, item.endPosition);
    });

    // Add document-level metadata
    structure.metadata = {
      totalLines: text.split('\n').length,
      totalCharacters: text.length,
      hasChapters: structure.chapters.length > 0,
      hasSections: structure.sections.length > 0,
      hasLists: structure.lists.length > 0,
      hasTables: structure.tables.length > 0,
      structureComplexity: this.calculateComplexity(structure),
      documentType: this.inferDocumentType(structure)
    };

    return structure;
  }

  /**
   * Calculate document structure complexity
   */
  calculateComplexity(structure) {
    let complexity = 0;
    complexity += structure.chapters.length * 3;
    complexity += structure.sections.length * 2;
    complexity += structure.lists.length * 1;
    complexity += structure.tables.length * 2;
    
    if (complexity <= 5) return 'simple';
    if (complexity <= 15) return 'moderate';
    return 'complex';
  }

  /**
   * Infer document type based on structure
   */
  inferDocumentType(structure) {
    if (structure.chapters.length > 5) return 'book';
    if (structure.chapters.length > 0) return 'report';
    if (structure.sections.length > 10) return 'manual';
    if (structure.lists.length > structure.sections.length) return 'list_document';
    if (structure.tables.length > 0) return 'data_document';
    return 'article';
  }

  /**
   * Find semantic boundaries for chunking
   * @param {string} text 
   * @param {Object} structure 
   * @returns {Array} Array of boundary positions
   */
  findSemanticBoundaries(text, structure) {
    const boundaries = [];
    
    // Add all structural boundaries
    structure.hierarchy.forEach(item => {
      boundaries.push({
        position: item.startPosition,
        type: item.type,
        level: item.level,
        title: item.title,
        importance: this.getBoundaryImportance(item.type)
      });
    });

    // Add paragraph boundaries for sections without subsections
    const paragraphBoundaries = this.findParagraphBoundaries(text, structure);
    boundaries.push(...paragraphBoundaries);

    // Sort by position
    boundaries.sort((a, b) => a.position - b.position);

    return boundaries;
  }

  /**
   * Find paragraph boundaries
   */
  findParagraphBoundaries(text, structure) {
    const boundaries = [];
    const lines = text.split('\n');
    let position = 0;
    let inParagraph = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine === '') {
        if (inParagraph) {
          // End of paragraph
          boundaries.push({
            position: position,
            type: 'paragraph',
            level: 5,
            importance: 1
          });
          inParagraph = false;
        }
      } else {
        if (!inParagraph) {
          // Start of new paragraph
          inParagraph = true;
        }
      }

      position += line.length + 1; // +1 for newline
    }

    return boundaries;
  }

  /**
   * Get boundary importance (for chunking decisions)
   */
  getBoundaryImportance(type) {
    const importance = {
      'chapter': 5,
      'section': 4,
      'subsection': 3,
      'paragraph': 1,
      'list': 2,
      'table': 2
    };
    return importance[type] || 1;
  }
}

export const documentStructureDetector = new DocumentStructureDetector();
export default DocumentStructureDetector;