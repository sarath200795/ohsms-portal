/**
 * storageUpload.js
 *
 * Helpers for persisting incident evidence (photos, videos).
 *
 * NOTE: This module previously uploaded to Firebase Storage, but Firebase
 * Storage requires a one-time "Get Started" click in the Firebase Console
 * before any bucket exists.  Until that gate is cleared this module falls
 * back to embedding the file as a base64 data URL directly in the RTDB
 * record (the original pre-Storage behaviour).
 *
 * Trade-offs of the base64 path:
 *   • RTDB nodes have a 10 MB limit; base64 inflates payloads by ~33 %.
 *   • Every record fetch loads its attachments — slower lists for many
 *     records with large photos.
 *   • Large videos (> ~7 MB raw) will fail the RTDB write.
 *
 * When you're ready to migrate to Storage:
 *   1. Open https://console.firebase.google.com/project/<id>/storage
 *      and click "Get Started" to create the bucket.
 *   2. Run  npm run firebase:rules:storage  to deploy storage.rules.
 *   3. Restore the Firebase SDK upload code (see git history of this file).
 *
 * Backward compatibility:
 *   Old records may store https:// Firebase Storage download URLs.  Display
 *   components that use `src={field}` work for both `data:` and `https://`
 *   forms transparently.
 */

// ── Type guards ───────────────────────────────────────────────────────────────

/** Returns true if the value is a Firebase Storage https:// download URL. */
export const isStorageUrl = (value) =>
    typeof value === 'string' && value.startsWith('https://');

/** Returns true if the value is a legacy base64 data URL. */
export const isBase64 = (value) =>
    typeof value === 'string' && value.startsWith('data:');

// ── Image compression → Blob ──────────────────────────────────────────────────

/**
 * Compress an image File to a Blob (JPEG) at the given max dimension and quality.
 * Returns the original file as-is if it is not a recognisable image type.
 *
 * Unlike the existing `compressImage()` in FullScreenIncidents which returns a
 * data URL, this returns a Blob suitable for `uploadBytes()`.
 *
 * @param {File}   file
 * @param {number} [maxDim=1600]
 * @param {number} [quality=0.82]
 * @returns {Promise<Blob>}
 */
export const compressImageToBlob = (file, maxDim = 1600, quality = 0.82) =>
    new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
            resolve(file); // non-image: pass through unchanged
            return;
        }

        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => resolve(blob || file),
                'image/jpeg',
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file); // compression failed: upload original
        };

        img.src = objectUrl;
    });

// ── Upload ────────────────────────────────────────────────────────────────────

// Hard size cap for a single attachment (raw bytes BEFORE base64 inflation).
// RTDB has a 10 MB node-size limit and base64 adds ~33 %, so anything over
// ~7 MB raw is almost certain to be rejected by the write.  We surface a
// clear, actionable error before we even attempt the write.
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

/**
 * Convert a file/blob to a base64 data URL.
 * @param {Blob|File} blob
 * @returns {Promise<string>}  data:... URL
 */
const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file (base64 conversion)'));
        reader.readAsDataURL(blob);
    });

/**
 * Persist an attachment.  Returns a `data:` URL ready to embed directly in
 * the parent RTDB record.
 *
 * The Storage-bound arguments (`orgId`, `collection`, `recordId`, `type`,
 * `originalName`) are kept on the signature so callers don't have to change
 * once Firebase Storage is enabled and this falls back to producing real
 * download URLs again.
 *
 * @param {string}      _orgId
 * @param {string}      _collection
 * @param {string}      _recordId
 * @param {Blob|File}   file
 * @param {'image'|'video'|'document'} [_type='image']
 * @param {string}      [_originalName='upload']
 * @returns {Promise<string>}  data:... URL
 */
export const uploadAttachment = async (
    _orgId,
    _collection,
    _recordId,
    file,
    _type = 'image',
    _originalName = 'upload'
) => {
    const size = file?.size ?? 0;
    if (size > MAX_ATTACHMENT_BYTES) {
        const mb = (size / (1024 * 1024)).toFixed(1);
        throw new Error(
            `File too large (${mb} MB). The maximum size that fits in the database ` +
            `record is 7 MB. Please compress the file or enable Firebase Storage ` +
            `(see src/utils/storageUpload.js for instructions).`
        );
    }
    return blobToDataUrl(file);
};
