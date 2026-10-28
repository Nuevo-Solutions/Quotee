"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Clock3,
  Database,
  Eye,
  FileSpreadsheet,
  FileText,
  Mail,
  Play,
} from "lucide-react";

import {
  confirmDocumentMapping,
  getDocument,
  getDocumentPositions,
  getLatestProcessingJob,
  getProcessingJob,
  processDocument,
} from "@/api";
import type {
  DocumentFormat,
  DocumentPositionResult,
  ProcessingJob,
  ProductColumnMapping,
  StoredDocument,
} from "@/api";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SourcePreviewDrawer } from "@/components/dashboard/source-preview-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DocumentObjectPageProps = {
  documentId: string;
};

type MatchResultStatus = DocumentPositionResult["review_status"];

const FILE_FORMAT_LABELS: Record<DocumentFormat, string> = {
  PDF: "PDF dokument",
  XLSX: "Excel radna sveska",
  CSV: "CSV tabela",
  EML: "Email poruka",
};

const DOCUMENT_STATUS: Record<StoredDocument["status"], { label: string; className: string }> = {
  UPLOADED: { label: "Otpremljen", className: "object-status--uploaded" },
  PROCESSING: { label: "Obrada u toku", className: "object-status--processing" },
  MAPPING_REQUIRED: { label: "Potrebna potvrda mapiranja", className: "object-status--mapping" },
  NEEDS_REVIEW: { label: "Potrebna provera", className: "object-status--review" },
  FAILED: { label: "Greška", className: "object-status--failed" },
  UNSUPPORTED_INPUT: { label: "Nepodržan format", className: "object-status--failed" },
};

const EMPTY_COLUMN_MAPPING: ProductColumnMapping = {
  position: null,
  sku: null,
  description: null,
  quantity: null,
  unit: null,
};

const PRODUCT_MAPPING_FIELDS: { key: keyof ProductColumnMapping; label: string }[] = [
  { key: "position", label: "Pozicija" },
  { key: "sku", label: "SKU / šifra" },
  { key: "description", label: "Opis proizvoda" },
  { key: "quantity", label: "Količina" },
  { key: "unit", label: "Jedinica mere" },
];

const MATCH_RESULT_STATUSES: { status: MatchResultStatus; label: string }[] = [
  { status: "EXACT_MATCH", label: "Tačno poklapanje" },
  { status: "SUGGESTED_MATCH", label: "Predlog za proveru" },
  { status: "AMBIGUOUS", label: "Potrebna ručna provera" },
  { status: "UNMATCHED", label: "Nije pronađeno" },
  { status: "INVALID_INPUT", label: "Neispravni podaci" },
  { status: "MISSING_PRICE", label: "Nedostaje cena" },
  { status: "EXTRACTED", label: "Izdvojeno" },
  { status: "MANUALLY_CONFIRMED", label: "Ručno potvrđeno" },
];

const MATCH_RESULT_LEGEND = MATCH_RESULT_STATUSES.filter(({ status }) =>
  ["EXACT_MATCH", "SUGGESTED_MATCH", "AMBIGUOUS", "UNMATCHED"].includes(status),
);

