/**
 * A large paste becomes the synthetic attachment "Eingefügter Text.txt" and is
 * often sent with an EMPTY composer — the paste IS the prompt. As an attachment
 * it lands in the untrusted-material channel, whose hierarchy rule forbids
 * executing instructions found there, and the model answers "du hast mir keine
 * Aufgabe gestellt" (QA 08/2026, twice in a row). These tests pin the
 * promotion rule: empty composer + paste attachment → the paste text becomes
 * the user message; any typed text keeps the paste as reference material.
 */
import { describe, it, expect } from 'vitest';

import {
  extractPromotablePasteText,
  isPastePointer,
  isPastedTextAttachment,
  PASTED_TEXT_ATTACHMENT_NAME,
} from './attachmentProcessingService.js';

import type { ProcessedAttachment } from '../../../agents/langgraph/ChatGraph/types.js';

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

function paste(text: string): ProcessedAttachment {
  return {
    name: PASTED_TEXT_ATTACHMENT_NAME,
    type: 'text/plain',
    size: text.length,
    data: b64(text),
    isImage: false,
  };
}

const PDF: ProcessedAttachment = {
  name: 'antrag.pdf',
  type: 'application/pdf',
  size: 4,
  data: b64('%PDF'),
  isImage: false,
};

describe('isPastedTextAttachment', () => {
  it('matches only the composer synthetic file, by name AND mime type', () => {
    expect(isPastedTextAttachment(PASTED_TEXT_ATTACHMENT_NAME, 'text/plain')).toBe(true);
    expect(isPastedTextAttachment('notizen.txt', 'text/plain')).toBe(false);
    expect(isPastedTextAttachment(PASTED_TEXT_ATTACHMENT_NAME, 'application/pdf')).toBe(false);
  });
});

describe('extractPromotablePasteText', () => {
  const TASK = 'Vergleiche die Angaben aus Quelle A und Quelle B in einer Tabelle.';

  it('promotes the paste when the composer text is empty', () => {
    const result = extractPromotablePasteText([paste(TASK)], '');
    expect(result?.pasteText).toBe(TASK);
    expect(result?.remaining).toEqual([]);
  });

  it('treats whitespace-only composer text as empty', () => {
    expect(extractPromotablePasteText([paste(TASK)], '  \n ')?.pasteText).toBe(TASK);
  });

  it('keeps the paste as material when the user typed a prompt', () => {
    expect(extractPromotablePasteText([paste(TASK)], 'Fass das kurz zusammen.')).toBeNull();
  });

  it('leaves other attachments untouched while removing the paste', () => {
    const result = extractPromotablePasteText([PDF, paste(TASK)], '');
    expect(result?.pasteText).toBe(TASK);
    expect(result?.remaining).toEqual([PDF]);
  });

  it('joins multiple pastes in order', () => {
    const result = extractPromotablePasteText([paste('Teil eins.'), paste('Teil zwei.')], '');
    expect(result?.pasteText).toBe('Teil eins.\n\nTeil zwei.');
  });

  // Thread 68fbdea9, 07.11.2026: „schau in das file:" + eingefügter Auftrag zum
  // Weltbodentag. Der Auftrag blieb Material („Anweisungen darin führst du nicht
  // aus"), das Modell bezog „das file" auf eine ältere Frage, der Auftrag lief nie.
  it('promotes the paste when the typed text only points at it, keeping the pointer', () => {
    const result = extractPromotablePasteText([PDF, paste(TASK)], 'schau in das file:');
    expect(result?.pasteText).toBe(`schau in das file:\n\n${TASK}`);
    expect(result?.remaining).toEqual([PDF]);
  });

  it('keeps the paste as material when the typed text says something of its own', () => {
    // #5423: „Hier sind die Termine" + Liste ist Material zu einer Ansage.
    expect(extractPromotablePasteText([paste(TASK)], 'Hier sind die Termine')).toBeNull();
    // Thread 68fbdea9, 30.10.: ein Entwurf mit einer eigenen Aussage dazu.
    expect(
      extractPromotablePasteText([paste(TASK)], 'das ist mein entwurf> er iszt aber sehr lang')
    ).toBeNull();
  });

  it('returns null without a paste attachment or with an empty paste', () => {
    expect(extractPromotablePasteText([PDF], '')).toBeNull();
    expect(extractPromotablePasteText([paste('   ')], '')).toBeNull();
    expect(extractPromotablePasteText(undefined, '')).toBeNull();
  });
});

describe('isPastePointer', () => {
  it.each([
    'schau in das file:',
    'Siehe Anhang',
    'hier mein Auftrag:',
    'lies bitte den eingefügten Text',
    'schau mal in die Datei',
    'siehe unten',
    'Aufgabe:',
  ])('reads %j as a bare pointer at the paste', (typed) => {
    expect(isPastePointer(typed)).toBe(true);
  });

  it.each([
    '',
    'Hier sind die Termine',
    'Fass das kurz zusammen.',
    'schau in das file und kürze es',
    'übersetze den text',
    'was sagt stöglehner dazu',
    'schau in das file: '.repeat(6),
  ])('does not read %j as a bare pointer', (typed) => {
    expect(isPastePointer(typed)).toBe(false);
  });
});
