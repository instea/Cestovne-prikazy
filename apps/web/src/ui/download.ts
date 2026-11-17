/**
 * Saves `blob` as `fileName` through a temporary object URL and a clicked
 * `<a download>` (NFR-07 export; the response came from an authenticated
 * fetch, so a plain link cannot be used).
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // After the click the browser holds its own reference to the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
