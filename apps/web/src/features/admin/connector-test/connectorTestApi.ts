import { type ConnectorTestProvider } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';

/**
 * Alles ausser 200 wird zum Fehler mit der Server-Meldung. Der Cast ist die
 * Grenzstelle: TS verengt einen generischen Union-Parameter nicht über `status`.
 */
export function unwrap<R extends { status: number; body: unknown }>(
  result: R
): Extract<R, { status: 200 }>['body'] {
  if (result.status === 200) return result.body as Extract<R, { status: 200 }>['body'];
  const body = result.body as { message?: string } | null;
  throw new Error(body?.message ?? `HTTP ${result.status}`);
}

/**
 * Öffnet das Popup synchron im Klick (sonst blockt der Browser es), holt dann den
 * Connect-Link und wartet, bis das Fenster zu ist.
 */
export async function connectInPopup(provider: ConnectorTestProvider): Promise<void> {
  const popup = window.open('', '_blank', 'width=600,height=720');
  if (!popup) throw new Error('Popup wurde blockiert.');
  try {
    const { connectLink } = unwrap(
      await getContractsClient().connectorTest.connect({ params: { provider } })
    );
    popup.location.href = connectLink;
  } catch (err) {
    popup.close();
    throw err;
  }
  await new Promise<void>((resolve) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        resolve();
      }
    }, 500);
  });
}
