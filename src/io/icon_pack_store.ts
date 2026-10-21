import type { ImportedPack } from './icon_pack';

/**
 * Imported icon packs live only in this browser (IndexedDB): vendor icons
 * are never uploaded anywhere. Only the icons placed in a diagram travel,
 * embedded in it.
 */

const DB_NAME = 'markasso-icon-packs';
const STORE = 'packs';
const VERSION = 1;

export class IconPackStoreError extends Error {
  override name = 'IconPackStoreError';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new IconPackStoreError('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new IconPackStoreError(
          request.error?.message ?? 'Could not open the icon pack store',
        ),
      );
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () =>
        reject(
          new IconPackStoreError(tx.error?.message ?? 'Icon pack store failed'),
        );
      tx.onabort = () =>
        reject(
          new IconPackStoreError(
            tx.error?.message ?? 'Icon pack store aborted (storage full?)',
          ),
        );
    });
  } finally {
    db.close();
  }
}

export async function listIconPacks(): Promise<ImportedPack[]> {
  const packs = await run<ImportedPack[]>('readonly', (s) => s.getAll());
  return packs.sort((a, b) => a.importedAt - b.importedAt);
}

export async function saveIconPack(pack: ImportedPack): Promise<void> {
  await run('readwrite', (s) => s.put(pack));
}

export async function deleteIconPack(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}
