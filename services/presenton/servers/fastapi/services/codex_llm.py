"""Codex (Responses API) adapter for structured and unstructured LLM calls.

Stateless adapter: receives AsyncOpenAI client and tool_calls_handler at call time.
Auth and client creation stay in LLMClient. Structure matches other providers:
generate = call API, collect content + tool_calls, recurse on tool_calls; stream = same but yield deltas.

Uses LLMToolCallsHandler directly: tools are parsed via parse_tools() in llm_client (handler supports
Codex and returns OpenAI-style dicts); this module flattens them for the Responses API. Tool execution
uses tool_calls_handler.handle_tool_calls_openai().
"""

import dirtyjson
from typing import Any, AsyncGenerator, List, Optional, Union

from fastapi import HTTPException
from openai import APIStatusError, AsyncOpenAI, OpenAIError

from models.llm_message import (
    LLMMessage,
    OpenAIAssistantMessage,
    LLMSystemMessage,
    LLMUserMessage,
)
from models.llm_tool_call import OpenAIToolCall, OpenAIToolCallFunction
from utils.schema_utils import ensure_strict_json_schema

# Responses API requires flat tool format: {"type":"function","name":...,"description":...,"parameters":...}
RESPONSE_SCHEMA_NAME = "ResponseSchema"
# Required tool choice for structured: force ResponseSchema (no plain-text fallback).
STRUCTURED_TOOL_CHOICE = {"type": "function", "name": RESPONSE_SCHEMA_NAME}
MAX_RECURSION_DEPTH = 5


def _to_responses_tools(chat_tools: List[dict]) -> List[dict]:
    """Convert Chat Completions tool format to flat Responses API format."""
    result = []
    for tool in chat_tools:
        if tool.get("type") != "function":
            result.append(tool)
            continue
        fn = tool.get("function") or tool
        result.append({
            "type": "function",
            "name": fn.get("name", ""),
            "description": fn.get("description", ""),
            "parameters": fn.get("parameters", {}),
        })
    return result


def _items_to_openai_calls(items_by_id: dict[str, dict]) -> List[OpenAIToolCall]:
    """Build OpenAIToolCall list from Responses API output_item map."""
    return [
        OpenAIToolCall(
            id=item.get("call_id", item.get("id", "")),
            type="function",
            function=OpenAIToolCallFunction(
                name=item.get("name", ""),
                arguments=item.get("arguments", "{}"),
            ),
        )
        for item in items_by_id.values()
    ]


async def _messages_after_tool_turn(
    messages: List[LLMMessage],
    items_by_id: dict[str, dict],
    tool_calls_handler: Any,
) -> List[LLMMessage]:
    """Handle tool calls and return messages extended with assistant turn + tool results."""
    openai_calls = _items_to_openai_calls(items_by_id)
    tool_call_messages = await tool_calls_handler.handle_tool_calls_openai(openai_calls)
    return [
        *messages,
        OpenAIAssistantMessage(
            role="assistant",
            content=None,
            tool_calls=[tc.model_dump() for tc in openai_calls],
        ),
        *tool_call_messages,
    ]


def _build_body(
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[dict]] = None,
    tool_choice: Optional[Union[str, dict]] = None,
) -> dict:
    """Build Responses API request body."""
    instructions = None
    input_messages = []

    for msg in messages:
        if isinstance(msg, LLMSystemMessage):
            instructions = msg.content
        elif isinstance(msg, LLMUserMessage):
            input_messages.append({
                "role": "user",
                "content": [{"type": "input_text", "text": msg.content}],
            })
        elif isinstance(msg, OpenAIAssistantMessage):
            text = msg.content or ""
            if text:
                input_messages.append({
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": text}],
                })
        else:
            text = getattr(msg, "content", "") or ""
            if text:
                input_messages.append({
                    "role": "user",
                    "content": [{"type": "input_text", "text": text}],
                })

    body: dict = {
        "model": model,
        "store": False,
        "stream": True,
        "text": {"verbosity": "medium"},
        "include": ["reasoning.encrypted_content"],
        "tool_choice": tool_choice if tool_choice is not None else "auto",
        "parallel_tool_calls": True,
    }
    if instructions:
        body["instructions"] = instructions
    if input_messages:
        body["input"] = input_messages
    if tools:
        body["tools"] = tools

    return body


def _event_to_dict(event: Any) -> dict:
    """Convert SDK event to dict."""
    if hasattr(event, "model_dump"):
        return event.model_dump()
    return {
        "type": getattr(event, "type", None),
        "delta": getattr(event, "delta", None),
        "item": getattr(event, "item", None),
        "message": getattr(event, "message", None),
        "arguments": getattr(event, "arguments", None),
        "name": getattr(event, "name", None),
    }


