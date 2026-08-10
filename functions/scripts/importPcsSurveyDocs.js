#!/usr/bin/env node
// One-time import: attaches newly-completed PCS Batch 3 survey report PDFs
// (downloaded from the "C6 - WA Network" Dropbox account, source files
// live outside our own storage) to the project via the real app upload
// path — uploadProjectDocument Cloud Function -> self-hosted upload API ->
// documents record — same as a human clicking Resources > Documents > Add.
//
// Usage (from functions/ directory):
//   GOOGLE_APPLICATION_CREDENTIALS=<key path> node scripts/importPcsSurveyDocs.js            # dry run
//   GOOGLE_APPLICATION_CREDENTIALS=<key path> node scripts/importPcsSurveyDocs.js --apply     # writes for real
//
// Local PDFs expected at <mapping dir>/pcs-survey-pdfs/<blockNo>.pdf,
// mapping (block no -> original Dropbox filename) at
// <mapping dir>/pcs-survey-mapping.json (array of {no, path}).

const path = require('path');
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const MAPPING_DIR = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'C:/Users/Yandao/AppData/Local/Temp/claude/c--Users-Yandao-Documents-wa-network-cms/12ae8e48-2d20-49dd-8d7e-2ee8205fc817/scratchpad';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the service account key path.');
  process.exit(1);
}

const PROJECT_ID = 'pcs-batch-3';
const PROJECT_NAME = 'PCS Batch 3';
const UPLOADED_BY = 'ADMIN'; // live owner account (Andy Ng) — CLAUDE.md's WA001 seed id is stale
const FOLDER = `/WA! Network Asia CMS/Projects/${PROJECT_NAME}/Documents`;

const FIREBASE_CLIENT_CONFIG = {
  apiKey: 'AIzaSyBuQvrSt2yt1fktAKAaPpQwdrihLib78Jo',
  authDomain: 'wa-network-cms.firebaseapp.com',
  projectId: 'wa-network-cms',
};

const emptyAccess = () => ({ own: false, kvm: false, sree: false, habibur: false, alamin: false });

async function main() {
  const { initializeApp: initAdmin, cert } = require('firebase-admin/app');
  const { getAuth: getAdminAuth } = require('firebase-admin/auth');
  const { getFirestore, Timestamp } = require('firebase-admin/firestore');

  const adminApp = initAdmin({ credential: cert(require(path.resolve(keyPath))) });
  const adminAuth = getAdminAuth(adminApp);
  const db = getFirestore(adminApp);

  const mapping = JSON.parse(fs.readFileSync(path.join(MAPPING_DIR, 'pcs-survey-mapping.json'), 'utf8'));
  const pdfDir = path.join(MAPPING_DIR, 'pcs-survey-pdfs');

  // Confirm project + block existence, and that we're not double-adding.
  const existingDocsSnap = await db.collection('projects').doc(PROJECT_ID).collection('documents').get();
  const existingNames = new Set(existingDocsSnap.docs.map(d => d.data().name));

  const rows = mapping.map(({ no, path: dbxPath }) => {
    const origFileName = dbxPath.split('/').pop();
    const localPdf = path.join(pdfDir, `${no}.pdf`);
    const name = `Survey Report - Blk ${no}`;
    return {
      no,
      origFileName,
      localPdf,
      name,
      localExists: fs.existsSync(localPdf),
      alreadyImported: existingNames.has(name),
    };
  });

  console.log(`Mapping entries: ${rows.length}`);
  const missingLocal = rows.filter(r => !r.localExists);
  const alreadyDone = rows.filter(r => r.alreadyImported);
  const toImport = rows.filter(r => r.localExists && !r.alreadyImported);

  if (missingLocal.length) {
    console.log(`\nSkipping (no local PDF downloaded): ${missingLocal.map(r => r.no).join(', ')}`);
  }
  if (alreadyDone.length) {
    console.log(`\nSkipping (document already exists on project): ${alreadyDone.map(r => r.no).join(', ')}`);
  }
  console.log(`\nWill ${APPLY ? 'IMPORT' : 'DRY-RUN preview'} ${toImport.length} document(s):`);
  toImport.forEach(r => console.log(`  Blk ${r.no.padEnd(5)} <- ${r.origFileName}`));

  if (!APPLY) {
    console.log('\nDry run only — no writes made. Re-run with --apply to perform the import.');
    return;
  }
  if (!toImport.length) {
    console.log('\nNothing to import.');
    return;
  }

  // Client SDK (needed to invoke the callable Cloud Function as a real
  // signed-in user, exactly the path the app itself uses).
  const { initializeApp: initClient } = require('firebase/app');
  const { getAuth: getClientAuth, signInWithCustomToken } = require('firebase/auth');
  const { getFunctions, httpsCallable } = require('firebase/functions');

  const ownerUser = await adminAuth.getUserByEmail(`${UPLOADED_BY}@wanetwork.cms`);
  const customToken = await adminAuth.createCustomToken(ownerUser.uid);

  const clientApp = initClient(FIREBASE_CLIENT_CONFIG);
  const clientAuth = getClientAuth(clientApp);
  await signInWithCustomToken(clientAuth, customToken);
  const fns = getFunctions(clientApp, 'asia-southeast1');
  const uploadCallable = httpsCallable(fns, 'uploadProjectDocument', { timeout: 120000 });

  const results = [];
  for (const r of toImport) {
    try {
      const buf = fs.readFileSync(r.localPdf);
      const data = buf.toString('base64');
      const res = await uploadCallable({ data, fileName: r.origFileName, mimeType: 'application/pdf', folder: FOLDER });
      const url = res.data.url;

      const payload = {
        name: r.name,
        category: 'general',
        url,
        fileName: r.origFileName,
        fileSize: buf.length,
        access: emptyAccess(),
        uploadedAt: Timestamp.now(),
        uploadedBy: UPLOADED_BY,
      };
      await db.collection('projects').doc(PROJECT_ID).collection('documents').add(payload);
      console.log(`OK   Blk ${r.no}: ${url}`);
      results.push({ no: r.no, ok: true, url });
    } catch (err) {
      console.log(`FAIL Blk ${r.no}: ${err.message || err}`);
      results.push({ no: r.no, ok: false, error: String(err.message || err) });
    }
  }

  const failed = results.filter(x => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} imported OK`);
  if (failed.length) console.log('Failed:', failed.map(f => f.no).join(', '));
}

main().catch(err => { console.error(err); process.exit(1); });
