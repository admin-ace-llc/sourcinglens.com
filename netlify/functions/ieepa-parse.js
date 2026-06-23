// netlify/functions/ieepa-parse.js
// Parses uploaded CBP Form 7501 PDFs using Claude and returns structured entry data

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };

  try {
    const { fileBase64, fileName } = JSON.parse(event.body);
    if (!fileBase64 || !fileName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing fileBase64 or fileName" }) };
    }

    const isPdf = fileName.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Only PDF files are supported via this endpoint. Upload ACE CSV directly in the browser." }) };
    }

    const prompt = `You are a US customs document expert. Analyze this CBP Form 7501 Entry Summary and extract the following fields:

1. Entry Number (Box 1) — format like 123-4567890-1
2. Entry Date (Box 7) — MM/DD/YYYY
3. Summary/Liquidation Date (Box 3) — MM/DD/YYYY, or "unliquidated" if not present
4. Country of Origin (Box 11) — 2-letter code or country name
5. All HTS/Tariff Classification Numbers (Box 27) — especially any starting with 9903 (Chapter 99 IEEPA codes)
6. IEEPA Duty Amount — the duty amount associated with any 9903.01.xx or 9903.08.xx line items specifically
7. Total Duty Paid (Box 33/36 total) — total duty on the entry
8. Importer of Record name or number if visible

IEEPA-eligible Chapter 99 codes to flag:
- 9903.01.10, 9903.01.20, 9903.01.30 (fentanyl tariffs, Feb 4 2025+)
- 9903.08.01 through 9903.08.99 (reciprocal tariffs, Apr 5 2025+)

Return ONLY valid JSON, no markdown, no commentary:
{
  "entryNumber": "string",
  "entryDate": "YYYY-MM-DD or null",
  "liquidationDate": "YYYY-MM-DD or null or 'unliquidated'",
  "countryOfOrigin": "string",
  "htsCodes": ["array of all HTS codes found"],
  "ieepaCodesFound": ["array of 9903.xx.xx codes found"],
  "ieepaDutyAmount": number_or_null,
  "totalDutyPaid": number_or_null,
  "importerOfRecord": "string or null",
  "parseConfidence": "high|medium|low"
}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: fileBase64
              }
            },
            { type: "text", text: prompt }
          ]
        }]
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Claude API error", detail: err }) };
    }

    const data = await resp.json();
    const raw = data.content?.[0]?.text || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    // Validate IEEPA eligibility
    const IEEPA_START = new Date("2025-02-04");
    const IEEPA_END = new Date("2026-02-24");
    const entryDate = parsed.entryDate ? new Date(parsed.entryDate) : null;
    const inWindow = entryDate && entryDate >= IEEPA_START && entryDate <= IEEPA_END;
    const hasIeepaCode = parsed.ieepaCodesFound && parsed.ieepaCodesFound.length > 0;
    const isEligible = inWindow && hasIeepaCode && parsed.ieepaDutyAmount > 0;

    // Estimate interest (7% annual from entry date to projected refund ~90 days from now)
    let estimatedInterest = 0;
    if (isEligible && entryDate && parsed.ieepaDutyAmount) {
      const projectedRefund = new Date();
      projectedRefund.setDate(projectedRefund.getDate() + 90);
      const days = (projectedRefund - entryDate) / (1000 * 60 * 60 * 24);
      estimatedInterest = Math.round(parsed.ieepaDutyAmount * 0.07 * days / 365);
    }

    // Liquidation / phase check
    const today = new Date();
    const liquidationDate = parsed.liquidationDate && parsed.liquidationDate !== "unliquidated"
      ? new Date(parsed.liquidationDate) : null;
    const daysSinceLiquidation = liquidationDate ? (today - liquidationDate) / (1000 * 60 * 60 * 24) : null;
    let phase = "ineligible";
    if (isEligible) {
      if (!liquidationDate || parsed.liquidationDate === "unliquidated") phase = "phase1";
      else if (daysSinceLiquidation <= 80) phase = "phase1";
      else phase = "phase2";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...parsed,
        isEligible,
        inDateWindow: inWindow,
        phase,
        estimatedInterest,
        estimatedTotal: isEligible ? (parsed.ieepaDutyAmount || 0) + estimatedInterest : 0
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
