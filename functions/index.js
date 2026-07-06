const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');

initializeApp();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const DROPBOX_APP_KEY       = defineSecret('DROPBOX_APP_KEY');
const DROPBOX_APP_SECRET    = defineSecret('DROPBOX_APP_SECRET');
const DROPBOX_REFRESH_TOKEN = defineSecret('DROPBOX_REFRESH_TOKEN');

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
];

// ~10 MB binary ≈ 13.7 MB base64; callable payload limit is well above this.
const MAX_BASE64_CHARS = 14 * 1024 * 1024;

const PROMPTS = {
  mc: `You are reading a Singapore medical certificate (MC). It may be a photo of paper or a digital PDF.
Extract these fields. Use null when a value is not present or unreadable.
- clinic: name of the clinic/hospital that issued the MC
- dateFrom: first day of MC in YYYY-MM-DD
- dateTo: last day of MC in YYYY-MM-DD (same as dateFrom for a 1-day MC)
- days: total number of MC days as a number
- patientName: patient name as printed
- mcNumber: MC reference/serial number if printed
Dates on Singapore MCs are usually DD/MM/YYYY or "12 Mar 2026" style — convert carefully.`,
  receipt: `You are reading a receipt or invoice photo/PDF from Singapore.
Extract these fields. Use null when a value is not present or unreadable.
- vendor: shop/company name at the top of the receipt
- date: transaction date in YYYY-MM-DD (Singapore receipts usually print DD/MM/YYYY)
- amount: final total paid in SGD as a number (after GST; look for TOTAL, NETT or amount tendered)
- category: best guess, exactly one of: transport, meals, materials, tools, comms, other
- description: one short line describing what was bought`,
};

const SCHEMAS = {
  mc: {
    type: 'OBJECT',
    properties: {
      clinic:      { type: 'STRING', nullable: true },
      dateFrom:    { type: 'STRING', nullable: true },
      dateTo:      { type: 'STRING', nullable: true },
      days:        { type: 'NUMBER', nullable: true },
      patientName: { type: 'STRING', nullable: true },
      mcNumber:    { type: 'STRING', nullable: true },
    },
  },
  receipt: {
    type: 'OBJECT',
    properties: {
      vendor:      { type: 'STRING', nullable: true },
      date:        { type: 'STRING', nullable: true },
      amount:      { type: 'NUMBER', nullable: true },
      category:    { type: 'STRING', nullable: true },
      description: { type: 'STRING', nullable: true },
    },
  },
};

exports.extractDocument = onCall(
  {
    region: 'asia-southeast1',
    secrets: [GEMINI_API_KEY],
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const { data, mimeType, docType } = request.data ?? {};
    if (!data || typeof data !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing file data.');
    }
    if (data.length > MAX_BASE64_CHARS) {
      throw new HttpsError('invalid-argument', 'File too large (max 10 MB).');
    }
    if (!ALLOWED_MIME.includes(mimeType)) {
      throw new HttpsError('invalid-argument', `Unsupported file type: ${mimeType}`);
    }
    if (!PROMPTS[docType]) {
      throw new HttpsError('invalid-argument', 'docType must be "mc" or "receipt".');
    }

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data } },
          { text: PROMPTS[docType] },
        ],
      }],
      generationConfig: {
        temperature: 0,
        response_mime_type: 'application/json',
        response_schema: SCHEMAS[docType],
      },
    };

    let res;
    try {
      res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY.value(),
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('Gemini request failed:', err);
      throw new HttpsError('unavailable', 'OCR service unreachable.');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Gemini error', res.status, text.slice(0, 500));
      throw new HttpsError('internal', 'OCR service returned an error.');
    }

    const json = await res.json();
    const raw  = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      console.error('Gemini empty response', JSON.stringify(json).slice(0, 500));
      throw new HttpsError('internal', 'OCR returned no result.');
    }

    try {
      return JSON.parse(raw);
    } catch {
      console.error('Gemini non-JSON response:', raw.slice(0, 500));
      throw new HttpsError('internal', 'OCR returned an unreadable result.');
    }
  }
);

