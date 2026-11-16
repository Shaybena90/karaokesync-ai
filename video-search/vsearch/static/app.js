"use strict";
// video-search UI. All coordinates of the region are stored normalized (0..1) relative to the
// video IMAGE (not the player element, not the letterbox bars).

const $ = (s) => document.querySelector(s);
const api = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const isJson = (r.headers.get("content-type") || "").includes("json");
  const body = isJson ? await r.json() : await r.text();
  if (!r.ok) throw new Error((body && body.detail) || body || r.statusText);
  return body;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtTime(t) {
  if (t == null || !isFinite(t)) return "—";
  const sign = t < 0 ? "-" : ""; t = Math.abs(t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}
function parseTime(str) {
  str = String(str).trim(); if (!str) return null;
  const parts = str.split(":").map(Number);
  if (parts.some((x) => !isFinite(x))) return NaN;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

const S = {
  status: null, source: null, region: null, tool: null, draft: null, drag: null,
  job: null, results: null, cat: "match", selected: null, poll: null, fallback: false, fbTime: 0,
};

const video = $("#video"), canvas = $("#overlay"), ctx = canvas.getContext("2d"), fb = $("#fallback");

// ---------- engines ----------
async function loadStatus() {
  S.status = await api("/api/status");
  const e = S.status.engines;
  const chip = (label, x) => `<span class="${x.available ? "on" : "off"}" title="${esc(x.reason || x.version || "")}">${label}: ${x.available ? "זמין" : "לא זמין"}</span>`;
  $("#engines").innerHTML = chip("זיהוי רכבים", e.detector) + chip("צבע (היוריסטיקה)", e.color) +
    chip("יצרן", e.make_classifier) + chip("לוחיות", e.plates) + chip("ריבוי מצלמות", e.multi_camera) +
    `<span title="${esc(S.status.note)}">עיבוד מקומי</span>`;
  $("#rule").textContent = "כלל האזור: " + S.status.region_rule.text;
  $("#f-types").innerHTML = Object.entries(S.status.types).map(([k, v]) => `<label><input type="checkbox" value="${k}"> ${esc(v)}</label>`).join("");
  $("#f-colors").innerHTML = Object.entries(S.status.colors).map(([k, v]) => `<label><input type="checkbox" value="${k}"> ${esc(v)}</label>`).join("");
  $("#makes-list").innerHTML = S.status.makes.map((m) => `<option value="${esc(m)}">`).join("");
  if (!e.detector.available) {
    $("#run").disabled = true;
    $("#run").title = "מודל הזיהוי אינו זמין: " + (e.detector.reason || "");
  }
}

// ---------- sources ----------
async function loadSources(selectId) {
  const list = await api("/api/sources");
  $("#src-list").innerHTML = `<option value="">סרטונים שנוספו…</option>` +
    list.map((s) => `<option value="${s.id}">${esc(s.path.split(/[\\/]/).pop())} — ${fmtTime(s.probe.duration)}</option>`).join("");
  if (selectId) { $("#src-list").value = selectId; }
}
function showSourceInfo(src) {
  const p = src.probe;
  const fps = p.avg_frame_rate ? p.avg_frame_rate.toFixed(3) : "?";
  $("#src-info").innerHTML =
    `<div>משך: <b class="mono" dir="ltr">${fmtTime(p.duration)}</b> · מידות: <b dir="ltr">${p.width}×${p.height}</b>` +
    ` · קידוד: ${esc(p.codec)} (${esc(p.container)}) · קצב ממוצע: <span dir="ltr">${fps}</span> fps` +
    `${p.variable_frame_rate ? " (משתנה)" : ""} · פוענחו ${p.decoded_sample_frames} פריימים לבדיקה</div>` +
    `<div dir="ltr" class="mono">SHA-256: ${esc(src.sha256)}</div>` +
    `<div class="mono" dir="ltr">${esc(src.path)}</div>` +
    (p.warnings || []).map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join("");
}
async function selectSource(src) {
  S.source = src; S.region = null; S.job = null; S.results = null; S.selected = null;
  showSourceInfo(src);
  $("#stage-empty").hidden = true;
  S.fallback = false; fb.hidden = true; video.hidden = false;
  video.src = `/api/sources/${src.id}/video`;
  $("#seek").max = src.probe.duration || 0;
  $("#r-end").value = fmtTime(src.probe.duration);
  renderResults(); draw();
  await loadPastJobs();
}
video.addEventListener("error", () => {
  if (!S.source) return;
  // Browser cannot play this codec: fall back to frames decoded by the local service.
  S.fallback = true; video.hidden = true; fb.hidden = false;
  $("#src-info").insertAdjacentHTML("beforeend", `<div class="warn">⚠ הדפדפן אינו מנגן את הקידוד הזה. מוצגים פריימים שפוענחו בשירות המקומי (ללא ניגון רציף).</div>`);
  seekTo(0);
});
fb.addEventListener("load", draw);

$("#src-add").onclick = async () => {
  const path = $("#src-path").value.trim(); if (!path) return;
  $("#src-info").innerHTML = "בודק את הקובץ…";
  try { const src = await api("/api/sources", { method: "POST", body: JSON.stringify({ path }) }); await loadSources(src.id); selectSource(src); }
  catch (e) { $("#src-info").innerHTML = `<span class="err">${esc(e.message)}</span>`; }
};
$("#src-upload").onchange = async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  $("#src-info").innerHTML = `מעלה ובודק ${esc(f.name)}…`;
  const fd = new FormData(); fd.append("file", f);
  try {
    const r = await fetch("/api/sources/upload", { method: "POST", body: fd });
    const b = await r.json(); if (!r.ok) throw new Error(b.detail || r.statusText);
    await loadSources(b.id); selectSource(b);
  } catch (e) { $("#src-info").innerHTML = `<span class="err">${esc(e.message)}</span>`; }
};
$("#src-list").onchange = async (ev) => { if (ev.target.value) selectSource(await api(`/api/sources/${ev.target.value}`)); };

// ---------- player ----------
const curTime = () => (S.fallback ? S.fbTime : video.currentTime);
const duration = () => S.source?.probe.duration || video.duration || 0;
const frameDur = () => 1 / (S.source?.probe.avg_frame_rate || 25);
function seekTo(t) {
  t = Math.max(0, Math.min(duration() || 0, t));
  if (S.fallback) { S.fbTime = t; fb.src = `/api/sources/${S.source.id}/frame?t=${t.toFixed(4)}`; updateClock(); }
  else video.currentTime = t;
}
function updateClock() { $("#clock").textContent = fmtTime(curTime()); $("#seek").value = curTime(); }
$("#play").onclick = () => { if (S.fallback || !S.source) return; video.paused ? video.play() : video.pause(); };
video.addEventListener("play", () => ($("#play").textContent = "⏸"));
video.addEventListener("pause", () => ($("#play").textContent = "▶"));
video.addEventListener("timeupdate", updateClock);
video.addEventListener("seeked", () => { updateClock(); draw(); });
video.addEventListener("loadedmetadata", () => { $("#seek").max = duration(); draw(); });
$("#seek").oninput = (e) => seekTo(parseFloat(e.target.value));
$("#step-back").onclick = () => { video.pause(); seekTo(curTime() - frameDur()); };
$("#step-fwd").onclick = () => { video.pause(); seekTo(curTime() + frameDur()); };
(function loop() { if (!video.paused) draw(); requestAnimationFrame(loop); })();
new ResizeObserver(draw).observe($("#stage"));

// ---------- coordinate mapping ----------
function imageSize() {
  if (!S.fallback && video.videoWidth) return [video.videoWidth, video.videoHeight];
  if (S.source) return [S.source.probe.width, S.source.probe.height];
  return [16, 9];
}
// The rectangle (in CSS px of the stage) where the image is actually shown, excluding letterbox bars.
function contentRect() {
  const st = $("#stage"); const W = st.clientWidth, H = st.clientHeight;
  const [vw, vh] = imageSize(); const s = Math.min(W / vw, H / vh);
  const w = vw * s, h = vh * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
const toNorm = (px, py) => { const r = contentRect(); return [Math.min(1, Math.max(0, (px - r.x) / r.w)), Math.min(1, Math.max(0, (py - r.y) / r.h))]; };
const toPx = ([nx, ny]) => { const r = contentRect(); return [r.x + nx * r.w, r.y + ny * r.h]; };
function evPos(e) { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }

// ---------- drawing ----------
function draw() {
  const st = $("#stage"), dpr = window.devicePixelRatio || 1;
  const W = st.clientWidth, H = st.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  if (!S.source) return;
  const pts = S.draft ? S.draft.points : S.region?.points;
  if (pts && pts.length) {
    ctx.beginPath(); pts.map(toPx).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (!S.draft || S.draft.kind === "rect") ctx.closePath();
    ctx.fillStyle = "rgba(255,179,0,.15)"; if (!S.draft || S.draft.kind === "rect") ctx.fill();
    ctx.strokeStyle = "#ffb300"; ctx.lineWidth = 2; ctx.stroke();
    if (S.tool === "edit" || S.draft) pts.map(toPx).forEach(([x, y]) => { ctx.fillStyle = "#ffb300"; ctx.fillRect(x - 4, y - 4, 8, 8); });
    if (S.draft?.kind === "poly" && S.draft.hover) { const [x, y] = toPx(pts[pts.length - 1]); const [hx, hy] = toPx(S.draft.hover); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]); }
  }
  if ($("#show-boxes").checked && S.results) drawBoxes();
}
function drawBoxes() {
  const t = curTime(), tol = 0.3;
  const items = [...S.results.results.match.map((x) => [x, "#1fbf4b"]), ...S.results.results.candidate.map((x) => [x, "#ff9800"])];
  for (const [tr, color] of items) {
    if (t < tr.t_first - tol || t > tr.t_last + tol) continue;
    let best = null, bd = 1e9;
    for (const o of tr.observations) { const d = Math.abs(o.t - t); if (d < bd) { bd = d; best = o; } }
    if (!best || bd > tol) continue;
    const [x0, y0] = toPx([best.box[0], best.box[1]]), [x1, y1] = toPx([best.box[2], best.box[3]]);
    ctx.strokeStyle = color; ctx.lineWidth = tr.id === S.selected ? 3 : 2; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = color; ctx.font = "12px system-ui"; ctx.fillText(`#${tr.track_no}`, x0 + 2, y0 - 3);
  }
}

