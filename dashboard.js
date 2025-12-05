
// Supabase-powered Pro Monthly dashboard + auth

// Injected Supabase config for this project
window.SOURCINGLENS_SUPABASE_URL = "https://tghihdfufdukqwxhzxpz.supabase.co";
window.SOURCINGLENS_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnaGloZGZ1ZmR1a3F3eGh6eHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MTA2NTIsImV4cCI6MjA4MDQ4NjY1Mn0.4Tg735KJcw39Nu4h55Dm1ieDlceXdqQ_zqHz_cTWvyY";

let supabaseClient = null;

function initSupabaseClient() {
  const url = window.SOURCINGLENS_SUPABASE_URL;
  const anon = window.SOURCINGLENS_SUPABASE_ANON_KEY;
  if (!url || !anon || !window.supabase) {
    console.warn("Supabase config missing or supabase-js not loaded.");
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(url, anon);
  }
  return supabaseClient;
}

document.addEventListener("DOMContentLoaded", () => {
  const client = initSupabaseClient();
  if (!client) return;

  setupAuthUI(client);
  restoreSession(client);
});

function setupAuthUI(client) {
  const authForm = document.getElementById("auth-form");
  const emailInput = document.getElementById("authEmail");
  const statusEl = document.getElementById("authStatus");
  const signOutBtn = document.getElementById("authSignOutButton");

  if (authForm && emailInput) {
    const sendBtn = document.getElementById("authSendLinkButton");
    if (sendBtn) {
      sendBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        if (!email) {
          if (statusEl) statusEl.textContent = "Enter a valid email.";
          return;
        }
        if (statusEl) statusEl.textContent = "Sending magic link…";
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin + "/#pro-monthly" }
        });
        if (error) {
          if (statusEl) statusEl.textContent = "Error sending link: " + error.message;
        } else {
          if (statusEl) statusEl.textContent = "Check your inbox for the magic link.";
        }
      });
    }
  }

  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      await client.auth.signOut();
      updateAuthState(null);
    });
  }

  client.auth.onAuthStateChange((_event, session) => {
    updateAuthState(session?.user || null);
    if (session?.user) {
      loadDashboardRows(client, session.user);
    }
  });
}

async function restoreSession(client) {
  const { data } = await client.auth.getUser();
  const user = data?.user || null;
  updateAuthState(user);
  if (user) {
    loadDashboardRows(client, user);
  }
}

function updateAuthState(user) {
  const loggedOut = document.getElementById("auth-logged-out");
  const loggedIn = document.getElementById("auth-logged-in");
  const dashboardMain = document.getElementById("dashboard-main");
  const emailSpan = document.getElementById("authUserEmail");

  if (user) {
    if (loggedOut) loggedOut.classList.add("hidden");
    if (loggedIn) loggedIn.classList.remove("hidden");
    if (dashboardMain) dashboardMain.classList.remove("hidden");
    if (emailSpan) emailSpan.textContent = user.email || "";
  } else {
    if (loggedOut) loggedOut.classList.remove("hidden");
    if (loggedIn) loggedIn.classList.add("hidden");
    if (dashboardMain) dashboardMain.classList.add("hidden");
    if (emailSpan) emailSpan.textContent = "";
    const tbody = document.querySelector("#dashboard-table tbody");
    if (tbody) tbody.innerHTML = "";
  }
}

async function loadDashboardRows(client, user) {
  const tbody = document.querySelector("#dashboard-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='5'>Loading…</td></tr>";
  const { data, error } = await client
    .from("analyses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan='5'>Error: ${error.message}</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='5'>No analyses saved yet.</td></tr>";
    return;
  }
  tbody.innerHTML = "";
  data.forEach(row => {
    const tr = document.createElement("tr");
    const payload = row.payload || {};
    tr.innerHTML = `
      <td>${new Date(row.created_at).toLocaleString()}</td>
      <td>${row.label || "Portfolio run"}</td>
      <td>${row.sku_count || (payload.rows ? payload.rows.length : 0)}</td>
      <td>${formatCurrency(row.estimated_savings || 0)}</td>
      <td><button type="button" data-id="${row.id}" class="btn btn-ghost btn-xs">Load</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const { data, error } = await client
        .from("analyses")
        .select("*")
        .eq("id", id)
        .single();
      if (error) {
        alert("Error loading analysis: " + error.message);
        return;
      }
      if (data && data.payload) {
        window.latestProRun = data.payload;
        alert("Loaded analysis into memory. Re-run Pro PDF/CSV if needed.");
      }
    });
  });
}

// Expose save function for script.js
window.saveProRunToSupabase = async function(proRun) {
  const client = initSupabaseClient();
  const statusEl = document.getElementById("dashboardSaveStatus");
  if (!client) {
    if (statusEl) statusEl.textContent = "Supabase not configured.";
    return;
  }
  if (!proRun || !proRun.rows || proRun.rows.length === 0) {
    if (statusEl) statusEl.textContent = "No Pro run to save yet.";
    return;
  }
  const { data: userData } = await client.auth.getUser();
  const user = userData?.user;
  if (!user) {
    if (statusEl) statusEl.textContent = "Sign in via Pro Monthly to save.";
    return;
  }
  if (statusEl) statusEl.textContent = "Saving run…";

  const label = "Pro run – " + new Date().toLocaleString();
  const { error } = await client.from("analyses").insert({
    user_id: user.id,
    label,
    sku_count: proRun.rows.length,
    estimated_savings: proRun.totalSavings || 0,
    payload: proRun
  });
  if (error) {
    if (statusEl) statusEl.textContent = "Save failed: " + error.message;
  } else {
    if (statusEl) statusEl.textContent = "Run saved. Refresh dashboard list below.";
    loadDashboardRows(client, user);
  }
};
