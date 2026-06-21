
export default async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const productName = body.productName || "";
    const description = body.description || "";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system: "You are an expert in HS/HTS tariff classification. Respond only with a JSON object — no markdown, no commentary, no code fences.",
        messages: [{
          role: "user",
          content: `Classify this product at the 6-digit HS level.\nProduct: ${productName}\nDescription: ${description}\n\nRespond with exactly this JSON and nothing else: {"hsCode":"NNNNNN","reason":"brief explanation"}. If unsure, use "000000".`
        }]
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Anthropic error:", txt);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Anthropic API error" })
      };
    }

    const data = await resp.json();
    const raw = data.content?.[0]?.text || "";
    const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
    let hsCode = "";
    let reason = "";
    try {
      const parsed = JSON.parse(cleaned);
      hsCode = parsed.hsCode || "";
      reason = parsed.reason || "";
    } catch (e) {
      const match = cleaned.match(/\b(\d{6})\b/);
      hsCode = match ? match[1] : "000000";
      reason = "Parsing error – treat as unknown.";
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ hsCode, reason })
    };
  } catch (err) {
    console.error("hs-infer error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Unexpected error" })
    };
  }
}
