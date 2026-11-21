import { type CheckSubdomainResponse } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { handleCheckState } from './useHandleCheck';

const base = { value: 'anna', current: null, response: null, pending: false };
const res = (r: CheckSubdomainResponse) => r;

describe('handleCheckState', () => {
  it.each([
    ['empty value', { value: '  ' }, 'idle'],
    ['same as the saved address', { current: 'anna' }, 'unchanged'],
    ['same, different case', { value: 'ANNA', current: 'anna' }, 'unchanged'],
    ['request pending', { pending: true }, 'checking'],
    ['no answer', {}, 'idle'],
    ['free', { response: res({ available: true }) }, 'available'],
    ['taken', { response: res({ available: false }) }, 'taken'],
    ['invalid', { response: res({ available: false, reason: 'invalid' }) }, 'invalid'],
    ['reserved', { response: res({ available: false, reason: 'reserved' }) }, 'reserved'],
  ] as const)('%s', (_name, over, expected) => {
    expect(handleCheckState({ ...base, ...over })).toBe(expected);
  });
});
