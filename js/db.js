const DB_NAME = "BBM_MID_DB";
const DB_VERSION = 1;

export async function openDB() {
  return new Promise((resolve, reject) => {

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {

      const db = e.target.result;

      if (!db.objectStoreNames.contains("fuel")) {
        db.createObjectStore("fuel", {
          keyPath: "id",
          autoIncrement: true
        });
      }

      if (!db.objectStoreNames.contains("service")) {
        db.createObjectStore("service", {
          keyPath: "id",
          autoIncrement: true
        });
      }

      if (!db.objectStoreNames.contains("trip")) {
        db.createObjectStore("trip", {
          keyPath: "id",
          autoIncrement: true
        });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", {
          keyPath: "key"
        });
      }

    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;

  });
}