// ---------- region tools ----------
const HELP = {
  rect: "גוררים מלבן על התמונה.",
  poly: "לוחצים כדי להוסיף נקודות. לחיצה כפולה או לחיצה ליד הנקודה הראשונה סוגרת את המצולע. Esc מבטל.",
  edit: "גוררים נקודה כדי להזיז אותה. לחיצה ימנית על נקודה מוחקת אותה (מינימום 3).",
};
document.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => setTool(S.tool === b.dataset.tool ? null : b.dataset.tool)));
function setTool(t) {
  S.tool = t; S.draft = null;
  document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
  canvas.style.pointerEvents = t ? "auto" : "none"; canvas.style.cursor = t ? "crosshair" : "default";
  $("#tool-help").textContent = t ? HELP[t] : ""; if (t) video.pause(); draw();
}
canvas.style.pointerEvents = "none";
$("#region-clear").onclick = () => { S.region = null; S.draft = null; draw(); };
function nearestVertex(px, py, pts, r = 10) {
  let bi = -1, bd = r;
  pts.forEach((p, i) => { const [x, y] = toPx(p); const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; bi = i; } });
  return bi;
}
canvas.addEventListener("pointerdown", (e) => {
  if (!S.source || !S.tool) return;
  const [px, py] = evPos(e), n = toNorm(px, py);
  canvas.setPointerCapture(e.pointerId);
  if (S.tool === "rect") S.draft = { kind: "rect", start: n, points: [n, n, n, n] };
  else if (S.tool === "poly") {
    if (!S.draft) S.draft = { kind: "poly", points: [n] };
    else if (S.draft.points.length >= 3 && nearestVertex(px, py, [S.draft.points[0]]) === 0) finishPoly();
    else S.draft.points.push(n);
  } else if (S.tool === "edit" && S.region) {
    const i = nearestVertex(px, py, S.region.points);
    if (e.button === 2 && i >= 0 && S.region.points.length > 3) { S.region.points.splice(i, 1); }
    else if (i >= 0) S.drag = i;
  }
  draw();
});
canvas.addEventListener("pointermove", (e) => {
  const [px, py] = evPos(e), n = toNorm(px, py);
  if (S.draft?.kind === "rect" && e.buttons) { const [x0, y0] = S.draft.start; S.draft.points = [[x0, y0], [n[0], y0], n, [x0, n[1]]]; draw(); }
  else if (S.draft?.kind === "poly") { S.draft.hover = n; draw(); }
  else if (S.drag != null && S.region) { S.region.points[S.drag] = n; draw(); }
});
canvas.addEventListener("pointerup", () => {
  if (S.draft?.kind === "rect") {
    const [[x0, y0], , [x1, y1]] = S.draft.points;
    if (Math.abs(x1 - x0) > 0.005 && Math.abs(y1 - y0) > 0.005)
      S.region = { kind: "rect", points: [[Math.min(x0, x1), Math.min(y0, y1)], [Math.max(x0, x1), Math.min(y0, y1)], [Math.max(x0, x1), Math.max(y0, y1)], [Math.min(x0, x1), Math.max(y0, y1)]] };
    S.draft = null; setTool("edit");
  }
  S.drag = null; draw();
});
canvas.addEventListener("dblclick", () => { if (S.draft?.kind === "poly") { S.draft.points.pop(); finishPoly(); } });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
function finishPoly() { if (S.draft.points.length >= 3) S.region = { kind: "polygon", points: S.draft.points.slice() }; S.draft = null; setTool("edit"); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.draft) { S.draft = null; draw(); } });

