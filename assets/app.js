/* ══════════════════════════════════════════════════════════════
   Terra Panorama · Site Yönetim Paneli
   Veri: özel GitHub deposundaki data.json (Contents API)
   ══════════════════════════════════════════════════════════════ */

const CFG = window.APP_CONFIG;
let VAULT = window.APP_VAULT;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ─────────── yardımcılar ─────────── */
const AY = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nf = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const TL = (n) => nf.format(Math.round((n + Number.EPSILON) * 100) / 100) + " ₺";
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (p) => { const [y, m] = p.split("-"); return `${AY[+m - 1]} ${y}`; };
const dateLabel = (d) => { if (!d) return "–"; const [y, m, g] = d.split("-"); return `${g} ${AY[+m - 1]} ${y}`; };
function monthsBetween(a, b) {
  const out = []; let [y, m] = a.split("-").map(Number); const [ey, em] = b.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 600) break; }
  return out;
}
function toast(msg, bad) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}

/* ─────────── şifre çözme ─────────── */
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function unlockToken(pass) {
  const v = VAULT;
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(v.salt), iterations: v.iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(v.iv) }, key, fromB64(v.ct));
  return new TextDecoder().decode(pt);
}

/* ─────────── durum ─────────── */
const S = {
  token: null, user: null, db: null, sha: null, saving: false, dirty: false,
  view: "panel", period: thisMonth(),
  f: { blok: "", ara: "", durum: "", kasaAy: "", kasaTip: "", isDurum: "acik", dBlok: "" },
};

/* ─────────── GitHub deposu ─────────── */
const API = () => `https://api.github.com/repos/${VAULT.repo}/contents/${CFG.dataPath}`;
const HEAD = () => ({ Authorization: `Bearer ${S.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

function utf8b64(str) {
  const bytes = new TextEncoder().encode(str);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64utf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function sync(state, txt) {
  $("#syncDot").className = "dot" + (state ? " " + state : "");
  $("#syncTxt").textContent = txt;
}

async function pull() {
  const r = await fetch(`${API()}?ref=${CFG.branch}&t=${Date.now()}`, { headers: HEAD(), cache: "no-store" });
  if (r.status === 404) throw new Error("NOFILE");
  if (r.status === 401 || r.status === 403) throw new Error("AUTH");
  if (!r.ok) throw new Error("Sunucuya ulaşılamadı (" + r.status + ")");
  const j = await r.json();
  S.sha = j.sha;
  S.db = normalize(JSON.parse(b64utf8(j.content)));
  return S.db;
}

async function put(msg) {
  const body = {
    message: `${msg} · ${S.user}`,
    content: utf8b64(JSON.stringify(S.db, null, 1)),
    sha: S.sha, branch: CFG.branch,
  };
  const r = await fetch(API(), { method: "PUT", headers: { ...HEAD(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return "CONFLICT";
  if (!r.ok) throw new Error("Kaydedilemedi (" + r.status + ")");
  S.sha = (await r.json()).content.sha;
  return "OK";
}

/* Tüm değişiklikler buradan geçer: çakışma olursa taze veriye yeniden uygular. */
async function mutate(msg, fn) {
  if (S.saving) { toast("Önceki kayıt sürüyor, bir saniye…"); return; }
  S.saving = true; sync("busy", "Kaydediliyor");
  fn(S.db); log(msg); render();
  try {
    for (let i = 0; i < 4; i++) {
      const res = await put(msg);
      if (res === "OK") { sync("", "Kayıtlı"); S.saving = false; return; }
      await pull(); fn(S.db); log(msg); render();
    }
    throw new Error("Çakışma çözülemedi");
  } catch (e) {
    S.saving = false; sync("err", "Hata");
    toast(e.message === "AUTH" ? "Erişim reddedildi — anahtar geçersiz olabilir" : "Kaydedilemedi: " + e.message, true);
    try { await pull(); render(); } catch (_) {}
  }
}
function log(text) {
  S.db.log.unshift({ ts: Date.now(), by: S.user, text });
  S.db.log = S.db.log.slice(0, 250);
}

/* ─────────── veri şeması ─────────── */
function normalize(d) {
  d.settings = d.settings || {};
  d.settings.siteName ||= CFG.siteName;
  d.settings.startMonth ||= thisMonth();
  d.settings.rates ||= [{ from: d.settings.startMonth, KONUT: 0, ISYERI: 0 }];
  d.settings.rates.sort((a, b) => a.from.localeCompare(b.from));
  d.units ||= []; d.payments ||= []; d.tx ||= []; d.tasks ||= []; d.log ||= [];
  return d;
}
const rateFor = (period, type) => {
  let r = 0;
  for (const x of S.db.settings.rates) if (x.from <= period) r = Number(x[type] || 0);
  return r;
};
const activePeriods = () => {
  const last = [thisMonth(), ...S.db.payments.map((p) => p.period)].sort().pop();
  return monthsBetween(S.db.settings.startMonth, last);
};
const dueOf = (u, period) => (u.exempt || (u.since && u.since > period) ? 0 : rateFor(period, u.type));
function unitStats(u, periods) {
  const accrued = periods.reduce((s, p) => s + dueOf(u, p), 0);
  const paid = S.db.payments.filter((p) => p.unitId === u.id).reduce((s, p) => s + Number(p.amount), 0);
  return { accrued, paid, balance: accrued - paid };
}
const paidIn = (unitId, period) =>
  S.db.payments.filter((p) => p.unitId === unitId && p.period === period).reduce((s, p) => s + Number(p.amount), 0);

function cashTotals() {
  const aidat = S.db.payments.reduce((s, p) => s + Number(p.amount), 0);
  const gelir = S.db.tx.filter((t) => t.kind === "gelir").reduce((s, t) => s + Number(t.amount), 0);
  const gider = S.db.tx.filter((t) => t.kind === "gider").reduce((s, t) => s + Number(t.amount), 0);
  return { aidat, gelir, gider, bakiye: aidat + gelir - gider };
}

/* ─────────── modal ─────────── */
function modal({ title, sub, body, ok = "Kaydet", wide, onOk, danger }) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="overlay"><div class="modal${wide ? " wide" : ""}">
    <div class="modal-h"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ""}</div>
      <button class="icon-btn" data-x>✕</button></div>
    <form class="modal-b" id="mform">${body}</form>
    <div class="modal-f"><button class="btn" data-x>Vazgeç</button>
      ${ok ? `<button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${esc(ok)}</button>` : ""}</div>
  </div></div>`;
  const close = () => (root.innerHTML = "");
  $$("[data-x]", root).forEach((b) => (b.onclick = close));
  root.firstChild.onmousedown = (e) => { if (e.target === root.firstChild) close(); };
  const form = $("#mform", root);
  form.onsubmit = (e) => e.preventDefault();
  const submit = () => {
    const data = Object.fromEntries(new FormData(form));
    if (onOk(data, close) !== false) close();
  };
  const okBtn = $("[data-ok]", root);
  if (okBtn) okBtn.onclick = submit;
  form.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); submit(); } });
  setTimeout(() => { const f = form.querySelector("input:not([type=hidden]),select,textarea"); if (f) f.focus(); }, 30);
  return close;
}
const fld = (label, inner, hint) =>
  `<label class="field"><span>${label}</span>${inner}${hint ? `<small>${hint}</small>` : ""}</label>`;
