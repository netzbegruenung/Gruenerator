import { type ThreadMessageLike, type ThreadMessage } from '@assistant-ui/react-native';
import {
  fromThreadMessageLike,
  getAutoStatus,
  generateId,
} from '@assistant-ui/react-native/internal';

export { convertToThreadMessageLike } from './messageConversion';
export { type LoadedMessage, type ConvertedMessage } from './messageConversion';

export function transformMessageLike(msg: ThreadMessageLike): ThreadMessage {
  return fromThreadMessageLike(
    msg,
    generateId(),
    getAutoStatus(false, false, false, false, undefined)
  );
}
