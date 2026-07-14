// Best-effort file-type sniff from a filename or URL (query string stripped)
// so the in-app viewer knows how to render a document.
const extOf = (name) => {
  const clean = (name || '').split('?')[0].split('#')[0];
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
};

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);

export const docKind = (name, url) => {
  const ext = extOf(name) || extOf(url);
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXT.has(ext)) return 'image';
  return 'other';
};

// Dropbox share links carry dl=1 (force download) or dl=0 (Dropbox's own
// preview page) — neither renders cleanly inside an <iframe>/<img>. raw=1
// serves the same file inline instead, which an in-app viewer needs. Links
// this app generates itself (uploadProjectDocument) already use the
// dl.dropboxusercontent.com host with no dl param, so this is a no-op for
// those — it only matters for the legacy dl=1 seed links (HSE forms etc).
export const viewableUrl = (url) => {
  if (!url || !url.includes('dropbox')) return url;
  return url.replace(/([?&])dl=[01]/, '$1raw=1');
};