const opts = (list, sel) => list.map((o) => {
  const [v, t] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(v)}"${v == sel ? " selected" : ""}>${esc(t)}</option>`;
}).join("");

/* ══════════════════════════════════════════════════════════════
   GÖRÜNÜMLER
   ══════════════════════════════════════════════════════════════ */
function render() {
  $("#siteName").textContent = S.db.settings.siteName;
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === S.view));
  $("#main").innerHTML = ({ panel: vPanel, aidat: vAidat, kasa: vKasa, isler: vIsler, daireler: vDaireler, ayarlar: vAyarlar })[S.view]();
  $("#main").scrollTop = 0;
}

/* ─── PANEL ─── */
function vPanel() {
  const P = activePeriods(), c = cashTotals();
  const stats = S.db.units.map((u) => ({ u, ...unitStats(u, P) }));
  const borclu = stats.filter((x) => x.balance > 0.5).sort((a, b) => b.balance - a.balance);
  const totalBorc = borclu.reduce((s, x) => s + x.balance, 0);

  const ay = S.period;
  const ayTahakkuk = S.db.units.reduce((s, u) => s + dueOf(u, ay), 0);
  const ayTahsil = S.db.payments.filter((p) => p.period === ay).reduce((s, p) => s + Number(p.amount), 0);
  const oran = ayTahakkuk ? Math.min(100, (ayTahsil / ayTahakkuk) * 100) : 0;
  const acikIs = S.db.tasks.filter((t) => !t.done).length;

  const bloklar = [...new Set(S.db.units.map((u) => u.block))].sort();
  const blokSat = bloklar.map((b) => {
    const us = S.db.units.filter((u) => u.block === b);
    const t = us.reduce((s, u) => s + dueOf(u, ay), 0);
    const p = us.reduce((s, u) => s + paidIn(u.id, ay), 0);
    const y = t ? Math.min(100, (p / t) * 100) : 0;
    return `<tr><td class="strong">${b} Blok</td>
      <td style="width:40%"><div class="bar"><i style="width:${y.toFixed(0)}%"></i></div></td>
      <td class="num muted">%${y.toFixed(0)}</td>
      <td class="num">${TL(p)} <span class="muted">/ ${TL(t)}</span></td></tr>`;
  }).join("");

  const sonHareket = [
    ...S.db.payments.map((p) => ({ d: p.date, ts: p.ts || 0, t: `${p.unitId} · aidat`, s: `${monthLabel(p.period)} · ${p.method || "–"} · ${p.by || ""}`, a: +p.amount })),
    ...S.db.tx.map((t) => ({ d: t.date, ts: t.ts || 0, t: t.desc || t.cat, s: `${t.cat} · ${t.by || ""}`, a: t.kind === "gelir" ? +t.amount : -t.amount })),
  ].sort((a, b) => (b.d || "").localeCompare(a.d || "") || b.ts - a.ts).slice(0, 8);

  const kurulumUyari = rateFor(thisMonth(), "KONUT") === 0
    ? `<div class="notice"><div><b>Aidat tutarı henüz girilmedi.</b> Ayarlar sekmesinden konut ve işyeri aidatını belirleyin; borç hesabı ancak ondan sonra çalışır.</div>
       <button class="btn btn-sm btn-primary" data-go="ayarlar">Ayarlara git</button></div>` : "";

  return `
  ${kurulumUyari}
  <div class="view-head">
    <div><h2>Genel Durum</h2><p>${monthLabel(ay)} dönemi özeti</p></div>
    <div class="toolbar"><select data-set="period">${opts(activePeriods().slice().reverse().map((p) => [p, monthLabel(p)]), ay)}</select></div>
  </div>

  <div class="grid g-4" style="margin-bottom:16px">
    <div class="stat ${c.bakiye < 0 ? "neg" : "pos"}"><div class="lbl">Kasa bakiyesi</div><div class="val">${TL(c.bakiye)}</div>
      <div class="sub">${TL(c.aidat + c.gelir)} gelir · ${TL(c.gider)} gider</div></div>
    <div class="stat"><div class="lbl">${monthLabel(ay)} tahsilatı</div><div class="val">${TL(ayTahsil)}</div>
      <div class="sub">Tahakkuk ${TL(ayTahakkuk)} · %${oran.toFixed(0)}</div></div>
    <div class="stat ${totalBorc > 0 ? "neg" : ""}"><div class="lbl">Toplam alacak</div><div class="val">${TL(totalBorc)}</div>
      <div class="sub">${borclu.length} bağımsız bölüm borçlu</div></div>
    <div class="stat"><div class="lbl">Açık iş</div><div class="val">${acikIs}</div>
      <div class="sub">${S.db.tasks.length} kayıttan</div></div>
  </div>

  <div class="grid g-2">
    <div class="card">
      <div class="card-h"><h3>Blok bazında tahsilat</h3><span>${monthLabel(ay)}</span></div>
      <div class="tbl-wrap"><table><tbody>${blokSat || `<tr><td class="empty">Kayıt yok</td></tr>`}</tbody></table></div>
    </div>

    <div class="card">
      <div class="card-h"><h3>En yüksek borçlular</h3><button class="btn btn-sm btn-ghost" data-go="aidat">Tümü →</button></div>
      ${borclu.length ? borclu.slice(0, 6).map((x) => `<div class="list-row">
          <div class="grow"><div class="t">${x.u.id} · ${esc(x.u.owner || "—")}</div>
          <div class="s">${x.u.type === "KONUT" ? "Konut" : "İşyeri"} · ödenen ${TL(x.paid)}</div></div>
          <div class="amt-neg">${TL(x.balance)}</div></div>`).join("")
        : `<div class="empty">Borçlu yok 🎉</div>`}
    </div>

    <div class="card">
      <div class="card-h"><h3>Son hareketler</h3><button class="btn btn-sm btn-ghost" data-go="kasa">Kasa →</button></div>
      ${sonHareket.length ? sonHareket.map((h) => `<div class="list-row">
          <div class="grow"><div class="t">${esc(h.t)}</div><div class="s">${dateLabel(h.d)} · ${esc(h.s)}</div></div>
          <div class="${h.a >= 0 ? "amt-pos" : "amt-neg"}">${h.a >= 0 ? "+" : "−"}${TL(Math.abs(h.a))}</div></div>`).join("")
        : `<div class="empty">Henüz hareket yok</div>`}
    </div>

    <div class="card">
      <div class="card-h"><h3>Yaklaşan işler</h3><button class="btn btn-sm btn-ghost" data-go="isler">Tümü →</button></div>
      ${(() => {
        const l = S.db.tasks.filter((t) => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 6);
        return l.length ? l.map((t) => `<div class="list-row">
          <div class="grow"><div class="t">${esc(t.title)}</div>
          <div class="s">${t.due ? dateLabel(t.due) : "tarihsiz"}${t.who ? " · " + esc(t.who) : ""}</div></div>
          ${priBadge(t.pri)}</div>`).join("") : `<div class="empty">Bekleyen iş yok</div>`;
      })()}
    </div>
  </div>`;
}
const priBadge = (p) => p === "yuksek" ? `<span class="badge b-err">Acil</span>`
  : p === "dusuk" ? `<span class="badge b-mute">Düşük</span>` : `<span class="badge b-warn">Normal</span>`;

