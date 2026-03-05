import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful AI assistant in a video chat conversation. Keep responses concise and conversational — ideally 1-3 sentences. The user is speaking to you via voice and your response will be displayed as subtitles on screen. Do not use any emoji in your responses.";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const resolvedKey =
    process.env.ANTHROPIC_API_KEY?.trim() ||
    req.headers.get("x-api-key")?.trim() ||
    null;

  if (!resolvedKey) {
    return new Response(JSON.stringify({ error: "API key required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = new Anthropic({ apiKey: resolvedKey });

  const { message, history, systemPrompt } = (await req.json()) as {
    message: string;
    history: Message[];
    systemPrompt?: string;
  };

  const resolvedSystem = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages,
    system: resolvedSystem,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