// ---------- query ----------
function setFields(f) {
  document.querySelectorAll("#f-types input").forEach((i) => (i.checked = f.types.includes(i.value)));
  document.querySelectorAll("#f-colors input").forEach((i) => (i.checked = f.colors.includes(i.value)));
  $("#f-makes").value = f.makes.join(", ");
}
function getFields() {
  return {
    text: $("#q").value,
    types: [...document.querySelectorAll("#f-types input:checked")].map((i) => i.value),
    colors: [...document.querySelectorAll("#f-colors input:checked")].map((i) => i.value),
    makes: $("#f-makes").value.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
  };
}
$("#q-parse").onclick = async () => {
  const r = await api("/api/query/parse", { method: "POST", body: JSON.stringify({ text: $("#q").value }) });
  setFields(r);
  $("#q-notes").innerHTML = r.notes.map((n) => `<li>${esc(n)}</li>`).join("") +
    `<li>פירוש: סוג: ${esc(r.labels.types.join(", ") || "—")}; צבע: ${esc(r.labels.colors.join(", ") || "—")}; יצרן: ${esc(r.labels.makes.join(", ") || "—")}. אפשר לתקן לפני החיפוש.</li>`;
};
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#q-parse").click(); });

// ---------- range ----------
$("#whole").onchange = (e) => ["#r-start", "#r-end", "#r-start-now", "#r-end-now"].forEach((s) => ($(s).disabled = e.target.checked));
$("#r-start-now").onclick = () => ($("#r-start").value = fmtTime(curTime()));
$("#r-end-now").onclick = () => ($("#r-end").value = fmtTime(curTime()));