/* ─── AİDAT ─── */
function vAidat() {
  const P = activePeriods(), ay = S.period;
  const bloklar = [...new Set(S.db.units.map((u) => u.block))].sort();
  const q = S.f.ara.toLocaleLowerCase("tr");

  let list = S.db.units.filter((u) => (!S.f.blok || u.block === S.f.blok) &&
    (!q || u.id.toLocaleLowerCase("tr").includes(q) || (u.owner || "").toLocaleLowerCase("tr").includes(q) || (u.tenant || "").toLocaleLowerCase("tr").includes(q)));

  const rows = list.map((u) => {
    const due = dueOf(u, ay), pd = paidIn(u.id, ay);
    const st = u.exempt ? "muaf" : due === 0 ? "yok" : pd >= due - 0.5 ? "ok" : pd > 0 ? "kismi" : "yok_odeme";
    const { balance } = unitStats(u, P);
    return { u, due, pd, st, balance };
  }).filter((r) => !S.f.durum || (S.f.durum === "borclu" ? r.balance > 0.5 : S.f.durum === "odendi" ? r.st === "ok" : r.st === "yok_odeme"));

  const badge = { ok: `<span class="badge b-ok">Ödendi</span>`, kismi: `<span class="badge b-warn">Kısmi</span>`,
    yok_odeme: `<span class="badge b-err">Ödenmedi</span>`, muaf: `<span class="badge b-mute">Muaf</span>`, yok: `<span class="badge b-mute">–</span>` };

  const t = rows.reduce((a, r) => ({ due: a.due + r.due, pd: a.pd + r.pd, bal: a.bal + Math.max(0, r.balance) }), { due: 0, pd: 0, bal: 0 });

  return `
  <div class="view-head">
    <div><h2>Aidat Takibi</h2><p>${monthLabel(ay)} · ${rows.length} bağımsız bölüm</p></div>
    <div class="toolbar">
      <select data-set="period">${opts(P.slice().reverse().map((p) => [p, monthLabel(p)]), ay)}</select>
      <select data-f="blok">${opts([["", "Tüm bloklar"], ...bloklar.map((b) => [b, b + " Blok"])], S.f.blok)}</select>
      <select data-f="durum">${opts([["", "Tüm durumlar"], ["odendi", "Ödeyenler"], ["odenmedi", "Ödemeyenler"], ["borclu", "Borcu olanlar"]], S.f.durum)}</select>
      <input data-f="ara" placeholder="Ara: daire veya isim" value="${esc(S.f.ara)}">
    </div>
  </div>

  <div class="grid g-3" style="margin-bottom:16px">
    <div class="stat"><div class="lbl">Dönem tahakkuku</div><div class="val">${TL(t.due)}</div></div>
    <div class="stat pos"><div class="lbl">Dönem tahsilatı</div><div class="val">${TL(t.pd)}</div>
      <div class="sub">%${t.due ? ((t.pd / t.due) * 100).toFixed(0) : 0} tahsilat</div></div>
    <div class="stat ${t.bal > 0 ? "neg" : ""}"><div class="lbl">Birikmiş alacak</div><div class="val">${TL(t.bal)}</div>
      <div class="sub">tüm dönemler</div></div>
  </div>

  <div class="card"><div class="tbl-wrap"><table>
    <thead class="sticky-h"><tr>
      <th>Daire</th><th>Malik / Kiracı</th><th>Tip</th>
      <th class="num">Aidat</th><th class="num">Ödenen</th><th>Durum</th><th class="num">Toplam borç</th><th></th>
    </tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr data-open="${r.u.id}" style="cursor:pointer">
      <td class="strong">${r.u.id}</td>
      <td>${esc(r.u.owner || "—")}${r.u.tenant ? `<div class="s muted" style="font-size:11.5px">Kiracı: ${esc(r.u.tenant)}</div>` : ""}</td>
      <td class="muted">${r.u.type === "KONUT" ? "Konut" : "İşyeri"}</td>
      <td class="num">${r.due ? TL(r.due) : "–"}</td>
      <td class="num">${r.pd ? TL(r.pd) : "–"}</td>
      <td>${badge[r.st]}</td>
      <td class="num ${r.balance > 0.5 ? "amt-neg" : "muted"}">${r.balance > 0.5 ? TL(r.balance) : "—"}</td>
      <td class="act"><button class="btn btn-sm" data-pay="${r.u.id}">Tahsil et</button></td>
    </tr>`).join("") : `<tr><td colspan="8" class="empty">Sonuç yok</td></tr>`}</tbody>
  </table></div></div>`;
}

/* ─── GELİR / GİDER ─── */
const KAT_GIDER = ["Temizlik", "Elektrik", "Su", "Doğalgaz", "Asansör", "Bahçe / Peyzaj", "Personel", "Tamir & Bakım", "Güvenlik", "Sigorta", "Resmi / Vergi", "Demirbaş", "Diğer"];
const KAT_GELIR = ["Kira geliri", "Demirbaş satışı", "Gecikme faizi", "Bağış", "Diğer"];

function vKasa() {
  const c = cashTotals();
  const aylar = [...new Set(S.db.tx.map((t) => (t.date || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  let list = S.db.tx.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.ts || 0) - (a.ts || 0));
  if (S.f.kasaAy) list = list.filter((t) => (t.date || "").startsWith(S.f.kasaAy));
  if (S.f.kasaTip) list = list.filter((t) => t.kind === S.f.kasaTip);

  const fg = list.filter((t) => t.kind === "gelir").reduce((s, t) => s + +t.amount, 0);
  const fd = list.filter((t) => t.kind === "gider").reduce((s, t) => s + +t.amount, 0);

  const katlar = {};
  S.db.tx.filter((t) => t.kind === "gider" && (!S.f.kasaAy || (t.date || "").startsWith(S.f.kasaAy)))
    .forEach((t) => (katlar[t.cat] = (katlar[t.cat] || 0) + +t.amount));
  const katList = Object.entries(katlar).sort((a, b) => b[1] - a[1]);
  const katMax = katList[0]?.[1] || 1;

  return `
  <div class="view-head">
    <div><h2>Gelir / Gider</h2><p>Aidat dışı tüm kasa hareketleri</p></div>
    <div class="toolbar">
      <select data-f="kasaAy">${opts([["", "Tüm zamanlar"], ...aylar.map((a) => [a, monthLabel(a)])], S.f.kasaAy)}</select>
      <select data-f="kasaTip">${opts([["", "Gelir + Gider"], ["gelir", "Sadece gelir"], ["gider", "Sadece gider"]], S.f.kasaTip)}</select>
      <button class="btn btn-primary" data-a="tx-new">+ Hareket ekle</button>
    </div>
  </div>

  <div class="grid g-4" style="margin-bottom:16px">
    <div class="stat ${c.bakiye < 0 ? "neg" : "pos"}"><div class="lbl">Kasa bakiyesi</div><div class="val">${TL(c.bakiye)}</div><div class="sub">güncel</div></div>
    <div class="stat"><div class="lbl">Aidat tahsilatı</div><div class="val">${TL(c.aidat)}</div><div class="sub">tüm dönemler</div></div>
    <div class="stat"><div class="lbl">Diğer gelir</div><div class="val">${TL(S.f.kasaAy || S.f.kasaTip ? fg : c.gelir)}</div><div class="sub">${S.f.kasaAy ? monthLabel(S.f.kasaAy) : "toplam"}</div></div>
    <div class="stat neg"><div class="lbl">Gider</div><div class="val">${TL(S.f.kasaAy || S.f.kasaTip ? fd : c.gider)}</div><div class="sub">${S.f.kasaAy ? monthLabel(S.f.kasaAy) : "toplam"}</div></div>
  </div>

  <div class="grid" style="grid-template-columns:1.7fr 1fr;gap:16px">
    <div class="card">
      <div class="card-h"><h3>Hareketler</h3><span>${list.length} kayıt</span></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th><th class="num">Tutar</th><th></th></tr></thead>
        <tbody>${list.length ? list.map((t) => `<tr>
          <td class="muted">${dateLabel(t.date)}</td>
          <td class="strong">${esc(t.desc || "—")}${t.note ? `<div class="muted" style="font-size:11.5px">${esc(t.note)}</div>` : ""}</td>
          <td><span class="badge ${t.kind === "gelir" ? "b-ok" : "b-mute"}">${esc(t.cat)}</span></td>
          <td class="num ${t.kind === "gelir" ? "amt-pos" : "amt-neg"}">${t.kind === "gelir" ? "+" : "−"}${TL(t.amount)}</td>
          <td class="act"><button class="btn btn-sm btn-ghost" data-a="tx-edit" data-i="${t.id}">Düzenle</button></td>
        </tr>`).join("") : `<tr><td colspan="5" class="empty">Kayıt yok</td></tr>`}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="card-h"><h3>Gider dağılımı</h3><span>${S.f.kasaAy ? monthLabel(S.f.kasaAy) : "tüm zamanlar"}</span></div>
      ${katList.length ? `<div class="card-b" style="display:grid;gap:12px">${katList.map(([k, v]) => `
        <div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px">
          <span>${esc(k)}</span><span class="strong">${TL(v)}</span></div>
          <div class="bar"><i style="width:${((v / katMax) * 100).toFixed(0)}%"></i></div></div>`).join("")}</div>`
        : `<div class="empty">Gider kaydı yok</div>`}
    </div>
  </div>`;
}

/* ─── YAPILACAKLAR ─── */
function vIsler() {
  const all = S.db.tasks.slice();
  const list = all.filter((t) => S.f.isDurum === "hepsi" ? true : S.f.isDurum === "acik" ? !t.done : t.done)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
  const gecikmis = all.filter((t) => !t.done && t.due && t.due < today()).length;

  return `
  <div class="view-head">
    <div><h2>Yapılacaklar</h2><p>${all.filter((t) => !t.done).length} açık${gecikmis ? ` · ${gecikmis} gecikmiş` : ""}</p></div>
    <div class="toolbar">
      <select data-f="isDurum">${opts([["acik", "Açık işler"], ["bitti", "Tamamlananlar"], ["hepsi", "Tümü"]], S.f.isDurum)}</select>
      <button class="btn btn-primary" data-a="task-new">+ İş ekle</button>
    </div>
  </div>

  <div class="card">${list.length ? list.map((t) => `
    <div class="task${t.done ? " done" : ""}">
      <input type="checkbox" data-a="task-toggle" data-i="${t.id}"${t.done ? " checked" : ""}>
      <div class="grow" style="flex:1;min-width:0">
        <div class="t strong">${esc(t.title)}</div>
        ${t.note ? `<div class="s muted" style="font-size:12px;margin-top:3px">${esc(t.note)}</div>` : ""}
        <div class="meta">
          ${!t.done ? priBadge(t.pri) : ""}
          ${t.due ? `<span class="badge ${!t.done && t.due < today() ? "b-err" : "b-mute"}">${dateLabel(t.due)}</span>` : ""}
          ${t.who ? `<span class="badge b-mute">${esc(t.who)}</span>` : ""}
          ${t.cost ? `<span class="badge b-mute">~${TL(t.cost)}</span>` : ""}
        </div>
      </div>
      <div class="act"><button class="btn btn-sm btn-ghost" data-a="task-edit" data-i="${t.id}">Düzenle</button></div>
    </div>`).join("") : `<div class="empty">Kayıt yok</div>`}
  </div>`;
}

/* ─── DAİRELER ─── */
function vDaireler() {
  const bloklar = [...new Set(S.db.units.map((u) => u.block))].sort();
  const q = S.f.ara.toLocaleLowerCase("tr");
  const list = S.db.units.filter((u) => (!S.f.dBlok || u.block === S.f.dBlok) &&
    (!q || u.id.toLocaleLowerCase("tr").includes(q) || (u.owner || "").toLocaleLowerCase("tr").includes(q) || (u.tenant || "").toLocaleLowerCase("tr").includes(q)));

  return `
  <div class="view-head">
    <div><h2>Bağımsız Bölümler</h2><p>${S.db.units.length} kayıt · ${S.db.units.filter((u) => u.type === "KONUT").length} konut, ${S.db.units.filter((u) => u.type === "ISYERI").length} işyeri</p></div>
    <div class="toolbar">
      <select data-f="dBlok">${opts([["", "Tüm bloklar"], ...bloklar.map((b) => [b, b + " Blok"])], S.f.dBlok)}</select>
      <input data-f="ara" placeholder="Ara: daire veya isim" value="${esc(S.f.ara)}">
      <button class="btn btn-primary" data-a="unit-new">+ Bölüm ekle</button>
    </div>
  </div>

  <div class="card"><div class="tbl-wrap"><table>
    <thead class="sticky-h"><tr><th>Daire</th><th>Malik</th><th>Kiracı</th><th>Telefon</th><th>Tip</th><th>Durum</th><th></th></tr></thead>
    <tbody>${list.length ? list.map((u) => `<tr>
      <td class="strong">${u.id}</td>
      <td>${esc(u.owner || "—")}</td>
      <td class="muted">${esc(u.tenant || "—")}</td>
      <td class="muted">${esc(u.phone || "—")}</td>
      <td class="muted">${u.type === "KONUT" ? "Konut" : "İşyeri"}</td>
      <td>${u.exempt ? `<span class="badge b-mute">Aidattan muaf</span>` : `<span class="badge b-ok">Aktif</span>`}</td>
      <td class="act"><button class="btn btn-sm btn-ghost" data-a="unit-edit" data-i="${u.id}">Düzenle</button></td>
    </tr>`).join("") : `<tr><td colspan="7" class="empty">Sonuç yok</td></tr>`}</tbody>
  </table></div></div>`;
}

/* ─── AYARLAR ─── */
function vAyarlar() {
  const r = S.db.settings.rates;
  return `
  <div class="view-head"><div><h2>Ayarlar</h2><p>Aidat tutarları ve sistem bilgileri</p></div></div>

  <div class="grid g-2">
    <div class="card">
      <div class="card-h"><h3>Aidat tutarları</h3><button class="btn btn-sm btn-primary" data-a="rate-new">+ Yeni tarife</button></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Geçerlilik</th><th class="num">Konut</th><th class="num">İşyeri</th><th></th></tr></thead>
        <tbody>${r.map((x, i) => `<tr>
          <td class="strong">${monthLabel(x.from)}${i === r.length - 1 ? " →" : ""}</td>
          <td class="num">${TL(x.KONUT)}</td><td class="num">${TL(x.ISYERI)}</td>
          <td class="act">${r.length > 1 ? `<button class="btn btn-sm btn-ghost" data-a="rate-del" data-i="${x.from}">Sil</button>` : ""}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      <div class="card-b"><div class="help">Yeni tarife eklediğinizde <b>geçmiş aylar etkilenmez</b>. Örneğin Mart 2026'dan itibaren aidatı artırırsanız Ocak–Şubat eski tutardan hesaplanmaya devam eder.</div></div>
    </div>

    <div class="card">
      <div class="card-h"><h3>Genel</h3></div>
      <div class="card-b">
        ${fld("Site adı", `<input id="setName" value="${esc(S.db.settings.siteName)}">`)}
        ${fld("Aidat başlangıç ayı", `<input id="setStart" type="month" value="${S.db.settings.startMonth}">`, "Borç hesabı bu aydan itibaren yapılır.")}
        <button class="btn btn-primary" data-a="gen-save">Kaydet</button>
        <div class="sep"></div>
        <div class="help">Veriler <b>${esc(VAULT.repo)}</b> özel deposunda tutulur. Her değişiklik geçmişe kaydedilir, yanlışlıkla silinen bir şey GitHub'dan geri alınabilir.</div>
        <div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">
          <button class="btn" data-a="backup">Yedek indir (JSON)</button>
          <button class="btn btn-danger" data-a="logout">Çıkış yap</button>
        </div>
      </div>
    </div>

    <div class="card" style="grid-column:1/-1">
      <div class="card-h"><h3>Son işlemler</h3><span>kim, ne zaman, ne yaptı</span></div>
      ${S.db.log.length ? S.db.log.slice(0, 25).map((l) => `<div class="list-row">
        <div class="grow"><div class="t">${esc(l.text)}</div>
        <div class="s">${esc(l.by)} · ${new Date(l.ts).toLocaleString("tr-TR")}</div></div></div>`).join("")
      : `<div class="empty">Kayıt yok</div>`}
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════
   EYLEMLER
   ══════════════════════════════════════════════════════════════ */
const unit = (id) => S.db.units.find((u) => u.id === id);

function payModal(unitId) {
  const u = unit(unitId), P = activePeriods();
  const st = unitStats(u, P);
  const kalan = Math.max(0, dueOf(u, S.period) - paidIn(u.id, S.period));
  const gecmis = S.db.payments.filter((p) => p.unitId === u.id).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 6);

  modal({
    title: `${u.id} · Tahsilat`, sub: `${u.owner || "—"}${u.tenant ? " · kiracı " + u.tenant : ""}`, wide: true,
    body: `
      <div class="grid g-3" style="margin-bottom:16px">
        <div class="stat" style="box-shadow:none"><div class="lbl">Toplam tahakkuk</div><div class="val" style="font-size:18px">${TL(st.accrued)}</div></div>
        <div class="stat" style="box-shadow:none"><div class="lbl">Ödenen</div><div class="val" style="font-size:18px">${TL(st.paid)}</div></div>
        <div class="stat ${st.balance > 0.5 ? "neg" : "pos"}" style="box-shadow:none"><div class="lbl">Kalan borç</div><div class="val" style="font-size:18px">${TL(Math.max(0, st.balance))}</div></div>
      </div>
      <div class="row2">
        ${fld("Dönem", `<select name="period">${opts(P.slice().reverse().map((p) => [p, monthLabel(p) + (paidIn(u.id, p) >= dueOf(u, p) && dueOf(u, p) > 0 ? " ✓" : "")]), S.period)}</select>`)}
        ${fld("Tutar", `<input name="amount" type="number" step="0.01" min="0" value="${kalan || dueOf(u, S.period)}">`)}
      </div>
      <div class="row2">
        ${fld("Tarih", `<input name="date" type="date" value="${today()}">`)}
        ${fld("Ödeme şekli", `<select name="method">${opts(["Nakit", "Havale / EFT", "Kredi kartı", "Diğer"])}</select>`)}
      </div>
      ${fld("Not (isteğe bağlı)", `<input name="note" placeholder="örn. eksik ödeme, elden alındı">`)}
      ${gecmis.length ? `<div class="sep"></div><div style="font-size:12px;color:var(--ink-3);margin-bottom:8px">Son ödemeler</div>
        ${gecmis.map((p) => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line-soft)">
          <span>${monthLabel(p.period)} <span class="muted">· ${dateLabel(p.date)} · ${esc(p.method || "")}</span></span>
          <span><b>${TL(p.amount)}</b> <button type="button" class="btn btn-sm btn-ghost" data-a="pay-del" data-i="${p.id}">sil</button></span>
        </div>`).join("")}` : ""}`,
    ok: "Tahsilatı kaydet",
    onOk: (d) => {
      const amount = Number(d.amount);
      if (!(amount > 0)) { toast("Geçerli bir tutar girin", true); return false; }
      mutate(`${u.id} · ${monthLabel(d.period)} aidatı ${TL(amount)} tahsil edildi`, (db) => {
        db.payments.push({ id: uid(), unitId: u.id, period: d.period, amount, date: d.date, method: d.method, note: d.note || "", by: S.user, ts: Date.now() });
      });
    },
  });
}

