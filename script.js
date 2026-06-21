// SourcingLens client logic – shared between main site and results page

document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear().toString();

  // Tabs (used on index.html free tool only)
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

  // Free tier – two-step flow (index.html)
  const freeStep1Button = document.getElementById("freeStep1Button");
  if (freeStep1Button) {
    freeStep1Button.addEventListener("click", () => {
      const category = document.getElementById("freeProductCategory")?.value;
      const currentCountry = document.getElementById("freeCurrentCountry")?.value;
      if (!category || !currentCountry) {
        alert("Please select both product category and current supplier country.");
        return;
      }
      document.getElementById("free-form-step1")?.classList.add("hidden");
      document.getElementById("free-form-step2")?.classList.remove("hidden");
    });
  }

  const freeRunButton = document.getElementById("freeRunButton");
  if (freeRunButton) freeRunButton.addEventListener("click", runFreeComparison);

  // Starter
  const starterRunButton = document.getElementById("starterRunButton");
  if (starterRunButton) starterRunButton.addEventListener("click", runStarterAnalysis);

  const starterDownloadCsvButton = document.getElementById("starterDownloadCsvButton");
  if (starterDownloadCsvButton) {
    starterDownloadCsvButton.addEventListener("click", () => {
      if (starterLastRun?.rows?.length) downloadCsv(starterLastRun.rows, "sourcinglens_starter.csv");
    });
  }

  // Pro (manual 5-SKU)
  const proAddSkuButton = document.getElementById("proAddSkuButton");
  if (proAddSkuButton) proAddSkuButton.addEventListener("click", addProSkuRow);

  const proRunButton = document.getElementById("proRunButton");
  if (proRunButton) proRunButton.addEventListener("click", runProAnalysis);

  const proDownloadCsvButton = document.getElementById("proDownloadCsvButton");
  if (proDownloadCsvButton) {
    proDownloadCsvButton.addEventListener("click", () => {
      if (proLastRun?.rows?.length) downloadCsv(proLastRun.rows, "sourcinglens_pro_portfolio.csv");
    });
  }

  const proDownloadPdfButton = document.getElementById("proDownloadPdfButton");
  if (proDownloadPdfButton) proDownloadPdfButton.addEventListener("click", downloadProPdf);

  const proSaveButton = document.getElementById("proSaveToDashboardButton");
  if (proSaveButton) {
    proSaveButton.addEventListener("click", () => {
      if (window.saveProRunToSupabase) {
        window.saveProRunToSupabase(proLastRun);
      } else {
        const el = document.getElementById("dashboardSaveStatus");
        if (el) el.textContent = "Dashboard not ready – check Supabase config.";
      }
    });
  }

  // Pro Monthly – bulk CSV
  const bulkTemplateButton = document.getElementById("bulkDownloadTemplateButton");
  if (bulkTemplateButton) bulkTemplateButton.addEventListener("click", downloadBulkCsvTemplate);

  const bulkCsvInput = document.getElementById("bulkCsvInput");
  if (bulkCsvInput) bulkCsvInput.addEventListener("change", handleBulkCsvUpload);

  const bulkClearButton = document.getElementById("bulkClearButton");
  if (bulkClearButton) {
    bulkClearButton.addEventListener("click", () => {
      bulkParsedSkus = [];
      if (bulkCsvInput) bulkCsvInput.value = "";
      document.getElementById("bulk-preview-section")?.classList.add("hidden");
      document.getElementById("bulk-results-section")?.classList.add("hidden");
    });
  }

  const bulkRunButton = document.getElementById("bulkRunButton");
  if (bulkRunButton) bulkRunButton.addEventListener("click", runBulkAnalysis);

  const bulkDownloadCsvButton = document.getElementById("bulkDownloadCsvButton");
  if (bulkDownloadCsvButton) {
    bulkDownloadCsvButton.addEventListener("click", () => {
      if (bulkLastRun?.rows?.length) downloadCsv(bulkLastRun.rows, "sourcinglens_bulk_portfolio.csv");
    });
  }

  // Init pro SKU container on result.html pro section
  if (document.getElementById("pro-sku-container")) addProSkuRow();

  // ── Plan routing (result.html) ──────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan");
  const allPlanSections = ["plan-starter", "plan-pro", "plan-pro-monthly", "plan-fallback"];

  if (plan) {
    const banner = document.getElementById("purchaseBanner");
    const bannerText = document.getElementById("purchaseBannerText");

    if (plan === "starter") {
      showPlanSection("plan-starter");
      if (bannerText) bannerText.textContent = "Thanks for purchasing Starter. Enter your product below and run your 1-SKU analysis.";

    } else if (plan === "pro") {
      showPlanSection("plan-pro");
      if (bannerText) bannerText.textContent = "Thanks for purchasing Pro. Add up to 5 SKUs below and run your portfolio analysis.";

    } else if (plan === "pro-monthly") {
      showPlanSection("plan-pro-monthly");
      if (banner) {
        banner.style.background = "linear-gradient(135deg, #ede9fe, #ddd6fe)";
        banner.style.borderLeftColor = "#7c3aed";
      }
      if (document.querySelector("#purchaseBanner h1")) {
        document.querySelector("#purchaseBanner h1").style.color = "#4c1d95";
      }
      if (bannerText) {
        bannerText.style.color = "#5b21b6";
        bannerText.textContent = "Thanks for subscribing to Pro Monthly. Download the CSV template, upload your SKU list, and run a bulk analysis across up to 100 products.";
      }

    } else {
      showPlanSection("plan-fallback");
    }
  } else if (allPlanSections.some(id => document.getElementById(id))) {
    // On result.html with no plan param – show fallback
    showPlanSection("plan-fallback");
  }

  function showPlanSection(id) {
    allPlanSections.forEach(sid => {
      const el = document.getElementById(sid);
      if (el) el.classList.add("hidden");
    });
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
  }
});