// ---------- jobs ----------
$("#run").onclick = async () => {
  if (!S.source) return alert("יש לבחור סרטון");
  if (!S.region) return alert("יש לסמן אזור");
  const fields = getFields();
  if (!fields.types.length) return alert("יש לבחור לפחות סוג אחד (אפשר בעזרת ״פירוש הבקשה״)");
  let start = 0, end = null;
  if (!$("#whole").checked) {
    start = parseTime($("#r-start").value); end = parseTime($("#r-end").value);
    if (!isFinite(start) || (end != null && !isFinite(end))) return alert("זמן לא תקין. פורמט: שעות:דקות:שניות");
  }
  const rate = $("#rate").value ? parseFloat($("#rate").value) : null;
  try {
    S.job = await api("/api/jobs", { method: "POST", body: JSON.stringify({ source_id: S.source.id, region: S.region, fields, start, end, rate }) });
    S.results = null; renderResults(); pollJob();
  } catch (e) { alert(e.message); }
};
$("#cancel").onclick = async () => { if (S.job) S.job = await api(`/api/jobs/${S.job.id}/cancel`, { method: "POST" }); };

const STATUS_HE = { queued: "ממתין", running: "בעיבוד", completed: "הושלם", cancelled: "בוטל", failed: "נכשל", interrupted: "נקטע" };
async function pollJob() {
  clearTimeout(S.poll);
  if (!S.job) return;
  const j = (S.job = await api(`/api/jobs/${S.job.id}`));
  const a = j.params.start, b = j.params.end ?? duration();
  const done = (j.progress_time ?? a) - a, total = Math.max(1e-6, b - a);
  $("#job").hidden = false;
  $("#job-bar").style.width = `${Math.min(100, (100 * done) / total)}%`;
  const running = j.status === "running" || j.status === "queued";
  $("#cancel").hidden = !running; $("#run").disabled = running || !S.status.engines.detector.available;
  $("#job-text").innerHTML = `מצב: <b>${STATUS_HE[j.status] || j.status}</b> · עובד: <span dir="ltr" class="mono">${fmtTime(j.progress_time ?? a)}</span> מתוך הטווח <span dir="ltr" class="mono">${fmtTime(a)}–${fmtTime(b)}</span>` +
    (j.progress ? ` · פוענחו ${j.progress.frames_decoded} פריימים, נותחו ${j.progress.frames_analysed}` : "") +
    (j.error ? `<div class="err">${esc(j.error)}</div>` : "");
  renderCoverage(j);
  if (running) S.poll = setTimeout(pollJob, 700);
  else if (j.status === "completed" || j.status === "cancelled") { await loadResults(); loadPastJobs(); }
}
function renderCoverage(j) {
  const c = j.coverage; if (!c) { $("#coverage").innerHTML = ""; return; }
  const lines = [];
  lines.push(`טווח שעובד בפועל: <span dir="ltr" class="mono">${fmtTime(c.processed_start)}–${fmtTime(c.processed_end)}</span> (התבקש <span dir="ltr" class="mono">${fmtTime(c.requested_start)}–${fmtTime(c.requested_end)}</span>)`);
  if (c.cancelled) lines.push(`<span class="warn">⚠ החיפוש בוטל — אין מידע על מה שאחרי <bdi dir="ltr">${fmtTime(c.processed_end)}</bdi>.</span>`);
  if (c.sampled) lines.push(`<span class="warn">סריקה בדגימה: כ־${c.analysis_rate} פריימים לשנייה מתוך ${c.frames_decoded} שפוענחו (נותחו ${c.frames_analysed}). הפער הגדול בין פריימים מנותחים: ${c.max_gap_between_analysed_frames.toFixed(3)} שנ׳.</span>`);
  else lines.push(`נותחו כל ${c.frames_analysed} הפריימים שפוענחו.`);
  if (c.decode.error_count) lines.push(`<span class="warn">⚠ ${c.decode.error_count} שגיאות פענוח (פריימים שלא נותחו): <bdi dir="ltr">${c.decode.errors.slice(0, 5).map((e) => fmtTime(e.time)).join(", ")}</bdi>${c.decode.error_count > 5 ? "…" : ""}</span>`);
  const endGap = (c.requested_end ?? 0) - (c.processed_end ?? 0);
  if (!c.cancelled && endGap > 1) lines.push(`<span class="warn">⚠ הפריים האחרון שפוענח הוא ${fmtTime(c.processed_end)} — ${endGap.toFixed(1)} שנ׳ לפני סוף הטווח.</span>`);
  lines.push(`גרסאות: ${esc(j.models.detector.version)} · צבע: ${esc(j.models.color.version)} · יצרן: ${esc(j.models.make_classifier.available ? j.models.make_classifier.version : "לא מחובר")}`);
  $("#coverage").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}