function txModal(id) {
  const t = id ? S.db.tx.find((x) => x.id === id) : null;
  modal({
    title: t ? "Hareketi düzenle" : "Yeni hareket", wide: false,
    body: `
      ${fld("Tür", `<select name="kind" id="txKind">${opts([["gider", "Gider"], ["gelir", "Gelir"]], t?.kind || "gider")}</select>`)}
      ${fld("Kategori", `<select name="cat" id="txCat"></select>`)}
      <div class="row2">
        ${fld("Tutar", `<input name="amount" type="number" step="0.01" min="0" value="${t?.amount ?? ""}">`)}
        ${fld("Tarih", `<input name="date" type="date" value="${t?.date || today()}">`)}
      </div>
      ${fld("Açıklama", `<input name="desc" value="${esc(t?.desc || "")}" placeholder="örn. Asansör yıllık bakım">`)}
      ${fld("Not", `<textarea name="note" placeholder="fatura no, firma, vb.">${esc(t?.note || "")}</textarea>`)}
      ${t ? `<button type="button" class="btn btn-danger btn-block" data-a="tx-del" data-i="${t.id}">Bu kaydı sil</button>` : ""}`,
    ok: t ? "Güncelle" : "Ekle",
    onOk: (d) => {
      const amount = Number(d.amount);
      if (!(amount > 0)) { toast("Geçerli bir tutar girin", true); return false; }
      const label = `${d.kind === "gelir" ? "Gelir" : "Gider"}: ${d.desc || d.cat} · ${TL(amount)}`;
      if (t) mutate(`${label} güncellendi`, (db) => {
        const x = db.tx.find((y) => y.id === id); if (!x) return;
        Object.assign(x, { kind: d.kind, cat: d.cat, amount, date: d.date, desc: d.desc, note: d.note });
      });
      else mutate(`${label} eklendi`, (db) => {
        db.tx.push({ id: uid(), kind: d.kind, cat: d.cat, amount, date: d.date, desc: d.desc, note: d.note, by: S.user, ts: Date.now() });
      });
    },
  });
  const kind = $("#txKind"), cat = $("#txCat");
  const fill = () => (cat.innerHTML = opts(kind.value === "gelir" ? KAT_GELIR : KAT_GIDER, t?.cat));
  kind.onchange = fill; fill();
}

