# Issue: `useLocalRuntime` + `useRemoteThreadListRuntime` — `run()` re-invoked after interrupt with `msgs=1`, no assistant message

## Environment

- `@assistant-ui/react`: **0.12.10**
- Runtime: `useRemoteThreadListRuntime` wrapping `useLocalRuntime`
- Backend: LangGraph with HITL (human-in-the-loop) interrupt → SSE stream

## What we're building

A chat with LangGraph that uses **HITL interrupts** for clarification. When the LLM needs user input, the backend sends an `interrupt` SSE event, and the frontend shows an interactive `ask_human` tool call UI. The user picks an option, and we call a `/resume` endpoint.

## Setup (simplified)

### Runtime hook

```tsx
function useGrueneratorThreadRuntime() {
  const modelAdapter = useMemo(
    () => createGrueneratorModelAdapter(getConfig, { onThreadCreated, onComplete }),
    [getConfig, onThreadCreated, onComplete]
  );
  return useLocalRuntime(modelAdapter, { unstable_humanToolNames: ['ask_human'] });
}

// Wrapped with useRemoteThreadListRuntime:
const runtime = useRemoteThreadListRuntime({
  runtimeHook: useGrueneratorThreadRuntime,
  adapter: threadListAdapter, // has unstable_Provider: GrueneratorHistoryProvider
});
```

### Model adapter (`run()` generator)

```tsx
export function createGrueneratorModelAdapter(getConfig, callbacks): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const config = getConfig();

      // Resume detection: look for ask_human tool-call with result
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        const askHumanResult = lastAssistant.content.find(
          p => p.type === 'tool-call' &&
               p.toolName === 'ask_human' &&
               typeof p.result === 'string' && p.result.length > 0
        );
        if (askHumanResult) {
          // Call /resume endpoint with the user's answer
          const response = await fetch('/api/chat-graph/resume', {
            method: 'POST',
            body: JSON.stringify({ threadId: config.threadId, resume: askHumanResult.result }),
          });
          yield* parseSSEStream(response, callbacks);
          return;
        }
      }

      // Normal stream
      const response = await fetch('/api/chat-graph/stream', { ... });
      yield* parseSSEStream(response, callbacks);
    },
  };
}
```

### SSE stream parser — interrupt handling

When the backend sends an interrupt, the SSE parser:

1. Receives a `thinking_step` event that creates an `ask_human` tool call (with `status: 'in_progress'`, no result)
2. Receives an `interrupt` event
3. Receives a `done` event with `interrupted: true`

The final `buildResult()` returns:

```tsx
{
  content: [
    {
      type: 'tool-call',
      toolCallId: 'clarify_1234',
      toolName: 'ask_human',
      args: { question: 'What topic?', options: ['A', 'B', 'C'] },
      argsText: '...',
      // NO result property — this is the pending human tool call
    },
    { type: 'text', text: '' },
  ],
  metadata: { custom: { progress: { stage: 'complete' } } },
  status: { type: 'requires-action', reason: 'tool-calls' },
}
```

### Tool UI registration

```tsx
const toolkit: Toolkit = {
  ask_human: {
    render: ({ args, result, addResult }) => (
      <AskHumanToolUI args={args} result={result} addResult={addResult} />
    ),
  },
};
```

The `AskHumanToolUI` renders option buttons. When clicked: `addResult(selectedOption)`.

## The problem

### Problem 1: Spurious `run()` ~5s after interrupt

After the stream completes with `status: requires-action`, the clarification UI renders correctly. However, **~5 seconds later**, `run()` is called again with:

```
msgs=1, askHumanParts=0
```

Only the user message is in the `messages` array — **no assistant message** with the `ask_human` tool call. This spurious call sends a fresh `/stream` request, which gets ANOTHER interrupt, creating a loop (8+ requests).

