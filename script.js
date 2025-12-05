
// Core UX + analysis logic for SourcingLens

document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear().toString();

  // Tabs
  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = document.getElementById(tab);
      if (panel) panel.classList.add("active");
    });
  });

  // Free tier
  const freeRunButton = document.getElementById("freeRunButton");
  if (freeRunButton) freeRunButton.addEventListener("click", runFreeComparison);

  // Starter
  const starterRunButton = document.getElementById("starterRunButton");
  if (starterRunButton) starterRunButton.addEventListener("click", runStarterAnalysis);
  const starterDownloadCsvButton = document.getElementById("starterDownloadCsvButton");
  if (starterDownloadCsvButton) starterDownloadCsvButton.addEventListener("click", () => downloadCsv(starterLastRun?.rows || [], "sourcinglens_starter.csv"));

  // Pro
  const proAddSkuButton = document.getElementById("proAddSkuButton");
  if (proAddSkuButton) proAddSkuButton.addEventListener("click", addProSkuRow);
  const proRunButton = document.getElementById("proRunButton");
  if (proRunButton) proRunButton.addEventListener("click", runProAnalysis);
  const proDownloadCsvButton = document.getElementById("proDownloadCsvButton");
  if (proDownloadCsvButton) proDownloadCsvButton.addEventListener("click", () => downloadCsv(proLastRun?.rows || [], "sourcinglens_pro_portfolio.csv"));
  const proDownloadPdfButton = document.getElementById("proDownloadPdfButton");
  if (proDownloadPdfButton) proDownloadPdfButton.addEventListener("click", downloadProPdf);

  // Pro save to dashboard triggers Supabase handler if available
  const proSaveButton = document.getElementById("proSaveToDashboardButton");
  if (proSaveButton) proSaveButton.addEventListener("click", () => {
    if (window.saveProRunToSupabase) {
      window.saveProRunToSupabase(proLastRun);
    } else {
      const el = document.getElementById("dashboardSaveStatus");
      if (el) {
        el.textContent = "Dashboard not ready yet. Check Supabase config.";
      }
    }
  });

  // Init pro sku container
  addProSkuRow();
});

// Simple in-memory state
let starterLastRun = null;
let proLastRun = null;

/* Utility: country assumptions */

const COUNTRY_CONFIG = {
  china:   { label: "China",   baseFactor: 1.00, tariff: 0.08, ship: 0.70 },
  vietnam: { label: "Vietnam", baseFactor: 0.98, tariff: 0.05, ship: 0.75 },
  mexico:  { label: "Mexico",  baseFactor: 1.04, tariff: 0.02, ship: 0.55 },
  india:   { label: "India",   baseFactor: 0.96, tariff: 0.06, ship: 0.78 },
  usa:     { label: "USA",     baseFactor: 1.18, tariff: 0.00, ship: 0.30 }
};

const COUNTRY_KEYS = ["china","vietnam","mexico","india","usa"];

function computeLandedForCountry(currentUnitCost, annualVolume, countryKey) {
  const cfg = COUNTRY_CONFIG[countryKey];
  if (!cfg) return null;
  const base = currentUnitCost * cfg.baseFactor;
  const tariffCost = base * cfg.tariff;
  const shipCost = base * 0.1 * cfg.ship;
  const totalUnit = base + tariffCost + shipCost;
  const annualCost = totalUnit * annualVolume;
  return {
    key: countryKey,
    label: cfg.label,
    base: base,
    tariff: tariffCost,
    shipping: shipCost,
    totalUnit,
    annualCost
  };
}

