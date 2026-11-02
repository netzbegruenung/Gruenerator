import { type MarketplaceCollectionId } from '@gruenerator/contracts';
import { useCollectionSubscriptions } from '@gruenerator/shared/marketplace';
import { Button } from '@gruenerator/ui';
import { type JSX, useRef } from 'react';
import { toast } from 'sonner';

/**
 * „Abonnieren" on a collection page. The state shows at once; a failed request
 * puts it back and says so. While one request runs the button ignores clicks,
 * so a double click is one request.
 */
export function SubscribeButton({
  collectionId,
}: {
  collectionId: MarketplaceCollectionId;
}): JSX.Element {
  const { isSubscribed, subscribe, unsubscribe } = useCollectionSubscriptions();
  const subscribed = isSubscribed(collectionId);
  const busy = useRef(false);

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await (subscribed ? unsubscribe(collectionId) : subscribe(collectionId));
    } catch {
      toast.error(subscribed ? 'Abbestellen fehlgeschlagen.' : 'Abonnieren fehlgeschlagen.');
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        size="lg"
        className="rounded-full dark:bg-primary-700 dark:hover:bg-primary-800"
        aria-pressed={subscribed}
        onClick={() => void toggle()}
      >
        {subscribed ? 'Abonniert ✓' : 'Abonnieren'}
      </Button>
      {subscribed && (
        <p className="m-0 text-sm text-foreground-muted">
          Neues vom Landesverband kommt automatisch dazu
        </p>
      )}
    </div>
  );
}