function taskModal(id) {
  const t = id ? S.db.tasks.find((x) => x.id === id) : null;
  modal({
    title: t ? "İşi düzenle" : "Yeni iş",
    body: `
      ${fld("Başlık", `<input name="title" value="${esc(t?.title || "")}" placeholder="örn. Su deposu temizliği">`)}
      ${fld("Detay", `<textarea name="note" placeholder="isteğe bağlı">${esc(t?.note || "")}</textarea>`)}
      <div class="row2">
        ${fld("Öncelik", `<select name="pri">${opts([["normal", "Normal"], ["yuksek", "Acil"], ["dusuk", "Düşük"]], t?.pri || "normal")}</select>`)}
        ${fld("Sorumlu", `<select name="who">${opts([["", "—"], ...CFG.admins, ["Dışarıdan", "Dışarıdan"]], t?.who || "")}</select>`)}
      </div>
      <div class="row2">
        ${fld("Termin", `<input name="due" type="date" value="${t?.due || ""}">`)}
        ${fld("Tahmini maliyet", `<input name="cost" type="number" step="0.01" min="0" value="${t?.cost || ""}">`)}
      </div>
      ${t ? `<button type="button" class="btn btn-danger btn-block" data-a="task-del" data-i="${t.id}">Bu işi sil</button>` : ""}`,
    ok: t ? "Güncelle" : "Ekle",
    onOk: (d) => {
      if (!d.title.trim()) { toast("Başlık gerekli", true); return false; }
      const patch = { title: d.title.trim(), note: d.note, pri: d.pri, who: d.who, due: d.due, cost: Number(d.cost) || 0 };
      if (t) mutate(`İş güncellendi: ${patch.title}`, (db) => Object.assign(db.tasks.find((x) => x.id === id) || {}, patch));
      else mutate(`İş eklendi: ${patch.title}`, (db) => db.tasks.push({ id: uid(), done: false, by: S.user, ts: Date.now(), ...patch }));
    },
  });
}

