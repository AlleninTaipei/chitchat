export async function GET() {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  return Response.json({ hasKey });
}
