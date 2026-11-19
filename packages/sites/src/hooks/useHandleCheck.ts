import { checkSiteHandle, type CheckSubdomainResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useEffect, useState } from 'react';

export type HandleCheck =
  'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'reserved' | 'unchanged';

const DEBOUNCE_MS = 400;

export function handleCheckState(i: {
  value: string;
  current: string | null;
  response: CheckSubdomainResponse | null;
  pending: boolean;
}): HandleCheck {
  const value = i.value.trim().toLowerCase();
  if (value === '') return 'idle';
  if (i.current !== null && value === i.current) return 'unchanged';
  if (i.pending) return 'checking';
  if (!i.response) return 'idle';
  if (i.response.available) return 'available';
  if (i.response.reason === 'invalid') return 'invalid';
  if (i.response.reason === 'reserved') return 'reserved';
  return 'taken';
}

export function useHandleCheck(value: string, current: string | null): HandleCheck {
  const key = value.trim().toLowerCase();
  const local = checkSiteHandle(key);
  const skip = key === '' || key === current || !local.ok;
  const [resolved, setResolved] = useState<{
    key: string;
    response: CheckSubdomainResponse | null;
  } | null>(null);

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      getContractsClient()
        .sites.checkSubdomain({ query: { subdomain: key } })
        .then(
          (res) => {
            if (!cancelled) setResolved({ key, response: res.status === 200 ? res.body : null });
          },
          () => {
            if (!cancelled) setResolved({ key, response: null });
          }
        );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, skip]);

  const settled = resolved !== null && resolved.key === key;
  const response: CheckSubdomainResponse | null = local.ok
    ? settled
      ? resolved.response
      : null
    : { available: false, reason: local.reason };
  return handleCheckState({
    value,
    current,
    response,
    pending: local.ok && key !== current && !settled,
  });
}
