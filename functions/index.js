const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const REGION = 'asia-southeast1';

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
  do: `You are reading a delivery order (DO) photo/PDF for a construction materials supplier in Singapore.
Extract these fields. Use null when a value is not present or unreadable.
- doNo: the delivery order / DO number printed on the document
- supplier: the supplier/company name that issued the DO
- date: delivery/document date in YYYY-MM-DD (Singapore documents usually print DD/MM/YYYY)
- items: array of line items actually delivered, each with:
  - description: item name/description as printed
  - qty: quantity delivered as a number
  - unit: unit of measure if printed (e.g. pcs, m, roll, box, set, lot), else null
  - unitPrice: unit price in SGD if printed, else null
Only include rows that are actual delivered items, not headers or totals.`,
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
  do: {
    type: 'OBJECT',
    properties: {
      doNo:     { type: 'STRING', nullable: true },
      supplier: { type: 'STRING', nullable: true },
      date:     { type: 'STRING', nullable: true },
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            description: { type: 'STRING', nullable: true },
            qty:         { type: 'NUMBER', nullable: true },
            unit:        { type: 'STRING', nullable: true },
            unitPrice:   { type: 'NUMBER', nullable: true },
          },
        },
      },
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
      throw new HttpsError('invalid-argument', 'docType must be "mc", "receipt" or "do".');
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