**Suspected cause**: `useRemoteThreadListRuntime`'s history provider. During the initial stream, a `thread_created` SSE event fires and we call `setCurrentThread(newThreadId)` in the store. This triggers the history provider's `load()`, which fetches messages from the API. When the messages load (~5s later), the runtime might re-evaluate the thread state and determine a `run()` is needed (seeing only the user message since the interrupted assistant message isn't persisted yet as a complete message).

### Problem 2: `addResult`-triggered `run()` also has `msgs=1`

When the user clicks an option in the tool UI:

```
[AskHumanToolUI] Option clicked: Energiepolitik
[ModelAdapter] run() called — msgs=1, askHumanParts=0    ← NO assistant message!
[AskHumanToolUI] addResult() returned
[AskHumanToolUI] render — result=Energiepolitik          ← UI shows "answered"
```

`addResult(option)` **synchronously** triggers `run()` (confirmed by log ordering). But the messages array still has only 1 message (the user message). The assistant message with the `ask_human` tool call + result is NOT in the `messages` array.

This means our resume detection (`lastAssistant.content.find(p => p.toolName === 'ask_human' && p.result)`) never finds anything.

### What we tried

| Approach                                | Outcome                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No guard                                | Loop of 8+ requests                                                                                                                       |
| Guard: `return` (no yield)              | Kills `requires-action` state — clicking does nothing                                                                                     |
| Guard: re-yield `lastInterruptedResult` | `Duplicate key toolCallId-clarify_xxx in tapResources` crash                                                                              |
| Guard: hang on `abortSignal`            | Blocks `addResult` from triggering a new run (run already in progress)                                                                    |
| Guard: `throw AbortError`               | Blocks spurious call silently, BUT also blocks the legitimate `addResult`-triggered call (both look identical: `msgs=1, askHumanParts=0`) |

## Questions

1. **Why does `run()` receive only the user message (`msgs=1`) after interrupt?** With `status: requires-action` and `humanToolNames: ['ask_human']`, we expected the committed assistant message (with the pending `ask_human` tool call) to appear in `messages` when `run()` is called again (both for the spurious call and the `addResult`-triggered call). Is this expected behavior with `useRemoteThreadListRuntime`?

2. **Why is `run()` called ~5s after the interrupt?** With `humanToolNames` including `ask_human`, we expected the runtime to wait for `addResult` and not call `run()` on its own. What triggers this spurious re-invocation? Is it related to `useRemoteThreadListRuntime`'s history loading?

3. **What is the correct pattern for HITL interrupts with `useLocalRuntime` + `useRemoteThreadListRuntime`?** Should we:
   - Use a different status/content format in the generator's final yield?
   - Handle the resume differently (not through the `run()` generator)?
   - Use a different API than `unstable_humanToolNames`?
   - Communicate the `addResult` answer through a side-channel since `messages` doesn't include it?

4. **Is the `Duplicate key toolCallId` error expected** when yielding the same tool call content from a second `run()` invocation? Is there a way to "refresh" the requires-action state without creating duplicate keys?

## Full console log for reference

```
[ChatProvider] Creating modelAdapter (adapter_...)
[ModelAdapter:run_1] run() called — msgs=1, threadId=xxx, interruptedThread=null, askHumanParts=0
[ModelAdapter:run_1] Sending stream request → /api/chat-graph/stream
[SSE] interrupt event received
[AskHumanToolUI] render — result=undefined, hasAddResult=true, question=..., optionCount=4
[SSE] Stream complete — onComplete skipped (metadata=true, interrupt=true)
[ModelAdapter:run_1] Stream interrupted — set interruptedThreadId=xxx

  // ~5s pause — nothing visible happens

[ModelAdapter:run_2] run() called — msgs=1, threadId=xxx, interruptedThread=xxx, askHumanParts=0
  ← SPURIOUS: same msgs=1, no assistant message. What triggered this?

  // User clicks option

[AskHumanToolUI] Option clicked: Energiepolitik
[ModelAdapter:run_3] run() called — msgs=1, threadId=xxx, askHumanParts=0
  ← LEGITIMATE: but looks identical to spurious. msgs=1, no assistant message with result.
[AskHumanToolUI] addResult() returned
[AskHumanToolUI] render — result=Energiepolitik
  ← UI shows answered state, but run() couldn't find the answer in messages
```
