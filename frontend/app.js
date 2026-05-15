const form = document.getElementById("gen-form");
const promptEl = document.getElementById("prompt");
const promptCount = document.getElementById("prompt-count");
const durationEl = document.getElementById("duration");
const durationVal = document.getElementById("duration-val");
const submitBtn = document.getElementById("submit-btn");

const resultCard = document.getElementById("result");
const statusLine = document.getElementById("status-line");
const taskMeta = document.getElementById("task-meta");
const videoEl = document.getElementById("video");
const videoActions = document.getElementById("video-actions");
const downloadLink = document.getElementById("download-link");
const errorEl = document.getElementById("error");

const historyCard = document.getElementById("history");
const historyList = document.getElementById("history-list");

const HISTORY_KEY = "kie_history_v1";
const POLL_INTERVAL_MS = 3000;
let pollTimer = null;

// ---------------- Prompt counter ----------------
promptEl.addEventListener("input", () => {
  promptCount.textContent = promptEl.value.length;
});

durationEl.addEventListener("input", () => {
  durationVal.textContent = durationEl.value;
});

// ---------------- Upload helper ----------------
async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload falló (HTTP ${res.status})`);
  }
  return res.json(); // { url, fileName, size, mimeType }
}

function bindDropzone(zone, onFiles, { multiple } = {}) {
  const accept = zone.closest("[data-accept]")?.dataset.accept || "*/*";

  const pickBtn = zone.querySelector(".pick");
  if (pickBtn) {
    pickBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.multiple = !!multiple;
      input.addEventListener("change", () => {
        if (input.files?.length) onFiles(Array.from(input.files));
      });
      input.click();
    });
  }

  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove("dragover");
    })
  );

  zone.addEventListener("drop", (e) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) onFiles(multiple ? files : [files[0]]);
  });
}

// ---------------- Single-frame zones (first/last frame) ----------------
document.querySelectorAll(".single-frame").forEach((wrap) => {
  const inputId = wrap.dataset.target;
  const input = document.getElementById(inputId);
  const zone = wrap.querySelector(".dropzone");

  bindDropzone(
    zone,
    async (files) => {
      const file = files[0];
      const originalText = zone.innerHTML;
      zone.classList.add("uploading");
      zone.textContent = `Subiendo ${file.name}…`;
      try {
        const { url } = await uploadFile(file);
        input.value = url;
        zone.innerHTML = `✓ ${file.name}`;
      } catch (err) {
        zone.innerHTML = originalText;
        showError(err.message);
      } finally {
        zone.classList.remove("uploading");
      }
    },
    { multiple: false }
  );
});

// ---------------- Reference URL lists ----------------
function addRefRow(items, { url = "", file = null } = {}) {
  const row = document.createElement("div");
  row.className = "ref-item";
  row.innerHTML = `
    <input type="url" placeholder="https://…" value="${escapeAttr(url)}" />
    <button type="button" class="remove">×</button>
  `;
  row.querySelector(".remove").addEventListener("click", () => row.remove());
  items.appendChild(row);
  return row;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

document.querySelectorAll(".ref-list").forEach((list) => {
  const max = parseInt(list.dataset.max, 10);
  const items = list.querySelector(".ref-items");
  const addBtn = list.querySelector(".add-ref");
  const zone = list.querySelector(".dropzone");

  addBtn.addEventListener("click", () => {
    if (items.children.length >= max) return;
    addRefRow(items);
  });

  if (zone) {
    bindDropzone(
      zone,
      async (files) => {
        const remaining = max - items.children.length;
        if (remaining <= 0) {
          showError(`Máximo ${max} archivos en esta sección.`);
          return;
        }
        const toUpload = files.slice(0, remaining);
        if (files.length > remaining) {
          showError(
            `Solo se aceptaron ${remaining} de ${files.length} archivos (máx ${max}).`
          );
        }

        const originalText = zone.innerHTML;

        for (const file of toUpload) {
          const row = addRefRow(items);
          const input = row.querySelector("input");
          input.disabled = true;
          input.placeholder = `Subiendo ${file.name}…`;
          row.classList.add("uploading");
          zone.classList.add("uploading");
          zone.textContent = `Subiendo ${file.name}…`;
          try {
            const { url } = await uploadFile(file);
            input.value = url;
            input.disabled = false;
            input.placeholder = "https://…";
            row.classList.remove("uploading");
          } catch (err) {
            row.remove();
            showError(err.message);
          }
        }

        zone.classList.remove("uploading");
        zone.innerHTML = originalText;
      },
      { multiple: true }
    );
  }
});

// ---------------- Submit ----------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const payload = collectPayload();
  if (!payload) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando…";

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `HTTP ${res.status}`);
    }

    const { taskId } = await res.json();
    showResultCard(taskId);
    startPolling(taskId, payload.prompt);
  } catch (err) {
    showError(err.message || "Error al crear la tarea.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Generar video";
  }
});

function collectPayload() {
  const refs = (name) => {
    const list = document.querySelector(`.ref-list[data-name="${name}"]`);
    return Array.from(list.querySelectorAll("input"))
      .map((i) => i.value.trim())
      .filter(Boolean);
  };

  const firstFrame = document.getElementById("first_frame_url").value.trim();
  const lastFrame = document.getElementById("last_frame_url").value.trim();
  const imgs = refs("reference_image_urls");
  const vids = refs("reference_video_urls");
  const auds = refs("reference_audio_urls");

  const hasFrame = firstFrame || lastFrame;
  const hasRefs = imgs.length || vids.length || auds.length;
  if (hasFrame && hasRefs) {
    showError(
      "No puedes combinar first/last frame con reference_*_urls. Elige una sola modalidad."
    );
    return null;
  }

  const payload = {
    prompt: promptEl.value.trim(),
    resolution: document.getElementById("resolution").value,
    aspect_ratio: document.getElementById("aspect_ratio").value,
    duration: parseInt(durationEl.value, 10),
    generate_audio: document.getElementById("generate_audio").checked,
    nsfw_checker: document.getElementById("nsfw_checker").checked,
    web_search: document.getElementById("web_search").checked,
  };
  if (firstFrame) payload.first_frame_url = firstFrame;
  if (lastFrame) payload.last_frame_url = lastFrame;
  if (imgs.length) payload.reference_image_urls = imgs;
  if (vids.length) payload.reference_video_urls = vids;
  if (auds.length) payload.reference_audio_urls = auds;
  return payload;
}

// ---------------- Result + Polling ----------------
function showResultCard(taskId) {
  resultCard.classList.remove("hidden");
  videoEl.classList.add("hidden");
  videoActions.classList.add("hidden");
  errorEl.classList.add("hidden");
  taskMeta.textContent = `taskId: ${taskId}`;
  statusLine.innerHTML = `<span class="spinner"></span> Enviado, esperando…`;
}

function startPolling(taskId, prompt) {
  if (pollTimer) clearInterval(pollTimer);
  pollOnce(taskId, prompt);
  pollTimer = setInterval(() => pollOnce(taskId, prompt), POLL_INTERVAL_MS);
}

async function pollOnce(taskId, prompt) {
  try {
    const res = await fetch(`/api/task/${encodeURIComponent(taskId)}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    renderStatus(data);

    if (data.state === "success") {
      clearInterval(pollTimer);
      pollTimer = null;
      saveToHistory({
        taskId: data.taskId,
        prompt,
        videoUrl: data.videoUrl,
        createdAt: Date.now(),
      });
      renderHistory();
    } else if (data.state === "fail") {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  } catch (err) {
    clearInterval(pollTimer);
    pollTimer = null;
    showError(err.message || "Error al consultar el estado.");
  }
}

