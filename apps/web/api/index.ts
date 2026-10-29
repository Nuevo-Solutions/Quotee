import Papa from "papaparse";

export type DocumentWorkflow = "PRODUCT_QUOTE" | "TECHNICAL_QUOTE";
export type DocumentType = "INQUIRY" | "PRODUCT_LIST" | "BOQ" | "OTHER";
export type DocumentFormat = "PDF" | "XLSX" | "CSV" | "EML";
export type CatalogField = "sku" | "name" | "unit" | "price" | "currency" | "vat_rate" | "aliases" | "active";

export type ParsedCatalogSheet = {
  name: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
};

export type CatalogColumnMapping = Record<CatalogField, string>;

export type CatalogImport = {
  id: string;
  version: number;
  status: string;
  original_filename: string;
  sheet_name: string | null;
  checksum: string;
  products_imported: number;
  aliases_imported: number;
  created_at: string;
};

export type CatalogImportSummary = {
  id: string;
  version: number;
  status: string;
  checksum: string | null;
  products_imported: number;
  aliases_imported: number;
  created_at: string;
};

export const CATALOG_FIELD_OPTIONS: {
  value: CatalogField;
  label: string;
  required: boolean;
}[] = [
  { value: "sku", label: "SKU / šifra", required: true },
  { value: "name", label: "Naziv proizvoda", required: true },
  { value: "unit", label: "Jedinica mere", required: true },
  { value: "price", label: "Cena", required: false },
  { value: "currency", label: "Valuta", required: false },
  { value: "vat_rate", label: "PDV stopa", required: false },
  { value: "aliases", label: "Alternativni nazivi", required: false },
  { value: "active", label: "Aktivan", required: false },
];

export type StoredDocument = {
  id: string;
  document_type: DocumentType;
  workflow: DocumentWorkflow | null;
  original_filename: string;
  format: DocumentFormat;
  status: "UPLOADED" | "PROCESSING" | "MAPPING_REQUIRED" | "NEEDS_REVIEW" | "FAILED" | "UNSUPPORTED_INPUT";
  size_bytes: number;
  mime_type: string;
  sha256: string;
  created_at: string;
};

export type ProcessingJob = {
  id: string;
  document_id: string;
  job_type: DocumentWorkflow | null;
  catalog_import_id: string | null;
  status: StoredDocument["status"];
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  result_count: number;
  mapping_headers: string[] | null;
  mapping_suggestion: ProductColumnMapping | null;
  column_mapping: ProductColumnMapping | null;
  llm_input_tokens: number;
  llm_output_tokens: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type ProductColumnMapping = {
  position: number | null;
  sku: number | null;
  description: number | null;
  quantity: number | null;
  unit: number | null;
};

export type MatchCandidate = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  price: string | null;
  currency: string | null;
  rank: number;
  evidence: Record<string, unknown>;
};

export type DocumentPositionResult = {
  id: string;
  position_code: string | null;
  sort_order: number;
  raw_description: string;
  original_quantity: string | null;
  original_unit: string | null;
  extraction_status: "PARSED" | "PARTIAL";
  quantity_status: "VALID" | "MISSING" | "INVALID";
  unit_status: "EXPLICIT" | "CATALOG_SUGGESTED" | "CONFLICT" | "MISSING";
  source_ref: Record<string, unknown> | null;
  item_type: "PRODUCT" | "WORK" | "SERVICE" | "COMPOSITE";
  review_status:
    | "EXTRACTED"
    | "EXACT_MATCH"
    | "SUGGESTED_MATCH"
    | "AMBIGUOUS"
    | "UNMATCHED"
    | "MISSING_PRICE"
    | "INVALID_INPUT"
    | "MANUALLY_CONFIRMED";
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  reason_codes: string[];
  price_status: "NOT_CHECKED" | "AVAILABLE" | "MISSING_PRICE";
  availability_status: "NOT_CHECKED" | "UNKNOWN";
  selected_product_id: string | null;
  candidates: MatchCandidate[];
};

export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;

const CATALOG_FIELD_ALIASES: Record<CatalogField, string[]> = {
  sku: ["sku", "sifra", "sifraartikla", "artikalsifra", "kod", "code"],
  name: ["name", "naziv", "proizvod", "ime", "artikal", "artikl", "product", "description", "opis"],
  unit: ["unit", "jedinicamere", "jedinica", "jm", "mera", "measure"],
  price: ["price", "cena", "cenabezpdv", "unitprice", "jedinicnacena"],
  currency: ["currency", "valuta", "curr"],
  vat_rate: ["vatrate", "pdv", "pdvstopa", "stopapdv", "vat", "tax"],
  aliases: ["alias", "aliasi", "alternativninaziv", "alternativninazivi"],
  active: ["active", "aktivan", "aktivno", "status"],
};