const REASON_LABELS: Record<string, string> = {
  EXACT_SKU: "SKU se tačno poklapa",
  EXACT_ALIAS: "Alternativni naziv se tačno poklapa",
  EXACT_NAME: "Naziv se tačno poklapa",
  TRIGRAM: "Sličan naziv",
  NAME_SIMILARITY: "Sličan naziv",
  ALIAS_SIMILARITY: "Sličan alternativni naziv",
  UNIT_REVIEW_REQUIRED: "Proverite jedinicu mere",
  UNIT_MISMATCH: "Jedinica mere se ne poklapa",
  SPECIFICATION_CONFLICT: "Specifikacija se razlikuje",
  SPECIFICATION_UNKNOWN: "Katalog ne navodi traženu specifikaciju",
  HUMAN_CONFIRMATION_REQUIRED: "Potrebna je ljudska potvrda",
  MULTIPLE_EXACT_CANDIDATES: "Više tačnih kandidata",
  MULTIPLE_CLOSE_CANDIDATES: "Više sličnih kandidata",
  NO_CATALOG_MATCH: "Nema poklapanja u katalogu",
  MISSING_PRICE: "Cena nije uneta u katalogu",
  INVALID_QUANTITY: "Količina nije validna",
  MISSING_QUANTITY: "Nedostaje količina",
  MISSING_UNIT: "Nedostaje jedinica mere",
  MISSING_DESCRIPTION: "Nedostaje opis i SKU",
  LLM_MATCH_SUGGESTION: "LLM predlog za ljudsku potvrdu",
  LLM_NO_MATCH_IN_TOP_CANDIDATES: "Nema odgovarajućeg kandidata među prikazanim predlozima",
  LLM_AMBIGUOUS: "Dostupni podaci ne razdvajaju kandidate",
  LLM_INPUT_LIMIT_EXCEEDED: "Stavka prelazi dozvoljeni LLM limit",
  LLM_JOB_BUDGET_EXCEEDED: "Dostignut je LLM budžet za ovaj posao",
};

const MATCH_STATUS_LABELS = Object.fromEntries(
  MATCH_RESULT_STATUSES.map(({ status, label }) => [status, label]),
) as Record<MatchResultStatus, string>;

const CONFIDENCE_LABELS = {
  HIGH: "visoka",
  MEDIUM: "srednja",
  LOW: "niska",
  NONE: "nije određena",
} as const;

function formatReason(reason: string) {
  if (reason.startsWith("LLM_REASON_")) {
    const llmReason = reason.slice("LLM_REASON_".length);
    const labels: Record<string, string> = {
      DESCRIPTION_MATCH: "Opis podržava predlog",
      SKU_SUPPORTS_MATCH: "Šifra podržava predlog",
      UNIT_MATCH: "Jedinica se poklapa",
      SPECIFICATION_MATCH: "Specifikacija se poklapa",
      INSUFFICIENT_INFORMATION: "Nema dovoljno podataka",
      SPECIFICATION_CONFLICT: "Specifikacija se razlikuje",
      UNIT_CONFLICT: "Jedinica mere se razlikuje",
    };
    return labels[llmReason] ?? llmReason;
  }
  if (reason.startsWith("LLM_MISSING_")) {
    return `Nedostaje podatak: ${reason.slice("LLM_MISSING_".length).toLowerCase().replaceAll("_", " ")}`;
  }
  return REASON_LABELS[reason] ?? reason.toLocaleLowerCase("sr-Latn").replaceAll("_", " ");
}

function formatMatchPrice(price: string | null, currency: string | null) {
  if (price === null) return "Cena nedostaje";
  return `${Number(price).toLocaleString("sr-Latn-RS", { maximumFractionDigits: 4 })} ${currency ?? ""}`.trim();
}