// ── In-memory state ──────────────────────────────────────────────────────────
let starterLastRun = null;
let proLastRun = null;
let bulkLastRun = null;
let bulkParsedSkus = [];

// ── Country heuristics ───────────────────────────────────────────────────────
// Tariff rates reflect 2026 effective rates (MFN + Section 301 where applicable).
// China: ~27% combined (25% Section 301 + ~2% MFN, representative for electronics/consumer goods).
// baseFactor reflects typical FOB price differential vs a China baseline.
const COUNTRY_CONFIG = {
  china:   { label: "China",   baseFactor: 1.00, tariff: 0.27, ship: 0.70 },
  vietnam: { label: "Vietnam", baseFactor: 1.10, tariff: 0.04, ship: 0.75 },
  mexico:  { label: "Mexico",  baseFactor: 1.22, tariff: 0.02, ship: 0.55 },
  india:   { label: "India",   baseFactor: 1.02, tariff: 0.05, ship: 0.78 },
  usa:     { label: "USA",     baseFactor: 1.35, tariff: 0.00, ship: 0.30 }
};

const COUNTRY_KEYS = ["china", "vietnam", "mexico", "india", "usa"];

function computeLandedForCountry(currentUnitCost, annualVolume, countryKey) {
  const cfg = COUNTRY_CONFIG[countryKey];
  if (!cfg) return null;
  const base = currentUnitCost * cfg.baseFactor;
  const tariffCost = base * cfg.tariff;
  const shipCost = base * 0.1 * cfg.ship;
  const totalUnit = base + tariffCost + shipCost;
  const annualCost = totalUnit * annualVolume;
  return { key: countryKey, label: cfg.label, base, tariff: tariffCost, shipping: shipCost, totalUnit, annualCost };
}

