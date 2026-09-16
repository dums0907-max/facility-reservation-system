let currentUser = null;
let currentProfile = null;

const TABS_BY_ROLE = {
  admin:     [["facilities","Facilities"], ["all-reservations","Reservations"], ["service","Service Requests"], ["users","Users"], ["audit","Audit Log"]],
  staff:     [["facilities","Facilities"], ["all-reservations","Reservations"], ["service","Service Requests"]],
  requester: [["facilities","Facilities"], ["reserve","Reserve"], ["my-reservations","My Reservations"]],
};

function fmt(dt) {
  return new Date(dt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function pill(status) {
  return `<span class="status-pill status-${status.replace(" ", "-")}">${status}</span>`;
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "index.html"; return; }
  currentUser = session.user;

  const { data: profile, error } = await supabaseClient
    .from("profiles").select("*").eq("id", currentUser.id).single();
  if (error || !profile) {
    console.error(error);
    alert("Could not load your profile. Please sign in again.");
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
    return;
  }
  currentProfile = profile;

  document.getElementById("who-name").textContent = profile.full_name;
  document.getElementById("who-role").textContent = profile.role;

  buildTabs();
  await Promise.all([loadFacilities(), loadReservations()]);
  if (profile.role === "admin") { await loadUsers(); await loadAuditLog(); }
  if (profile.role !== "requester") { await loadServiceRequests(); }

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
  });
}

function buildTabs() {
  const tabsEl = document.getElementById("tabs");
  const tabs = TABS_BY_ROLE[currentProfile.role] || [];
  tabsEl.innerHTML = tabs.map(([id, label], i) =>
    `<button class="tab-btn${i === 0 ? " active" : ""}" data-panel="${id}">${label}</button>`
  ).join("");
  tabs.forEach(([id], i) => {
    document.getElementById(`panel-${id}`).classList.toggle("active", i === 0);
  });
  tabsEl.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll("main.content .panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`panel-${btn.dataset.panel}`).classList.add("active");
    });
  });

  if (currentProfile.role === "admin") {
    document.getElementById("admin-add-facility").classList.remove("hidden");
  }
  if (currentProfile.role === "staff") {
    document.getElementById("staff-add-service").classList.remove("hidden");
  }
}