async function loadPastJobs() {
  if (!S.source) return;
  const jobs = await api(`/api/jobs?source_id=${S.source.id}`);
  $("#past-jobs").innerHTML = jobs.length ? `<select id="job-select"><option value="">חיפושים קודמים בסרטון זה…</option>${jobs.map((j) =>
    `<option value="${j.id}" ${S.job?.id === j.id ? "selected" : ""}>${new Date(j.created_at * 1000).toLocaleString("he-IL")} — ${STATUS_HE[j.status] || j.status}</option>`).join("")}</select>` : "";
  const sel = $("#job-select");
  if (sel) sel.onchange = async () => {
    if (!sel.value) return;
    S.job = await api(`/api/jobs/${sel.value}`); S.region = S.job.region; setFields(S.job.fields); $("#q").value = S.job.fields.text || ""; pollJob(); draw();
  };
}

// ---------- results ----------
async function loadResults(fields) {
  S.results = fields ? await api(`/api/jobs/${S.job.id}/results`, { method: "POST", body: JSON.stringify(fields) }) : await api(`/api/jobs/${S.job.id}/results`);
  $("#exp-csv").href = `/api/jobs/${S.job.id}/export.csv`; $("#exp-json").href = `/api/jobs/${S.job.id}/export.json`;
  $("#exports").hidden = false; renderResults(); draw();
}
$("#reapply").onclick = () => S.job && loadResults(getFields());
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { S.cat = b.dataset.cat; document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b)); renderResults(); }));