function formatCurrency(num) {
  if (!isFinite(num)) return "-";
  return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percentDelta(newVal, baseVal) {
  if (!isFinite(newVal) || !isFinite(baseVal) || baseVal === 0) return null;
  return ((newVal - baseVal) / baseVal) * 100;
}

/* Free comparison */

function runFreeComparison() {
  const productName = document.getElementById("freeProductName")?.value.trim();
  const currentCountry = document.getElementById("freeCurrentCountry")?.value;
  const unitCost = parseFloat(document.getElementById("freeUnitCost")?.value || "0");
  const volume = parseInt(document.getElementById("freeAnnualVolume")?.value || "0", 10);
  const compareCountry = document.getElementById("freeCompareCountry")?.value;
  const statusEl = document.getElementById("freeStatus");

  if (!productName || !currentCountry || !compareCountry || !unitCost || !volume) {
    if (statusEl) {
      statusEl.textContent = "Please fill all fields.";
      statusEl.className = "status-pill status-error";
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = "Running comparison…";
    statusEl.className = "status-pill status-busy";
  }

  const currentRes = computeLandedForCountry(unitCost, volume, currentCountry);
  const altRes = computeLandedForCountry(unitCost, volume, compareCountry);

  const tbody = document.querySelector("#free-results-table tbody");
  if (tbody) tbody.innerHTML = "";
  if (currentRes && altRes && tbody) {
    const currentRow = document.createElement("tr");
    const altRow = document.createElement("tr");

    const delta = percentDelta(altRes.annualCost, currentRes.annualCost);
    const deltaText = delta === null ? "-" : (delta > 0 ? "+" : "") + delta.toFixed(1) + "%";

    currentRow.innerHTML = `
      <td>Current – ${currentRes.label}</td>
      <td>${formatCurrency(currentRes.base)}</td>
      <td>${formatCurrency(currentRes.tariff)}</td>
      <td>${formatCurrency(currentRes.shipping)}</td>
      <td>${formatCurrency(currentRes.totalUnit)}</td>
      <td>${formatCurrency(currentRes.annualCost)}</td>
      <td>–</td>
    `;

    altRow.innerHTML = `
      <td>Alt – ${altRes.label}</td>
      <td>${formatCurrency(altRes.base)}</td>
      <td>${formatCurrency(altRes.tariff)}</td>
      <td>${formatCurrency(altRes.shipping)}</td>
      <td>${formatCurrency(altRes.totalUnit)}</td>
      <td>${formatCurrency(altRes.annualCost)}</td>
      <td>${deltaText}</td>
    `;

    tbody.appendChild(currentRow);
    tbody.appendChild(altRow);
  }

  const section = document.getElementById("free-results-section");
  const nameSpan = document.getElementById("free-results-product-name");
  const intro = document.getElementById("free-results-intro");
  if (section) section.classList.remove("hidden");
  if (nameSpan) nameSpan.textContent = productName;
  if (intro && currentRes && altRes) {
    const diff = altRes.annualCost - currentRes.annualCost;
    const better = diff < 0 ? altRes.label : currentRes.label;
    const savings = Math.abs(diff);
    intro.textContent = `${better} looks directionally more attractive on cost by about ${formatCurrency(savings)} per year at your volume, using simplified heuristics.`;
  }

  if (statusEl) {
    statusEl.textContent = "Comparison complete.";
    statusEl.className = "status-pill status-ok";
  }
}

/* Starter analysis (1 SKU, 5 countries, HS LLM) */

async function runStarterAnalysis() {
  const productName = document.getElementById("starterProductName")?.value.trim();
  const desc = document.getElementById("starterProductDescription")?.value.trim();
  const hsInput = document.getElementById("starterHsCode")?.value.trim();
  const currentCountry = document.getElementById("starterCurrentCountry")?.value;
  const unitCost = parseFloat(document.getElementById("starterUnitCost")?.value || "0");
  const volume = parseInt(document.getElementById("starterAnnualVolume")?.value || "0", 10);
  const priority = document.getElementById("starterPriority")?.value || "balance";
  const hsStatus = document.getElementById("starterHsStatus");
  const statusEl = document.getElementById("starterStatus");

  if (!productName || !desc || !currentCountry || !unitCost || !volume) {
    if (statusEl) {
      statusEl.textContent = "Please fill all required fields.";
      statusEl.className = "status-pill status-error";
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = "Running analysis…";
    statusEl.className = "status-pill status-busy";
  }

  let hsCode = hsInput || "";
  let hsReason = "";
  if (hsInput) {
    if (hsStatus) {
      hsStatus.textContent = "HS code: using your input.";
      hsStatus.className = "status-pill status-ok";
    }
  } else {
    if (hsStatus) {
      hsStatus.textContent = "HS code: asking GPT-4.1-mini…";
      hsStatus.className = "status-pill status-busy";
    }
    try {
      const res = await fetch("/.netlify/functions/hs-infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, description: desc })
      });
      if (res.ok) {
        const data = await res.json();
        hsCode = data.hsCode || "";
        hsReason = data.reason || "";
        if (hsStatus) {
          hsStatus.textContent = hsCode
            ? `HS suggestion: ${hsCode} (indicative; confirm with broker)`
            : "HS suggestion unavailable – proceed with caution.";
          hsStatus.className = hsCode ? "status-pill status-ok" : "status-pill status-error";
        }
      } else {
        if (hsStatus) {
          hsStatus.textContent = "HS suggestion failed – continue with heuristics.";
          hsStatus.className = "status-pill status-error";
        }
      }
    } catch (err) {
      console.error(err);
      if (hsStatus) {
        hsStatus.textContent = "HS suggestion error – continue with heuristics.";
        hsStatus.className = "status-pill status-error";
      }
    }
  }

  const currentRes = computeLandedForCountry(unitCost, volume, currentCountry);
  const rows = [];
  if (currentRes) {
    rows.push({ ...currentRes, role: "current" });
  }

  COUNTRY_KEYS.forEach(key => {
    if (key === currentCountry) return;
    const res = computeLandedForCountry(unitCost, volume, key);
    if (!res) return;
    rows.push({ ...res, role: "alt" });
  });

  // Rank based on priority
  const sorted = [...rows].sort((a, b) => a.annualCost - b.annualCost);
  let recommended = sorted[0];
  if (priority === "nearshore") {
    const nearshoreOpt = sorted.find(r => r.key === "mexico" || r.key === "usa");
    if (nearshoreOpt) recommended = nearshoreOpt;
  } else if (priority === "us") {
    const usOpt = sorted.find(r => r.key === "usa");
    if (usOpt) recommended = usOpt;
  }

  const tbody = document.querySelector("#starter-results-table tbody");
  if (tbody) tbody.innerHTML = "";
  const currentAnnual = currentRes?.annualCost || NaN;
  sorted.forEach(r => {
    const tr = document.createElement("tr");
    const delta = percentDelta(r.annualCost, currentAnnual);
    const deltaText = isNaN(currentAnnual) || delta === null ? "-" : (delta > 0 ? "+" : "") + delta.toFixed(1) + "%";
    tr.innerHTML = `
      <td>${r.role === "current" ? "Current – " : "Alt – "}${r.label}${r === recommended ? " ★" : ""}</td>
      <td>${formatCurrency(r.base)}</td>
      <td>${formatCurrency(r.tariff)}</td>
      <td>${formatCurrency(r.shipping)}</td>
      <td>${formatCurrency(r.totalUnit)}</td>
      <td>${formatCurrency(r.annualCost)}</td>
      <td>${r.role === "current" ? "–" : deltaText}</td>
    `;
    tbody.appendChild(tr);
  });

  const nameSpan = document.getElementById("starter-results-product-name");
  const intro = document.getElementById("starter-results-intro");
  const summary = document.getElementById("starter-summary");
  const compliance = document.getElementById("starter-compliance");
  const section = document.getElementById("starter-results-section");
  if (section) section.classList.remove("hidden");
  if (nameSpan) nameSpan.textContent = productName;

  if (intro && currentRes && recommended) {
    const diff = recommended.annualCost - currentRes.annualCost;
    const direction = diff < 0 ? "lower" : "higher";
    const amount = Math.abs(diff);
    intro.textContent = `${recommended.label} emerges as the top lane on our heuristics, with an estimated ${direction} annual landed cost of about ${formatCurrency(amount)} versus your current lane at this volume.`;
  }

  if (summary) {
    summary.textContent =
      `Based on your inputs, the model suggests HS code ${hsCode || "N/A"} for directional duty assumptions. ` +
      `The ${recommended.label} lane benefits from its relative mix of unit cost, duty, and freight. ` +
      `We would treat this as a short-list candidate for a more formal RFQ and broker review.`;
  }

  if (compliance) {
    compliance.textContent =
      `This output is indicative only. HS classification is fact-specific and may differ from the model's suggestion. ` +
      `Before adjusting suppliers or pricing, confirm the HS code, tariff treatment (including any Section 301 or trade remedies), ` +
      `and compliance requirements (testing, labeling, certifications) with your customs broker or legal counsel.`;
  }

  starterLastRun = {
    productName,
    hsCode,
    hsReason,
    rows: sorted
  };

  if (statusEl) {
    statusEl.textContent = "Starter analysis complete.";
    statusEl.className = "status-pill status-ok";
  }
}

/* Pro analysis (multi-SKU) */

function ensureProSkuContainer() {
  const container = document.getElementById("pro-sku-container");
  return container;
}

function addProSkuRow() {
  const container = ensureProSkuContainer();
  if (!container) return;
  const currentCount = container.querySelectorAll(".pro-sku-row").length;
  if (currentCount >= 5) return;

  const idx = currentCount + 1;
  const div = document.createElement("div");
  div.className = "pro-sku-row";
  div.style.marginBottom = "0.7rem";
  div.innerHTML = `
    <div class="grid-2">
      <label>
        SKU label
        <input type="text" name="skuLabel" placeholder="e.g. Bottle – 24oz – Black" />
      </label>
      <label>
        Product description
        <input type="text" name="skuDesc" placeholder="Key materials, coatings, electronics, etc." />
      </label>
    </div>
    <div class="grid-2">
      <label>
        Current supplier country
        <select name="skuCurrentCountry">
          <option value="">Select...</option>
          <option value="china">China</option>
          <option value="vietnam">Vietnam</option>
          <option value="mexico">Mexico</option>
          <option value="india">India</option>
          <option value="usa">United States</option>
        </select>
      </label>
      <label>
        Current unit cost (USD)
        <input type="number" name="skuUnitCost" min="0" step="0.01" />
      </label>
    </div>
    <div class="grid-2">
      <label>
        Annual volume (units)
        <input type="number" name="skuAnnualVolume" min="1" step="1" />
      </label>
      <label>
        HS code (optional)
        <input type="text" name="skuHsCode" placeholder="Let GPT suggest if blank" />
      </label>
    </div>
    <hr style="border:none;border-top:1px dashed #e5e7eb;margin:0.6rem 0 0.4rem;" />
  `;
  container.appendChild(div);

  const statusEl = document.getElementById("proStatus");
  if (statusEl) {
    statusEl.textContent = `Ready to run (${idx} SKU${idx > 1 ? "s" : ""} added, max 5)`;
    statusEl.className = "status-pill status-idle";
  }
}

async function runProAnalysis() {
  const container = ensureProSkuContainer();
  const statusEl = document.getElementById("proStatus");
  if (!container) return;

  const rowsEls = Array.from(container.querySelectorAll(".pro-sku-row"));
  const skuInputs = [];
  rowsEls.forEach(row => {
    const label = row.querySelector('input[name="skuLabel"]')?.value.trim();
    const desc = row.querySelector('input[name="skuDesc"]')?.value.trim();
    const currentCountry = row.querySelector('select[name="skuCurrentCountry"]')?.value;
    const unitCost = parseFloat(row.querySelector('input[name="skuUnitCost"]')?.value || "0");
    const volume = parseInt(row.querySelector('input[name="skuAnnualVolume"]')?.value || "0", 10);
    const hsCode = row.querySelector('input[name="skuHsCode"]')?.value.trim();
    if (label && desc && currentCountry && unitCost && volume) {
      skuInputs.push({ label, desc, currentCountry, unitCost, volume, hsCode });
    }
  });

  if (skuInputs.length === 0) {
    if (statusEl) {
      statusEl.textContent = "Add at least one complete SKU row.";
      statusEl.className = "status-pill status-error";
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = "Running Pro analysis…";
    statusEl.className = "status-pill status-busy";
  }

  // HS suggestions for those missing
  const enrichedSkus = [];
  for (const sku of skuInputs) {
    let hsCode = sku.hsCode;
    let hsReason = "";
    if (!hsCode) {
      try {
        const res = await fetch("/.netlify/functions/hs-infer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productName: sku.label, description: sku.desc })
        });
        if (res.ok) {
          const data = await res.json();
          hsCode = data.hsCode || "";
          hsReason = data.reason || "";
        }
      } catch (err) {
        console.error("HS infer error for Pro SKU:", err);
      }
    }
    enrichedSkus.push({ ...sku, hsCode, hsReason });
  }

  const tbody = document.querySelector("#pro-results-table tbody");
  if (tbody) tbody.innerHTML = "";

  let totalSavings = 0;
  const portfolioRows = [];
  const narrativeBits = [];
  const riskItems = [];

  enrichedSkus.forEach(sku => {
    const currentRes = computeLandedForCountry(sku.unitCost, sku.volume, sku.currentCountry);
    if (!currentRes) return;
    let bestAlt = currentRes;
    COUNTRY_KEYS.forEach(key => {
      const res = computeLandedForCountry(sku.unitCost, sku.volume, key);
      if (!res) return;
      if (res.annualCost < bestAlt.annualCost) bestAlt = res;
    });
    const savings = currentRes.annualCost - bestAlt.annualCost;
    if (savings > 0) totalSavings += savings;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sku.label}</td>
      <td>${bestAlt.label === currentRes.label ? currentRes.label + " (stay)" : bestAlt.label}</td>
      <td>${formatCurrency(currentRes.annualCost)}</td>
      <td>${formatCurrency(bestAlt.annualCost)}</td>
      <td>${formatCurrency(savings)}</td>
    `;
    if (tbody) tbody.appendChild(tr);

    portfolioRows.push({
      skuLabel: sku.label,
      currentLane: currentRes.label,
      suggestedLane: bestAlt.label,
      currentAnnual: currentRes.annualCost,
      suggestedAnnual: bestAlt.annualCost,
      annualSavings: savings,
      hsCode: sku.hsCode || "",
      volume: sku.volume
    });

    if (savings > 0) {
      narrativeBits.push(`${sku.label}: shifting from ${currentRes.label} to ${bestAlt.label} could free up about ${formatCurrency(savings)} per year at current volumes.`);
    } else {
      narrativeBits.push(`${sku.label}: current lane ${currentRes.label} remains directionally competitive on cost.`);
    }

    // simple risk tags
    const risk = [];
    if (bestAlt.key === "china") risk.push("Section 301 / China exposure");
    if (bestAlt.key === "vietnam" || bestAlt.key === "india") risk.push("emerging-labor & FX volatility");
    if (bestAlt.key === "mexico") risk.push("border / trucking capacity");
    if (bestAlt.key === "usa") risk.push("domestic labor cost & capacity");
    riskItems.push(`${sku.label}: ${bestAlt.label} lane – ${risk.join(", ") || "standard sourcing risk mix"}.`);
  });

  const totalEl = document.getElementById("pro-total-savings");
  const portfolioSummary = document.getElementById("pro-portfolio-summary");
  const riskPanel = document.getElementById("pro-risk-panel");
  const nextStepsList = document.getElementById("pro-next-steps");
  const intro = document.getElementById("pro-results-intro");
  const section = document.getElementById("pro-results-section");

  if (section) section.classList.remove("hidden");
  if (totalEl) totalEl.textContent = formatCurrency(totalSavings);

  if (portfolioSummary) {
    portfolioSummary.textContent =
      narrativeBits.length > 0
        ? narrativeBits.join(" ")
        : "No clear savings pockets emerged from this run on our heuristics.";
  }

  if (riskPanel) {
    riskPanel.textContent =
      riskItems.length > 0
        ? riskItems.join(" ")
        : "Risk is broadly distributed across your current lanes. Treat this as a qualitative prompt for further review.";
  }

  if (nextStepsList) {
    nextStepsList.innerHTML = "";
    ["Short-list 2–3 lanes per SKU for real RFQs.",
     "Share this pack with your broker / freight partner for validation.",
     "Layer in service, lead time, and capacity before committing to any shift."
    ].forEach(step => {
      const li = document.createElement("li");
      li.textContent = step;
      nextStepsList.appendChild(li);
    });
  }

  if (intro) {
    intro.textContent =
      `This run covers ${portfolioRows.length} SKU${portfolioRows.length === 1 ? "" : "s"}. ` +
      `Use it as a first pass to see where a focused sourcing project might unlock the most leverage.`;
  }

  proLastRun = {
    totalSavings,
    rows: portfolioRows,
    narrative: portfolioSummary?.textContent || "",
    riskPanel: riskPanel?.textContent || "",
    createdAt: new Date().toISOString()
  };
  window.latestProRun = proLastRun;

  if (statusEl) {
    statusEl.textContent = "Pro analysis complete.";
    statusEl.className = "status-pill status-ok";
  }
}

/* CSV & PDF helpers */

function downloadCsv(rows, filename) {
  if (!rows || rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const lines = rows.map(r =>
    keys.map(k => {
      const v = r[k];
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(",")
  );
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadProPdf() {
  if (!proLastRun) return;
  const element = document.createElement("div");
  element.innerHTML = `
    <h1>SourcingLens – Pro report</h1>
    <p>Generated at: ${new Date(proLastRun.createdAt || Date.now()).toLocaleString()}</p>
    <h2>Portfolio summary</h2>
    <p>${proLastRun.narrative || ""}</p>
    <h2>Total estimated savings</h2>
    <p>${formatCurrency(proLastRun.totalSavings || 0)}</p>
    <h2>Risk drivers</h2>
    <p>${proLastRun.riskPanel || ""}</p>
    <h2>SKU-level summary</h2>
    <table border="1" cellspacing="0" cellpadding="4">
      <tr>
        <th>SKU</th>
        <th>Current lane</th>
        <th>Suggested lane</th>
        <th>Current annual</th>
        <th>Suggested annual</th>
        <th>Annual savings</th>
        <th>HS</th>
      </tr>
      ${proLastRun.rows
        .map(
          r => `
        <tr>
          <td>${r.skuLabel}</td>
          <td>${r.currentLane}</td>
          <td>${r.suggestedLane}</td>
          <td>${formatCurrency(r.currentAnnual)}</td>
          <td>${formatCurrency(r.suggestedAnnual)}</td>
          <td>${formatCurrency(r.annualSavings)}</td>
          <td>${r.hsCode || ""}</td>
        </tr>`
        )
        .join("")}
    </table>
  `;
  const opt = {
    margin: 10,
    filename: "sourcinglens_pro_report.pdf",
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };
  window.html2pdf().set(opt).from(element).save();
}
