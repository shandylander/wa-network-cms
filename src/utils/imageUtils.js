// Downscale + re-encode a picked image so submissions stay small and EXIF
// orientation is baked into the pixels (~jpeg 0.85). Shared by any feature
// that lets a user pick/capture a photo (site photos, snag evidence, ...).
const MAX_DIM = 1600;

export async function fileToJpegBlob(file) {
  let bitmap;
  try {
    // createImageBitmap honours EXIF orientation, so portrait photos stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode failed'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bitmap.width, h = bitmap.height;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}
