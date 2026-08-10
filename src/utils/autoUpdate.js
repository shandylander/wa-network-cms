// ============================================
//   WA! NETWORK ASIA CMS — AUTO UPDATE CHECK
//   src/utils/autoUpdate.js
//
//   Browser tabs can stay open for days without ever re-fetching
//   index.html, so a new deploy never reaches them on its own. This
//   polls the build's own asset-manifest.json (which CRA regenerates
//   with a new content hash on every build) and reloads the page the
//   moment it detects the deployed build has changed.
// ============================================

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

async function fetchMainJsHash() {
  const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.files && data.files['main.js'];
}

export function startAutoUpdateCheck() {
  let knownHash = null;

  fetchMainJsHash().then((hash) => { knownHash = hash; });

  const interval = setInterval(async function() {
    const latestHash = await fetchMainJsHash();
    if (!latestHash || !knownHash) return;
    if (latestHash !== knownHash) {
      console.log('New app version detected — reloading.');
      window.location.reload();
    }
  }, CHECK_INTERVAL_MS);

  return function stop() { clearInterval(interval); };
}
