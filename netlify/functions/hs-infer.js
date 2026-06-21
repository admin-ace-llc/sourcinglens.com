
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "OPENAI_API_KEY not configured" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const productName = body.productName || "";
    const description = body.description || "";

    const prompt = `You are assisting with indicative HS classification (6-digit level). 
Product name: ${productName}
Description: ${description}

Respond with a short JSON object ONLY, no commentary, of the form:
{{"hsCode":"NNNNNN","reason":"very short explanation"}}. 
If you are unsure, use "000000".`;

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
        response_format: { type: "text" },
        max_output_tokens: 150
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("OpenAI error:", txt);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OpenAI API error" })
      };
    }

    const data = await resp.json();
    // Responses API: output_text is a convenience string; fallback to output array content
    const raw = data.output_text
      || data.output?.[0]?.content?.[0]?.text
      || data.choices?.[0]?.message?.content
      || "";
    // Strip markdown code fences if the model wraps the JSON
    const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
    let hsCode = "";
    let reason = "";
    try {
      const parsed = JSON.parse(cleaned);
      hsCode = parsed.hsCode || "";
      reason = parsed.reason || "";
    } catch (e) {
      // Try extracting a 6-digit code from the raw text as a last resort
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