// ── Petty cash duplicate-receipt check ──────────────────────────────────
// Runs server-side (admin SDK) because a claimant's own Firestore rules only
// let them read their own claims — this needs to see everyone's to catch a
// receipt someone else already claimed.
exports.checkReceiptDuplicate = onCall(
  {
    region: 'asia-southeast1',
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const { hash, url, excludeId } = request.data ?? {};
    const trimmedUrl = typeof url === 'string' ? url.trim() : '';
    const field = hash && typeof hash === 'string' ? 'receiptHash' : trimmedUrl ? 'receiptUrl' : null;
    const value = field === 'receiptHash' ? hash : trimmedUrl;
    if (!field) {
      throw new HttpsError('invalid-argument', 'Missing receipt hash or url.');
    }

    const db = getFirestore();
    const snap = await db.collection('pettyCashClaims').where(field, '==', value).get();
    // A rejected claim didn't consume the receipt — resubmission is fine.
    const match = snap.docs.find((d) => d.id !== excludeId && d.data().status !== 'rejected');
    if (!match) return { duplicate: false };
    return { duplicate: true, claimantName: match.data().name ?? 'another staff member' };
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

// ── Access Levels — effective-permission recomputation ──────────────────
// A user's effectivePermissions is the union of every assigned access
// level's permissions. It is denormalized onto the user doc so Firestore
// security rules can check it in O(1) (`p in me().effectivePermissions`)
// instead of resolving group membership inside rules, which the rules
// language can't do efficiently. This field is Cloud-Function-only —
// firestore.rules blocks every client write to it.

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function computeEffectivePermissions(accessLevelIds, levelsById) {
  const set = new Set();
  (accessLevelIds ?? []).forEach((id) => {
    const level = levelsById[id];
    if (!level) return; // dangling reference (deleted level) — contributes nothing
    (level.permissions ?? []).forEach((p) => set.add(p));
  });
  return [...set].sort();
}

async function loadLevelsById(db, ids) {
  const levelsById = {};
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  await Promise.all(uniqueIds.map(async (id) => {
    const snap = await db.collection('accessLevels').doc(id).get();
    if (snap.exists) levelsById[id] = snap.data();
  }));
  return levelsById;
}

async function loadAllLevels(db) {
  const snap = await db.collection('accessLevels').get();
  const levelsById = {};
  snap.docs.forEach((d) => { levelsById[d.id] = d.data(); });
  return levelsById;
}

// Recomputes one user's effectivePermissions when their own accessLevels
// (or role) changes. Guarded against retriggering on its own write: it
// only ever writes effectivePermissions, which isn't a watched field, so
// the second invocation sees no change and returns immediately.
exports.recomputeUserPermissions = onDocumentWritten(
  { document: 'users/{userId}', region: REGION, memory: '256MiB', timeoutSeconds: 60 },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // user deleted

    const beforeData = event.data?.before?.exists ? event.data.before.data() : {};
    const afterData  = after.data();

    const beforeLevels = (beforeData.accessLevels ?? []).slice().sort();
    const afterLevels  = (afterData.accessLevels ?? []).slice().sort();
    if (arraysEqual(beforeLevels, afterLevels)) return; // loop guard

    const db = getFirestore();
    const levelsById = await loadLevelsById(db, afterLevels);
    const computed = computeEffectivePermissions(afterLevels, levelsById);
    const current  = (afterData.effectivePermissions ?? []).slice().sort();
    if (arraysEqual(computed, current)) return;

    await after.ref.update({
      effectivePermissions: computed,
      effectivePermissionsComputedAt: FieldValue.serverTimestamp(),
    });
  }
);

// Fans out to every user assigned to a level when that level's permission
// list changes (or the level is deleted), so nobody's access silently goes
// stale. Loads the whole accessLevels collection once and reuses it across
// every affected user rather than re-resolving per user.
exports.recomputeLevelMemberPermissions = onDocumentWritten(
  { document: 'accessLevels/{levelId}', region: REGION, memory: '256MiB', timeoutSeconds: 120 },
  async (event) => {
    const levelId = event.params.levelId;
    const after = event.data?.after;
    const beforeData = event.data?.before?.exists ? event.data.before.data() : {};
    const afterData  = after?.exists ? after.data() : null;
    const deleted = !afterData;

    const beforePerms = (beforeData.permissions ?? []).slice().sort();
    const afterPerms  = (afterData?.permissions ?? []).slice().sort();
    if (!deleted && arraysEqual(beforePerms, afterPerms)) return; // cosmetic-only edit (label/color)

    const db = getFirestore();
    const usersSnap = await db.collection('users')
      .where('accessLevels', 'array-contains', levelId)
      .get();
    if (usersSnap.empty) return;

    const levelsById = await loadAllLevels(db);

    const docs = usersSnap.docs;
    for (let i = 0; i < docs.length; i += 500) {
      const batch = db.batch();
      docs.slice(i, i + 500).forEach((userDoc) => {
        const userData = userDoc.data();
        let accessLevels = userData.accessLevels ?? [];
        if (deleted) accessLevels = accessLevels.filter((id) => id !== levelId); // strip dangling ref
        const computed = computeEffectivePermissions(accessLevels, levelsById);
        batch.update(userDoc.ref, {
          ...(deleted ? { accessLevels } : {}),
          effectivePermissions: computed,
          effectivePermissionsComputedAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }
  }
);

// Hourly safety net: unconditionally recomputes every user. Covers the
// narrow race window between two near-simultaneous edits (e.g. a user's
// level assignment and that level's permission list changing at the same
// moment) and catches any invocation that silently failed above.
exports.reconcileAllPermissions = onSchedule(
  { schedule: 'every 60 minutes', region: REGION, memory: '256MiB', timeoutSeconds: 120 },
  async () => {
    const db = getFirestore();
    const [usersSnap, levelsById] = await Promise.all([
      db.collection('users').get(),
      loadAllLevels(db),
    ]);

    const docs = usersSnap.docs;
    for (let i = 0; i < docs.length; i += 500) {
      const batch = db.batch();
      let anyChange = false;
      docs.slice(i, i + 500).forEach((userDoc) => {
        const userData = userDoc.data();
        const computed = computeEffectivePermissions(userData.accessLevels, levelsById);
        const current  = (userData.effectivePermissions ?? []).slice().sort();
        if (!arraysEqual(computed, current)) {
          anyChange = true;
          batch.update(userDoc.ref, {
            effectivePermissions: computed,
            effectivePermissionsComputedAt: FieldValue.serverTimestamp(),
          });
        }
      });
      if (anyChange) await batch.commit();
    }
  }
);

// ── Push notifications ──────────────────────────────────────────────────

const LEAVE_TYPE_LABEL = { AL: 'Annual Leave', MC: 'Medical Leave', NPL: 'No-Pay Leave', OIL: 'Off-in-Lieu' };

// Sends one push to every device token belonging to the given user ids, and
// prunes any token Firebase reports as dead so the list doesn't grow stale
// forever. Silently no-ops if nobody has a token yet (e.g. before anyone has
// opted in on their device) — this is a best-effort channel, never load-
// bearing the way the in-app announcement/alert system already is.
async function sendPushToUserIds(db, userIds, { title, body, link, tag }) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (!uniqueIds.length) return;

  const userDocs = await db.getAll(...uniqueIds.map((id) => db.collection('users').doc(id)));
  const tokenOwners = [];
  userDocs.forEach((snap) => {
    if (!snap.exists) return;
    (snap.data().fcmTokens ?? []).forEach((token) => tokenOwners.push({ token, userId: snap.id }));
  });
  if (!tokenOwners.length) return;

  let response;
  try {
    response = await getMessaging().sendEachForMulticast({
      tokens: tokenOwners.map((t) => t.token),
      notification: { title, body },
      data: { link: link ?? '/', ...(tag ? { tag } : {}) },
      webpush: { fcmOptions: { link: link ?? '/' } },
    });
  } catch (err) {
    console.error('Push send failed:', err);
    return;
  }

  const staleTokensByUser = {};
  response.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
      const { token, userId } = tokenOwners[i];
      (staleTokensByUser[userId] ??= []).push(token);
    }
  });
  await Promise.all(
    Object.entries(staleTokensByUser).map(([userId, tokens]) =>
      db.collection('users').doc(userId).update({ fcmTokens: FieldValue.arrayRemove(...tokens) })
    )
  );
}

// Same recipient set as the existing in-app management-alerts system
// (cert expiry, incidents, permits) — owner/manager/supervisor by default,
// but driven by the real Access Levels permission, not a hardcoded role list.
async function managementRecipientIds(db) {
  const snap = await db.collection('users')
    .where('effectivePermissions', 'array-contains', 'view:management-alerts')
    .get();
  return snap.docs.map((d) => d.id);
}

exports.notifyOnLeaveApplication = onDocumentCreated(
  { document: 'leaveApplications/{id}', region: REGION, memory: '256MiB', timeoutSeconds: 30 },
  async (event) => {
    const app = event.data?.data();
    if (!app) return;
    const db = getFirestore();
    const recipients = await managementRecipientIds(db);
    const typeLabel = LEAVE_TYPE_LABEL[app.type] ?? app.type;
    await sendPushToUserIds(db, recipients, {
      title: 'New Leave Application',
      body: `${app.name} — ${typeLabel}, ${app.days} day${app.days !== 1 ? 's' : ''}`,
      link: '/leave',
      tag: 'leave-new',
    });
  }
);

exports.notifyOnPettyCashClaim = onDocumentCreated(
  { document: 'pettyCashClaims/{id}', region: REGION, memory: '256MiB', timeoutSeconds: 30 },
  async (event) => {
    const claim = event.data?.data();
    if (!claim) return;
    const db = getFirestore();
    const recipients = await managementRecipientIds(db);
    await sendPushToUserIds(db, recipients, {
      title: 'New Petty Cash Claim',
      body: `${claim.name} — $${Number(claim.amount ?? 0).toFixed(2)} (${claim.description ?? claim.category ?? 'claim'})`,
      link: '/petty-cash',
      tag: 'pettycash-new',
    });
  }
);

exports.notifyOnIncidentReport = onDocumentCreated(
  { document: 'projects/{projectId}/incidents/{incidentId}', region: REGION, memory: '256MiB', timeoutSeconds: 30 },
  async (event) => {
    const inc = event.data?.data();
    if (!inc) return;
    const db = getFirestore();
    const [recipients, projSnap] = await Promise.all([
      managementRecipientIds(db),
      db.collection('projects').doc(event.params.projectId).get(),
    ]);
    const projectName = projSnap.exists ? (projSnap.data().name ?? 'Project') : 'Project';
    await sendPushToUserIds(db, recipients, {
      title: 'Incident Reported',
      body: `${projectName}: ${inc.type ?? 'Incident'}${inc.severity ? ` (${inc.severity})` : ''}`,
      link: `/projects/${event.params.projectId}`,
      tag: 'incident-new',
    });
  }
);

// Team-key audiences (kvm/sree/habibur/alamin/own) map 1:1 to the users.team
// field. 'all' and 'management' are resolved separately below.
async function announcementRecipientIds(db, audience, excludeUserId) {
  let ids;
  if (audience === 'management') {
    ids = await managementRecipientIds(db);
  } else {
    let q = db.collection('users').where('status', '==', 'active');
    if (audience && audience !== 'all') q = q.where('team', '==', audience);
    const snap = await q.get();
    ids = snap.docs.map((d) => d.id);
  }
  return ids.filter((id) => id !== excludeUserId);
}

const SEVERITY_TITLE = { critical: '⚠ Safety Alert', warning: 'Warning Bulletin', info: 'New Bulletin' };

// System notifications (leave/petty-cash submissions posted into this same
// collection to reach management via the in-app bell) already get their own
// push from notifyOnLeaveApplication/notifyOnPettyCashClaim — skip those here
// so they don't fire twice.
exports.notifyOnAnnouncement = onDocumentCreated(
  { document: 'announcements/{id}', region: REGION, memory: '256MiB', timeoutSeconds: 30 },
  async (event) => {
    const ann = event.data?.data();
    if (!ann || ann.isSystemNotification) return;
    const db = getFirestore();
    const recipients = await announcementRecipientIds(db, ann.audience ?? 'all', ann.createdBy);
    await sendPushToUserIds(db, recipients, {
      title: SEVERITY_TITLE[ann.severity] ?? SEVERITY_TITLE.info,
      body: ann.message,
      link: '/announcements',
      tag: 'announcement-new',
    });
  }
);

exports.notifyOnLeaveDecision = onDocumentUpdated(
  { document: 'leaveApplications/{id}', region: REGION, memory: '256MiB', timeoutSeconds: 30 },
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();
    if (!before || !after || !after.userId) return;
    if (before.status === after.status) return;
    if (after.status !== 'approved' && after.status !== 'rejected') return;

    const db = getFirestore();
    const typeLabel = LEAVE_TYPE_LABEL[after.type] ?? after.type;
    const decided = after.status === 'approved' ? 'Approved' : 'Rejected';
    await sendPushToUserIds(db, [after.userId], {
      title: `Leave ${decided}`,
      body: `${typeLabel}, ${after.days} day${after.days !== 1 ? 's' : ''}`
        + (after.status === 'rejected' && after.rejectionReason ? ` — ${after.rejectionReason}` : ''),
      link: '/leave',
      tag: 'leave-decision',
    });
  }
);

exports.notifyOnPettyCashDecision = onDocumentUpdated(
  { document: 'pettyCashClaims/{id}', region: REGION, memory: '256MiB', timeoutSeconds: 30 },
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();
    if (!before || !after || !after.userId) return;
    if (before.status === after.status) return;
    if (after.status !== 'approved' && after.status !== 'rejected') return;

    const db = getFirestore();
    const decided = after.status === 'approved' ? 'Approved' : 'Rejected';
    await sendPushToUserIds(db, [after.userId], {
      title: `Petty Cash ${decided}`,
      body: `$${Number(after.amount ?? 0).toFixed(2)}`
        + (after.status === 'rejected' && after.rejectionReason ? ` — ${after.rejectionReason}` : ''),
      link: '/petty-cash',
      tag: 'pettycash-decision',
    });
  }
);
