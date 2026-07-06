import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the Cloud Function's MAX_BASE64_CHARS cap

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Upload a File object to Dropbox via the uploadProjectDocument Cloud
// Function and return a permanent direct-download link. Dropbox credentials
// live server-side only — this client never sees them.
// destFolder e.g. "/WA! Network Asia CMS/Projects/PCS Batch 3/Documents"
export const uploadToDropbox = async (file, destFolder, onProgress) => {
  if (file.size > MAX_FILE_BYTES) throw new Error('File too large (max 10 MB).');

  onProgress?.(10);
  const data = await fileToBase64(file);
  onProgress?.(60);

  const callable = httpsCallable(functions, 'uploadProjectDocument', { timeout: 120000 });
  const res = await callable({
    data,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    folder: destFolder,
  });
  onProgress?.(90);

  return res.data.url;
};