function formatCurrency(num) {
  if (!isFinite(num)) return "-";
  return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percentDelta(newVal, baseVal) {
  if (!isFinite(newVal) || !isFinite(baseVal) || baseVal === 0) return null;
  return ((newVal - baseVal) / baseVal) * 100;
}

// ── Free comparison (index.html) ─────────────────────────────────────────────
function runFreeComparison() {
  const productName = document.getElementById("freeProductName")?.value.trim();
  const currentCountry = document.getElementById("freeCurrentCountry")?.value;
  const unitCost = parseFloat(document.getElementById("freeUnitCost")?.value || "0");
  const volume = parseInt(document.getElementById("freeAnnualVolume")?.value || "0", 10);
  const compareCountry = document.getElementById("freeCompareCountry")?.value;
  const statusEl = document.getElementById("freeStatus");

  if (!productName || !currentCountry || !compareCountry || !unitCost || !volume) {
    if (statusEl) { statusEl.textContent = "Please fill all fields."; statusEl.className = "status-pill status-error"; }
    return;
  }
  if (statusEl) { statusEl.textContent = "Running comparison…"; statusEl.className = "status-pill status-busy"; }

  const currentRes = computeLandedForCountry(unitCost, volume, currentCountry);
  const altRes = computeLandedForCountry(unitCost, volume, compareCountry);
  const tbody = document.querySelector("#free-results-table tbody");
  if (tbody) tbody.innerHTML = "";

  if (currentRes && altRes && tbody) {
    const delta = percentDelta(altRes.annualCost, currentRes.annualCost);
    const deltaText = delta === null ? "-" : (delta > 0 ? "+" : "") + delta.toFixed(1) + "%";
    const currentRow = document.createElement("tr");
    const altRow = document.createElement("tr");
    currentRow.innerHTML = `<td>Current – ${currentRes.label}</td><td>${formatCurrency(currentRes.base)}</td><td>${formatCurrency(currentRes.tariff)}</td><td>${formatCurrency(currentRes.shipping)}</td><td>${formatCurrency(currentRes.totalUnit)}</td><td>${formatCurrency(currentRes.annualCost)}</td><td>—</td>`;
    altRow.innerHTML = `<td>Alt – ${altRes.label}</td><td>${formatCurrency(altRes.base)}</td><td>${formatCurrency(altRes.tariff)}</td><td>${formatCurrency(altRes.shipping)}</td><td>${formatCurrency(altRes.totalUnit)}</td><td>${formatCurrency(altRes.annualCost)}</td><td>${deltaText}</td>`;
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
    intro.textContent = `${better} looks directionally more attractive on cost by about ${formatCurrency(Math.abs(diff))} per year at your volume, using simplified heuristics.`;
  }
  if (statusEl) { statusEl.textContent = "Comparison complete."; statusEl.className = "status-pill status-ok"; }
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Starter: 1 SKU ───────────────────────────────────────────────────────────
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
    if (statusEl) { statusEl.textContent = "Please fill all required fields."; statusEl.className = "status-pill status-error"; }
    return;
  }
  if (statusEl) { statusEl.textContent = "Running analysis…"; statusEl.className = "status-pill status-busy"; }

  let hsCode = hsInput || "";
  let hsReason = "";

  if (hsInput) {
    if (hsStatus) { hsStatus.textContent = "HS code: using your input."; hsStatus.className = "status-pill status-ok"; }
  } else {
    if (hsStatus) { hsStatus.textContent = "HS code: asking AI…"; hsStatus.className = "status-pill status-busy"; }
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
          hsStatus.textContent = hsCode ? `HS suggestion: ${hsCode} (confirm with broker)` : "HS suggestion unavailable – proceeding with heuristics.";
          hsStatus.className = hsCode ? "status-pill status-ok" : "status-pill status-error";
        }
      } else {
        if (hsStatus) { hsStatus.textContent = "HS suggestion failed – proceeding with heuristics."; hsStatus.className = "status-pill status-error"; }
      }
    } catch (err) {
      console.error(err);
      if (hsStatus) { hsStatus.textContent = "HS suggestion error – proceeding with heuristics."; hsStatus.className = "status-pill status-error"; }
    }
  }

  const currentRes = computeLandedForCountry(unitCost, volume, currentCountry);
  const rows = [];
  if (currentRes) rows.push({ ...currentRes, role: "current" });
  COUNTRY_KEYS.forEach(key => {
    if (key === currentCountry) return;
    const res = computeLandedForCountry(unitCost, volume, key);
    if (res) rows.push({ ...res, role: "alt" });
  });

  const sorted = [...rows].sort((a, b) => a.annualCost - b.annualCost);
  let recommended = sorted[0];
  if (priority === "nearshore") {
    const opt = sorted.find(r => r.key === "mexico" || r.key === "usa");
    if (opt) recommended = opt;
  } else if (priority === "us") {
    const opt = sorted.find(r => r.key === "usa");
    if (opt) recommended = opt;
  }

  const tbody = document.querySelector("#starter-results-table tbody");
  if (tbody) tbody.innerHTML = "";
  const currentAnnual = currentRes?.annualCost || NaN;
  sorted.forEach(r => {
    const delta = percentDelta(r.annualCost, currentAnnual);
    const deltaText = isNaN(currentAnnual) || delta === null ? "-" : (delta > 0 ? "+" : "") + delta.toFixed(1) + "%";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.role === "current" ? "Current – " : "Alt – "}${r.label}${r === recommended ? " ★" : ""}</td><td>${formatCurrency(r.base)}</td><td>${formatCurrency(r.tariff)}</td><td>${formatCurrency(r.shipping)}</td><td>${formatCurrency(r.totalUnit)}</td><td>${formatCurrency(r.annualCost)}</td><td>${r.role === "current" ? "—" : deltaText}</td>`;
    tbody && tbody.appendChild(tr);
  });

  const section = document.getElementById("starter-results-section");
  const nameSpan = document.getElementById("starter-results-product-name");
  const intro = document.getElementById("starter-results-intro");
  const summary = document.getElementById("starter-summary");
  const compliance = document.getElementById("starter-compliance");

  if (section) section.classList.remove("hidden");
  if (nameSpan) nameSpan.textContent = productName;

  if (intro && currentRes && recommended) {
    const diff = recommended.annualCost - currentRes.annualCost;
    intro.textContent = `${recommended.label} emerges as the top lane, with an estimated ${diff < 0 ? "lower" : "higher"} annual landed cost of about ${formatCurrency(Math.abs(diff))} versus your current lane at this volume.`;
  }
  if (summary) {
    summary.textContent = `Based on your inputs, the AI suggests HS code ${hsCode || "N/A"} for directional duty assumptions. The ${recommended?.label} lane benefits from its relative mix of unit cost, duty, and freight. Treat this as a short-list candidate for a more formal RFQ and broker review.`;
  }
  if (compliance) {
    compliance.textContent = `This output is indicative only. HS classification is fact-specific and may differ from the AI suggestion. Confirm HS code, tariff treatment, and compliance requirements with your customs broker before acting.`;
  }

  starterLastRun = { productName, hsCode, hsReason, rows: sorted };
  if (statusEl) { statusEl.textContent = "Analysis complete."; statusEl.className = "status-pill status-ok"; }
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Pro: manual multi-SKU (up to 5) ──────────────────────────────────────────
function addProSkuRow() {
  const container = document.getElementById("pro-sku-container");
  if (!container) return;
  const currentCount = container.querySelectorAll(".pro-sku-row").length;
  if (currentCount >= 5) return;

  const idx = currentCount + 1;
  const div = document.createElement("div");
  div.className = "pro-sku-row";
  div.style.marginBottom = "0.7rem";
  div.innerHTML = `
    <div class="grid-2">
      <label>SKU label<input type="text" name="skuLabel" placeholder="e.g. Bottle – 24oz – Black" /></label>
      <label>Product description<input type="text" name="skuDesc" placeholder="Key materials, coatings, electronics, etc." /></label>
    </div>
    <div class="grid-2">
      <label>Current supplier country
        <select name="skuCurrentCountry">
          <option value="">Select...</option>
          <option value="china">China</option>
          <option value="vietnam">Vietnam</option>
          <option value="mexico">Mexico</option>
          <option value="india">India</option>
          <option value="usa">United States</option>
        </select>
      </label>
      <label>Current unit cost (USD)<input type="number" name="skuUnitCost" min="0" step="0.01" /></label>
    </div>
    <div class="grid-2">
      <label>Annual volume (units)<input type="number" name="skuAnnualVolume" min="1" step="1" /></label>
      <label>HS code (optional – leave blank for AI suggestion)<input type="text" name="skuHsCode" placeholder="e.g. 732393" /></label>
    </div>
    <hr style="border:none;border-top:1px dashed #e5e7eb;margin:0.6rem 0 0.4rem;" />
  `;
  container.appendChild(div);

  const statusEl = document.getElementById("proStatus");
  if (statusEl) { statusEl.textContent = `Ready to run (${idx} SKU${idx > 1 ? "s" : ""} added, max 5)`; statusEl.className = "status-pill status-idle"; }
}

async function runProAnalysis() {
  const container = document.getElementById("pro-sku-container");
  const statusEl = document.getElementById("proStatus");
  if (!container) return;

  const rowsEls = Array.from(container.querySelectorAll(".pro-sku-row"));
  const skuInputs = [];
  rowsEls.forEach(row => {
    const label = row.querySelector('[name="skuLabel"]')?.value.trim();
    const desc = row.querySelector('[name="skuDesc"]')?.value.trim();
    const currentCountry = row.querySelector('[name="skuCurrentCountry"]')?.value;
    const unitCost = parseFloat(row.querySelector('[name="skuUnitCost"]')?.value || "0");
    const volume = parseInt(row.querySelector('[name="skuAnnualVolume"]')?.value || "0", 10);
    const hsCode = row.querySelector('[name="skuHsCode"]')?.value.trim();
    if (label && desc && currentCountry && unitCost && volume) skuInputs.push({ label, desc, currentCountry, unitCost, volume, hsCode });
  });

  if (skuInputs.length === 0) {
    if (statusEl) { statusEl.textContent = "Add at least one complete SKU row."; statusEl.className = "status-pill status-error"; }
    return;
  }
  if (statusEl) { statusEl.textContent = "Running analysis…"; statusEl.className = "status-pill status-busy"; }

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
        if (res.ok) { const data = await res.json(); hsCode = data.hsCode || ""; hsReason = data.reason || ""; }
      } catch (err) { console.error("HS infer error:", err); }
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
      if (res && res.annualCost < bestAlt.annualCost) bestAlt = res;
    });
    const savings = currentRes.annualCost - bestAlt.annualCost;
    if (savings > 0) totalSavings += savings;

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${sku.label}</td><td>${bestAlt.label === currentRes.label ? currentRes.label + " (stay)" : bestAlt.label}</td><td>${formatCurrency(currentRes.annualCost)}</td><td>${formatCurrency(bestAlt.annualCost)}</td><td>${formatCurrency(savings)}</td>`;
    tbody && tbody.appendChild(tr);

    portfolioRows.push({ skuLabel: sku.label, currentLane: currentRes.label, suggestedLane: bestAlt.label, currentAnnual: currentRes.annualCost, suggestedAnnual: bestAlt.annualCost, annualSavings: savings, hsCode: sku.hsCode || "", volume: sku.volume });

    narrativeBits.push(savings > 0
      ? `${sku.label}: shifting from ${currentRes.label} to ${bestAlt.label} could free up about ${formatCurrency(savings)} per year.`
      : `${sku.label}: current lane ${currentRes.label} remains directionally competitive.`);

    const risk = [];
    if (bestAlt.key === "china") risk.push("China exposure & trade remedies");
    if (bestAlt.key === "vietnam" || bestAlt.key === "india") risk.push("emerging-labor & FX volatility");
    if (bestAlt.key === "mexico") risk.push("border / trucking capacity");
    if (bestAlt.key === "usa") risk.push("domestic labor cost & capacity");
    riskItems.push(`${sku.label}: ${bestAlt.label} – ${risk.join(", ") || "standard sourcing risk mix"}.`);
  });

  const totalEl = document.getElementById("pro-total-savings");
  const portfolioSummary = document.getElementById("pro-portfolio-summary");
  const riskPanel = document.getElementById("pro-risk-panel");
  const nextStepsList = document.getElementById("pro-next-steps");
  const intro = document.getElementById("pro-results-intro");
  const section = document.getElementById("pro-results-section");

  if (section) section.classList.remove("hidden");
  if (totalEl) totalEl.textContent = formatCurrency(totalSavings);
  if (portfolioSummary) portfolioSummary.textContent = narrativeBits.join(" ") || "No clear savings pockets emerged on our heuristics.";
  if (riskPanel) riskPanel.textContent = riskItems.join(" ") || "Risk broadly distributed. Treat as a qualitative prompt for further review.";
  if (nextStepsList) {
    nextStepsList.innerHTML = "";
    ["Short-list 2–3 lanes per SKU for real RFQs.", "Share this pack with your broker for validation.", "Layer in service, lead time, and capacity before committing."].forEach(step => {
      const li = document.createElement("li"); li.textContent = step; nextStepsList.appendChild(li);
    });
  }
  if (intro) intro.textContent = `This run covers ${portfolioRows.length} SKU${portfolioRows.length === 1 ? "" : "s"}. Use it as a first pass to identify where a focused sourcing project might unlock the most leverage.`;

  proLastRun = { totalSavings, rows: portfolioRows, narrative: portfolioSummary?.textContent || "", riskPanel: riskPanel?.textContent || "", createdAt: new Date().toISOString() };
  window.latestProRun = proLastRun;
  if (statusEl) { statusEl.textContent = "Pro analysis complete."; statusEl.className = "status-pill status-ok"; }
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Pro Monthly: bulk CSV upload (up to 100 SKUs) ────────────────────────────

