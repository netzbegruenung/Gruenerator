import MarkdownIt from 'markdown-it';
// @ts-expect-error -- untyped deep import of the patched file; the package types only its root
import parser from 'react-native-markdown-display/src/lib/parser';
import { describe, expect, it } from 'vitest';

// react-native-markdown-display keys every AST node from a global counter, so
// each parse produced new keys and React remounted the whole native tree of a
// message on every streamed token (35k host mounts for one 2.4k-char answer).
// patches/react-native-markdown-display@7.0.2.patch keys nodes by type and
// position among their siblings instead. This runs the installed copy, so a
// dropped patch fails here.

interface AstNode {
  key: string;
  type: string;
  children: AstNode[];
}

const md = MarkdownIt({ typographer: true });
const toAst = (source: string): AstNode[] => parser(source, (nodes: AstNode[]) => nodes, md);

function keyPaths(nodes: AstNode[], prefix = ''): string[] {
  return nodes.flatMap((node) => {
    const path = `${prefix}/${node.key}`;
    return [path, ...keyPaths(node.children, path)];
  });
}

const SAMPLE = [
  '# Titel',
  '',
  'Ein Absatz mit **fett**, *kursiv* und `code`.',
  '',
  '- eins',
  '- zwei',
  '',
  '```ts',
  'const a = 1;',
  '```',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
].join('\n');

describe('markdown AST keys', () => {
  it('are identical across parses of the same text', () => {
    expect(keyPaths(toAst(SAMPLE))).toEqual(keyPaths(toAst(SAMPLE)));
  });

  it('keep the keys of earlier blocks when text is appended', () => {
    const before = keyPaths(toAst(SAMPLE));
    const after = keyPaths(toAst(`${SAMPLE}\n\nNoch ein Absatz`));
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('are unique among siblings', () => {
    const check = (nodes: AstNode[]) => {
      expect(new Set(nodes.map((n) => n.key)).size).toBe(nodes.length);
      nodes.forEach((n) => check(n.children));
    };
    check(toAst(SAMPLE));
  });
});
