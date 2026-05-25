/**
 * imageUtils.js
 *
 * Client-side image compression using Canvas.
 * Used for org logo uploads — keeps files small enough for DB storage.
 */

/**
 * Compress an image File to a JPEG base64 data URL.
 * Resizes so neither dimension exceeds maxDim while keeping aspect ratio.
 *
 * @param {File}   file     Image file from <input type="file">
 * @param {number} maxDim   Max width / height in px  (default 256)
 * @param {number} quality  JPEG quality 0–1          (default 0.85)
 * @returns {Promise<string>}  JPEG data URL ("data:image/jpeg;base64,…")
 */
export async function compressImageToBase64(file, maxDim = 256, quality = 0.85) {
    if (!file || !file.type.startsWith('image/')) {
        throw new Error('Selected file is not an image.');
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;

            img.onload = () => {
                const { naturalWidth: w, naturalHeight: h } = img;
                const ratio  = Math.min(maxDim / w, maxDim / h, 1); // never upscale
                const dstW   = Math.round(w * ratio);
                const dstH   = Math.round(h * ratio);

                const canvas = document.createElement('canvas');
                canvas.width  = dstW;
                canvas.height = dstH;

                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled  = true;
                ctx.imageSmoothingQuality  = 'high';
                ctx.drawImage(img, 0, 0, dstW, dstH);

                resolve(canvas.toDataURL('image/jpeg', quality));
            };

            img.onerror = () => reject(new Error('Could not decode image. Try a different file.'));
        };

        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
}

/** Return the approximate size in KB of a base64 data URL. */
export const base64SizeKB = (dataUrl = '') =>
    Math.round((dataUrl.length * 3) / 4 / 1024);
