/**
 * Thumbnails of cloud boards for the Boards panel (issue #100). They live only
 * in this browser (IndexedDB: localStorage is too small for images) and are
 * a cache: a missing or failed thumbnail just shows a placeholder.
 */

const DB_NAME = 'markasso-cloud-thumbs';
const STORE = 'thumbs';
const VERSION = 1;

interface ThumbRecord {
  id: string;
  blob: Blob;
  /** Epoch ms the thumbnail was rendered. */
  at: number;
}

export class ThumbStoreError extends Error {
  override name = 'ThumbStoreError';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new ThumbStoreError('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new ThumbStoreError(
          request.error?.message ?? 'Could not open the thumbnail store',
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
          new ThumbStoreError(tx.error?.message ?? 'Thumbnail store failed'),
        );
      tx.onabort = () =>
        reject(
          new ThumbStoreError(
            tx.error?.message ?? 'Thumbnail store aborted (storage full?)',
          ),
        );
    });
  } finally {
    db.close();
  }
}

export async function saveThumb(id: string, blob: Blob): Promise<void> {
  await run('readwrite', (s) =>
    s.put({ id, blob, at: Date.now() } satisfies ThumbRecord),
  );
}

/** The stored thumbnail of a board, or null when there is none. */
export async function loadThumb(id: string): Promise<Blob | null> {
  const record = await run<ThumbRecord | undefined>('readonly', (s) =>
    s.get(id),
  );
  return record?.blob ?? null;
}

export async function deleteThumb(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}
