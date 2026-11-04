import { describe, it, expect, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { MathText } from '../components/chat/math/MathText';

import type { getMarkdownStyles } from '../components/chat/markdownStyles';
import type { Theme } from '../theme/colors';

jest.mock('../components/chat/math/MathViewDOM', () => ({ __esModule: true, default: () => null }));

// The real package pulls in the whole chat runtime; only the splitter matters here.
jest.mock('@gruenerator/chat', () => ({
  normalizeMathDelimiters: (text: string) => text,
  normalizeUnicodeMath: (text: string) => text,
  splitMathSegments: (text: string) => [
    { kind: 'math-display', content: text.replace(/^\$\$|\$\$$/g, '') },
  ],
}));

type MarkdownStyles = ReturnType<typeof getMarkdownStyles>;

const theme = { text: '#000' } as unknown as Theme;

const label = async (text: string) => {
  const view = await render(
    <MathText text={text} markdownStyles={{} as MarkdownStyles} rules={null} theme={theme} />
  );
  return view.getByRole('image').props.accessibilityLabel as string;
};

describe('MathDisplay accessibility label', () => {
  it('is the German speech of the formula', async () => {
    expect(await label('$$\\sum_{k=1}^{7} n_k d_k$$')).toBe(
      'Formel: Summe von k gleich 1 bis 7 über n Index k d Index k'
    );
  });

  it('keeps the TeX source when there is no speech', async () => {
    expect(await label('$$\\underbrace{a+b}_{n}$$')).toBe('Formel: \\underbrace{a+b}_{n}');
  });
});