// ---------------- FACILITIES ----------------
async function loadFacilities() {
  const { data, error } = await supabaseClient.from("facilities").select("*").order("name");
  if (error) { console.error(error); return; }

  const tbody = document.querySelector("#facilities-table tbody");
  tbody.innerHTML = data.map(f => `
    <tr>
      <td>${f.name}</td>
      <td>${f.location ?? ""}</td>
      <td>${f.capacity ?? ""}</td>
      <td>${pill(f.status)}</td>
      <td>${facilityActionsHtml(f)}</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-fac-status]").forEach(sel => {
    sel.addEventListener("change", async (e) => {
      const { error } = await supabaseClient
        .from("facilities").update({ status: e.target.value }).eq("id", sel.dataset.facId);
      if (error) { alert(error.message); return; }
      loadFacilities();
    });
  });

  // populate reservation / service-request facility dropdowns with Active facilities
  const activeOptions = data.filter(f => f.status === "Active")
    .map(f => `<option value="${f.id}">${f.name}</option>`).join("");
  const resSelect = document.getElementById("res_facility");
  if (resSelect) resSelect.innerHTML = activeOptions;
  const svcSelect = document.getElementById("svc_facility");
  if (svcSelect) svcSelect.innerHTML = data.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
}

function facilityActionsHtml(f) {
  if (currentProfile.role === "admin" || currentProfile.role === "staff") {
    return `
      <select data-fac-status data-fac-id="${f.id}" class="btn-sm">
        <option ${f.status === "Active" ? "selected" : ""}>Active</option>
        <option ${f.status === "Maintenance" ? "selected" : ""}>Maintenance</option>
        <option ${f.status === "Inactive" ? "selected" : ""}>Inactive</option>
      </select>`;
  }
  return "";
}

document.getElementById("add-facility-btn")?.addEventListener("click", async () => {
  const name = document.getElementById("fac_name").value.trim();
  const location = document.getElementById("fac_location").value.trim();
  const capacity = document.getElementById("fac_capacity").value || null;
  const status = document.getElementById("fac_status").value;
  const errEl = document.getElementById("fac-error");
  if (!name) { errEl.textContent = "Name is required."; errEl.classList.remove("hidden"); return; }

  const { error } = await supabaseClient.from("facilities").insert({ name, location, capacity, status });
  if (error) { errEl.textContent = error.message; errEl.classList.remove("hidden"); return; }
  errEl.classList.add("hidden");
  document.getElementById("add-facility-form").reset();
  loadFacilities();
});

// ---------------- RESERVATIONS ----------------
async function loadReservations() {
  if (currentProfile.role === "requester") {
    const { data, error } = await supabaseClient
      .from("reservations")
      .select("*, facilities(name)")
      .eq("requester_id", currentUser.id)
      .order("start_time", { ascending: false });
    if (error) { console.error(error); return; }

    document.getElementById("my-reservations-body").innerHTML = data.map(r => `
      <tr>
        <td>${r.facilities?.name ?? ""}</td>
        <td>${fmt(r.start_time)} – ${fmt(r.end_time)}</td>
        <td>${r.purpose ?? ""}</td>
        <td>${pill(r.status)}</td>
        <td>${r.status === "Pending"
          ? `<button class="btn-sm reject" data-cancel="${r.id}">Cancel</button>` : ""}</td>
      </tr>`).join("");

    document.querySelectorAll("[data-cancel]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const { error } = await supabaseClient
          .from("reservations").update({ status: "Cancelled" }).eq("id", btn.dataset.cancel);
        if (error) { alert(error.message); return; }
        loadReservations();
      });
    });
  } else {
    const { data, error } = await supabaseClient
      .from("reservations")
      .select("*, facilities(name), profiles!reservations_requester_id_fkey(full_name)")
      .order("start_time", { ascending: false });
    if (error) { console.error(error); return; }

    document.getElementById("all-reservations-body").innerHTML = data.map(r => `
      <tr>
        <td>${r.facilities?.name ?? ""}</td>
        <td>${r.profiles?.full_name ?? ""}</td>
        <td>${fmt(r.start_time)} – ${fmt(r.end_time)}</td>
        <td>${pill(r.status)}</td>
        <td>${reservationActionsHtml(r)}</td>
      </tr>`).join("");

    attachReservationActionHandlers();
  }
}

function reservationActionsHtml(r) {
  if (currentProfile.role === "admin" && r.status === "Pending") {
    return `<button class="btn-sm approve" data-approve="${r.id}">Approve</button>
            <button class="btn-sm reject" data-reject="${r.id}">Reject</button>`;
  }
  if (currentProfile.role === "staff" && r.status === "Scheduled") {
    return `<button class="btn-sm advance" data-inuse="${r.id}">Mark In Use</button>`;
  }
  if (currentProfile.role === "staff" && r.status === "In Use") {
    return `<button class="btn-sm advance" data-complete="${r.id}">Mark Completed</button>`;
  }
  return "";
}

function attachReservationActionHandlers() {
  const run = async (id, patch) => {
    const { error } = await supabaseClient.from("reservations").update(patch).eq("id", id);
    if (error) { alert(error.message); return; }
    loadReservations();
  };
  document.querySelectorAll("[data-approve]").forEach(b =>
    b.addEventListener("click", () => run(b.dataset.approve, { status: "Approved" })));
  document.querySelectorAll("[data-reject]").forEach(b =>
    b.addEventListener("click", () => run(b.dataset.reject, { status: "Rejected" })));
  document.querySelectorAll("[data-inuse]").forEach(b =>
    b.addEventListener("click", () => run(b.dataset.inuse, { status: "In Use" })));
  document.querySelectorAll("[data-complete]").forEach(b =>
    b.addEventListener("click", () => run(b.dataset.complete, { status: "Completed" })));
}

document.getElementById("reserve-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("reserve-error");
  const infoEl = document.getElementById("reserve-info");
  errEl.classList.add("hidden");
  infoEl.classList.add("hidden");

  const facility_id = document.getElementById("res_facility").value;
  const start_time = document.getElementById("res_start").value;
  const end_time = document.getElementById("res_end").value;
  const purpose = document.getElementById("res_purpose").value.trim();

  if (new Date(start_time) >= new Date(end_time)) {
    errEl.textContent = "Start time must be before end time.";
    errEl.classList.remove("hidden");
    return;
  }

  const { error } = await supabaseClient.from("reservations").insert({
    facility_id, requester_id: currentUser.id, start_time, end_time, purpose, status: "Pending"
  });
  if (error) { errEl.textContent = error.message; errEl.classList.remove("hidden"); return; }

  infoEl.textContent = "Reservation submitted as Pending.";
  infoEl.classList.remove("hidden");
  document.getElementById("reserve-form").reset();
  loadReservations();
});

// ---------------- SERVICE REQUESTS ----------------
async function loadServiceRequests() {
  const { data, error } = await supabaseClient
    .from("service_requests").select("*, facilities(name)").order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  document.getElementById("service-body").innerHTML = data.map(s => `
    <tr>
      <td>${s.facilities?.name ?? ""}</td>
      <td>${s.description}</td>
      <td>${pill(s.status)}</td>
      <td>${fmt(s.created_at)}</td>
    </tr>`).join("");
}

document.getElementById("service-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const facility_id = document.getElementById("svc_facility").value;
  const description = document.getElementById("svc_description").value.trim();
  const { error } = await supabaseClient.from("service_requests").insert({
    facility_id, staff_id: currentUser.id, description
  });
  if (error) { alert(error.message); return; }
  document.getElementById("service-form").reset();
  loadServiceRequests();
});

// ---------------- USERS (admin) ----------------
async function loadUsers() {
  const { data, error } = await supabaseClient.from("profiles").select("*").order("full_name");
  if (error) { console.error(error); return; }
  document.getElementById("users-body").innerHTML = data.map(u => `
    <tr>
      <td>${u.full_name}</td>
      <td>
        <select data-user-role="${u.id}" class="btn-sm" ${u.id === currentUser.id ? "disabled" : ""}>
          <option ${u.role === "requester" ? "selected" : ""}>requester</option>
          <option ${u.role === "staff" ? "selected" : ""}>staff</option>
          <option ${u.role === "admin" ? "selected" : ""}>admin</option>
        </select>
      </td>
      <td>${fmt(u.created_at)}</td>
      <td></td>
    </tr>`).join("");

  document.querySelectorAll("[data-user-role]").forEach(sel => {
    sel.addEventListener("change", async () => {
      const { error } = await supabaseClient
        .from("profiles").update({ role: sel.value }).eq("id", sel.dataset.userRole);
      if (error) { alert(error.message); return; }
      loadUsers();
    });
  });
}

// ---------------- AUDIT LOG (admin) ----------------
async function loadAuditLog() {
  const { data, error } = await supabaseClient
    .from("audit_logs")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) { console.error(error); return; }
  document.getElementById("audit-body").innerHTML = data.map(a => `
    <tr>
      <td>${fmt(a.created_at)}</td>
      <td>${a.profiles?.full_name ?? "system"}</td>
      <td>${a.action}</td>
      <td>${a.target_table} / ${(a.target_id ?? "").toString().slice(0, 8)}</td>
      <td><code>${JSON.stringify(a.details)}</code></td>
    </tr>`).join("");
}

init();
