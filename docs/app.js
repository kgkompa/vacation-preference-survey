(() => {
  const apiBase = (document.querySelector('meta[name="api-base"]')?.content || "").replace(/\/+$/, "");
  const sitesBypass = document.querySelector('meta[name="sites-bypass"]')?.content || "";
  const $ = (selector) => document.querySelector(selector);
  const views = [...document.querySelectorAll(".view")];
  let token = sessionStorage.getItem("vacationSurveyToken") || "";
  let role = sessionStorage.getItem("vacationSurveyRole") || "";
  let residentNames = [];
  let currentResident = null;
  let responses = [];

  function showView(id) {
    views.forEach((view) => view.classList.toggle("hidden", view.id !== id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setStatus(selector, message, success = false) {
    const element = $(selector);
    element.textContent = message || "";
    element.classList.toggle("success", success);
  }

  async function request(path, options = {}) {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    if (sitesBypass) headers["OAI-Sites-Authorization"] = `Bearer ${sitesBypass}`;
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${apiBase}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== "/api/login") logout();
      throw new Error(body.error || "Something went wrong. Please try again.");
    }
    return body;
  }

  function rememberSession(data) {
    token = data.token;
    role = data.role;
    residentNames = data.residents || [];
    sessionStorage.setItem("vacationSurveyToken", token);
    sessionStorage.setItem("vacationSurveyRole", role);
  }

  function logout() {
    token = "";
    role = "";
    currentResident = null;
    sessionStorage.removeItem("vacationSurveyToken");
    sessionStorage.removeItem("vacationSurveyRole");
    $("#password").value = "";
    showView("login-view");
  }

  function populateNames() {
    $("#resident-list").replaceChildren(
      ...residentNames.map((name) => {
        const option = document.createElement("option");
        option.value = name;
        return option;
      }),
    );
  }

  function buildRankFields(options, priorChoices = []) {
    const count = Math.min(5, options.length);
    $("#rank-fields").replaceChildren(
      ...Array.from({ length: count }, (_, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "rank-row";
        const rank = document.createElement("span");
        rank.className = "rank-number";
        rank.textContent = String(index + 1);
        const content = document.createElement("div");
        const label = document.createElement("label");
        label.htmlFor = `rank-${index + 1}`;
        label.textContent = index < 3 ? `Choice ${index + 1} · required` : `Choice ${index + 1} · optional`;
        const select = document.createElement("select");
        select.id = `rank-${index + 1}`;
        select.dataset.rank = String(index + 1);
        select.required = index < Math.min(3, count);
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Select a week";
        select.append(blank);
        for (const option of options) {
          const item = document.createElement("option");
          item.value = option.id;
          item.textContent = option.label;
          if (priorChoices[index]?.optionId === option.id) item.selected = true;
          select.append(item);
        }
        select.addEventListener("change", preventDuplicateChoices);
        content.append(label, select);
        wrapper.append(rank, content);
        return wrapper;
      }),
    );
  }

  function preventDuplicateChoices() {
    const selects = [...document.querySelectorAll("[data-rank]")];
    const selected = selects.map((select) => select.value).filter(Boolean);
    selects.forEach((select) => {
      [...select.options].forEach((option) => {
        option.disabled = Boolean(option.value && option.value !== select.value && selected.includes(option.value));
      });
    });
  }

  async function loadResident(name) {
    const data = await request(`/api/options?name=${encodeURIComponent(name)}`);
    currentResident = data.resident;
    $("#survey-title").textContent = `${currentResident.name}, rank your weeks`;
    $("#survey-subtitle").textContent = `${currentResident.level} · ${currentResident.options.length} eligible option${currentResident.options.length === 1 ? "" : "s"}`;
    $("#option-count").textContent = `${currentResident.options.length} available`;
    buildRankFields(currentResident.options, data.existingResponse?.choices || []);
    $(".preference-card .muted").textContent = currentResident.options.length
      ? "Choices 1–3 are required. Each week can only be selected once."
      : "No eligible weeks remain under the current rules. You may still submit scheduling context for the chiefs.";
    $("#comments").value = data.existingResponse?.comment || "";
    $("#flexible").checked = Boolean(data.existingResponse?.flexible);
    showView("survey-view");
  }

  function choiceRows() {
    const byId = new Map(currentResident.options.map((option) => [option.id, option]));
    return [...document.querySelectorAll("[data-rank]")]
      .filter((select) => select.value)
      .map((select) => ({
        rank: Number(select.dataset.rank),
        optionId: select.value,
        ...byId.get(select.value),
      }));
  }

  function renderMetrics(filtered) {
    const submitted = new Set(filtered.map((response) => response.residentName)).size;
    const firstChoices = new Set(filtered.map((response) => response.choices?.[0]?.optionId).filter(Boolean)).size;
    const flexible = filtered.filter((response) => response.flexible).length;
    const comments = filtered.filter((response) => response.comment).length;
    const values = [
      ["Residents responded", submitted],
      ["Unique first-choice weeks", firstChoices],
      ["Flexible responses", flexible],
      ["Responses with context", comments],
    ];
    $("#admin-metrics").replaceChildren(
      ...values.map(([label, value]) => {
        const metric = document.createElement("div");
        metric.className = "metric";
        metric.innerHTML = `<span>${escapeHtml(label)}</span><strong>${value}</strong>`;
        return metric;
      }),
    );
  }

  function renderDemand(filtered) {
    const demand = new Map();
    filtered.forEach((response) =>
      (response.choices || []).forEach((choice) => {
        const item = demand.get(choice.optionId) || { label: choice.label, score: 0, first: 0 };
        item.score += 6 - choice.rank;
        if (choice.rank === 1) item.first += 1;
        demand.set(choice.optionId, item);
      }),
    );
    const ranked = [...demand.values()].sort((a, b) => b.score - a.score || b.first - a.first).slice(0, 10);
    const max = ranked[0]?.score || 1;
    $("#demand-chart").replaceChildren(
      ...ranked.map((item) => {
        const row = document.createElement("div");
        row.className = "bar-row";
        row.title = `${item.first} first-choice request${item.first === 1 ? "" : "s"}`;
        row.innerHTML = `
          <span class="bar-label">${escapeHtml(item.label)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(item.score / max) * 100}%"></span></span>
          <span class="bar-score">${item.score}</span>`;
        return row;
      }),
    );
    if (!ranked.length) $("#demand-chart").innerHTML = '<p class="muted">No preference data yet.</p>';
  }

  function filteredResponses() {
    const level = $("#level-filter").value;
    const query = $("#response-search").value.trim().toLowerCase();
    return responses.filter((response) => {
      const matchesLevel = !level || response.trainingLevel === level;
      const haystack = [
        response.residentName,
        response.comment,
        ...(response.choices || []).map((choice) => choice.label),
      ].join(" ").toLowerCase();
      return matchesLevel && (!query || haystack.includes(query));
    });
  }

  function renderTable(filtered) {
    $("#table-count").textContent = `${filtered.length} response${filtered.length === 1 ? "" : "s"}`;
    $("#empty-responses").classList.toggle("hidden", filtered.length > 0);
    $("#response-body").replaceChildren(
      ...filtered.map((response) => {
        const row = document.createElement("tr");
        const submitted = new Date(response.submittedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
        row.innerHTML = `
          <td><strong>${escapeHtml(response.residentName)}</strong></td>
          <td>${escapeHtml(response.trainingLevel)}</td>
          <td>${escapeHtml(submitted)}</td>
          <td><ol class="choice-list">${(response.choices || []).map((choice) => `<li>${escapeHtml(choice.label)}</li>`).join("")}</ol></td>
          <td>${response.flexible ? "Yes" : "No"}</td>
          <td>${escapeHtml(response.comment || "—")}</td>`;
        return row;
      }),
    );
  }

  function renderAdmin() {
    const filtered = filteredResponses();
    renderMetrics(filtered);
    renderDemand(filtered);
    renderTable(filtered);
  }

  async function loadAdmin() {
    setStatus("#admin-status", "");
    try {
      const data = await request("/api/admin/responses");
      responses = data.responses || [];
      $("#admin-updated").textContent = `${responses.length} submitted response${responses.length === 1 ? "" : "s"} · refreshed ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      renderAdmin();
    } catch (error) {
      setStatus("#admin-status", error.message);
    }
  }

  async function setupRepository() {
    const button = $("#setup-repository");
    button.disabled = true;
    setStatus("#admin-status", "Creating the GitHub repository and encrypted response archive…");
    try {
      const data = await request("/api/admin/setup-repository", { method: "POST" });
      setStatus(
        "#admin-status",
        `Repository ready: ${data.repositoryUrl} · Pages: ${data.pagesUrl}`,
        true,
      );
      await loadAdmin();
    } catch (error) {
      setStatus("#admin-status", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function downloadCsv() {
    const headers = ["Resident", "Level", "Submitted At", "Rank", "Rotation", "Block", "Week Start", "Week End", "Option", "Flexible", "Comment"];
    const rows = [headers];
    filteredResponses().forEach((response) => {
      (response.choices || []).forEach((choice) => rows.push([
        response.residentName,
        response.trainingLevel,
        response.submittedAt,
        choice.rank,
        choice.rotation,
        choice.block,
        choice.weekStart,
        choice.weekEnd,
        choice.label,
        response.flexible ? "Yes" : "No",
        response.comment || "",
      ]));
    });
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `vacation-preferences-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  $("#toggle-password").addEventListener("click", () => {
    const input = $("#password");
    input.type = input.type === "password" ? "text" : "password";
    $("#toggle-password").textContent = input.type === "password" ? "Show" : "Hide";
  });

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("#login-status", "Checking password…");
    try {
      const data = await request("/api/login", {
        method: "POST",
        body: JSON.stringify({ password: $("#password").value }),
      });
      rememberSession(data);
      if (role === "admin") {
        showView("admin-view");
        await loadAdmin();
      } else {
        populateNames();
        showView("resident-view");
      }
    } catch (error) {
      setStatus("#login-status", error.message);
    }
  });

  $("#resident-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#resident-name").value.trim();
    if (!residentNames.includes(name)) {
      setStatus("#resident-status", "Please select your exact name from the list.");
      return;
    }
    setStatus("#resident-status", "Loading your schedule…");
    try {
      await loadResident(name);
      setStatus("#resident-status", "");
    } catch (error) {
      setStatus("#resident-status", error.message);
    }
  });

  $("#survey-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const choices = choiceRows();
    if (choices.length < Math.min(3, currentResident.options.length)) {
      setStatus("#survey-status", "Please complete your required rankings.");
      return;
    }
    setStatus("#survey-status", "Saving your preferences…");
    try {
      await request("/api/responses", {
        method: "POST",
        body: JSON.stringify({
          residentName: currentResident.name,
          choices: choices.map(({ rank, optionId }) => ({ rank, optionId })),
          comment: $("#comments").value.trim(),
          flexible: $("#flexible").checked,
        }),
      });
      $("#success-copy").textContent = `${currentResident.name}, your ranked preferences were written to the scheduling repository. You may return and update them before the survey closes.`;
      showView("success-view");
    } catch (error) {
      setStatus("#survey-status", error.message);
    }
  });

  $("#change-resident").addEventListener("click", () => showView("resident-view"));
  $("#edit-response").addEventListener("click", () => loadResident(currentResident.name));
  document.querySelectorAll(".logout-button").forEach((button) => button.addEventListener("click", logout));
  $("#setup-repository").addEventListener("click", setupRepository);
  $("#refresh-admin").addEventListener("click", loadAdmin);
  $("#download-csv").addEventListener("click", downloadCsv);
  $("#level-filter").addEventListener("change", renderAdmin);
  $("#response-search").addEventListener("input", renderAdmin);

  if (token && role === "admin") {
    showView("admin-view");
    loadAdmin();
  } else if (token && role === "respondent") {
    request("/api/session").then((data) => {
      residentNames = data.residents || [];
      populateNames();
      showView("resident-view");
    }).catch(logout);
  } else {
    showView("login-view");
  }
})();
