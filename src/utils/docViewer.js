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

// Renders a PDF inline via Google's viewer service rather than a raw
// iframe src. Plenty of mobile browsers don't reliably render a PDF
// natively inside an iframe (blank/stuck frame, no visible error) — this
// offloads rendering to a service that works consistently everywhere,
// instead of depending on the visiting browser's own PDF support.
export const pdfEmbedUrl = (url) => {
  if (!url) return '';
  // Google Drive already has a dedicated, reliably same-origin-embeddable
  // preview endpoint — no need to proxy it through the viewer below.
  if (url.includes('drive.google.com')) {
    return url.replace(/\/(view|edit)(\?|$)/, '/preview$2');
  }
  // Stored document URLs are relative paths (e.g. "/files/...") — Google's
  // viewer fetches the file server-side and needs a real absolute URL.
  const absolute = url.startsWith('/') ? `${window.location.origin}${url}` : url;
  const raw = /[?&]dl=[01]/.test(absolute) ? absolute.replace(/([?&])dl=[01]/, '$1raw=1') : absolute;
  return `https://docs.google.com/viewer?url=${encodeURIComponent(raw)}&embedded=true`;
};
