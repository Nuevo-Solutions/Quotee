export type ProductDocumentType = "INQUIRY" | "PRODUCT_LIST" | "OTHER";
export type ProductFileFormat = "PDF" | "XLSX" | "CSV" | "EML";

export type StoredProductRequest = {
  id: string;
  title: string;
  filename: string;
  format: ProductFileFormat;
  documentType: ProductDocumentType;
  updatedAt: string;
  itemCount: number;
  reviewCount: number;
  status: "uploaded";
  storage: "browser";
  sizeBytes: number;
  mimeType: string;
  createdAt: number;
};

type ProductDocumentRecord = StoredProductRequest & {
  blob: Blob;
};

const DATABASE_NAME = "inbox-to-quote-demo";
const DATABASE_VERSION = 1;
const STORE_NAME = "product-documents";
export const MAX_PRODUCT_FILE_SIZE = 20 * 1024 * 1024;

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("Ovaj browser ne podržava lokalno čuvanje fajlova."));
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(request.error ?? new Error("Nije moguće otvoriti lokalno skladište."));
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(new Error("Zatvorite druge demo kartice da biste otvorili lokalno skladište."));
      };
    });
  }

  return databasePromise;
}

function formatUpdatedAt(date: Date) {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFromFilename(filename: string): ProductFileFormat | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "pdf":
      return "PDF";
    case "xlsx":
      return "XLSX";
    case "csv":
      return "CSV";
    case "eml":
      return "EML";
    default:
      return null;
  }
}

function hasSignature(file: File, format: ProductFileFormat) {
  return file.slice(0, 8).arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);

    if (format === "PDF") {
      return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
    }

    if (format === "XLSX") {
      return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    }

    // CSV and EML are text formats. Reject a binary NUL prefix, but leave
    // decoding and parsing to a later, server-validated processing stage.
    return !bytes.includes(0);
  });
}

export async function validateProductUpload(file: File): Promise<string | null> {
  const format = formatFromFilename(file.name);
  if (!format) return "Podržani formati su PDF, XLSX, CSV i EML.";
  if (file.size === 0) return "Izabrani fajl je prazan.";
  if (file.size > MAX_PRODUCT_FILE_SIZE) {
    return "Fajl je veći od demo limita od 20 MB.";
  }

  try {
    if (!(await hasSignature(file, format))) {
      return `Sadržaj fajla ne izgleda kao ${format}. Izaberite ispravan fajl.`;
    }
  } catch {
    return "Nije moguće proveriti početak fajla u browseru.";
  }

  return null;
}

export async function saveProductDocument(
  file: File,
  documentType: ProductDocumentType,
): Promise<StoredProductRequest> {
  const validationError = await validateProductUpload(file);
  if (validationError) throw new Error(validationError);

  const database = await openDatabase();
  const createdAt = Date.now();
  const format = formatFromFilename(file.name);
  if (!format) throw new Error("Nepodržani format fajla.");

  const request: StoredProductRequest = {
    id: `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(),
    filename: file.name,
    format,
    documentType,
    updatedAt: `Danas, ${formatUpdatedAt(new Date(createdAt))}`,
    itemCount: 0,
    reviewCount: 0,
    status: "uploaded",
    storage: "browser",
    sizeBytes: file.size,
    mimeType: file.type || "application/octet-stream",
    createdAt,
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).add({ ...request, blob: file } satisfies ProductDocumentRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      const error = transaction.error;
      reject(
        error?.name === "QuotaExceededError"
          ? new Error("Nema dovoljno lokalnog prostora. Obrišite neke demo fajlove ili izaberite manji fajl.")
          : new Error("Fajl nije sačuvan u lokalnom browser skladištu."),
      );
    };
    transaction.onabort = () => reject(new Error("Čuvanje fajla je prekinuto."));
  });

  return request;
}

export async function listSavedProductDocuments(): Promise<StoredProductRequest[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll() as IDBRequest<ProductDocumentRecord[]>;

    request.onsuccess = () => {
      const records = request.result
        .map((record) => {
          const { blob, ...metadata } = record;
          void blob;
          return metadata;
        })
        .sort((left, right) => right.createdAt - left.createdAt);
      resolve(records);
    };
    request.onerror = () => reject(request.error ?? new Error("Sačuvani zahtevi nisu dostupni."));
  });
}

export async function getSavedProductFile(id: string): Promise<Blob | null> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id) as IDBRequest<ProductDocumentRecord | undefined>;

    request.onsuccess = () => resolve(request.result?.blob ?? null);
    request.onerror = () => reject(request.error ?? new Error("Sačuvani fajl nije dostupan."));
  });
}

export async function deleteSavedProductDocument(id: string): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Fajl nije obrisan."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Brisanje fajla je prekinuto."));
  });
}
