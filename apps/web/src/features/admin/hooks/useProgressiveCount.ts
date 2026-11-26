import { startTransition, useEffect, useState } from 'react';

/**
 * Wie viele Zeilen einer langen Liste schon gerendert werden. Das erste Bild
 * zeigt `first` Zeilen, der Rest kommt in Schritten von `step` je Frame als
 * Transition nach — der Klick auf den Eintrag bleibt so ein kurzer Frame statt
 * einer langen Aufgabe, und eine Eingabe dazwischen unterbricht das Nachladen.
 */
export function useProgressiveCount(total: number, first = 24, step = 24): number {
  const [count, setCount] = useState(first);

  useEffect(() => {
    if (count >= total) return;
    const id = requestAnimationFrame(() => {
      startTransition(() => setCount((c) => c + step));
    });
    return () => cancelAnimationFrame(id);
  }, [count, total, step]);

  return Math.min(count, total);
}