function normalizeCatalogHeader(header: string) {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sr-Latn")
    .replace(/[^a-z0-9]/g, "");
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function sheetFromRows(name: string, rows: unknown[][]): ParsedCatalogSheet {
  const normalizedRows = rows.map((row) => row.map(cellText));
  return {
    name,
    headers: normalizedRows[0] ?? [],
    rows: normalizedRows.slice(1),
    rowCount: Math.max(normalizedRows.length - 1, 0),
  };
}

export async function parseCatalogFile(file: File): Promise<ParsedCatalogSheet[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    const result = await new Promise<Papa.ParseResult<string[]>>((resolve, reject) => {
      Papa.parse<string[]>(file, {
        header: false,
        skipEmptyLines: "greedy",
        worker: true,
        complete: resolve,
        error: reject,
      });
    });
    if (result.errors.length > 0) {
      throw new Error(`CSV se ne može parsirati: ${result.errors[0].message}`);
    }
    return [sheetFromRows(file.name, result.data)];
  }

  if (extension === "xlsx") {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    const workbook = await readExcelFile(file, { trim: false });
    return workbook.map(({ sheet, data }) => sheetFromRows(sheet, data));
  }

  throw new Error("Podržani formati kataloga su CSV i XLSX.");
}

export function suggestCatalogColumnMapping(headers: string[]): CatalogColumnMapping {
  const mapping: CatalogColumnMapping = {
    sku: "",
    name: "",
    unit: "",
    price: "",
    currency: "",
    vat_rate: "",
    aliases: "",
    active: "",
  };

  for (const field of CATALOG_FIELD_OPTIONS) {
    const aliases = CATALOG_FIELD_ALIASES[field.value];
    const matchingIndex = headers.findIndex((header) =>
      aliases.includes(normalizeCatalogHeader(header)),
    );
    if (matchingIndex >= 0) mapping[field.value] = String(matchingIndex);
  }

  return mapping;
}

export function missingRequiredCatalogFields(mapping: CatalogColumnMapping): string[] {
  return CATALOG_FIELD_OPTIONS
    .filter((field) => field.required && !mapping[field.value])
    .map((field) => field.label);
}

export function mapCatalogPreviewRows(
  rows: string[][],
  mapping: CatalogColumnMapping,
  limit = 10,
): Record<CatalogField, string>[] {
  return rows.slice(0, limit).map((row) => {
    const mappedRow = {} as Record<CatalogField, string>;
    for (const field of CATALOG_FIELD_OPTIONS) {
      const columnIndex = mapping[field.value] === "" ? -1 : Number(mapping[field.value]);
      mappedRow[field.value] = columnIndex >= 0 ? row[columnIndex] ?? "" : "";
    }
    return mappedRow;
  });
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      detail?: string | { message?: string; errors?: { field?: string; message?: string }[] };
    } | null;
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (detail) {
      const rowErrors = detail.errors?.map((issue) => issue.message).filter(Boolean) ?? [];
      throw new Error([detail.message, ...rowErrors].filter(Boolean).join(" "));
    }
    throw new Error("Zahtev nije uspeo. Pokušajte ponovo.");
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

export async function getDocument(documentId: string): Promise<StoredDocument> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    cache: "no-store",
  });
  return readResponse<StoredDocument>(response);
}

export async function processDocument(documentId: string): Promise<ProcessingJob> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/process`, {
    method: "POST",
    cache: "no-store",
  });
  return readResponse<ProcessingJob>(response);
}

export async function confirmDocumentMapping(
  documentId: string,
  jobId: string,
  mapping: ProductColumnMapping,
): Promise<ProcessingJob> {
  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/jobs/${encodeURIComponent(jobId)}/mapping`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
      cache: "no-store",
    },
  );
  return readResponse<ProcessingJob>(response);
}

export async function getLatestProcessingJob(documentId: string): Promise<ProcessingJob | null> {
  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/jobs`,
    { cache: "no-store" },
  );
  return readResponse<ProcessingJob | null>(response);
}

export async function getProcessingJob(jobId: string): Promise<ProcessingJob> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
  return readResponse<ProcessingJob>(response);
}

export async function getDocumentPositions(
  documentId: string,
  jobId: string,
): Promise<DocumentPositionResult[]> {
  const query = new URLSearchParams({ job_id: jobId });
  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/positions?${query}`,
    { cache: "no-store" },
  );
  return readResponse<DocumentPositionResult[]>(response);
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

export async function listCatalogImports(): Promise<CatalogImportSummary[]> {
  const response = await fetch("/api/catalog/imports", { cache: "no-store" });
  return readResponse<CatalogImportSummary[]>(response);
}

export async function importCatalogFile(
  file: File,
  mapping?: CatalogColumnMapping,
  sheetName?: string,
): Promise<CatalogImport> {
  const formData = new FormData();
  formData.set("file", file, file.name);
  if (mapping) {
    const normalizedMapping = Object.fromEntries(
      Object.entries(mapping).map(([field, column]) => [field, column === "" ? null : Number(column)]),
    );
    formData.set("mapping", JSON.stringify(normalizedMapping));
  }
  if (sheetName) formData.set("sheet_name", sheetName);

  const response = await fetch("/api/catalog/imports", {
    method: "POST",
    body: formData,
  });
  return readResponse<CatalogImport>(response);
}