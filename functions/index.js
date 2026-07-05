const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');

initializeApp();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

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
