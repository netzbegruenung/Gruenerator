import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const check = vi.hoisted(() => vi.fn());
vi.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ sites: { checkSubdomain: check } }),
}));

import { useState } from 'react';

import { useHandleCheck } from '../../../hooks/useHandleCheck';

import { AddressField } from './AddressField';

function Harness({
  initial = '',
  current = null,
  locked = false,
  publicOrigin = 'https://grsites.de',
}: {
  initial?: string;
  current?: string | null;
  locked?: boolean;
  publicOrigin?: string | null;
}) {
  const [value, setValue] = useState(initial);
  return (
    <AddressField
      id="addr"
      value={value}
      onChange={setValue}
      current={current}
      publicOrigin={publicOrigin}
      locked={locked}
    />
  );
}

describe('AddressField', () => {
  beforeEach(() => {
    check.mockReset();
  });

  it('shows "bereits vergeben" for a taken name', async () => {
    check.mockResolvedValue({ status: 200, body: { available: false } });
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Adresse'), 'anna');
    expect(await screen.findByText('Diese Adresse ist bereits vergeben')).toBeInTheDocument();
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({ query: { subdomain: 'anna' } });
  });

  it('shows the free message and the host of public_origin', async () => {
    check.mockResolvedValue({ status: 200, body: { available: true } });
    const user = userEvent.setup();
    render(<Harness publicOrigin="https://grsites.at" />);
    await user.type(screen.getByLabelText('Adresse'), 'berta');
    expect(await screen.findByText('Diese Adresse ist frei')).toBeInTheDocument();
    expect(screen.getByText('grsites.at/')).toBeInTheDocument();
  });

  it('falls back to grsites.de without public_origin', () => {
    render(<Harness publicOrigin={null} />);
    expect(screen.getByText('grsites.de/')).toBeInTheDocument();
  });

  it('answers a reserved name without a request', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Adresse'), 'admin');
    expect(await screen.findByText('Diese Adresse ist reserviert')).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();
  });

  it('is read-only after the first publish', () => {
    render(<Harness initial="anna" current="anna" locked />);
    expect(screen.getByLabelText('Adresse')).toHaveAttribute('readonly');
    expect(
      screen.getByText('Die Adresse lässt sich nach dem ersten Veröffentlichen nicht mehr ändern.')
    ).toBeInTheDocument();
  });

  it('keeps typed hyphens and drops invalid characters', async () => {
    check.mockResolvedValue({ status: 200, body: { available: true } });
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Adresse'), 'Dein Na-me');
    expect(screen.getByLabelText('Adresse')).toHaveValue('deinna-me');
  });
});

describe('useHandleCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    check.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('debounces by 400 ms, shows checking, then the answer', async () => {
    check.mockResolvedValue({ status: 200, body: { available: true } });
    const { result, rerender } = renderHook(({ v }) => useHandleCheck(v, null), {
      initialProps: { v: 'ann' },
    });
    expect(result.current).toBe('checking');
    rerender({ v: 'anna' });
    await act(() => vi.advanceTimersByTimeAsync(399));
    expect(check).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({ query: { subdomain: 'anna' } });
    expect(result.current).toBe('available');
  });

  it('reports unchanged without a request, and idle for an empty value', async () => {
    const same = renderHook(() => useHandleCheck('anna', 'anna'));
    const empty = renderHook(() => useHandleCheck('', null));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(same.result.current).toBe('unchanged');
    expect(empty.result.current).toBe('idle');
    expect(check).not.toHaveBeenCalled();
  });

  it('maps server reasons and a failed request', async () => {
    check.mockResolvedValueOnce({ status: 200, body: { available: false, reason: 'invalid' } });
    const a = renderHook(() => useHandleCheck('anna', null));
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(a.result.current).toBe('invalid');
    check.mockRejectedValueOnce(new Error('offline'));
    const b = renderHook(() => useHandleCheck('berta', null));
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(b.result.current).toBe('idle');
  });

  it('classifies a reserved name locally', () => {
    const { result } = renderHook(() => useHandleCheck('login', null));
    expect(result.current).toBe('reserved');
    expect(check).not.toHaveBeenCalled();
  });
});
