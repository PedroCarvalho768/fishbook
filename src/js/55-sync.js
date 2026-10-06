/* Live sync: remember the save file (File System Access API) and reload it whenever the game writes it.
   Stardew saves when you go to bed, so polling every few seconds while the tab is visible is plenty. */

const SYNC_DB = "fishbook-sync", SYNC_STORE = "handles", POLL_MS = 4000;
const sync = { handle: null, status: "off", lastModified: 0, timer: null, error: null };
const syncSupported = () => typeof window.showOpenFilePicker === "function";

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(SYNC_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(SYNC_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(SYNC_STORE, mode);
    const req = fn(tx.objectStore(SYNC_STORE));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}
const saveHandle = h => idbDo("readwrite", s => s.put(h, "save"));
const loadHandle = () => idbDo("readonly", s => s.get("save"));
const dropHandle = () => idbDo("readwrite", s => s.delete("save"));

async function startSync(handle, { loadNow = true } = {}) {
  sync.handle = handle;
  sync.status = "live";
  sync.error = null;
  try {
    const f = await handle.getFile();
    if (loadNow) { sync.lastModified = f.lastModified; await loadSaveFile(f, { quiet: false }); }
    else sync.lastModified = state.save?.fileModified === f.lastModified ? f.lastModified : 0;
  } catch (e) { sync.status = "error"; sync.error = e.message; }
  schedulePoll();
  renderSaveCard();
}

function schedulePoll() {
  clearTimeout(sync.timer);
  if (sync.status !== "live") return;
  sync.timer = setTimeout(poll, POLL_MS);
}
async function poll() {
  if (sync.status !== "live" || !sync.handle) return;
  if (document.visibilityState === "visible") {
    try {
      const f = await sync.handle.getFile();
      if (f.lastModified !== sync.lastModified && f.size > 0) {
        // the game may still be writing; wait for the size to settle before parsing
        await new Promise(r => setTimeout(r, 1200));
        const f2 = await sync.handle.getFile();
        if (f2.size === f.size) {
          sync.lastModified = f2.lastModified;
          await loadSaveFile(f2, { auto: true });
        }
      }
    } catch (e) {
      if (e.name === "NotAllowedError") { sync.status = "needs-permission"; renderSaveCard(); return; }
      if (e.name === "NotFoundError") { sync.status = "error"; sync.error = "The save file was moved or deleted."; renderSaveCard(); return; }
    }
  }
  schedulePoll();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && sync.status === "live") { clearTimeout(sync.timer); poll(); } });

async function pickAndSync() {
  try {
    const [h] = await window.showOpenFilePicker({ id: "stardew-save", multiple: false, excludeAcceptAllOption: false });
    await saveHandle(h);
    await startSync(h);
    toast(`${icon("refresh")}Live sync on. Almanac will update by itself each time you sleep in-game.`, null, 6000);
  } catch (e) {
    if (e.name !== "AbortError") toast("Couldn't open that file for syncing. Try loading it once instead.");
  }
}
async function reconnectSync() {
  if (!sync.handle) return;
  try {
    const p = await sync.handle.requestPermission({ mode: "read" });
    if (p === "granted") await startSync(sync.handle);
  } catch { toast("Permission wasn't granted. You can still load the save by hand."); }
}
async function stopSync() {
  clearTimeout(sync.timer);
  sync.handle = null; sync.status = "off";
  try { await dropHandle(); } catch {}
  renderSaveCard();
  toast("Live sync turned off");
}

/* resume after a reload: permission may persist (Chrome "allow on every visit") or need one click */
async function resumeSync() {
  if (!syncSupported()) return;
  let h;
  try { h = await loadHandle(); } catch { return; }
  if (!h) return;
  sync.handle = h;
  try {
    const p = await h.queryPermission({ mode: "read" });
    if (p === "granted") await startSync(h, { loadNow: false }), poll();
    else { sync.status = "needs-permission"; renderSaveCard(); }
  } catch { sync.status = "needs-permission"; renderSaveCard(); }
}

function syncCardHTML() {
  if (!syncSupported()) return "";
  if (sync.status === "live") return `<div class="sync-line live"><i></i><span>Live sync on${sync.handle?.name ? ` · ${esc(sync.handle.name)}` : ""}</span><button class="link-btn" type="button" data-act="sync-stop">Stop</button></div>`;
  if (sync.status === "needs-permission") return `<div class="sync-line warn"><span>Live sync paused</span><button class="link-btn" type="button" data-act="sync-reconnect">Resume</button></div>`;
  if (sync.status === "error") return `<div class="sync-line warn"><span>${esc(sync.error || "Sync stopped")}</span><button class="link-btn" type="button" data-act="sync-start">Pick again</button></div>`;
  return `<button class="link-btn sync-start" type="button" data-act="sync-start">${icon("refresh")}Keep it in sync automatically</button>`;
}

document.addEventListener("click", e => {
  const a = e.target.closest("[data-act]")?.dataset.act;
  if (a === "sync-start") pickAndSync();
  else if (a === "sync-reconnect") reconnectSync();
  else if (a === "sync-stop") stopSync();
});
