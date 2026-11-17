/**
 * Release an unread response body so undici frees its pooled socket now
 * instead of at garbage collection. Never throws.
 */
export async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // already consumed, locked or errored: nothing to release
  }
}