const DOCUMENT_TYPE_LABELS: Record<StoredDocument["document_type"], string> = {
  INQUIRY: "Upit",
  PRODUCT_LIST: "Lista artikala",
  BOQ: "Predmer",
  OTHER: "Drugi dokument",
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function FileTypeIcon({ format }: { format: DocumentFormat }) {
  if (format === "XLSX" || format === "CSV") return <FileSpreadsheet aria-hidden="true" size={23} />;
  if (format === "EML") return <Mail aria-hidden="true" size={23} />;
  return <FileText aria-hidden="true" size={23} />;
}

function DetailField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`object-detail-field ${className}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function DocumentObjectPage({ documentId }: DocumentObjectPageProps) {
  const [document, setDocument] = useState<StoredDocument | null>(null);
  const [processingJob, setProcessingJob] = useState<ProcessingJob | null>(null);
  const [results, setResults] = useState<DocumentPositionResult[]>([]);
  const [columnMapping, setColumnMapping] = useState<ProductColumnMapping>(EMPTY_COLUMN_MAPPING);
  const [isLoading, setIsLoading] = useState(true);
  const [isJobLoading, setIsJobLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResultsLoading, setIsResultsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [processNotice, setProcessNotice] = useState("");

  useEffect(() => {
    let isCurrent = true;

    getDocument(documentId)
      .then((result) => {
        if (isCurrent) setDocument(result);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : "Dokument nije dostupan.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    getLatestProcessingJob(documentId)
      .then((result) => {
        if (isCurrent) {
          setProcessingJob(result);
          if (result?.status === "MAPPING_REQUIRED") {
            setColumnMapping(result.mapping_suggestion ?? EMPTY_COLUMN_MAPPING);
          }
          if (result?.status === "NEEDS_REVIEW") setIsResultsLoading(true);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setProcessNotice(error instanceof Error ? error.message : "Status obrade nije dostupan.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsJobLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [documentId]);

  const activeJobId = processingJob?.id;
  const activeJobStatus = processingJob?.status;
  useEffect(() => {
    if (!activeJobId || !activeJobStatus || !["UPLOADED", "PROCESSING"].includes(activeJobStatus)) return;

    let isCurrent = true;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const latest = await getProcessingJob(activeJobId);
        if (!isCurrent) return;
        setProcessingJob(latest);
        if (latest.status === "UPLOADED" || latest.status === "PROCESSING") {
          timeout = setTimeout(poll, 800);
        } else if (latest.status === "NEEDS_REVIEW") {
          setIsResultsLoading(true);
        } else {
          setProcessNotice(latest.error_message ?? "Obrada nije završena.");
        }
      } catch (error: unknown) {
        if (!isCurrent) return;
        setProcessNotice(error instanceof Error ? error.message : "Status obrade nije dostupan.");
        timeout = setTimeout(poll, 1600);
      }
    };

    timeout = setTimeout(poll, 500);
    return () => {
      isCurrent = false;
      clearTimeout(timeout);
    };
  }, [activeJobId, activeJobStatus]);

  const resultsJobId = activeJobStatus === "NEEDS_REVIEW" ? activeJobId : null;
  useEffect(() => {
    if (!resultsJobId) return;

    let isCurrent = true;
    getDocumentPositions(documentId, resultsJobId)
      .then((items) => {
        if (isCurrent) setResults(items);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setProcessNotice(error instanceof Error ? error.message : "Rezultati nisu dostupni.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsResultsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [documentId, resultsJobId]);

  const effectiveDocumentStatus = document && processingJob
    ? processingJob.status === "UPLOADED"
      ? "PROCESSING"
      : processingJob.status
    : document?.status;
  const status = effectiveDocumentStatus ? DOCUMENT_STATUS[effectiveDocumentStatus] : null;
  const canProcess = Boolean(
    document
      && document.workflow === "PRODUCT_QUOTE"
      && (document.format === "CSV" || document.format === "XLSX")
      && !isJobLoading
      && !isProcessing
      && !isResultsLoading
      && processingJob?.status !== "UPLOADED"
      && processingJob?.status !== "PROCESSING"
      && processingJob?.status !== "MAPPING_REQUIRED"
      && processingJob?.status !== "NEEDS_REVIEW",
  );

  const mappingIndexes = Object.values(columnMapping).filter(
    (index): index is number => index !== null,
  );
  const isMappingValid =
    (columnMapping.sku !== null || columnMapping.description !== null)
    && mappingIndexes.length === new Set(mappingIndexes).size
    && mappingIndexes.every((index) => index >= 0 && index < (processingJob?.mapping_headers?.length ?? 0));

  async function handleProcessDocument() {
    setProcessNotice("");
    setIsProcessing(true);
    try {
      const job = await processDocument(documentId);
      setResults([]);
      setProcessingJob(job);
      setDocument((current) => current ? { ...current, status: "PROCESSING" } : current);
    } catch (error: unknown) {
      setProcessNotice(error instanceof Error ? error.message : "Obrada nije mogla da se pokrene.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleConfirmMapping() {
    if (!processingJob) return;
    setProcessNotice("");
    setIsProcessing(true);
    try {
      const resumedJob = await confirmDocumentMapping(documentId, processingJob.id, columnMapping);
      setProcessingJob(resumedJob);
      setDocument((current) => current ? { ...current, status: "PROCESSING" } : current);
    } catch (error: unknown) {
      setProcessNotice(error instanceof Error ? error.message : "Mapiranje nije moglo da se potvrdi.");
    } finally {
      setIsProcessing(false);
    }
  }
  const previewDocument = document
    ? {
        id: document.id,
        title: document.original_filename.replace(/\.[^.]+$/, ""),
        filename: document.original_filename,
        format: document.format,
        updatedAt: formatDate(document.created_at),
        viewMode: document.workflow === "TECHNICAL_QUOTE" ? "technical" as const : "product" as const,
        storage: "server" as const,
        storedSizeBytes: document.size_bytes,
      }
    : null;

  return (
    <DashboardShell
      activeModule={document?.workflow === "TECHNICAL_QUOTE" ? "technical" : "product"}
      sourcePreviewOpen={previewOpen}
    >
      <div className="object-page">
        <nav aria-label="Putanja dokumenta" className="object-breadcrumb">
          <Link href={document?.workflow === "TECHNICAL_QUOTE" ? "/technical-quoting" : "/"}>
            {document?.workflow === "TECHNICAL_QUOTE" ? "Technical Quoting" : "Product Quoting"}
          </Link>
          <span aria-hidden="true">/</span>
          <span>Dokument</span>
        </nav>

        {isLoading ? (
          <div className="object-page-state" role="status">Učitavam podatke dokumenta…</div>
        ) : loadError || !document || !status ? (
          <section className="object-page-state object-page-state--error" role="alert">
            <CircleX aria-hidden="true" size={22} />
            <strong>Dokument nije dostupan</strong>
            <span>{loadError || "Dokument nije pronađen."}</span>
            <Button asChild variant="outline"><Link href="/"><ArrowLeft aria-hidden="true" size={15} />Nazad na dokumente</Link></Button>
          </section>
        ) : (
          <>
            <header className="object-page-header">
              <span className={`object-file-icon object-file-icon--${document.format.toLowerCase()}`}>
                <FileTypeIcon format={document.format} />
              </span>
              <div className="object-title-group">
                <span className="heading-eyebrow">{document.workflow === "TECHNICAL_QUOTE" ? "Technical Quoting" : "Product Quoting"}</span>
                <h1>{document.original_filename}</h1>
                <span className="object-document-id">ID dokumenta · {document.id}</span>
              </div>
              <div className="object-page-actions">
                <Badge className={`object-status ${status.className}`} variant="outline">{status.label}</Badge>
                <Button className="object-preview-button" onClick={() => setPreviewOpen(true)} type="button" variant="outline">
                  <Eye aria-hidden="true" size={15} />Pregled izvora
                </Button>
                <Button
                  className="primary-action"
                  disabled={!canProcess}
                  onClick={handleProcessDocument}
                  title={
                    document.workflow !== "PRODUCT_QUOTE"
                      ? "Technical Quoting obrada još nije podržana."
                      : document.format !== "CSV" && document.format !== "XLSX"
                        ? "Product obrada trenutno podržava CSV i XLSX."
                        : undefined
                  }
                  type="button"
                >
                  {isProcessing || processingJob?.status === "UPLOADED" || processingJob?.status === "PROCESSING"
                    ? <Clock3 aria-hidden="true" size={15} />
                    : <Play aria-hidden="true" size={15} />}
                  {isProcessing ? "Pokrećem obradu" : processingJob?.status === "NEEDS_REVIEW" ? "Obrada završena" : processingJob?.status === "FAILED" || processingJob?.status === "UNSUPPORTED_INPUT" ? "Pokušaj ponovo" : "Obradi dokument"}
                </Button>
              </div>
            </header>

            {processNotice && (
              <div className="object-process-notice" role="status">
                <CircleAlert aria-hidden="true" size={16} />
                <span>{processNotice}</span>
                <button aria-label="Zatvori obaveštenje" onClick={() => setProcessNotice("")} type="button">×</button>
              </div>
            )}

            {processingJob?.status === "MAPPING_REQUIRED" && processingJob.mapping_headers && (
              <section aria-labelledby="mapping-confirmation-title" className="object-mapping-panel">
                <div>
                  <span className="object-section-kicker">Mapiranje fajla</span>
                  <h2 id="mapping-confirmation-title">Potvrdite kolone</h2>
                  <p>Predlog je automatski; proverite da li svako polje odgovara izvornoj koloni.</p>
                </div>
                <div className="object-mapping-grid">
                  {PRODUCT_MAPPING_FIELDS.map(({ key, label }) => (
                    <label className="object-mapping-field" key={key}>
                      <span>{label}{key === "sku" || key === "description" ? " *" : ""}</span>
                      <select
                        onChange={(event) => {
                          const value = event.target.value;
                          setColumnMapping((current) => ({
                            ...current,
                            [key]: value === "" ? null : Number(value),
                          }));
                        }}
                        value={columnMapping[key] === null ? "" : String(columnMapping[key])}
                      >
                        <option value="">Nije mapirano</option>
                        {Array.from({ length: 10 }, (_, index) => {
                          const header = processingJob.mapping_headers?.[index] ?? "";
                          return (
                            <option key={`${index}-${header}`} value={index}>
                              {header || `Kolona ${index + 1}`}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  ))}
                </div>
                <Button
                  className="primary-action"
                  disabled={!isMappingValid || isProcessing}
                  onClick={handleConfirmMapping}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" size={15} />
                  {isProcessing ? "Nastavljam obradu" : "Potvrdi mapiranje"}
                </Button>
              </section>
            )}

            <section aria-labelledby="object-details-title" className="object-section">
              <div className="object-section-heading">
                <div>
                  <span className="object-section-kicker">Izvorni fajl</span>
                  <h2 id="object-details-title">Detalji dokumenta</h2>
                </div>
                <span className="object-format-label">{FILE_FORMAT_LABELS[document.format]}</span>
              </div>
              <dl className="object-details-grid">
                <DetailField label="Naziv fajla" value={document.original_filename} />
                <DetailField label="Tip dokumenta" value={DOCUMENT_TYPE_LABELS[document.document_type]} />
                <DetailField label="Workflow" value={document.workflow === "TECHNICAL_QUOTE" ? "Technical Quoting" : document.workflow === "PRODUCT_QUOTE" ? "Product Quoting" : "Nije dodeljen"} />
                <DetailField label="Postavljeno" value={formatDate(document.created_at)} />
                <DetailField label="Poslednja izmena" value="Nije dostupno iz API-ja" />
                <DetailField label="Veličina" value={formatFileSize(document.size_bytes)} />
                <DetailField label="MIME tip" value={document.mime_type} />
                <DetailField label="Status" value={status.label} />
                <DetailField label="SHA-256" value={document.sha256} className="object-detail-field--hash" />
              </dl>
            </section>

            <section aria-labelledby="object-results-title" className="object-section object-results-section">
              <div className="object-section-heading object-results-heading">
                <div>
                  <span className="object-section-kicker">Katalog / baza</span>
                  <h2 id="object-results-title">Rezultati obrade</h2>
                  <p>Rezultati su predlozi za proveru; stanje zaliha nije provereno.</p>
                </div>
                <span className="object-results-count"><Database aria-hidden="true" size={15} />{results.length} obrađenih stavki</span>
              </div>

              <div className="object-results-table-wrap">
                <table className="object-results-table">
                  <thead>
                    <tr>
                      <th>Izvor / pozicija</th>
                      <th>Opis stavke</th>
                      <th>Količina</th>
                      <th>Predlog iz baze</th>
                      <th>Status poklapanja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.length > 0 ? results.map((result) => {
                      const candidate = result.candidates[0];
                      const sourceRow = result.source_ref?.row;
                      const sourceSheet = result.source_ref?.sheet;
                      return (
                        <tr key={result.id}>
                          <td>
                            <strong>{result.position_code ?? `#${result.sort_order}`}</strong>
                            <small>{[sourceSheet, typeof sourceRow === "number" ? `red ${sourceRow}` : null].filter(Boolean).join(" · ") || "Izvorni dokument"}</small>
                          </td>
                          <td>{result.raw_description}</td>
                          <td>{result.original_quantity ?? "—"} {result.original_unit ?? ""}</td>
                          <td>
                            {candidate ? (
                              <>
                                <strong>{candidate.name}</strong>
                                <small>{candidate.sku} · {candidate.unit}</small>
                                <small>Cena: {formatMatchPrice(candidate.price, candidate.currency)}</small>
                              </>
                            ) : "Bez predloga"}
                          </td>
                          <td>
                            <Badge className={`object-match-status object-match-status--${result.review_status.toLowerCase()}`} variant="outline">
                              {result.review_status === "EXACT_MATCH" ? <CheckCircle2 aria-hidden="true" size={13} /> : result.review_status === "UNMATCHED" || result.review_status === "INVALID_INPUT" ? <CircleX aria-hidden="true" size={13} /> : <CircleAlert aria-hidden="true" size={13} />}
                              {MATCH_STATUS_LABELS[result.review_status]}
                            </Badge>
                            <small>Pouzdanost: {CONFIDENCE_LABELS[result.confidence]}</small>
                            {result.reason_codes.length > 0 && <small>{result.reason_codes.map(formatReason).join(" · ")}</small>}
                            <small>Cena: {result.price_status === "NOT_CHECKED" ? "nije proverena" : result.price_status === "MISSING_PRICE" ? "nedostaje u katalogu" : "iz kataloga"}</small>
                            <small>Zalihe: nisu proverene</small>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td className="object-results-empty" colSpan={5}>
                          {isResultsLoading || processingJob?.status === "UPLOADED" || processingJob?.status === "PROCESSING"
                            ? <Clock3 aria-hidden="true" size={20} />
                            : <Database aria-hidden="true" size={20} />}
                          <strong>{isResultsLoading ? "Učitavam rezultate" : processingJob?.status === "UPLOADED" || processingJob?.status === "PROCESSING" ? "Obrada u toku" : processingJob?.status === "MAPPING_REQUIRED" ? "Čeka potvrdu mapiranja" : processingJob?.status === "NEEDS_REVIEW" ? "Nema izdvojenih stavki" : "Obrada još nije pokrenuta"}</strong>
                          <span>{processingJob?.error_message ?? (processingJob?.status === "NEEDS_REVIEW" ? "Dokument nije sadržao prepoznatljive stavke." : "Pokrenite obradu da biste dobili predloge poklapanja.")}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div aria-label="Statusi poklapanja" className="object-match-statuses">
                {MATCH_RESULT_LEGEND.map(({ status: matchStatus, label }) => (
                  <Badge className={`object-match-status object-match-status--${matchStatus.toLowerCase()}`} key={matchStatus} variant="outline">
                    {matchStatus === "EXACT_MATCH" ? <CheckCircle2 aria-hidden="true" size={13} /> : matchStatus === "UNMATCHED" ? <CircleX aria-hidden="true" size={13} /> : <CircleAlert aria-hidden="true" size={13} />}
                    {label}
                  </Badge>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <SourcePreviewDrawer document={previewOpen ? previewDocument : null} onOpenChange={setPreviewOpen} />
    </DashboardShell>
  );
}