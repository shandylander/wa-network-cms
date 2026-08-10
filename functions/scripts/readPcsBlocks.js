#!/usr/bin/env node
// Read-only: dumps current live pcs-batch-3 block survey/team status so we
// can cross-reference against new Dropbox survey reports before writing
// anything. Run from functions/ directory:
//   GOOGLE_APPLICATION_CREDENTIALS=<key path> node scripts/readPcsBlocks.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the service account key path.');
  process.exit(1);
}

initializeApp({ credential: cert(require(path.resolve(keyPath))) });
const db = getFirestore();

const TARGET_NOS = new Set([
  ...Array.from({ length: 13 }, (_, i) => String(101 + i)),          // 101-113
  ...Array.from({ length: 23 }, (_, i) => String(144 + i)),          // 144-166
  ...Array.from({ length: 8 },  (_, i) => String(172 + i)),          // 172-179
  ...Array.from({ length: 10 }, (_, i) => String(134 + i)),          // 134-143
  '180A', '180B', '180C', '181',
]);

(async () => {
  const projSnap = await db.collection('projects').where('name', '==', 'PCS Batch 3').get();
  if (projSnap.empty) {
    const all = await db.collection('projects').get();
    console.log('No project named exactly "PCS Batch 3". Projects found:');
    all.forEach(d => console.log(' -', d.id, JSON.stringify(d.data().name)));
    process.exit(1);
  }
  const projectDoc = projSnap.docs[0];
  console.log('Project doc id:', projectDoc.id, 'name:', projectDoc.data().name);

  const blocksSnap = await db.collection('projects').doc(projectDoc.id).collection('blocks').get();
  console.log('Total blocks:', blocksSnap.size);

  const matched = [];
  blocksSnap.forEach(d => {
    const b = d.data();
    if (TARGET_NOS.has(String(b.no))) matched.push({ id: d.id, ...b });
  });

  matched.sort((a, b) => String(a.no).localeCompare(String(b.no), undefined, { numeric: true }));
  console.log(`\nMatched ${matched.length} / ${TARGET_NOS.size} target blocks:\n`);
  matched.forEach(b => {
    console.log(`  ${String(b.no).padEnd(6)} street=${String(b.street ?? '').padEnd(22)} survey=${String(b.survey ?? '-').padEnd(6)} team=${String(b.team ?? '-').padEnd(10)} fix1=${b.fix1 ?? '-'} fix2=${b.fix2 ?? '-'} fix3=${b.fix3 ?? '-'} fix4=${b.fix4 ?? '-'}`);
  });

  const missing = [...TARGET_NOS].filter(no => !matched.some(b => String(b.no) === no));
  if (missing.length) {
    console.log('\nTarget block numbers with NO matching block doc:', missing.sort());
  }

  const docsSnap = await db.collection('projects').doc(projectDoc.id).collection('documents').get();
  console.log(`\nExisting documents on project: ${docsSnap.size}`);
  const surveyDocs = docsSnap.docs.filter(d => /survey/i.test(d.data().name ?? ''));
  console.log(`Existing documents with "survey" in the name: ${surveyDocs.length}`);
  surveyDocs.forEach(d => console.log('  -', d.data().name, '|', d.data().category, '|', d.data().url));
})().catch(err => { console.error(err); process.exit(1); });
