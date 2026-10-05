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
}
