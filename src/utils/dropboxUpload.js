const TOKEN_URL          = 'https://api.dropbox.com/oauth2/token';
const UPLOAD_URL         = 'https://content.dropboxapi.com/2/files/upload';
const SESSION_START_URL  = 'https://content.dropboxapi.com/2/files/upload_session/start';
const SESSION_APPEND_URL = 'https://content.dropboxapi.com/2/files/upload_session/append_v2';
const SESSION_FINISH_URL = 'https://content.dropboxapi.com/2/files/upload_session/finish';
const SHARE_URL          = 'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings';
const SHARE_LIST_URL     = 'https://api.dropboxapi.com/2/sharing/list_shared_links';

let cachedToken  = null;
let tokenExpiry  = 0;

const getAccessToken = async () => {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;
  console.log('[Dropbox] Refreshing access token…');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: process.env.REACT_APP_DROPBOX_REFRESH_TOKEN,
      client_id:     process.env.REACT_APP_DROPBOX_APP_KEY,
      client_secret: process.env.REACT_APP_DROPBOX_APP_SECRET,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[Dropbox] Token refresh failed:', res.status, body);
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }
  const data  = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  console.log('[Dropbox] Token obtained, expires in', data.expires_in, 's');
  return cachedToken;
};

// Upload a File object to Dropbox and return a permanent shared download link.
// destFolder e.g. "/WA! Network Asia CMS/Projects/PCS Batch 3/Documents"
export const uploadToDropbox = async (file, destFolder, onProgress) => {
  const token    = await getAccessToken();
  const safeName = file.name.replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '_');
  const destPath = `${destFolder}/${safeName}`;
  const CHUNK    = 8 * 1024 * 1024; // 8 MB

  if (file.size <= CHUNK) {
    onProgress?.(30);
    console.log('[Dropbox] Uploading', file.name, 'to', destPath);
    const res = await fetch(UPLOAD_URL, {
      method:  'POST',
      headers: {
        Authorization:    `Bearer ${token}`,
        'Content-Type':   'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: destPath, mode: 'add', autorename: true }),
      },
      body: file,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[Dropbox] Upload failed:', res.status, body);
      throw new Error(`Upload failed (${res.status}): ${body}`);
    }
    const result = await res.json();
    onProgress?.(70);
    return getShareLink(token, result.path_display);
  }

  // Chunked session upload for files > 8 MB
  const startRes = await fetch(SESSION_START_URL, {
    method:  'POST',
    headers: {
      Authorization:    `Bearer ${token}`,
      'Content-Type':   'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ close: false }),
    },
    body: file.slice(0, CHUNK),
  });
  if (!startRes.ok) throw new Error(`Session start failed: ${startRes.status}`);
  const { session_id } = await startRes.json();
  let offset = CHUNK;
  onProgress?.(Math.round((offset / file.size) * 60));

  while (offset + CHUNK < file.size) {
    const appendRes = await fetch(SESSION_APPEND_URL, {
      method:  'POST',
      headers: {
        Authorization:    `Bearer ${token}`,
        'Content-Type':   'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ cursor: { session_id, offset }, close: false }),
      },
      body: file.slice(offset, offset + CHUNK),
    });
    if (!appendRes.ok) throw new Error(`Session append failed: ${appendRes.status}`);
    offset += CHUNK;
    onProgress?.(Math.round((offset / file.size) * 60));
  }

  const finishRes = await fetch(SESSION_FINISH_URL, {
    method:  'POST',
    headers: {
      Authorization:    `Bearer ${token}`,
      'Content-Type':   'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        cursor: { session_id, offset },
        commit: { path: destPath, mode: 'add', autorename: true },
      }),
    },
    body: file.slice(offset),
  });
  if (!finishRes.ok) throw new Error(`Session finish failed: ${finishRes.status}`);
  const result = await finishRes.json();
  onProgress?.(70);
  return getShareLink(token, result.path_display);
};

const getShareLink = async (token, path) => {
  const res = await fetch(SHARE_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path, settings: { requested_visibility: 'public' } }),
  });
  if (res.ok) {
    const data = await res.json();
    return toDirectLink(data.url);
  }
  const err = await res.json();
  if (err?.error?.['.tag'] === 'shared_link_already_exists') {
    const listRes = await fetch(SHARE_LIST_URL, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path, direct_only: true }),
    });
    const list = await listRes.json();
    return toDirectLink(list.links[0].url);
  }
  throw new Error(`Share link failed: ${res.status}`);
};

const toDirectLink = (url) =>
  url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
