
import OpenAI from "openai";

export default async function handler(req, context) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
    }

    const body = await req.json();
    const description = body.description || "";

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `You are an HS classification helper.
Return ONLY the single most likely 6-digit HS code as digits.
No words, no explanation, no punctuation.

Product description:
${description}
`;

    const result = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      max_output_tokens: 10
    });

    const raw = result.output_text || "";
    let hs = raw.replace(/[^0-9]/g, "").slice(0,6);

    if (hs.length < 4) {
      hs = "";
    }

    return new Response(JSON.stringify({ hsCode: hs }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
