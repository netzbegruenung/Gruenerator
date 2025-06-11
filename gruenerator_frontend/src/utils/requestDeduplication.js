// Race Condition Prevention
const pendingRequests = new Map();

export const fetchWithDedup = async (key, fetcher) => {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }
  
  const promise = fetcher();
  pendingRequests.set(key, promise);
  
  try {
    const result = await promise;
    return result;
  } finally {
    pendingRequests.delete(key);
  }
}; 