// ── Dropbox document upload ─────────────────────────────────────────────
// Moves Dropbox credentials server-side — the old client code shipped the
// app key/secret/refresh token in the CRA bundle (public to anyone).

const DROPBOX_TOKEN_URL      = 'https://api.dropbox.com/oauth2/token';
const DROPBOX_UPLOAD_URL     = 'https://content.dropboxapi.com/2/files/upload';
const DROPBOX_SHARE_URL      = 'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings';
const DROPBOX_SHARE_LIST_URL = 'https://api.dropboxapi.com/2/sharing/list_shared_links';

const getDropboxAccessToken = async () => {
  const res = await fetch(DROPBOX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: DROPBOX_REFRESH_TOKEN.value(),
      client_id:     DROPBOX_APP_KEY.value(),
      client_secret: DROPBOX_APP_SECRET.value(),
    }),
  });
  if (!res.ok) {
    console.error('[Dropbox] Token refresh failed:', res.status);
    throw new HttpsError('internal', 'Dropbox authentication failed.');
  }
  const data = await res.json();
  return data.access_token;
};

const toDirectLink = (url) =>
  url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');

const getDropboxShareLink = async (token, path) => {
  const res = await fetch(DROPBOX_SHARE_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path, settings: { requested_visibility: 'public' } }),
  });
  if (res.ok) {
    const data = await res.json();
    return toDirectLink(data.url);
  }
  const err = await res.json().catch(() => null);
  if (err?.error?.['.tag'] === 'shared_link_already_exists') {
    const listRes = await fetch(DROPBOX_SHARE_LIST_URL, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path, direct_only: true }),
    });
    if (!listRes.ok) {
      console.error('[Dropbox] Share link list failed:', listRes.status);
      throw new HttpsError('internal', 'Dropbox share link lookup failed.');
    }
    const list = await listRes.json();
    return toDirectLink(list.links[0].url);
  }
  console.error('[Dropbox] Share link failed:', res.status);
  throw new HttpsError('internal', 'Dropbox share link creation failed.');
};

exports.uploadProjectDocument = onCall(
  {
    region: 'asia-southeast1',
    secrets: [DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN],
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const { data, fileName, mimeType, folder } = request.data ?? {};
    if (!data || typeof data !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing file data.');
    }
    if (data.length > MAX_BASE64_CHARS) {
      throw new HttpsError('invalid-argument', 'File too large (max 10 MB).');
    }
    if (!fileName || typeof fileName !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing file name.');
    }
    if (!folder || typeof folder !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing destination folder.');
    }

    const safeName = fileName.replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '_');
    const destPath = `${folder}/${safeName}`;

    let token;
    try {
      token = await getDropboxAccessToken();
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[Dropbox] Token error:', err);
      throw new HttpsError('unavailable', 'Dropbox service unreachable.');
    }

    let uploadRes;
    try {
      uploadRes = await fetch(DROPBOX_UPLOAD_URL, {
        method:  'POST',
        headers: {
          Authorization:    `Bearer ${token}`,
          'Content-Type':   'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({ path: destPath, mode: 'add', autorename: true }),
        },
        body: Buffer.from(data, 'base64'),
      });
    } catch (err) {
      console.error('[Dropbox] Upload request failed:', err);
      throw new HttpsError('unavailable', 'Dropbox service unreachable.');
    }

    if (!uploadRes.ok) {
      const body = await uploadRes.text().catch(() => '');
      console.error('[Dropbox] Upload failed:', uploadRes.status, body.slice(0, 500));
      throw new HttpsError('internal', 'Dropbox upload failed.');
    }

    const result = await uploadRes.json();

    try {
      const url = await getDropboxShareLink(token, result.path_display);
      return { url };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[Dropbox] Share link error:', err);
      throw new HttpsError('internal', 'Dropbox share link creation failed.');
    }
  }
);
