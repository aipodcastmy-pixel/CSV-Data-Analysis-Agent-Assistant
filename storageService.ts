
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { AppState } from './types';

const DB_NAME = 'csv-ai-assistant-db';
const STORE_NAME = 'sessions';
const SESSION_KEY = 'current-session';

interface MyDB extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: AppState;
  };
}

let dbPromise: Promise<IDBPDatabase<MyDB>>;

const getDb = (): Promise<IDBPDatabase<MyDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<MyDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return dbPromise;
};

export const saveSession = async (state: AppState): Promise<void> => {
  try {
    const db = await getDb();
    await db.put(STORE_NAME, state, SESSION_KEY);
  } catch (error) {
    console.error('Failed to save session to IndexedDB:', error);
  }
};

export const getSession = async (): Promise<AppState | undefined> => {
  try {
    const db = await getDb();
    return await db.get(STORE_NAME, SESSION_KEY);
  } catch (error) {
    console.error('Failed to get session from IndexedDB:', error);
    return undefined;
  }
};

export const clearSession = async (): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, SESSION_KEY);
  } catch (error) {
    console.error('Failed to clear session from IndexedDB:', error);
  }
};