const BULK_CSV_TEMPLATE = `sku_label,description,current_country,unit_cost_usd,annual_volume,hs_code
"Product A","Stainless steel water bottle 500ml",china,8.50,10000,
"Product B","Cotton t-shirt unisex",vietnam,4.20,25000,610910
"Product C","Ceramic mug 350ml",china,1.80,50000,
"Product D","Silicone phone case",china,2.10,30000,392690
"Product E","Bamboo cutting board",vietnam,6.40,8000,`;

function downloadBulkCsvTemplate() {
  const blob = new Blob([BULK_CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sourcinglens_bulk_template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());

  const colIdx = {
    sku_label: header.indexOf("sku_label"),
    description: header.indexOf("description"),
    current_country: header.indexOf("current_country"),
    unit_cost_usd: header.indexOf("unit_cost_usd"),
    annual_volume: header.indexOf("annual_volume"),
    hs_code: header.indexOf("hs_code")
  };

  const parsed = [];
  for (let i = 1; i < lines.length && parsed.length < 100; i++) {
    const cols = splitCsvRow(lines[i]);
    const label = (cols[colIdx.sku_label] || "").trim();
    const desc = (cols[colIdx.description] || "").trim();
    const country = (cols[colIdx.current_country] || "").trim().toLowerCase();
    const unitCost = parseFloat(cols[colIdx.unit_cost_usd] || "0");
    const volume = parseInt(cols[colIdx.annual_volume] || "0", 10);
    const hsCode = (cols[colIdx.hs_code] || "").trim();

    if (label && desc && COUNTRY_CONFIG[country] && unitCost > 0 && volume > 0) {
      parsed.push({ label, desc, currentCountry: country, unitCost, volume, hsCode });
    }
  }
  return parsed;
}

function splitCsvRow(row) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function handleBulkCsvUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const text = evt.target.result;
    bulkParsedSkus = parseCsvText(text);

    const previewSection = document.getElementById("bulk-preview-section");
    const countEl = document.getElementById("bulk-preview-count");
    const tbody = document.querySelector("#bulk-preview-table tbody");
    const bulkStatus = document.getElementById("bulkStatus");

    if (bulkParsedSkus.length === 0) {
      if (bulkStatus) { bulkStatus.textContent = "No valid rows found – check your CSV matches the template format."; bulkStatus.className = "status-pill status-error"; }
      previewSection?.classList.remove("hidden");
      return;
    }

    if (countEl) countEl.textContent = bulkParsedSkus.length;
    if (tbody) {
      tbody.innerHTML = "";
      bulkParsedSkus.slice(0, 5).forEach((sku, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${i + 1}</td><td>${sku.label}</td><td>${sku.desc.substring(0, 40)}${sku.desc.length > 40 ? "…" : ""}</td><td>${sku.currentCountry}</td><td>$${sku.unitCost.toFixed(2)}</td><td>${sku.volume.toLocaleString()}</td><td>${sku.hsCode || "—"}</td>`;
        tbody.appendChild(tr);
      });
    }

    if (bulkStatus) { bulkStatus.textContent = `Ready – ${bulkParsedSkus.length} SKU${bulkParsedSkus.length > 1 ? "s" : ""} loaded.`; bulkStatus.className = "status-pill status-ok"; }
    previewSection?.classList.remove("hidden");
    document.getElementById("bulk-results-section")?.classList.add("hidden");
  };
  reader.readAsText(file);
}

async function runBulkAnalysis() {
  if (!bulkParsedSkus.length) return;
  const statusEl = document.getElementById("bulkStatus");
  const runBtn = document.getElementById("bulkRunButton");
  if (runBtn) runBtn.disabled = true;

  // Enrich SKUs needing HS inference in parallel batches of 10
  const needsInference = bulkParsedSkus.filter(s => !s.hsCode);
  const hasHs = bulkParsedSkus.filter(s => s.hsCode);

  if (statusEl) { statusEl.textContent = `Classifying ${needsInference.length} SKU${needsInference.length !== 1 ? "s" : ""} via AI…`; statusEl.className = "status-pill status-busy"; }

  const BATCH_SIZE = 10;
  const inferredMap = {};
  for (let i = 0; i < needsInference.length; i += BATCH_SIZE) {
    const batch = needsInference.slice(i, i + BATCH_SIZE);
    if (statusEl) statusEl.textContent = `Classifying SKUs ${i + 1}–${Math.min(i + BATCH_SIZE, needsInference.length)} of ${needsInference.length}…`;
    await Promise.all(batch.map(async (sku) => {
      try {
        const res = await fetch("/.netlify/functions/hs-infer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productName: sku.label, description: sku.desc })
        });
        if (res.ok) { const data = await res.json(); inferredMap[sku.label] = data.hsCode || ""; }
      } catch (err) { console.error("HS infer error:", sku.label, err); }
    }));
  }

  if (statusEl) { statusEl.textContent = "Computing landed costs…"; statusEl.className = "status-pill status-busy"; }

  const allEnriched = bulkParsedSkus.map(sku => ({
    ...sku,
    hsCode: sku.hsCode || inferredMap[sku.label] || ""
  }));

  const tbody = document.querySelector("#bulk-results-table tbody");
  if (tbody) tbody.innerHTML = "";

  let totalSavings = 0;
  let savingsCount = 0;
  const portfolioRows = [];
  const narrativeBits = [];

  allEnriched.forEach(sku => {
    const currentRes = computeLandedForCountry(sku.unitCost, sku.volume, sku.currentCountry);
    if (!currentRes) return;

    let bestAlt = currentRes;
    COUNTRY_KEYS.forEach(key => {
      const res = computeLandedForCountry(sku.unitCost, sku.volume, key);
      if (res && res.annualCost < bestAlt.annualCost) bestAlt = res;
    });

    const savings = currentRes.annualCost - bestAlt.annualCost;
    if (savings > 0) { totalSavings += savings; savingsCount++; }

    const tr = document.createElement("tr");
    const laneText = bestAlt.key === sku.currentCountry ? `${currentRes.label} (stay)` : bestAlt.label;
    tr.innerHTML = `<td>${sku.label}</td><td>${sku.hsCode || "—"}</td><td>${currentRes.label}</td><td>${laneText}</td><td>${formatCurrency(currentRes.annualCost)}</td><td>${formatCurrency(bestAlt.annualCost)}</td><td style="color:${savings > 0 ? "#059669" : "#6b7280"};">${formatCurrency(savings)}</td>`;
    tbody && tbody.appendChild(tr);

    portfolioRows.push({
      skuLabel: sku.label, hsCode: sku.hsCode || "", currentLane: currentRes.label,
      suggestedLane: laneText, currentAnnual: currentRes.annualCost,
      suggestedAnnual: bestAlt.annualCost, annualSavings: savings, volume: sku.volume
    });

    if (savings > 0) narrativeBits.push(`${sku.label}: ${currentRes.label} → ${bestAlt.label} saves ~${formatCurrency(savings)}/yr.`);
  });

  const section = document.getElementById("bulk-results-section");
  const countEl = document.getElementById("bulk-results-count");
  const intro = document.getElementById("bulk-results-intro");
  const totalEl = document.getElementById("bulk-total-savings");
  const savingsCountEl = document.getElementById("bulk-savings-count");
  const portfolioSummary = document.getElementById("bulk-portfolio-summary");

  if (section) section.classList.remove("hidden");
  if (countEl) countEl.textContent = portfolioRows.length;
  if (totalEl) totalEl.textContent = formatCurrency(totalSavings);
  if (savingsCountEl) savingsCountEl.textContent = `${savingsCount} of ${portfolioRows.length} SKUs`;
  if (intro) intro.textContent = `Analysed ${portfolioRows.length} SKU${portfolioRows.length !== 1 ? "s" : ""}. ${savingsCount} have a potential lane switch. Use the CSV to share with your broker or team.`;
  if (portfolioSummary) portfolioSummary.textContent = narrativeBits.length > 0 ? narrativeBits.join(" ") : "All current lanes appear directionally competitive on cost at current volumes.";

  bulkLastRun = { totalSavings, savingsCount, rows: portfolioRows, createdAt: new Date().toISOString() };
  window.latestProRun = bulkLastRun;

  if (statusEl) { statusEl.textContent = `Bulk analysis complete – ${portfolioRows.length} SKUs processed.`; statusEl.className = "status-pill status-ok"; }
  if (runBtn) runBtn.disabled = false;
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── CSV & PDF helpers ─────────────────────────────────────────────────────────
function downloadCsv(rows, filename) {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const lines = rows.map(r =>
    keys.map(k => {
      const v = r[k];
      if (v === null || v === undefined) return "";
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(",")
  );
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function downloadProPdf() {
  const run = proLastRun;
  if (!run || !run.rows) return;
  const element = document.createElement("div");
  element.innerHTML = `
    <h1>SourcingLens – Pro Report</h1>
    <p>Generated: ${new Date(run.createdAt || Date.now()).toLocaleString()}</p>
    <h2>Portfolio summary</h2><p>${run.narrative || ""}</p>
    <h2>Total estimated savings</h2><p>${formatCurrency(run.totalSavings || 0)}</p>
    <h2>Risk drivers</h2><p>${run.riskPanel || ""}</p>
    <h2>SKU-level detail</h2>
    <table border="1" cellspacing="0" cellpadding="4">
      <tr><th>SKU</th><th>Current lane</th><th>Suggested lane</th><th>Current annual</th><th>Suggested annual</th><th>Annual savings</th><th>HS</th></tr>
      ${run.rows.map(r => `<tr><td>${r.skuLabel}</td><td>${r.currentLane}</td><td>${r.suggestedLane}</td><td>${formatCurrency(r.currentAnnual)}</td><td>${formatCurrency(r.suggestedAnnual)}</td><td>${formatCurrency(r.annualSavings)}</td><td>${r.hsCode || ""}</td></tr>`).join("")}
    </table>
  `;
  window.html2pdf().set({ margin: 10, filename: "sourcinglens_pro_report.pdf", html2canvas: { scale: 2 }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } }).from(element).save();
}
