// netlify/functions/ieepa-parse.js
// Parses CBP Form 7501 PDFs using Claude and returns structured IEEPA eligibility data

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };

  try {
    const { fileBase64, fileName } = JSON.parse(event.body);
    if (!fileBase64 || !fileName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing fileBase64 or fileName" }) };
    }

    const prompt = `You are a US customs document expert analyzing a CBP Form 7501 Entry Summary for IEEPA tariff refund eligibility.

Extract every piece of data you can find. Even if this is a synthetic, test, or partially filled document, extract whatever values are present.

Fields to extract:
1. Entry Number — any identifier like "XXX-XXXXXXX-X" or similar alphanumeric entry reference
2. Entry Date — the import/entry date in any format (convert to YYYY-MM-DD)
3. Liquidation Date — settlement/liquidation date, or "unliquidated" if absent
4. Country of Origin — 2-letter ISO code or full country name
5. HTS Classification Numbers — all tariff codes, especially any beginning with 9903 (IEEPA Chapter 99)
6. IEEPA Duty Amount — duty tied to 9903.01.xx or 9903.08.xx codes; if not listed separately, use the additional/special duty line
7. Total Duty Paid — all duty combined (use this as fallback if IEEPA amount is not itemised)
8. Importer of Record — name or IRS/EIN number

IMPORTANT: Many 7501 forms show IEEPA duties as "Additional Duty" or "Special Duty" without explicitly labelling the 9903 code. If you see additional duties on an entry dated between 2025-02-04 and 2026-02-24, include those amounts in ieepaDutyAmount.

Return ONLY valid JSON with no markdown fences:
{
  "entryNumber": "string or UNKNOWN",
  "entryDate": "YYYY-MM-DD or null",
  "liquidationDate": "YYYY-MM-DD or null or unliquidated",
  "countryOfOrigin": "string or Unknown",
  "htsCodes": ["all HTS codes as strings"],
  "ieepaCodesFound": ["any 9903.xx.xx codes found, empty array if none"],
  "ieepaDutyAmount": number_or_0,
  "totalDutyPaid": number_or_0,
  "importerOfRecord": "string or null",
  "parseConfidence": "high|medium|low",
  "parseNotes": "brief note on what was found or missing"
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
              source: { type: "base64", media_type: "application/pdf", data: fileBase64 }
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

    const aiData = await resp.json();
    const raw = aiData.content?.[0]?.text || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      try { parsed = match ? JSON.parse(match[0]) : {}; }
      catch { parsed = {}; }
    }

    // ── Eligibility logic ─────────────────────────────────────────────────────
    // Relaxed: IEEPA codes are a confidence signal but NOT required.
    // Any entry in the window with duty paid is potentially eligible —
    // IEEPA tariffs applied universally from Apr 5 2025 and to China from Feb 4 2025.
    const IEEPA_START = new Date("2025-02-04");
    const IEEPA_END   = new Date("2026-02-24");

    const entryDate = parsed.entryDate ? new Date(parsed.entryDate) : null;
    const inWindow  = !!(entryDate && entryDate >= IEEPA_START && entryDate <= IEEPA_END);

    const hasIeepaCode = Array.isArray(parsed.ieepaCodesFound) && parsed.ieepaCodesFound.length > 0;

    // Use ieepaDutyAmount if available; fall back to totalDutyPaid for in-window entries
    const rawDuty = parsed.ieepaDutyAmount && parsed.ieepaDutyAmount > 0
      ? parsed.ieepaDutyAmount
      : (inWindow ? (parsed.totalDutyPaid || 0) : 0);

    const isEligible = inWindow && rawDuty > 0;

    // ── Interest estimate (7% annual) ─────────────────────────────────────────
    let estimatedInterest = 0;
    if (isEligible && entryDate) {
      const projectedRefund = new Date();
      projectedRefund.setDate(projectedRefund.getDate() + 90);
      const days = (projectedRefund - entryDate) / (1000 * 60 * 60 * 24);
      estimatedInterest = Math.round(rawDuty * 0.07 * (days / 365));
    }

    // ── Phase determination ───────────────────────────────────────────────────
    const today = new Date();
    const liqStr = parsed.liquidationDate;
    const liquidationDate = liqStr && liqStr !== "unliquidated" ? new Date(liqStr) : null;
    const daysSinceLiq = liquidationDate ? (today - liquidationDate) / (1000 * 60 * 60 * 24) : null;

    let phase = "ineligible";
    if (isEligible) {
      if (!liquidationDate) phase = "phase1";
      else if (daysSinceLiq <= 80) phase = "phase1";
      else phase = "phase2";
    }

    // ── Confidence flag ───────────────────────────────────────────────────────
    // Downgrade confidence if we had to fall back to totalDutyPaid
    const confidence = hasIeepaCode ? parsed.parseConfidence || "high"
      : (isEligible ? "medium" : parsed.parseConfidence || "low");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        entryNumber:       parsed.entryNumber || "UNKNOWN",
        entryDate:         parsed.entryDate   || null,
        liquidationDate:   liqStr             || "unliquidated",
        countryOfOrigin:   parsed.countryOfOrigin || "Unknown",
        htsCodes:          (parsed.htsCodes || []).join(", "),
        ieepaCodesFound:   parsed.ieepaCodesFound || [],
        ieepaDutyAmount:   rawDuty,
        totalDutyPaid:     parsed.totalDutyPaid || 0,
        importerOfRecord:  parsed.importerOfRecord || null,
        parseConfidence:   confidence,
        parseNotes:        parsed.parseNotes || "",
        isEligible,
        inDateWindow:      inWindow,
        hasIeepaCode,
        phase,
        estimatedInterest,
        estimatedTotal:    isEligible ? rawDuty + estimatedInterest : 0
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