function unitModal(id) {
  const u = id ? unit(id) : null;
  modal({
    title: u ? `${u.id} · Bilgiler` : "Yeni bağımsız bölüm",
    body: `
      ${u ? "" : `<div class="row2">${fld("Blok", `<input name="block" placeholder="A" maxlength="3">`)}${fld("No", `<input name="no" type="number" min="1">`)}</div>`}
      ${fld("Malik", `<input name="owner" value="${esc(u?.owner || "")}">`)}
      <div class="row2">
        ${fld("Kiracı", `<input name="tenant" value="${esc(u?.tenant || "")}">`)}
        ${fld("Telefon", `<input name="phone" value="${esc(u?.phone || "")}" placeholder="05xx xxx xx xx">`)}
      </div>
      <div class="row2">
        ${fld("Tip", `<select name="type">${opts([["KONUT", "Konut"], ["ISYERI", "İşyeri"]], u?.type || "KONUT")}</select>`)}
        ${fld("Aidat", `<select name="exempt">${opts([["", "Ödüyor"], ["1", "Muaf"]], u?.exempt ? "1" : "")}</select>`)}
      </div>
      ${fld("Not", `<textarea name="note">${esc(u?.note || "")}</textarea>`)}
      ${u ? `<button type="button" class="btn btn-danger btn-block" data-a="unit-del" data-i="${u.id}">Bu bölümü sil</button>` : ""}`,
    ok: u ? "Güncelle" : "Ekle",
    onOk: (d) => {
      const patch = { owner: d.owner.trim(), tenant: d.tenant.trim(), phone: d.phone.trim(), type: d.type, exempt: !!d.exempt, note: d.note };
      if (u) mutate(`${u.id} bilgileri güncellendi`, (db) => Object.assign(db.units.find((x) => x.id === id) || {}, patch));
      else {
        const nid = `${d.block.trim().toLocaleUpperCase("tr")}-${Number(d.no)}`;
        if (!d.block.trim() || !d.no) { toast("Blok ve no gerekli", true); return false; }
        if (unit(nid)) { toast(nid + " zaten var", true); return false; }
        mutate(`${nid} eklendi`, (db) => db.units.push({ id: nid, block: d.block.trim().toLocaleUpperCase("tr"), no: Number(d.no), since: thisMonth(), ...patch }));
      }
    },
  });
}

