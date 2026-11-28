/** Tab-scoped fallback only: never claims that a clinical record was saved remotely. */
export const CLINICAL_DRAFT_TTL = 8 * 60 * 60 * 1000;
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function canCloseClinicalDraft(remoteSaved: boolean, tabBackupConfirmed: boolean, emptyUnlinked: boolean): boolean {
  return remoteSaved || tabBackupConfirmed || emptyUnlinked;
}
export function clinicalDraftKey(userId: string, unitId: string) {
  return `clinical-close-draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(unitId)}`;
}
export function storeClinicalDraft<T>(storage: DraftStorage, key: string, draft: T, now = Date.now()): boolean {
  try {
    const value = JSON.stringify({ version: 1, expires: now + CLINICAL_DRAFT_TTL, draft });
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch { return false; }
}
export function readClinicalDraft<T>(storage: DraftStorage, key: string, now = Date.now()): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Number.isFinite(value.expires) || value.expires <= now) {
      storage.removeItem(key);
      return null;
    }
    return value.draft ?? null;
  } catch { return null; }
}
/** Successful saves may only remove the fallback of the same editor. */
export function clearClinicalDraft(storage: DraftStorage, key: string) {
  try { storage.removeItem(key); } catch { /* unavailable storage must not break the editor */ }
}