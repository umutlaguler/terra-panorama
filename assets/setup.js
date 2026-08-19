/* Kurulum: GitHub anahtarını ortak şifreyle şifreler (PBKDF2-SHA256 + AES-GCM). */
const $ = (s) => document.querySelector(s);
const ITER = 310000;

const b64 = (buf) => {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
};

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );
}

function fail(msg) {
  const e = $("#err");
  e.textContent = msg;
  e.hidden = false;
}

$("#go").addEventListener("click", async () => {
  $("#err").hidden = true;
  const repo = $("#repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const token = $("#token").value.trim();
  const pass = $("#pass").value;
  const pass2 = $("#pass2").value;

  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail("Depo adı 'kullanici/depo' biçiminde olmalı.");
  if (token.length < 20) return fail("Anahtar eksik görünüyor.");
  if (pass.length < 10) return fail("Şifre en az 10 karakter olmalı.");
  if (pass !== pass2) return fail("Şifreler aynı değil.");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));

  const vault = { v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct), repo };
  const file =
    "// Bu dosya kurulum.html tarafından üretildi.\n" +
    "// GitHub anahtarı ortak şifreyle şifrelenmiştir; şifre olmadan okunamaz.\n" +
    "window.APP_VAULT = " + JSON.stringify(vault, null, 2) + ";\n";

  $("#vaultOut").textContent = file;
  $("#out").hidden = false;
  $("#out").scrollIntoView({ behavior: "smooth", block: "start" });

  $("#copy").onclick = () => {
    navigator.clipboard.writeText(file);
    $("#copy").textContent = "Kopyalandı ✓";
    setTimeout(() => ($("#copy").textContent = "Kopyala"), 1800);
  };
  $("#dl").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([file], { type: "text/javascript" }));
    a.download = "vault.js";
    a.click();
    URL.revokeObjectURL(a.href);
  };
});
