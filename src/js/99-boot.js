/* Boot */
applyModRecipes();
renderSaveCard();
renderClock();
renderSpoilerBtn();
renderView();
resumeSync();

// installable app when hosted (the site build adds a manifest; the single offline file doesn't)
if (location.protocol.startsWith("http") && "serviceWorker" in navigator && document.querySelector('link[rel="manifest"]')) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("service worker", e)));
  // a new deploy's worker took over a page the old one served: reload once to show the new version.
  // Only on updates (a controller already existed), so the first install never reloads.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
}
