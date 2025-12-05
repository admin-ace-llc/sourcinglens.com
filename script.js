
document.addEventListener('DOMContentLoaded', () => {
  const yearSpan = document.getElementById('year');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  const form = document.getElementById('analysis-form');
  const runButton = document.getElementById('runButton');
  const resultsSection = document.getElementById('results-section');
  const resultsProductName = document.getElementById('results-product-name');
  const resultsIntro = document.getElementById('results-intro');
  const tbody = document.querySelector('#results-table tbody');
  const downloadBtn = document.getElementById('downloadCsvButton');
  const hsStatus = document.getElementById('hsStatus');
  const analysisStatus = document.getElementById('analysisStatus');
  const bestOptionEl = document.getElementById('best-option');
  const annualSavingsEl = document.getElementById('annual-savings');
  const paybackEl = document.getElementById('payback');
  const summaryEl = document.getElementById('analysis-summary');
  const actionsList = document.getElementById('analysis-actions');
  const complianceNotes = document.getElementById('compliance-notes');
  const usSuppliersCard = document.getElementById('us-suppliers-card');
  const usSuppliersList = document.getElementById('us-suppliers-list');

  function setStatus(el, state, text) {
    if (!el) return;
    el.classList.remove('status-idle', 'status-loading', 'status-success', 'status-error');
    if (state) el.classList.add(state);
    if (text) el.textContent = text;
  }

  function formatUsd(n){
    if (isNaN(n)) return '$0.00';
    return '$' + n.toFixed(2);
  }

  async function inferHsIfNeeded(description, currentHs) {
    if (currentHs && currentHs.trim() !== '') {
      setStatus(hsStatus, 'status-success', 'HS code: using your input');
      return currentHs.trim();
    }
    if (!description || description.trim().length < 10) {
      setStatus(hsStatus, 'status-idle', 'HS code: not provided (using generic assumptions)');
      return '';
    }
    try {
      setStatus(hsStatus, 'status-loading', 'HS code: asking GPT-4.1-mini...');
      const res = await fetch('/.netlify/functions/hs-infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
      });
      const data = await res.json();
      if (data && data.hsCode) {
        setStatus(hsStatus, 'status-success', 'HS code: suggested ' + data.hsCode + ' (verify with broker)');
        return data.hsCode;
      } else {
        setStatus(hsStatus, 'status-error', 'HS suggestion unavailable. Using generic assumptions.');
        return '';
      }
    } catch (e) {
      setStatus(hsStatus, 'status-error', 'HS suggestion failed. Using generic assumptions.');
      return '';
    }
  }

  if (runButton) {
    runButton.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!form || !form.reportValidity()) return;

      const productName = document.getElementById('productName').value.trim() || 'your product';
      const desc = document.getElementById('productDescription').value.trim();
      const hsInput = document.getElementById('hsCode').value.trim();
      const unitCost = parseFloat(document.getElementById('unitCost').value || '0');
      const annualVolume = parseInt(document.getElementById('annualVolume').value || '1', 10);
      const currentCountry = document.getElementById('currentCountry').value || 'china';
      const priority = document.getElementById('priority').value || 'cost';

      setStatus(analysisStatus, 'status-loading', 'Running analysis...');

      const inferredHs = await inferHsIfNeeded(desc, hsInput);

      const countries = [
        {key:'china',   label:'China (baseline offshore)',        mult:1.00, tariff:0.25, ship:0.80},
        {key:'vietnam', label:'Vietnam (China+1)',               mult:1.05, tariff:0.05, ship:0.95},
        {key:'mexico',  label:'Mexico (nearshore, USMCA)',       mult:1.15, tariff:0.00, ship:0.55},
        {key:'india',   label:'India',                           mult:1.10, tariff:0.08, ship:0.95},
        {key:'usa',     label:'United States (domestic)',        mult:1.35, tariff:0.00, ship:0.25}
      ];

      const baseline = countries.find(c => c.key === currentCountry) || countries[0];

      const options = countries.map(c => {
        const baseCost = unitCost * (c.mult / baseline.mult);
        const tariffAmt = baseCost * c.tariff;
        const landed = baseCost + tariffAmt + c.ship;
        const annual = landed * annualVolume;
        return { ...c, baseCost, tariffAmt, landed, annual };
      });

      const current = options.find(o => o.key === currentCountry) || options[0];
      const currentAnnual = current.annual;
      options.forEach(o => o.delta = o.annual - currentAnnual);

      if (priority === 'nearshore') {
        options.sort((a,b) => {
          const nearshoreBoost = (x) => x.key === 'mexico' ? -0.5 : 0;
          return (a.annual + nearshoreBoost(a)) - (b.annual + nearshoreBoost(b));
        });
      } else if (priority === 'us') {
        options.sort((a,b) => {
          const usBoost = (x) => x.key === 'usa' ? -0.7 : 0;
          return (a.annual + usBoost(a)) - (b.annual + usBoost(b));
        });
      } else if (priority === 'balance') {
        options.sort((a,b) => {
          const riskScore = (x) => {
            if (x.key === 'china') return 0.6;
            if (x.key === 'vietnam') return 0.4;
            if (x.key === 'india') return 0.5;
            if (x.key === 'mexico') return 0.3;
            if (x.key === 'usa') return 0.2;
            return 0.5;
          };
          const aScore = a.annual * (1 + 0.15 * riskScore(a));
          const bScore = b.annual * (1 + 0.15 * riskScore(b));
          return aScore - bScore;
        });
      } else {
        options.sort((a,b) => a.annual - b.annual);
      }

      const best = options[0];
      const savings = Math.max(0, currentAnnual - best.annual);

      tbody.innerHTML = '';
      options.forEach(o => {
        const tr = document.createElement('tr');
        if (o.key === best.key) tr.classList.add('best-row');
        const isCurrent = o.key === current.key;
        tr.innerHTML = `
          <td>${o.label}${isCurrent ? ' · current' : ''}${o.key===best.key ? ' · suggested' : ''}</td>
          <td>${formatUsd(o.baseCost)}</td>
          <td>${(o.tariff*100).toFixed(1)}%</td>
          <td>${formatUsd(o.ship)}</td>
          <td>${formatUsd(o.landed)}</td>
          <td>${formatUsd(o.annual)}</td>
          <td>${isCurrent ? '—' : (o.delta>0?'+':'') + formatUsd(o.delta)}</td>
        `;
        tbody.appendChild(tr);
      });

      resultsProductName.textContent = productName;
      if (savings > 0) {
        resultsIntro.textContent = `Directionally, switching from ${current.label} to ${best.label} could save around ${formatUsd(savings)} per year on landed costs under these assumptions.`;
      } else {
        resultsIntro.textContent = `On these assumptions, your current lane in ${current.label} looks broadly competitive with the profiled alternatives.`;
      }

      if (bestOptionEl) {
        bestOptionEl.textContent = `${best.label} – estimated annual spend ${formatUsd(best.annual)} vs ${formatUsd(currentAnnual)} today.`;
      }
      if (annualSavingsEl) {
        annualSavingsEl.textContent = savings > 0 ? formatUsd(savings) + ' per year (directional)' : 'No clear savings on this run.';
      }
      if (paybackEl) {
        if (savings > 0) {
          const roughProjectCost = 5000;
          const years = roughProjectCost / (savings || 1);
          if (years < 0.5) paybackEl.textContent = 'Well under 1 year on a modest sourcing project budget.';
          else if (years < 1.5) paybackEl.textContent = 'Roughly 1 year payback on a modest sourcing project budget.';
          else paybackEl.textContent = 'Payback may be slower; consider bundling this with other sourcing changes.';
        } else {
          paybackEl.textContent = 'Treat this as a validation that your current lane is not obviously offside on cost.';
        }
      }

      if (summaryEl && actionsList) {
        summaryEl.textContent = `This run treats your current lane in ${current.label} as the anchor and compares five common sourcing options using simplified cost and duty heuristics.`;
        actionsList.innerHTML = '';
        const bullets = [];
        if (savings > 0) {
          bullets.push(`Share this table and CSV with finance and sourcing to sanity-check assumptions.`);
          bullets.push(`Ask your broker to quote duties and landed cost for ${best.label} using your real HS code and Incoterms.`);
        } else {
          bullets.push(`Use this as a confidence check that your current lane is not obviously overpriced on these assumptions.`);
        }
        bullets.push('Treat HS-code suggestions, if any, as a starting point only; always confirm classification.');
        bullets.forEach(text => {
          const li = document.createElement('li');
          li.textContent = text;
          actionsList.appendChild(li);
        });
      }

      if (complianceNotes) {
        complianceNotes.textContent = 'Trade policy can shift quickly (tariffs, AD/CVD, Section 301, etc.). Always check live rates and any product-specific measures, and confirm whether your product is actually eligible for any preference programs.';
      }

      if (usSuppliersCard && usSuppliersList) {
        if (best.key === 'usa') {
          usSuppliersCard.classList.remove('hidden');
          usSuppliersList.innerHTML = '';
          const dirs = [
            { name: 'Thomasnet', url: 'https://www.thomasnet.com/' },
            { name: 'MFG.com', url: 'https://www.mfg.com/' },
            { name: 'Maker\'s Row', url: 'https://makersrow.com/' }
          ];
          dirs.forEach(d => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = d.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = d.name;
            li.appendChild(a);
            usSuppliersList.appendChild(li);
          });
        } else {
          usSuppliersCard.classList.add('hidden');
        }
      }

      resultsSection.classList.remove('hidden');
      resultsSection.scrollIntoView({ behavior: 'smooth' });
      setStatus(analysisStatus, 'status-success', 'Analysis complete');
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (!tbody || !tbody.children.length) {
        alert('Run an analysis first.');
        return;
      }
      const rows = [];
      const headers = Array.from(document.querySelectorAll('#results-table thead th'))
        .map(th => th.textContent.replace(/,/g, ''));
      rows.push(headers.join(','));
      Array.from(tbody.children).forEach(tr => {
        const cells = Array.from(tr.children).map(td => td.textContent.replace(/,/g,''));
        rows.push(cells.join(','));
      });
      const blob = new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sourcinglens_analysis.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
});
