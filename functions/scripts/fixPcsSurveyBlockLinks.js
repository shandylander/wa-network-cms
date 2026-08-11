#!/usr/bin/env node
// Corrects the survey-report import done in importPcsSurveyDocs.js: those 55
// PDFs were added as generic project `documents` entries (Resources tab)
// instead of the block-level `surveyUrl` field that actually powers the
// per-block quick-link + in-app viewer. The files themselves are fine where
// they are (no re-upload needed) — this just points each block's
// `surveyUrl` at its already-uploaded file, then removes the now-redundant
// generic document record.
//
// Skips any block that already has a surveyUrl set (e.g. 180A/180B/180C/181,
// which had one from before this whole survey-report batch existed).
//
// Usage (from functions/ directory):
//   GOOGLE_APPLICATION_CREDENTIALS=<key path> node scripts/fixPcsSurveyBlockLinks.js            # dry run
//   GOOGLE_APPLICATION_CREDENTIALS=<key path> node scripts/fixPcsSurveyBlockLinks.js --apply     # writes for real

const path = require('path');

const APPLY = process.argv.includes('--apply');
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the service account key path.');
  process.exit(1);
}

const PROJECT_ID = 'pcs-batch-3';
const NAME_PREFIX = 'Survey Report - Blk ';

async function main() {
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');

  const app = initializeApp({ credential: cert(require(path.resolve(keyPath))) });
  const db = getFirestore(app);

  const [blocksSnap, docsSnap] = await Promise.all([
    db.collection('projects').doc(PROJECT_ID).collection('blocks').get(),
    db.collection('projects').doc(PROJECT_ID).collection('documents').get(),
  ]);

  const blockByNo = new Map();
  blocksSnap.forEach(d => blockByNo.set(String(d.data().no), { id: d.id, ...d.data() }));

  const surveyDocs = docsSnap.docs
    .filter(d => (d.data().name ?? '').startsWith(NAME_PREFIX))
    .map(d => ({ id: d.id, no: d.data().name.slice(NAME_PREFIX.length), url: d.data().url, name: d.data().name }));

  console.log(`Found ${surveyDocs.length} imported survey-report document(s) to reconcile.\n`);

  const toLink = [];
  const alreadyHadUrl = [];
  const noMatchingBlock = [];

  for (const doc of surveyDocs) {
    const block = blockByNo.get(doc.no);
    if (!block) { noMatchingBlock.push(doc); continue; }
    if (block.surveyUrl) { alreadyHadUrl.push({ ...doc, existingUrl: block.surveyUrl }); continue; }
    toLink.push({ ...doc, blockId: block.id });
  }

  if (noMatchingBlock.length) {
    console.log(`No matching block found for: ${noMatchingBlock.map(d => d.no).join(', ')}`);
  }
  if (alreadyHadUrl.length) {
    console.log(`Already has surveyUrl (leaving untouched, will still remove the duplicate doc): ${alreadyHadUrl.map(d => d.no).join(', ')}`);
  }
  console.log(`\nWill set block.surveyUrl for ${toLink.length} block(s):`);
  toLink.forEach(d => console.log(`  Blk ${d.no.padEnd(5)} -> ${d.url}`));

  const toDelete = [...toLink, ...alreadyHadUrl];
  console.log(`\nWill remove ${toDelete.length} redundant project document record(s) from Resources/Documents.`);

  if (!APPLY) {
    console.log('\nDry run only — no writes made. Re-run with --apply to perform the fix.');
    return;
  }

  for (const d of toLink) {
    await db.collection('projects').doc(PROJECT_ID).collection('blocks').doc(d.blockId)
      .update({ surveyUrl: d.url });
  }
  for (const d of toDelete) {
    await db.collection('projects').doc(PROJECT_ID).collection('documents').doc(d.id).delete();
  }

  console.log(`\nDone. Linked ${toLink.length} block(s), removed ${toDelete.length} duplicate document record(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