function rateModal() {
  const last = S.db.settings.rates[S.db.settings.rates.length - 1];
  modal({
    title: "Yeni aidat tarifesi", sub: "Belirttiğiniz aydan itibaren geçerli olur",
    body: `${fld("Geçerlilik başlangıcı", `<input name="from" type="month" value="${thisMonth()}">`)}
      <div class="row2">
        ${fld("Konut aidatı", `<input name="KONUT" type="number" step="0.01" min="0" value="${last.KONUT}">`)}
        ${fld("İşyeri aidatı", `<input name="ISYERI" type="number" step="0.01" min="0" value="${last.ISYERI}">`)}
      </div>`,
    ok: "Tarifeyi ekle",
    onOk: (d) => {
      if (!d.from) { toast("Ay seçin", true); return false; }
      mutate(`${monthLabel(d.from)} tarifesi: konut ${TL(+d.KONUT)}, işyeri ${TL(+d.ISYERI)}`, (db) => {
        db.settings.rates = db.settings.rates.filter((x) => x.from !== d.from);
        db.settings.rates.push({ from: d.from, KONUT: Number(d.KONUT), ISYERI: Number(d.ISYERI) });
        db.settings.rates.sort((a, b) => a.from.localeCompare(b.from));
      });
    },
  });
}

function confirmDo(title, text, msg, fn) {
  modal({ title, body: `<p style="margin:0;color:var(--ink-2);font-size:13.5px;line-height:1.6">${esc(text)}</p>`,
    ok: "Evet, sil", danger: true, onOk: () => mutate(msg, fn) });
}

