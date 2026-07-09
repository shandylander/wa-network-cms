import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '../firebase';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches storage.rules

/* Downscale camera photos before upload/OCR — phone photos are often 4-12 MB;
   1600px JPEG is plenty for both audit viewing and OCR. PDFs pass through. */
export const compressImage = (file) =>
  new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) { resolve(file); return; }
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg', 0.82,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

/* Upload an MC or receipt to Firebase Storage; returns a download URL.
   kind: 'mc' | 'receipts' */
export const uploadWorkerDoc = async (file, kind, userId) => {
  if (file.size > MAX_FILE_BYTES) throw new Error('file-too-big');
  const safeName = file.name.replace(/[^\w.-]/g, '_');
  const path     = `${kind}/${userId}/${Date.now()}-${safeName}`;
  const fileRef  = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
  return getDownloadURL(fileRef);
};

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/* Send an MC / receipt to the extractDocument Cloud Function.
   docType: 'mc' | 'receipt'
   Returns e.g. { clinic, dateFrom, dateTo, days } or { vendor, date, amount, category }.
   Throws on failure — callers fall back to manual entry. */
export const extractDocument = async (file, docType) => {
  const data     = await fileToBase64(file);
  const callable = httpsCallable(functions, 'extractDocument', { timeout: 90000 });
  const res      = await callable({ data, mimeType: file.type || 'application/pdf', docType });
  return res.data;
};

/* SHA-256 hex digest of a file's raw bytes — used to spot the same receipt
   photo being submitted more than once. */
export const hashFile = async (file) => {
  const buf    = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

/* Ask the server whether this receipt (by file hash or, for manually-entered
   links, by URL) already belongs to another claim. The check has to run
   server-side since a caller can't read other users' claims directly. */
export const checkReceiptDuplicate = async ({ hash, url, excludeId } = {}) => {
  const callable = httpsCallable(functions, 'checkReceiptDuplicate', { timeout: 30000 });
  const res = await callable({ hash, url, excludeId: excludeId ?? null });
  return res.data;
};
