/**
 * storageUpload.js
 *
 * Helpers for uploading incident evidence (photos, videos) to Firebase Storage
 * instead of storing them as base64 strings in Realtime Database.
 *
 * Storage path pattern:
 *   organizations/{orgId}/attachments/{collection}/{recordId}/{type}_{timestamp}.{ext}
 *
 * Backward compatibility:
 *   Old records store base64 data URLs (start with 'data:').
 *   New records store Firebase Storage download URLs (start with 'https://').
 *   All display components that use `src={field}` work for both automatically.
 *
 * Usage:
 *   import { uploadAttachment, compressImageToBlob, isStorageUrl } from '../../utils/storageUpload.js';
 *
 *   // Upload a photo:
 *   const blob = await compressImageToBlob(file);
 *   const url  = await uploadAttachment(orgId, 'incidents', recordId, blob, 'image', file.name);
 *
 *   // Check if a field value is a Storage URL (vs old base64):
 *   if (isStorageUrl(record.imageEvidence)) { ... }
 */

import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebase.js';

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

/**
 * Upload a file (Blob or File) to Firebase Storage and return its public
 * download URL.
 *
 * @param {string}      orgId       Organisation ID (path isolation)
 * @param {string}      collection  RTDB collection name, e.g. 'incidents'
 * @param {string}      recordId    RTDB record key (use a temp ID if not yet saved)
 * @param {Blob|File}   file        The file to upload
 * @param {'image'|'video'|'document'} [type='image']
 * @param {string}      [originalName='upload']   Original filename for extension detection
 * @returns {Promise<string>}  Firebase Storage download URL (https://)
 */
export const uploadAttachment = async (
    orgId,
    collection,
    recordId,
    file,
    type = 'image',
    originalName = 'upload'
) => {
    const ext = (originalName.split('.').pop() || (type === 'video' ? 'mp4' : 'jpg')).toLowerCase();
    const storagePath = `organizations/${orgId}/attachments/${collection}/${recordId}/${type}_${Date.now()}.${ext}`;

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
};
