/**
 * Flags raw `error.message` values on their way to a user.
 *
 * Tooling output (FFmpeg stderr, driver errors, stack traces) means nothing to
 * users and leaks internals. Backend code must route such values through
 * `toJobError()` / `toUserFacingMessage()` from `utils/errors`, which maps
 * known failure signatures to curated German text and collapses the rest.
 *
 * Only *outbound* positions are flagged: response bodies (`res.json`,
 * `res.send`, ts-rest `{ status, body }`) and job-status documents
 * (`JSON.stringify`, `redisClient.set`, `updateProgress`). Logging keeps the
 * raw value on purpose — that is where it belongs.
 */

const RAW_KEYS = new Set(['error', 'message', 'data']);
const OUTBOUND_CALLEES = new Set(['json', 'send', 'stringify', 'set', 'updateProgress']);
const LOGGER_OBJECTS = new Set(['log', 'logger', 'console']);
const LOGGER_METHODS = new Set(['error', 'warn', 'info', 'debug', 'log']);

function isErrorMessageAccess(node) {
  return (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.name === 'message' &&
    node.object?.type === 'Identifier' &&
    /^(err|error|e|ex|cause)$/i.test(node.object.name)
  );
}

/** `error: e.message` or `error: e instanceof Error ? e.message : …` */
function rawMessageValue(value) {
  if (isErrorMessageAccess(value)) return true;
  if (value?.type === 'ConditionalExpression') {
    return isErrorMessageAccess(value.consequent) || isErrorMessageAccess(value.alternate);
  }
  if (value?.type === 'LogicalExpression') {
    return isErrorMessageAccess(value.left) || isErrorMessageAccess(value.right);
  }
  return false;
}

function isLoggerCall(node) {
  const callee = node.callee;
  if (callee?.type !== 'MemberExpression') return false;
  const objectName =
    callee.object?.type === 'Identifier'
      ? callee.object.name
      : callee.object?.property?.name; /* this.log.error(…) */
  return LOGGER_OBJECTS.has(objectName) && LOGGER_METHODS.has(callee.property?.name);
}

/** Walk up to decide whether this property ends up leaving the process. */
function reachesClient(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === 'CallExpression') {
      if (isLoggerCall(current)) return false;
      const callee = current.callee;
      const name = callee?.type === 'MemberExpression' ? callee.property?.name : callee?.name;
      if (OUTBOUND_CALLEES.has(name)) return true;
      // Any other call swallows the object — stop guessing.
      return false;
    }
    if (current.type === 'ReturnStatement') {
      // Contract handlers return `{ status, body }` — treat as outbound.
      return true;
    }
    if (current.type === 'FunctionDeclaration' || current.type === 'ArrowFunctionExpression') {
      return false;
    }
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw error messages in responses and job statuses',
    },
    schema: [],
    messages: {
      rawError:
        'Roher Fehlertext ({{key}}) verlässt hier den Server. Nutze toJobError() / toUserFacingMessage() aus utils/errors — der Rohtext gehört ins Log.',
    },
  },
  create(context) {
    return {
      Property(node) {
        if (node.computed || node.key?.type !== 'Identifier') return;
        if (!RAW_KEYS.has(node.key.name)) return;
        if (!rawMessageValue(node.value)) return;
        if (!reachesClient(node)) return;

        context.report({ node, messageId: 'rawError', data: { key: node.key.name } });
      },
    };
  },
};