/* ─────────── olay yönlendirme ─────────── */
document.addEventListener("click", (e) => {
  const tab = e.target.closest("#tabs button");
  if (tab) { S.view = tab.dataset.view; S.f.ara = ""; render(); return; }

  const t = e.target.closest("[data-a],[data-go],[data-pay],[data-open]");
  if (!t) return;
  const id = t.dataset.i;

  if (t.dataset.go) { S.view = t.dataset.go; render(); return; }
  if (t.dataset.pay) { e.stopPropagation(); payModal(t.dataset.pay); return; }
  if (t.dataset.open && !t.dataset.a) { payModal(t.dataset.open); return; }

  switch (t.dataset.a) {
    case "tx-new": txModal(); break;
    case "tx-edit": txModal(id); break;
    case "tx-del": {
      const x = S.db.tx.find((y) => y.id === id);
      $("#modalRoot").innerHTML = "";
      confirmDo("Kayıt silinsin mi?", `${x.desc || x.cat} · ${TL(x.amount)} kaydı kalıcı olarak silinecek.`,
        `Silindi: ${x.desc || x.cat} · ${TL(x.amount)}`, (db) => (db.tx = db.tx.filter((y) => y.id !== id)));
      break;
    }
    case "task-new": taskModal(); break;
    case "task-edit": taskModal(id); break;
    case "task-del": {
      const x = S.db.tasks.find((y) => y.id === id);
      $("#modalRoot").innerHTML = "";
      confirmDo("İş silinsin mi?", `"${x.title}" listeden kaldırılacak.`, `İş silindi: ${x.title}`,
        (db) => (db.tasks = db.tasks.filter((y) => y.id !== id)));
      break;
    }
    case "task-toggle": {
      const x = S.db.tasks.find((y) => y.id === id);
      mutate(`${x.done ? "Yeniden açıldı" : "Tamamlandı"}: ${x.title}`, (db) => {
        const y = db.tasks.find((z) => z.id === id); if (!y) return;
        y.done = !y.done; y.doneAt = y.done ? today() : null; y.doneBy = y.done ? S.user : null;
      });
      break;
    }
    case "unit-new": unitModal(); break;
    case "unit-edit": unitModal(id); break;
    case "unit-del": {
      const u = unit(id);
      $("#modalRoot").innerHTML = "";
      confirmDo("Bölüm silinsin mi?", `${u.id} ve bu bölüme ait tüm aidat ödemeleri silinecek.`, `${u.id} silindi`,
        (db) => { db.units = db.units.filter((x) => x.id !== id); db.payments = db.payments.filter((p) => p.unitId !== id); });
      break;
    }
    case "pay-del": {
      const p = S.db.payments.find((x) => x.id === id);
      $("#modalRoot").innerHTML = "";
      confirmDo("Ödeme silinsin mi?", `${p.unitId} · ${monthLabel(p.period)} · ${TL(p.amount)} kaydı silinecek.`,
        `Ödeme silindi: ${p.unitId} ${monthLabel(p.period)} ${TL(p.amount)}`,
        (db) => (db.payments = db.payments.filter((x) => x.id !== id)));
      break;
    }
    case "rate-new": rateModal(); break;
    case "rate-del": confirmDo("Tarife silinsin mi?", `${monthLabel(id)} tarifesi kaldırılacak, o aylar önceki tarifeden hesaplanacak.`,
      `${monthLabel(id)} tarifesi silindi`, (db) => (db.settings.rates = db.settings.rates.filter((x) => x.from !== id))); break;
    case "gen-save": {
      const name = $("#setName").value.trim() || CFG.siteName, start = $("#setStart").value;
      mutate("Genel ayarlar güncellendi", (db) => { db.settings.siteName = name; if (start) db.settings.startMonth = start; });
      break;
    }
    case "backup": {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S.db, null, 1)], { type: "application/json" }));
      a.download = `apartman-yedek-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
      toast("Yedek indirildi");
      break;
    }
    case "logout": localStorage.clear(); location.reload(); break;
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.set === "period") { S.period = el.value; render(); }
  if (el.dataset.f) { S.f[el.dataset.f] = el.value; render(); }
});
document.addEventListener("input", (e) => {
  if (e.target.dataset.f === "ara") {
    S.f.ara = e.target.value;
    clearTimeout(window._d); window._d = setTimeout(() => {
      render();
      const i = $("[data-f=ara]"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }, 220);
  }
});

/* ─────────── açılış ─────────── */
function setTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem("tp_theme", t); }
setTheme(localStorage.getItem("tp_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

async function boot(token, user) {
  S.token = token; S.user = user;
  sync("busy", "Yükleniyor");
  try {
    await pull();
  } catch (e) {
    if (e.message === "NOFILE") {
      alert("Özel depoda data.json bulunamadı.\n\nKurulum adımlarını (kurulum.html) tamamladığınızdan emin olun.");
    } else if (e.message === "AUTH") {
      alert("GitHub erişimi reddedildi. Anahtarın süresi dolmuş olabilir; kurulumu tekrarlayın.");
    } else alert(e.message);
    sync("err", "Bağlanamadı"); return false;
  }
  $("#gate").hidden = true; $("#app").hidden = false;
  $("#userChip").textContent = user.slice(0, 2).toLocaleUpperCase("tr");
  $("#userChip").title = user + " · çıkış için tıklayın";
  S.period = thisMonth();
  sync("", "Güncel");
  render();

  // 30 sn'de bir diğer yöneticinin değişikliklerini çek
  setInterval(async () => {
    if (S.saving || document.hidden) return;
    try {
      const old = S.sha;
      await pull();
      if (old !== S.sha) { render(); toast("Yeni değişiklikler alındı"); }
      sync("", "Güncel");
    } catch (_) { sync("err", "Bağlantı yok"); }
  }, 30000);
  return true;
}

/* Tarayıcı eski vault.js'i önbellekten vermiş olabilir — taze bir kopya dene. */
async function refreshVault() {
  if (VAULT) return;
  try {
    const r = await fetch(`vault.js?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    new Function(await r.text())();
    VAULT = window.APP_VAULT;
  } catch (_) {}
}

(async function init() {
  await refreshVault();
  if (!VAULT) {
    document.body.innerHTML = `<div class="gate"><div class="gate-card" style="text-align:center">
      <h1 style="font-size:17px;margin-bottom:8px">Kurulum tamamlanmadı</h1>
      <p style="color:var(--ink-3);font-size:13px;line-height:1.6">Sistemi kullanmaya başlamak için önce kurulum sayfasını açın.</p>
      <a class="btn btn-primary btn-block" style="margin-top:18px;text-decoration:none" href="kurulum.html">Kuruluma git</a></div></div>`;
    return;
  }
  $("#gateUser").innerHTML = opts(CFG.admins);
  $("#themeBtn").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  $("#syncBtn").onclick = async () => {
    sync("busy", "Yenileniyor");
    try { await pull(); render(); sync("", "Güncel"); toast("Güncellendi"); }
    catch (_) { sync("err", "Bağlantı yok"); }
  };
  $("#userChip").onclick = () => { if (confirm("Çıkış yapılsın mı?")) { localStorage.clear(); location.reload(); } };

  const saved = localStorage.getItem("tp_tok"), savedUser = localStorage.getItem("tp_user");
  if (saved && savedUser) { boot(saved, savedUser); return; }

  const go = async () => {
    const pass = $("#gatePass").value, user = $("#gateUser").value;
    const err = $("#gateErr");
    err.hidden = true;
    $("#gateBtn").disabled = true; $("#gateBtn").textContent = "Kontrol ediliyor…";
    try {
      const token = await unlockToken(pass);
      localStorage.setItem("tp_tok", token); localStorage.setItem("tp_user", user);
      if (!(await boot(token, user))) { localStorage.clear(); throw new Error("bağlantı"); }
    } catch (e) {
      err.textContent = e.message === "bağlantı" ? "Bağlantı kurulamadı." : "Şifre hatalı.";
      err.hidden = false;
      $("#gatePass").select();
    }
    $("#gateBtn").disabled = false; $("#gateBtn").textContent = "Giriş yap";
  };
  $("#gateBtn").onclick = go;
  $("#gatePass").onkeydown = (e) => { if (e.key === "Enter") go(); };
})();
