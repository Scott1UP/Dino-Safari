// The binder's storage: photos and which photo fills which slot, kept in IndexedDB on this device.
// This database belongs to Dino Safari alone; nothing is shared with any other game.

import type { PhotoSubject } from '../capture/capture';
import type { DinoId, PoseId } from '../data/dinos';

export interface Photo {
  id: string;
  takenAt: number;
  levelId: string;
  /** The real frame, unedited. */
  image: Blob;
  width: number;
  height: number;
  subject?: PhotoSubject;
  /** Other dinosaurs in the frame. */
  others: PhotoSubject[];
  points: number;
  /** 0 only when there is no subject. */
  stars: 0 | 1 | 2 | 3;
}

export const slotKey = (levelId: string, dino: DinoId, pose: PoseId) => `${levelId}:${dino}:${pose}`;

const NAME = 'dino-safari';
let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('photos', { keyPath: 'id' });
      request.result.createObjectStore('slots'); // slot key -> photo id
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

function run<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const request = work(tx);
    tx.oncomplete = () => resolve(request ? request.result : (undefined as T));
    tx.onerror = tx.onabort = () => reject(tx.error);
  }));
}

/** Asks the browser not to clear the binder when it is short of space. */
export function keepStorage() {
  void navigator.storage?.persist?.().catch(() => false);
}

/** Every filled slot in the binder: slot key -> photo. */
export async function loadBinder(): Promise<Map<string, Photo>> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['slots', 'photos']);
    const filled = new Map<string, Photo>();
    const slots = tx.objectStore('slots').openCursor();
    slots.onsuccess = () => {
      const cursor = slots.result;
      if (!cursor) return;
      const key = cursor.key as string;
      const photo = tx.objectStore('photos').get(cursor.value as string);
      photo.onsuccess = () => photo.result && filled.set(key, photo.result as Photo);
      cursor.continue();
    };
    tx.oncomplete = () => resolve(filled);
    tx.onerror = () => reject(tx.error);
  });
}

/** Puts a photo in a slot, throwing away the photo that was there. */
export function fillSlot(key: string, photo: Photo): Promise<void> {
  return run<void>(['slots', 'photos'], 'readwrite', (tx) => {
    const slots = tx.objectStore('slots'), photos = tx.objectStore('photos');
    const old = slots.get(key);
    old.onsuccess = () => {
      if (old.result && old.result !== photo.id) photos.delete(old.result as string);
      photos.put(photo);
      slots.put(photo.id, key);
    };
  });
}

/** Empties one level's binder: every slot of that level, and the photos in them. */
export function resetBinder(levelId: string): Promise<void> {
  return run<void>(['slots', 'photos'], 'readwrite', (tx) => {
    const slots = tx.objectStore('slots'), photos = tx.objectStore('photos');
    const walk = slots.openCursor();
    walk.onsuccess = () => {
      const cursor = walk.result;
      if (!cursor) return;
      if (String(cursor.key).startsWith(`${levelId}:`)) {
        photos.delete(cursor.value as string);
        cursor.delete();
      }
      cursor.continue();
    };
  });
}
