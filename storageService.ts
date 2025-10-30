
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { AppState, Settings } from './types';

const DB_NAME = 'csv-ai-assistant-db';
const STORE_NAME = 'sessions';
const SESSION_KEY = 'current-session';
const SETTINGS_KEY = 'csv-ai-assistant-settings';

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

const defaultSettings: Settings = {
    apiKey: '',
    model: 'gemini-2.5-flash',
    language: 'English'
};

export const saveSettings = (settings: Settings): void => {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error('Failed to save settings to localStorage:', error);
    }
};

export const getSettings = (): Settings => {
    try {
        const settingsJson = localStorage.getItem(SETTINGS_KEY);
        if (settingsJson) {
            // Merge saved settings with defaults to ensure all keys are present
            return { ...defaultSettings, ...JSON.parse(settingsJson) };
        }
    } catch (error) {
        console.error('Failed to get settings from localStorage:', error);
    }
    return defaultSettings;
};