const CHECK_HE = { match: "תואם", uncertain: "לא ודאי", mismatch: "לא תואם" };
const FIELD_HE = { type: "סוג", color: "צבע", make: "יצרן" };
function renderResults() {
  const el = $("#results");
  ["match", "candidate", "excluded"].forEach((k) => ($(`#n-${k}`).textContent = S.results ? S.results.counts[k] : 0));
  if (!S.results) { el.innerHTML = ""; $("#results-note").textContent = ""; $("#exports").hidden = true; return; }
  const j = S.results.job, list = S.results.results[S.cat];
  const notes = [];
  if (j.status === "cancelled") notes.push("החיפוש בוטל: התוצאות חלקיות.");
  if (!list.length) notes.push(S.cat === "match" ? "לא נמצאו התאמות בטווח שעובד. אין בכך הוכחה שלא עבר רכב כזה — ראו את פרטי הכיסוי ובדקו את המועמדים." : "אין פריטים ברשימה זו.");
  if (S.cat === "candidate") notes.push("מועמדים: לא נמצאה סתירה לתנאים, אך חסר פרט אחד או יותר (למשל יצרן שלא נבדק או צבע שלא הוכרע).");
  $("#results-note").textContent = notes.join(" ");
  const names = S.status.types, colors = S.status.colors;
  el.innerHTML = list.map((t) => {
    const ev = t.evaluation, ctxImg = t.images.context ? `/api/thumbs/${t.images.context.file}` : null;
    const checks = Object.entries(ev.checks).map(([k, c]) => {
      let v = c.value ? (k === "type" ? names[c.value] : k === "color" ? colors[c.value] : c.value) : "";
      if (c.values) v += ` (${Object.entries(c.values).map(([a, n]) => `${k === "color" ? colors[a] || a : a}: ${n}`).join(", ")})`;
      return `<dt>${FIELD_HE[k]}</dt><dd><span class="st-${c.status}">${CHECK_HE[c.status]}</span> ${esc(v)}${c.note ? ` — ${esc(c.note)}` : ""}</dd>`;
    }).join("");
    const color = t.color?.frames ? `<dt>צבע לפי פריימים</dt><dd>${Object.entries(t.color.values || {}).map(([a, n]) => `${esc(colors[a] || a)} ×${n}`).join(", ") || "לא הוכרע"} מתוך ${t.color.frames}${t.color.low_light_frames ? ` · ${t.color.low_light_frames} בתאורה חלשה` : ""}</dd>` : "";
    return `<article class="res ${t.id === S.selected ? "sel" : ""}" data-id="${t.id}">
      <div>${ctxImg ? `<img class="ctx" src="${ctxImg}" alt="פריים הקשר" data-full="${ctxImg}">` : ""}
        <div class="crops">${t.images.crops.map((c) => `<img src="/api/thumbs/${c.file}" data-full="/api/thumbs/${c.file}" title="${fmtTime(c.t)}" alt="">`).join("")}</div></div>
      <div><div class="t">#${t.track_no} · ${esc(names[t.obj_type] || t.obj_type)}</div>
        <div class="mono" dir="ltr">${fmtTime(t.t_in_first)} – ${fmtTime(t.t_in_last)}</div>
        <div class="hint">באזור לפי זמן המדיה מתחילת הקובץ · מסלול מלא <bdi dir="ltr">${fmtTime(t.t_first)}–${fmtTime(t.t_last)}</bdi> · ${t.n_obs_in_region}/${t.n_obs} תצפיות באזור</div>
        <dl>${checks}${color}<dt>ציון זיהוי מרבי</dt><dd>${t.det_score_max.toFixed(2)} <span class="hint">(ציון מודל, לא הסתברות)</span></dd></dl></div>
      <div class="acts">
        <button data-act="jump">מעבר לרגע</button>
        <button data-act="approved" class="${t.decision === "approved" ? "active" : ""}">✓ התאמה</button>
        <button data-act="rejected" class="${t.decision === "rejected" ? "active" : ""}">✗ דחייה</button>
        <button data-act="note">הערה</button>
        <button data-act="clip">ייצוא קטע (±3 שנ׳)</button>
      </div>
      <div class="decision">${t.decision ? `בדיקה ידנית: ${t.decision === "approved" ? "אושר" : "נדחה"}` : ""}${t.note ? ` · הערה: ${esc(t.note)}` : ""}</div>
    </article>`;
  }).join("");
}
$("#results").addEventListener("click", async (e) => {
  const img = e.target.closest("img[data-full]");
  if (img) { $("#lightbox-img").src = img.dataset.full; $("#lightbox").showModal(); return; }
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const card = b.closest(".res"), id = card.dataset.id;
  const all = Object.values(S.results.results).flat(), t = all.find((x) => x.id === id);
  const act = b.dataset.act;
  if (act === "jump") { S.selected = id; video.pause(); seekTo(t.images.context?.t ?? t.t_in_first); renderResults(); return; }
  if (act === "clip") {
    b.disabled = true; b.textContent = "מייצא…";
    try { const r = await api(`/api/tracks/${id}/clip`, { method: "POST", body: JSON.stringify({ before: 3, after: 3 }) }); window.open(r.file, "_blank"); }
    catch (err) { alert(err.message); }
    b.disabled = false; b.textContent = "ייצוא קטע (±3 שנ׳)"; return;
  }
  let decision = t.decision, note = t.note;
  if (act === "note") { const n = prompt("הערה לתוצאה:", note || ""); if (n === null) return; note = n; }
  else decision = t.decision === act ? null : act;
  const upd = await api(`/api/tracks/${id}/decision`, { method: "POST", body: JSON.stringify({ decision, note }) });
  t.decision = upd.decision; t.note = upd.note; renderResults();
});

// ---------- init ----------
loadStatus().then(() => loadSources()).catch((e) => ($("#engines").innerHTML = `<span class="err">השירות המקומי אינו זמין: ${esc(e.message)}</span>`));