function renderStatus(data) {
  const labelByState = {
    waiting: "En cola…",
    queuing: "En cola…",
    generating: "Generando…",
    success: "✓ Listo",
    fail: "✗ Falló",
    unknown: "Estado desconocido",
  };
  const cls =
    data.state === "success"
      ? "state-success"
      : data.state === "fail"
      ? "state-fail"
      : "";

  const inProgress = ["waiting", "queuing", "generating"].includes(data.state);
  statusLine.innerHTML = `
    ${inProgress ? '<span class="spinner"></span>' : ""}
    <span class="${cls}">${labelByState[data.state] || data.state}</span>
  `;

  const metaParts = [`taskId: ${data.taskId}`];
  if (typeof data.creditsConsumed === "number")
    metaParts.push(`créditos: ${data.creditsConsumed}`);
  if (typeof data.costTimeMs === "number")
    metaParts.push(`tiempo: ${(data.costTimeMs / 1000).toFixed(1)}s`);
  taskMeta.textContent = metaParts.join(" · ");

  if (data.state === "success" && data.videoUrl) {
    videoEl.src = data.videoUrl;
    videoEl.classList.remove("hidden");
    downloadLink.href = data.videoUrl;
    videoActions.classList.remove("hidden");
  }

  if (data.state === "fail") {
    showError(
      data.failMsg || data.failCode || "La generación falló sin detalles."
    );
  }
}

// ---------------- History ----------------
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  const list = loadHistory();
  const filtered = list.filter((e) => e.taskId !== entry.taskId);
  filtered.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, 10)));
}

function renderHistory() {
  const list = loadHistory();
  if (list.length === 0) {
    historyCard.classList.add("hidden");
    return;
  }
  historyCard.classList.remove("hidden");
  historyList.innerHTML = "";
  list.forEach((e) => {
    const li = document.createElement("li");
    const promptShort =
      e.prompt && e.prompt.length > 60 ? e.prompt.slice(0, 60) + "…" : e.prompt;
    li.innerHTML = `
      <div>
        <div>${escapeHtml(promptShort || "(sin prompt)")}</div>
        <a href="${e.videoUrl}" target="_blank" rel="noopener">${e.videoUrl}</a>
      </div>
      <span class="ts">${new Date(e.createdAt).toLocaleString()}</span>
    `;
    historyList.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------- Errors ----------------
function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
  resultCard.classList.remove("hidden");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

// Initial render
renderHistory();
