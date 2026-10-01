// Spicy Bilingual v3 - Letra karaoke + traducción (EN <-> ES) en otro color
(async function SpicyBilingual() {
  while (!(window.Spicetify?.Player && Spicetify.Playbar && Spicetify.CosmosAsync)) {
    await new Promise((r) => setTimeout(r, 300));
  }

  // ---------- Ajustes ----------
  const LOOKAHEAD_MS = 120;
  const CHUNK = 12;
  const FPS_MS = 33; // ~30 fps para el barrido karaoke
  const DIM = -12; // posición inicial del degradado (%)
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem("sb:" + k)) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem("sb:" + k, JSON.stringify(v)); } catch {} },
  };
  const S = {
    color: store.get("color", "#ffd166"),
    showTr: store.get("showTr", true),
    blur: store.get("blur", true),
    swap: store.get("swap", false),
    apiKey: store.get("apikey", ""),
  };

  // ---------- Estado ----------
  let lines = [], synced = false, idx = -1;
  let isOpen = false, loadedId = null, token = 0, raf = 0, lastFrame = 0, lastSec = -1;
  let offset = 0, lyricsSrc = "", lyricsAttr = null, precise = false, fromApi = false, apiNote = "";
  let anchor = { pos: 0, t: 0, rep: -1 }, hold = 0;

  // ---------- Iconos ----------
  const ico = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="${d}"/></svg>`;
  const I = {
    play: "M8 5v14l11-7z",
    pause: "M6 5h4v14H6zM14 5h4v14h-4z",
    next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
    prev: "M6 6h2v12H6zM9.5 12l8.5 6V6z",
    shuffle: "M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
    repeat: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
    swap: "M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z",
    translate: "M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z",
    fs: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
    fsExit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
    close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  };

  // ---------- Estilos ----------
  const style = document.createElement("style");
  style.textContent = `
  #sb-root{position:fixed;inset:0;z-index:99999;display:none;flex-direction:row;background:#0b0b0d;color:#fff;overflow:hidden;font-family:var(--font-family,"Circular Std",system-ui,sans-serif)}
  #sb-root.open{display:flex}
  #sb-root.swap{flex-direction:row-reverse}
  #sb-bg{position:absolute;inset:-10%;background-size:cover;background-position:center;filter:blur(70px) brightness(.35) saturate(1.3);transform:translateZ(0)}

  /* NowBar */
  #sb-nowbar{position:relative;z-index:2;flex:0 0 42%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:0 3vw;min-width:0}
  .sb-fade{opacity:0;pointer-events:none;transition:opacity .25s}
  #sb-nowbar:hover .sb-fade{opacity:1;pointer-events:auto}
  #sb-tools,#sb-ctl{display:flex;gap:10px;align-items:center;justify-content:center}
  .sb-btn{width:42px;height:42px;border-radius:50%;border:1.5px solid rgba(255,255,255,.28);background:rgba(0,0,0,.35);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,transform .15s}
  .sb-btn:hover{background:rgba(255,255,255,.2);transform:scale(1.06)}
  .sb-btn.on{color:#1ed760;border-color:#1ed760}
  .sb-btn.plain{border:0;background:none;width:38px;height:38px}
  .sb-btn.big{width:60px;height:60px;border:0;background:#fff;color:#000}
  .sb-btn.big svg{width:30px;height:30px}
  #sb-cover{width:min(30vw,44vh);aspect-ratio:1;object-fit:cover;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.55);background:#222}
  #sb-time{display:flex;align-items:center;gap:10px;width:min(34vw,60vh);font-size:13px;opacity:.85;font-variant-numeric:tabular-nums}
  #sb-bar{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.22);cursor:pointer;overflow:hidden}
  #sb-fill{height:100%;width:0;background:#fff;border-radius:3px}
  #sb-meta{text-align:center;max-width:100%}
  #sb-title{font-size:clamp(22px,2.4vw,34px);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #sb-artist{font-size:clamp(15px,1.6vw,22px);opacity:.75;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  .sb-btn.sm{width:32px;height:32px;font-size:18px;line-height:1}
  #sb-src{font-size:12px;opacity:.6;margin-top:6px;line-height:1.4}
  #sb-key{-webkit-text-security:disc;background:#0d0d0d;color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:8px 10px}

  /* Letra */
  #sb-scroll{position:relative;z-index:1;flex:1;min-width:0;overflow-y:auto;padding:45vh 5vw;scrollbar-width:none}
  #sb-scroll::-webkit-scrollbar{display:none}
  #sb-status{opacity:.7;font-size:20px}
  .sb-line{--d:5;margin:0 0 30px;opacity:max(.2,calc(.7 - var(--d)*.12));filter:blur(calc(var(--d)*.8px));transform:scale(.97);transform-origin:left center;transition:opacity .3s,filter .3s,transform .3s;cursor:pointer}
  .sb-line.active{opacity:1;filter:none;transform:scale(1)}
  #sb-root.noblur .sb-line{filter:none}
  #sb-root.static .sb-line{opacity:.9;filter:none;transform:none}
  .sb-o{font-size:clamp(28px,3.6vw,56px);font-weight:800;line-height:1.18;letter-spacing:-.015em}
  /* Karaoke: barrido de degradado por palabra */
  .sb-w{display:inline-block;transform-origin:center bottom;transition:transform .6s cubic-bezier(.3,.7,.2,1);--p:${DIM}%;color:transparent;-webkit-text-fill-color:transparent;-webkit-background-clip:text;background-clip:text;
    background-image:linear-gradient(90deg,#fff 0,#fff var(--p),rgba(255,255,255,.38) calc(var(--p) + 12%),rgba(255,255,255,.38) 100%)}
  .sb-line.active .sb-o{filter:drop-shadow(0 0 14px rgba(255,255,255,.18))}
  /* La palabra que suena se eleva un poquito y luego vuelve a su sitio */
  .sb-w.up{transform:translateY(-.085em) scale(1.035);transition-duration:.22s}
  .sb-line.active .sb-w{will-change:transform}
  .sb-line.opp{text-align:right;transform-origin:right center}
  #sb-root.static .sb-w{background:none;-webkit-text-fill-color:#fff}
  .sb-t{margin-top:8px;font-size:clamp(18px,2.2vw,34px);font-weight:600;line-height:1.25;color:var(--sb-tr);min-height:1.25em}
  #sb-root.no-tr .sb-t{display:none}

  /* Modal */
  #sb-modal{position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
  #sb-modal.open{display:flex}
  #sb-card{width:min(380px,90vw);background:#181818;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:22px 24px;display:flex;flex-direction:column;gap:16px}
  #sb-card h3{margin:0;font-size:20px}
  .sb-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:15px}
  .sb-row input[type=checkbox]{accent-color:#1ed760;width:18px;height:18px}
  .sb-row input[type=color]{width:38px;height:28px;border:0;padding:0;background:none;cursor:pointer}
  #sb-sw{display:flex;gap:8px}
  #sb-sw button{width:28px;height:28px;border-radius:50%;border:2px solid transparent;cursor:pointer}
  #sb-sw button.sel{border-color:#fff}
  #sb-done{align-self:flex-end;background:#fff;color:#000;border:0;border-radius:20px;padding:8px 20px;font-weight:700;cursor:pointer}
  @media (max-width:900px){#sb-nowbar{flex-basis:34%}}
  @media (prefers-reduced-motion:reduce){.sb-line,.sb-fade,.sb-w{transition:none}.sb-w.up{transform:none}}
  `;
  document.head.appendChild(style);

  // ---------- DOM ----------
  const root = document.createElement("div");
  root.id = "sb-root";
  root.innerHTML = `
    <div id="sb-bg"></div>
    <div id="sb-nowbar">
      <div id="sb-tools" class="sb-fade">
        <button class="sb-btn" id="sb-swap" title="Cambiar lado del NowBar">${ico(I.swap)}</button>
        <button class="sb-btn" id="sb-trbtn" title="Traducción">${ico(I.translate)}</button>
        <button class="sb-btn" id="sb-fs" title="Pantalla completa">${ico(I.fs)}</button>
        <button class="sb-btn" id="sb-close" title="Cerrar">${ico(I.close)}</button>
      </div>
      <img id="sb-cover" alt="">
      <div id="sb-ctl" class="sb-fade">
        <button class="sb-btn plain" id="sb-shuf" title="Aleatorio">${ico(I.shuffle)}</button>
        <button class="sb-btn plain" id="sb-prev" title="Anterior">${ico(I.prev)}</button>
        <button class="sb-btn big" id="sb-play" title="Pausar / Reproducir"></button>
        <button class="sb-btn plain" id="sb-next" title="Siguiente">${ico(I.next)}</button>
        <button class="sb-btn plain" id="sb-rep" title="Bucle">${ico(I.repeat)}</button>
      </div>
      <div id="sb-time" class="sb-fade"><span id="sb-cur">0:00</span><div id="sb-bar"><div id="sb-fill"></div></div><span id="sb-dur">0:00</span></div>
      <div id="sb-meta"><div id="sb-title"></div><div id="sb-artist"></div><div id="sb-src"></div></div>
    </div>
    <div id="sb-scroll"></div>
    <div id="sb-modal">
      <div id="sb-card">
        <h3>Traducción</h3>
        <label class="sb-row"><span>Mostrar traducción</span><input type="checkbox" id="sb-m-show"></label>
        <div class="sb-row"><span>Color</span><input type="color" id="sb-m-color"></div>
        <div id="sb-sw"></div>
        <div class="sb-row"><span>Sincronía <small style="opacity:.6">(+ adelanta la letra)</small></span><span style="display:flex;align-items:center;gap:8px"><button class="sb-btn sm" id="sb-offm">−</button><span id="sb-off" style="min-width:64px;text-align:center">0 ms</span><button class="sb-btn sm" id="sb-offp">+</button></span></div>
        <label class="sb-row"><span>Desenfocar líneas lejanas</span><input type="checkbox" id="sb-m-blur"></label>
        <div class="sb-row" style="flex-direction:column;align-items:stretch;gap:6px"><span>Clave API de Spicy Lyrics <small style="opacity:.6">(opcional: letra palabra por palabra)</small></span><div style="display:flex;gap:8px"><input id="sb-key" type="text" placeholder="sl_pk_..." autocomplete="off" spellcheck="false" style="flex:1;min-width:0"><button class="sb-btn" id="sb-keypaste" style="width:auto;border-radius:8px;padding:0 14px;font-size:13px">Pegar</button></div><div id="sb-keystatus" style="font-size:13px;min-height:18px;font-weight:600"></div><small style="opacity:.6">Gratis en developers.spicylyrics.org. Cada persona debe usar su propia clave.</small></div>
        <button id="sb-done">Listo</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const scroller = $("#sb-scroll");

  const SWATCHES = ["#ffd166", "#ff8fab", "#7bdff2", "#b5f5a0", "#c3a6ff", "#ffa552"];
  SWATCHES.forEach((c) => {
    const b = document.createElement("button");
    b.style.background = c;
    b.dataset.c = c;
    b.addEventListener("click", () => { S.color = c; store.set("color", c); applyTheme(); });
    $("#sb-sw").appendChild(b);
  });

  function applyTheme() {
    root.style.setProperty("--sb-tr", S.color);
    root.classList.toggle("no-tr", !S.showTr);
    root.classList.toggle("noblur", !S.blur);
    root.classList.toggle("swap", S.swap);
    $("#sb-m-show").checked = S.showTr;
    $("#sb-m-blur").checked = S.blur;
    $("#sb-m-color").value = S.color;
    $("#sb-sw").querySelectorAll("button").forEach((b) => b.classList.toggle("sel", b.dataset.c === S.color));
    $("#sb-trbtn").classList.toggle("on", S.showTr);
  }
  applyTheme();

  $("#sb-m-show").addEventListener("change", (e) => { S.showTr = e.target.checked; store.set("showTr", S.showTr); applyTheme(); });
  $("#sb-m-blur").addEventListener("change", (e) => { S.blur = e.target.checked; store.set("blur", S.blur); applyTheme(); });
  $("#sb-m-color").addEventListener("input", (e) => { S.color = e.target.value; store.set("color", S.color); applyTheme(); });
  const showOff = () => { $("#sb-off").textContent = (offset > 0 ? "+" : "") + offset + " ms"; };
  const setOff = (v) => { offset = v; if (loadedId) store.set("o:" + loadedId, v); showOff(); };
  $("#sb-offm").addEventListener("click", () => setOff(offset - 100));
  $("#sb-offp").addEventListener("click", () => setOff(offset + 100));
  // Clave de la API: Spotify a veces bloquea Ctrl+V, así que hay botón "Pegar" y lectura manual del portapapeles
  const keyEl = $("#sb-key");
  const notify = (m, err) => { try { Spicetify.showNotification(m, !!err); } catch {} };
  keyEl.value = S.apiKey;
  { const ks = store.get("keystate", null); if (S.apiKey && ks) setKeyStatus(ks.kind, ks.msg); }
  function saveKey() {
    const v = keyEl.value.trim();
    if (v.startsWith("sl_sk_")) {
      keyEl.value = "";
      notify("Esa es la clave secreta. Usa la clave pública (sl_pk_...).", true);
      return;
    }
    S.apiKey = v;
    store.set("apikey", v);
    loadedId = null;
    if (v) { notify("Clave guardada"); testKey(); } else setKeyStatus("", "");
    if (isOpen) load();
  }
  async function readClip() {
    try { const t = await Spicetify.Platform?.ClipboardAPI?.paste?.(); if (typeof t === "string" && t) return t; } catch {}
    try { return await navigator.clipboard.readText(); } catch {}
    return "";
  }
  async function pasteKey() {
    const t = (await readClip()).trim();
    if (!t) { notify("No pude leer el portapapeles. Escribe la clave a mano.", true); return; }
    keyEl.value = t;
    saveKey();
  }
  keyEl.addEventListener("change", saveKey);
  keyEl.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") keyEl.blur(); });
  $("#sb-keypaste").addEventListener("click", pasteKey);
  window.addEventListener("keydown", (e) => {
    if (e.target === keyEl && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      e.stopImmediatePropagation();
      pasteKey();
    }
  }, true);
  $("#sb-done").addEventListener("click", () => $("#sb-modal").classList.remove("open"));
  $("#sb-modal").addEventListener("click", (e) => { if (e.target.id === "sb-modal") $("#sb-modal").classList.remove("open"); });
  $("#sb-trbtn").addEventListener("click", () => $("#sb-modal").classList.add("open"));
  $("#sb-swap").addEventListener("click", () => { S.swap = !S.swap; store.set("swap", S.swap); applyTheme(); });
  $("#sb-close").addEventListener("click", () => toggle(false));

  // ---------- Pantalla completa real ----------
  const fsBtn = $("#sb-fs");
  function updateFsIcon() {
    const on = !!document.fullscreenElement;
    fsBtn.innerHTML = ico(on ? I.fsExit : I.fs);
    fsBtn.title = on ? "Salir de pantalla completa" : "Pantalla completa";
  }
  async function enterFs() {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch (e) { console.warn("[SpicyBilingual] fullscreen:", e); }
  }
  async function exitFs() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
  }
  fsBtn.addEventListener("click", () => (document.fullscreenElement ? exitFs() : enterFs()));
  document.addEventListener("fullscreenchange", updateFsIcon);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isOpen) return;
    const m = $("#sb-modal");
    if (m.classList.contains("open")) m.classList.remove("open");
    else toggle(false);
  });

  // ---------- Controles del reproductor ----------
  const P = Spicetify.Player;
  const fmt = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function refreshCtl() {
    $("#sb-play").innerHTML = ico(P.isPlaying() ? I.pause : I.play);
    $("#sb-shuf").classList.toggle("on", !!P.getShuffle());
    $("#sb-rep").classList.toggle("on", P.getRepeat() > 0);
    $("#sb-dur").textContent = fmt(P.getDuration() || 0);
  }
  const later = (fn) => () => { fn(); setTimeout(refreshCtl, 180); };
  $("#sb-play").addEventListener("click", later(() => P.togglePlay()));
  $("#sb-next").addEventListener("click", later(() => P.next()));
  $("#sb-prev").addEventListener("click", later(() => P.back()));
  $("#sb-shuf").addEventListener("click", later(() => P.toggleShuffle()));
  $("#sb-rep").addEventListener("click", later(() => P.toggleRepeat()));
  $("#sb-bar").addEventListener("click", (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    doSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * P.getDuration());
  });
  P.addEventListener("onplaypause", refreshCtl);

  // ---------- Fuentes de letra ----------
  async function fetchSpotify(id) {
    try {
      const res = await Spicetify.CosmosAsync.get(
        `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`
      );
      const ls = res?.lyrics?.lines;
      if (!ls?.length) return null;
      const sync = res.lyrics.syncType === "LINE_SYNCED";
      return {
        synced: sync, src: "Spotify",
        lines: ls.map((l) => ({ t: sync ? Number(l.startTimeMs) : null, text: (l.words || "").trim() })).filter((l) => l.text && l.text !== "♪"),
      };
    } catch { return null; }
  }

  function parseLrclib(d) {
    if (d.syncedLyrics) {
      const out = [];
      for (const raw of d.syncedLyrics.split("\n")) {
        const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
        if (m && m[3].trim()) out.push({ t: (+m[1] * 60 + +m[2]) * 1000, text: m[3].trim() });
      }
      if (out.length) return { synced: true, src: "LRCLIB", lines: out };
    }
    if (d.plainLyrics) return { synced: false, src: "LRCLIB", lines: d.plainLyrics.split("\n").map((s) => s.trim()).filter(Boolean).map((text) => ({ t: null, text })) };
    return null;
  }

  async function fetchLrclib(item) {
    const name = item.name, artist = item.artists?.[0]?.name || "";
    const dur = Math.round(P.getDuration() / 1000);
    try {
      let r = await fetch("https://lrclib.net/api/get?" + new URLSearchParams({ track_name: name, artist_name: artist, duration: dur }));
      if (r.ok) { const x = parseLrclib(await r.json()); if (x) return x; }
      // Búsqueda flexible: elegimos la versión cuya duración más se parece
      r = await fetch("https://lrclib.net/api/search?" + new URLSearchParams({ track_name: name, artist_name: artist }));
      if (r.ok) {
        const arr = (await r.json())
          .filter((d) => d.syncedLyrics && Math.abs(d.duration - dur) <= 3)
          .sort((a, b) => Math.abs(a.duration - dur) - Math.abs(b.duration - dur));
        if (arr[0]) return parseLrclib(arr[0]);
      }
    } catch {}
    return null;
  }

  // ---------- API oficial de Spicy Lyrics (opcional, requiere clave propia) ----------
  const SRC_NAMES = { spicy_lyrics: "Spicy Lyrics", apple_music: "Apple Music", spotify: "Spotify", desconocida: "fuente desconocida" };

  // <parseSpicy>
  function parseSpicy(body) {
    const type = body.Type;
    const out = [];
    for (const it of body.Content || []) {
      if (it.Type && it.Type !== "Vocal") continue;
      const sy = it.Lead?.Syllables;
      if (type === "Syllable" && sy?.length) {
        const t = Math.round((it.Lead.StartTime ?? sy[0].StartTime) * 1000);
        const e = Math.round((it.Lead.EndTime ?? sy[sy.length - 1].EndTime) * 1000);
        const words = [];
        let cur = null;
        sy.forEach((x, i) => {
          const st = Math.round(x.StartTime * 1000) - t, en = Math.round(x.EndTime * 1000) - t;
          if (cur && sy[i - 1].IsPartOfWord) { cur.text += x.Text; cur.e = en; }
          else { cur = { text: x.Text, s: st, e: en }; words.push(cur); }
        });
        const clean = words.map((w) => ({ text: w.text.trim(), s: w.s, e: w.e })).filter((w) => w.text);
        if (!clean.length) continue;
        out.push({ t, e, text: clean.map((w) => w.text).join(" "), words: clean, opp: !!it.OppositeAligned });
      } else {
        const text = String(it.Text ?? it.Lead?.Text ?? "").trim();
        if (!text) continue;
        const st = it.StartTime ?? it.Lead?.StartTime, en = it.EndTime ?? it.Lead?.EndTime;
        out.push({ t: type === "Static" || st == null ? null : Math.round(st * 1000), e: en != null ? Math.round(en * 1000) : undefined, text, opp: !!it.OppositeAligned });
      }
    }
    const synced = type !== "Static" && out.length > 0 && out.every((l) => l.t != null);
    if (synced) out.sort((a, b) => a.t - b.t);
    return { synced, precise: type === "Syllable" && synced, api: true, src: body.source || "desconocida", attr: body.UploadAttribution || null, lines: out };
  }
  // </parseSpicy>

  // Petición desde un iframe con sandbox: el navegador le asigna Origin "null"
  function fetchViaSandbox(url, headers) {
    return new Promise((resolve) => {
      const id = "sb" + Math.random().toString(36).slice(2);
      const f = document.createElement("iframe");
      f.setAttribute("sandbox", "allow-scripts");
      f.style.cssText = "display:none;width:0;height:0;border:0";
      let done = false;
      const finish = (v) => { if (done) return; done = true; window.removeEventListener("message", on); clearTimeout(tm); f.remove(); resolve(v); };
      const on = (ev) => { if (ev.source === f.contentWindow && ev.data?.id === id) finish(ev.data); };
      const tm = setTimeout(() => finish({ status: 0, err: "tiempo agotado" }), 7000);
      window.addEventListener("message", on);
      f.srcdoc = "<script>(async()=>{const id=" + JSON.stringify(id) + ";try{const r=await fetch(" + JSON.stringify(url) +
        ",{headers:" + JSON.stringify(headers) + "});let b=null;try{b=await r.json()}catch(e){}parent.postMessage({id:id,status:r.status,body:b},'*')}catch(e){parent.postMessage({id:id,status:0,err:String(e).slice(0,80)},'*')}})()<\/script>";
      document.body.appendChild(f);
    });
  }

  // Una petición a la API; devuelve el código HTTP (0 = sin conexión), la letra si la hay y un diagnóstico
  async function apiCall(id) {
    const url = `https://api.spicylyrics.org/v1/lyrics/${id}`;
    const headers = { Authorization: "Bearer " + S.apiKey };
    const pick = (j) => {
      if (typeof j === "string") { try { j = JSON.parse(j); } catch { return null; } }
      return j?.Body ?? (j?.Content ? j : null);
    };
    const describe = (e) => String(e?.status ?? e?.code ?? e?.statusCode ?? e?.message ?? e?.name ?? e).split(url).join("<url>").slice(0, 170);
    const diag = [];
    let cosStatus = null;
    // Si el iframe ya funcionó antes, vamos directo (evita peticiones rechazadas de las otras vías)
    if (store.get("route", "") === "iframe") {
      try {
        const r = await fetchViaSandbox(url, headers);
        const body = r.status === 200 ? pick(r.body) : null;
        if (body) return { status: 200, body, diag: "" };
        if ([401, 404, 429].includes(r.status)) return { status: r.status, diag: "iframe: " + r.status };
      } catch {}
      store.set("route", ""); // la vía rápida falló: probamos todas de nuevo
    }
    // 1) Cosmos (vía nativa de Spotify, sin cabecera Origin: es lo que pide la clave "No Origin header")
    try {
      const body = pick(await Spicetify.CosmosAsync.get(url, null, headers));
      if (body) return { status: 200, body, diag: "" };
      diag.push("Cosmos: respuesta sin letra");
    } catch (e) {
      diag.push("Cosmos: " + describe(e));
      const n = Number(e?.status ?? e?.code ?? e?.statusCode);
      if (Number.isFinite(n) && n >= 400) cosStatus = n;
    }
    // 2) iframe aislado: su Origin es "null" (hay que agregar null en Allowed origins del panel)
    try {
      const r = await fetchViaSandbox(url, headers);
      const body = r.status === 200 ? pick(r.body) : null;
      if (body) { store.set("route", "iframe"); return { status: 200, body, diag: "" }; }
      diag.push("iframe: " + (r.status || r.err || "sin respuesta"));
      if ([401, 404, 429].includes(r.status)) return { status: r.status, diag: diag.join(" · ") };
    } catch (e) { diag.push("iframe: " + describe(e)); }
    // 3) fetch normal (lleva el Origin de Spotify, solo sirve si la clave lo permite)
    try {
      const r = await fetch(url, { headers });
      if (r.ok) return { status: 200, body: pick(await r.json()), diag: "" };
      diag.push("fetch: " + r.status);
      return { status: r.status, diag: diag.join(" · ") };
    } catch (e) {
      diag.push("fetch: " + describe(e));
      return { status: cosStatus ?? 0, diag: diag.join(" · ") };
    }
  }

  // Mensaje verde / rojo / ámbar en el modal
  function keyMessage(status, diag) {
    const d = diag ? " [" + diag + "]" : "";
    if (status === 200) return ["ok", "✓ Clave funcionando"];
    if (status === 404) return ["ok", "✓ Clave válida (esa canción no está en su catálogo)"];
    if (status === 401) return ["bad", "✗ Clave incorrecta (401). Revisa que esté completa." + d];
    if (status === 403) return ["bad", "✗ Rechazada (403)." + d];
    if (status === 429) return ["warn", "Clave válida, pero llegó al límite de peticiones (429). Espera un momento."];
    if (status === 0) return ["bad", "✗ No se pudo conectar con la API." + d];
    return ["bad", "✗ Error " + status + "." + d];
  }
  function setKeyStatus(kind, msg) {
    const el = $("#sb-keystatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = { ok: "#1ed760", bad: "#ff6b6b", warn: "#ffd166", wait: "rgba(255,255,255,.7)" }[kind] || "inherit";
    store.set("keystate", kind ? { kind, msg } : null);
  }
  async function testKey() {
    if (!S.apiKey) return;
    setKeyStatus("wait", "Verificando…");
    const id = P.data?.item?.uri?.startsWith("spotify:track:") ? P.data.item.uri.split(":")[2] : "4uLU6hMCjMI75M1A2tKUQC";
    const { status, diag } = await apiCall(id);
    setKeyStatus(...keyMessage(status, diag));
  }

  async function fetchSpicy(id) {
    if (!S.apiKey) return null;
    const { status, body, diag } = await apiCall(id);
    setKeyStatus(...keyMessage(status, diag));
    if (!body?.Content?.length) {
      apiNote = status === 200 || status === 404 ? "API Spicy: sin letra" : "API Spicy: error " + (status || "de red");
      console.warn("[SpicyBilingual] API Spicy:", status);
      return null;
    }
    const data = parseSpicy(body);
    return data.lines.length ? data : null;
  }

  // ---------- Traducción ----------
  async function gt(text, tl) {
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`);
    if (!r.ok) throw new Error("translate " + r.status);
    const d = await r.json();
    return { out: d[0].map((s) => s[0]).join(""), src: d[2] };
  }
  async function translateChunk(chunk, tl) {
    const { out, src } = await gt(chunk.join("\n"), tl);
    let parts = out.split("\n");
    if (parts.length !== chunk.length) { parts = []; for (const l of chunk) parts.push((await gt(l, tl)).out); }
    return { parts, src };
  }
  async function translateAll(my) {
    let tl = "es";
    for (let i = 0; i < lines.length; i += CHUNK) {
      if (my !== token) return;
      const texts = lines.slice(i, i + CHUNK).map((l) => l.text);
      try {
        let res = await translateChunk(texts, tl);
        if (i === 0 && res.src?.startsWith("es")) { tl = "en"; res = await translateChunk(texts, tl); }
        if (my !== token) return;
        res.parts.forEach((p, k) => {
          const line = lines[i + k];
          line.tr = p.trim().toLowerCase() === line.text.toLowerCase() ? "" : p.trim();
          const el = scroller.children[i + k]?.querySelector(".sb-t");
          if (el) el.textContent = line.tr;
        });
      } catch (e) { console.warn("[SpicyBilingual] traducción:", e); return; }
    }
    if (my === token && loadedId) saveCache(loadedId, { ts: Date.now(), synced, src: lyricsSrc, attr: lyricsAttr, precise, api: fromApi, lines: lines.map(({ t, e, text, tr, words, opp }) => ({ t, e, text, tr, words, opp })) });
  }

  // Caché en localStorage con límite de 80 canciones
  function saveCache(id, data) {
    store.set("c2:" + id, data);
    const list = store.get("index2", []).filter((x) => x !== id);
    list.push(id);
    while (list.length > 80) { try { localStorage.removeItem("sb:c2:" + list.shift()); } catch {} }
    store.set("index2", list);
  }

  // ---------- Tiempos por palabra (estimados) ----------
  function timeWords(i) {
    const l = lines[i];
    if (l.words) return; // ya trae tiempos reales
    const words = l.text.split(/\s+/).filter(Boolean);
    const gap = (lines[i + 1]?.t ?? l.t + 4500) - l.t;
    const dur = Math.max(300, Math.min(gap - 80, Math.max(1200, l.text.length * 95)));
    const wt = words.map((w) => w.length + 1);
    const total = wt.reduce((a, b) => a + b, 0);
    let acc = 0;
    l.words = words.map((w, k) => { const s = (acc / total) * dur; acc += wt[k]; return { text: w, s, e: (acc / total) * dur }; });
  }

  // ---------- Render ----------
  function render() {
    scroller.textContent = "";
    root.classList.toggle("static", !synced);
    lines.forEach((l, i) => {
      if (synced) timeWords(i);
      const d = document.createElement("div");
      d.className = "sb-line" + (l.opp ? " opp" : "");
      const o = document.createElement("div");
      o.className = "sb-o";
      const words = l.words ? l.words.map((w) => w.text) : l.text.split(/\s+/).filter(Boolean);
      d._w = words.map((w, k) => {
        const s = document.createElement("span");
        s.className = "sb-w";
        s.textContent = w;
        o.appendChild(s);
        if (k < words.length - 1) o.appendChild(document.createTextNode(" "));
        return s;
      });
      const t = document.createElement("div");
      t.className = "sb-t";
      t.textContent = l.tr || "";
      d.append(o, t);
      d.addEventListener("click", () => { if (synced && l.t != null) doSeek(l.t); });
      scroller.appendChild(d);
    });
    idx = -1;
  }

  function status(msg) {
    scroller.innerHTML = "";
    const s = document.createElement("div");
    s.id = "sb-status";
    s.textContent = msg;
    scroller.appendChild(s);
  }

  function showSrc() {
    const el = $("#sb-src");
    el.textContent = "";
    const add = (t) => el.appendChild(document.createTextNode(t));
    const link = (u) => {
      if (!u?.username) return;
      if (typeof u.url === "string" && u.url.startsWith("https://")) {
        const a = document.createElement("a");
        a.href = u.url; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.textContent = u.username; a.style.color = "inherit"; a.style.textDecoration = "underline";
        el.appendChild(a);
      } else add(u.username);
    };
    if (lyricsSrc) {
      add("Letra: " + (SRC_NAMES[lyricsSrc] || lyricsSrc));
      if (lyricsAttr?.Uploader) { add(" · subida por "); link(lyricsAttr.Uploader); }
      if (lyricsAttr?.Maker) { add(" · sincronía por "); link(lyricsAttr.Maker); }
      add(precise ? " · palabra a palabra" : synced ? "" : " · sin sincronía");
    }
    if (apiNote) add((lyricsSrc ? " · " : "") + apiNote);
  }

  function setHeader(item) {
    $("#sb-title").textContent = item.name || "";
    $("#sb-artist").textContent = item.artists?.map((a) => a.name).join(", ") || "";
    const img = (item.metadata?.image_xlarge_url || item.metadata?.image_url || "").replace("spotify:image:", "https://i.scdn.co/image/");
    $("#sb-cover").src = img;
    $("#sb-bg").style.backgroundImage = img ? `url("${img}")` : "none";
  }

  async function load() {
    const item = P.data?.item;
    if (!item || !item.uri?.startsWith("spotify:track:")) { status("Reproduce una canción para ver su letra."); return; }
    const id = item.uri.split(":")[2];
    setHeader(item);
    refreshCtl();
    if (id === loadedId && lines.length) return;
    const my = ++token;
    loadedId = id;
    lines = [];
    offset = store.get("o:" + id, 0);
    showOff();
    showSrc();
    status("Buscando letra…");

    const cached = store.get("c2:" + id, null);
    const fresh = cached && Date.now() - (cached.ts || 0) < 25 * 864e5; // la API exige renovar antes de 30 días
    if (fresh && (!S.apiKey || cached.api)) {
      lines = cached.lines; synced = cached.synced; lyricsSrc = cached.src || "";
      lyricsAttr = cached.attr || null; precise = !!cached.precise; fromApi = !!cached.api; apiNote = "";
      render(); showSrc();
      return;
    }

    apiNote = "";
    // Orden: API de Spicy Lyrics (si hay clave) -> Spotify -> LRCLIB. Preferimos siempre letra sincronizada.
    let data = await fetchSpicy(id);
    if (!data) data = await fetchSpotify(id);
    if (!data || !data.synced) {
      const alt = await fetchLrclib(item);
      if (alt && (alt.synced || !data)) data = alt;
    }
    if (my !== token) return;
    if (!data) { showSrc(); status("No encontré letra para esta canción."); return; }
    lines = data.lines;
    synced = data.synced;
    lyricsSrc = data.src || "";
    lyricsAttr = data.attr || null;
    precise = !!data.precise;
    fromApi = !!data.api;
    console.log("[SpicyBilingual] fuente:", lyricsSrc, "| palabra a palabra:", precise, "| sincronizada:", synced, "| líneas:", lines.length);
    render();
    showSrc();
    translateAll(my);
  }

  // ---------- Bucle principal (solo mientras está abierto, ~30 fps) ----------
  // Posición interpolada: suaviza si Spotify reporta el progreso a saltos
  function getPos() {
    const rep = P.getProgress();
    const now = performance.now();
    const playing = P.isPlaying();
    if (now < hold) {
      // Justo después de un seek, Spotify tarda en reportar la posición nueva
      const est = anchor.pos + (playing ? now - anchor.t : 0);
      if (Math.abs(rep - est) > 700) return est;
      hold = 0;
    }
    if (!playing || rep !== anchor.rep) { anchor = { pos: rep, t: now, rep }; return rep; }
    return anchor.pos + Math.min(now - anchor.t, 1500);
  }

  function doSeek(ms) {
    ms = Math.max(0, Math.round(ms));
    const now = performance.now();
    anchor = { pos: ms, t: now, rep: -1 };
    hold = now + 1500;
    lastSec = -1;
    try { P.seek(ms); } catch { try { Spicetify.Platform.PlayerAPI.seekTo(ms); } catch (e) { console.warn("[SpicyBilingual] seek:", e); } }
  }

  function setActive(n) {
    const prev = idx;
    idx = n;
    if (prev >= 0 && scroller.children[prev]) {
      const el = scroller.children[prev];
      el.classList.remove("active");
      el._w.forEach((w) => { w._p = DIM; w._st = 0; w.classList.remove("up"); w.style.setProperty("--p", DIM + "%"); });
    }
    if (n >= 0) {
      const el = scroller.children[n];
      el.classList.add("active");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (S.blur) {
      const a = Math.max(0, Math.min(prev < 0 ? n : prev, n < 0 ? prev : n) - 7);
      const b = Math.min(lines.length - 1, Math.max(prev, n) + 7);
      for (let i = a; i <= b; i++) {
        scroller.children[i]?.style.setProperty("--d", n < 0 ? 5 : Math.min(5, Math.abs(i - n)));
      }
    }
  }

  function sweep(p) {
    if (idx < 0) return;
    const l = lines[idx], el = scroller.children[idx];
    if (!l?.words || !el) return;
    const rel = p - l.t;
    for (let k = 0; k < l.words.length; k++) {
      const w = l.words[k];
      const f = Math.min(1, Math.max(0, (rel - w.s) / Math.max(1, w.e - w.s)));
      const v = Math.round(DIM + f * (100 - DIM));
      const sp = el._w[k];
      if (!sp) continue;
      if (sp._p !== v) { sp._p = v; sp.style.setProperty("--p", v + "%"); }
      // Estado de la palabra: 0 = aún no, 1 = sonando (elevada), 2 = ya pasó (vuelve a su sitio)
      const st = rel < w.s ? 0 : rel < w.s + Math.min(w.e - w.s, 650) ? 1 : 2;
      if (sp._st !== st) { sp._st = st; sp.classList.toggle("up", st === 1); }
    }
  }

  function frame(ts) {
    if (!isOpen) return;
    raf = requestAnimationFrame(frame);
    if (ts - lastFrame < FPS_MS) return;
    lastFrame = ts;
    const prog = getPos();
    const dur = P.getDuration() || 1;
    $("#sb-fill").style.width = (prog / dur) * 100 + "%";
    const sec = Math.floor(prog / 1000);
    if (sec !== lastSec) { lastSec = sec; $("#sb-cur").textContent = fmt(prog); }

    if (!synced || !lines.length || !scroller.children[0]?._w) return;
    const p = prog + LOOKAHEAD_MS + offset;
    let n = idx;
    if (n < 0 || lines[n].t > p) n = 0;
    while (n + 1 < lines.length && lines[n + 1].t <= p) n++;
    if (lines[n].t > p) n = -1;
    if (n !== idx) setActive(n);
    sweep(p);
  }

  async function toggle(force) {
    isOpen = force ?? !isOpen;
    root.classList.toggle("open", isOpen);
    cancelAnimationFrame(raf);
    if (isOpen) {
      enterFs(); // pantalla completa desde el primer clic
      load();
      raf = requestAnimationFrame(frame);
    } else {
      $("#sb-modal").classList.remove("open");
      exitFs();
    }
  }

  P.addEventListener("songchange", () => { if (isOpen) { loadedId = null; load(); } });

  new Spicetify.Playbar.Button(
    "Letra bilingüe",
    `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 3h12v1.5H2zM2 7h8v1.5H2zM2 11h12v1.5H2z"/></svg>`,
    () => toggle()
  );
})();
