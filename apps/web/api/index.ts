export type DocumentWorkflow = "PRODUCT_QUOTE" | "TECHNICAL_QUOTE";
export type DocumentType = "INQUIRY" | "PRODUCT_LIST" | "BOQ" | "OTHER";
export type DocumentFormat = "PDF" | "XLSX" | "CSV" | "EML";

export type StoredDocument = {
  id: string;
  document_type: DocumentType;
  workflow: DocumentWorkflow | null;
  original_filename: string;
  format: DocumentFormat;
  status: "UPLOADED" | "PROCESSING" | "NEEDS_REVIEW" | "FAILED" | "UNSUPPORTED_INPUT";
  size_bytes: number;
  mime_type: string;
  sha256: string;
  created_at: string;
};

export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? "Zahtev nije uspeo. Pokušajte ponovo.");
  }

  return response.json() as Promise<T>;
}

export function validateDocumentFile(
  file: File,
  acceptedFormats: readonly DocumentFormat[],
): string | null {
  const extension = file.name.split(".").pop()?.toUpperCase();

  if (!extension || !acceptedFormats.includes(extension as DocumentFormat)) {
    return `Podržani formati su ${acceptedFormats.join(", ")}.`;
  }
  if (file.size === 0) return "Izabrani fajl je prazan.";
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) return "Fajl je veći od dozvoljenih 20 MB.";

  return null;
}

export async function listDocuments(workflow: DocumentWorkflow): Promise<StoredDocument[]> {
  const query = new URLSearchParams({ workflow });
  const response = await fetch(`/api/documents?${query}`, { cache: "no-store" });
  return readResponse<StoredDocument[]>(response);
}

export async function uploadDocument(
  file: File,
  documentType: DocumentType,
  workflow: DocumentWorkflow,
): Promise<StoredDocument> {
  const formData = new FormData();
  formData.set("file", file, file.name);
  formData.set("document_type", documentType);
  formData.set("workflow", workflow);

  const response = await fetch("/api/documents", {
    method: "POST",
    body: formData,
  });
  return readResponse<StoredDocument>(response);
}