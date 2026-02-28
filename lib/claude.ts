// Claude API helper — actual streaming is handled server-side in app/api/chat/route.ts

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function streamChat(
  message: string,
  history: ChatMessage[],
  onChunk: (text: string) => void
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    onChunk(full);
  }

  return full;
}