async def _stream_raw(
    client: AsyncOpenAI,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[dict]] = None,
    tool_choice: Optional[Union[str, dict]] = None,
) -> AsyncGenerator[dict, None]:
    """Yield raw SSE event dicts from Codex Responses API."""
    body = _build_body(model, messages, tools, tool_choice=tool_choice)
    create_kwargs = {k: v for k, v in body.items() if k != "stream"}

    try:
        stream = await client.responses.create(stream=True, **create_kwargs)
    except (APIStatusError, OpenAIError) as e:
        status = getattr(e, "status_code", 502)
        detail = getattr(e, "message", str(e)) or str(e)
        raise HTTPException(
            status_code=status,
            detail=f"Codex API error: {detail}"[:400],
        ) from e

    async for event in stream:
        yield _event_to_dict(event)


class CodexLLMAdapter:
    """Stateless adapter for Codex Responses API. Matches other providers: generate/stream + tool recursion."""

    @staticmethod
    async def generate_codex(
        client: AsyncOpenAI,
        model: str,
        messages: List[LLMMessage],
        tool_calls_handler: Any,
        max_tokens: Optional[int] = None,
        tools: Optional[List[dict]] = None,
        depth: int = 0,
    ) -> Optional[str]:
        """Generate text; on tool_calls handle and recurse (like _generate_openai / _generate_anthropic)."""
        print(
            f"Codex generate: model={model} depth={depth} tools_count={len(tools) if tools else 0}"
        )
        responses_tools = _to_responses_tools(tools) if tools else None
        text_parts: List[str] = []
        tool_calls_by_id: dict[str, dict] = {}

        async for event in _stream_raw(client, model, messages, responses_tools, tool_choice=None):
            event_type = event.get("type", "")

            if event_type == "response.output_text.delta":
                delta = event.get("delta", "")
                if delta:
                    text_parts.append(delta)
            elif event_type == "response.output_item.done":
                item = event.get("item") or {}
                if item.get("type") == "function_call":
                    tool_calls_by_id[item.get("call_id", item.get("id", ""))] = item
            elif event_type in ("response.failed", "error"):
                msg_text = event.get("message") or str(event)
                raise HTTPException(status_code=502, detail=f"Codex error: {msg_text}")

        if tool_calls_by_id and tools and depth < MAX_RECURSION_DEPTH:
            print(
                f"Codex generate: tool calls detected depth={depth} count={len(tool_calls_by_id)}"
            )
            new_messages = await _messages_after_tool_turn(
                messages, tool_calls_by_id, tool_calls_handler
            )
            return await CodexLLMAdapter.generate_codex(
                client, model, new_messages, tool_calls_handler,
                max_tokens=max_tokens, tools=tools, depth=depth + 1,
            )

        return "".join(text_parts) or None

    @staticmethod
    async def stream_codex(
        client: AsyncOpenAI,
        model: str,
        messages: List[LLMMessage],
        tool_calls_handler: Any,
        max_tokens: Optional[int] = None,
        tools: Optional[List[dict]] = None,
        depth: int = 0,
    ) -> AsyncGenerator[str, None]:
        """Stream text deltas; on tool_calls handle and recurse (like _stream_openai)."""
        print(
            f"Codex stream: model={model} depth={depth} tools_count={len(tools) if tools else 0}"
        )
        responses_tools = _to_responses_tools(tools) if tools else None
        tool_calls_by_id: dict[str, dict] = {}

        async for event in _stream_raw(client, model, messages, responses_tools, tool_choice=None):
            event_type = event.get("type", "")

            if event_type == "response.output_text.delta":
                delta = event.get("delta", "")
                if delta:
                    yield delta
            elif event_type == "response.output_item.done":
                item = event.get("item") or {}
                if item.get("type") == "function_call":
                    tool_calls_by_id[item.get("call_id", item.get("id", ""))] = item
            elif event_type in ("response.failed", "error"):
                msg_text = event.get("message") or str(event)
                raise HTTPException(status_code=502, detail=f"Codex stream error: {msg_text}")

        if tool_calls_by_id and tools and depth < MAX_RECURSION_DEPTH:
            print(
                f"Codex stream: tool calls detected depth={depth} count={len(tool_calls_by_id)}"
            )
            new_messages = await _messages_after_tool_turn(
                messages, tool_calls_by_id, tool_calls_handler
            )
            async for chunk in CodexLLMAdapter.stream_codex(
                client, model, new_messages, tool_calls_handler,
                max_tokens=max_tokens, tools=tools, depth=depth + 1,
            ):
                yield chunk

    @staticmethod
    async def stream_codex_structured(
        client: AsyncOpenAI,
        model: str,
        messages: List[LLMMessage],
        response_format: dict,
        tool_calls_handler: Any,
        strict: bool = False,
        max_tokens: Optional[int] = None,
        tools: Optional[List[dict]] = None,
        depth: int = 0,
    ) -> AsyncGenerator[str, None]:
        """Stream JSON chunks from ResponseSchema tool; recurse for other tool_calls.

        Structured output is achieved by always adding an internal ResponseSchema "tool"
        (with response_format as its parameters) and tool_choice=ResponseSchema. So
        user_tools=0 only means no extra tools like web search; we still use the
        ResponseSchema tool to receive the model's JSON.
        """
        user_tools_count = len(tools) if tools else 0
        print(
            f"Codex stream_structured: model={model} depth={depth} strict={strict} "
            f"user_tools={user_tools_count} (always adding ResponseSchema tool for structured JSON)"
        )
        schema = ensure_strict_json_schema(response_format, path=(), root=response_format) if strict and depth == 0 else response_format
        response_schema_tool = {
            "type": "function",
            "name": RESPONSE_SCHEMA_NAME,
            "description": "Provide response to the user",
            "parameters": schema,
        }
        all_tools: List[dict] = [response_schema_tool]
        if tools:
            all_tools.extend(_to_responses_tools(tools))

        tool_calls_by_id: dict[str, dict] = {}
        current_call_id: Optional[str] = None

        async for event in _stream_raw(
            client, model, messages, all_tools, tool_choice=STRUCTURED_TOOL_CHOICE
        ):
            event_type = event.get("type", "")

            if event_type == "response.output_item.added":
                item = event.get("item") or {}
                if item.get("type") == "function_call" and item.get("name") == RESPONSE_SCHEMA_NAME:
                    current_call_id = item.get("call_id", item.get("id"))
                    print(
                        f"Codex stream_structured: ResponseSchema call started call_id={current_call_id}"
                    )

            elif event_type == "response.function_call_arguments.delta":
                if current_call_id is not None:
                    delta = event.get("delta", "")
                    if delta:
                        # Log only first few chunks to avoid log spam
                        print(
                            f"Codex stream_structured: ResponseSchema delta chunk len={len(delta)}"
                        )
                        yield delta

            elif event_type == "response.function_call_arguments.done":
                if event.get("name") == RESPONSE_SCHEMA_NAME:
                    arguments = event.get("arguments", "")
                    if arguments:
                        print(
                            f"Codex stream_structured: ResponseSchema arguments.done len={len(arguments)}"
                        )
                        yield arguments

            elif event_type == "response.output_item.done":
                item = event.get("item") or {}
                if item.get("type") == "function_call":
                    tool_calls_by_id[item.get("call_id", item.get("id", ""))] = item
                    if item.get("name") == RESPONSE_SCHEMA_NAME:
                        arguments = item.get("arguments", "")
                        if arguments:
                            print(
                                f"Codex stream_structured: ResponseSchema output_item.done len={len(arguments)}"
                            )
                            yield arguments

            elif event_type in ("response.failed", "error"):
                msg_text = event.get("message") or str(event)
                raise HTTPException(status_code=502, detail=f"Codex structured error: {msg_text}")

        other_tool_calls = {
            k: v for k, v in tool_calls_by_id.items()
            if v.get("name") != RESPONSE_SCHEMA_NAME
        }
        if other_tool_calls and tools and depth < MAX_RECURSION_DEPTH:
            print(
                f"Codex stream_structured: recursing for non-ResponseSchema tool calls "
                f"depth={depth} count={len(other_tool_calls)}"
            )
            new_messages = await _messages_after_tool_turn(
                messages, other_tool_calls, tool_calls_handler
            )
            async for chunk in CodexLLMAdapter.stream_codex_structured(
                client, model, new_messages, response_format, tool_calls_handler,
                strict=strict, max_tokens=max_tokens, tools=tools, depth=depth + 1,
            ):
                yield chunk

    @staticmethod
    async def generate_codex_structured(
        client: AsyncOpenAI,
        model: str,
        messages: List[LLMMessage],
        response_format: dict,
        tool_calls_handler: Any,
        strict: bool = False,
        max_tokens: Optional[int] = None,
        tools: Optional[List[dict]] = None,
        depth: int = 0,
    ) -> Optional[dict]:
        """Collect stream and parse JSON (like _generate_openai_structured)."""
        user_tools_count = len(tools) if tools else 0
        print(
            f"Codex generate_structured: model={model} depth={depth} strict={strict} "
            f"user_tools={user_tools_count} (using ResponseSchema tool for structured JSON)"
        )
        accumulated: List[str] = []
        async for chunk in CodexLLMAdapter.stream_codex_structured(
            client, model, messages, response_format, tool_calls_handler,
            strict=strict, max_tokens=max_tokens, tools=tools, depth=depth,
        ):
            accumulated.append(chunk)

        raw = "".join(accumulated)
        if not raw:
            return None

        if depth == 0:
            try:
                parsed = dict(dirtyjson.loads(raw))
                print(
                    f"Codex generate_structured: parsed JSON keys={list(parsed.keys())[:8]}"
                )
                return parsed
            except Exception:
                start = raw.find("{")
                if start >= 0:
                    try:
                        parsed = dict(dirtyjson.loads(raw[start:]))
                        print(
                            "Codex generate_structured: parsed JSON from offset "
                            f"{start} keys={list(parsed.keys())[:8]}"
                        )
                        return parsed
                    except Exception:
                        pass
                raise HTTPException(
                    status_code=502,
                    detail=(
                        "Model did not return valid structured output (expected JSON from ResponseSchema). "
                        "Please retry."
                    ),
                )

        return None
