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

import { getDocument } from "@/api";
import type { DocumentFormat, StoredDocument } from "@/api";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SourcePreviewDrawer } from "@/components/dashboard/source-preview-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DocumentObjectPageProps = {
  documentId: string;
};

type MatchResultStatus = "EXACT_MATCH" | "SUGGESTED_MATCH" | "AMBIGUOUS" | "UNMATCHED";

const FILE_FORMAT_LABELS: Record<DocumentFormat, string> = {
  PDF: "PDF dokument",
  XLSX: "Excel radna sveska",
  CSV: "CSV tabela",
  EML: "Email poruka",
};

const DOCUMENT_STATUS: Record<StoredDocument["status"], { label: string; className: string }> = {
  UPLOADED: { label: "Otpremljen", className: "object-status--uploaded" },
  PROCESSING: { label: "Obrada u toku", className: "object-status--processing" },
  NEEDS_REVIEW: { label: "Potrebna provera", className: "object-status--review" },
  FAILED: { label: "Greška", className: "object-status--failed" },
  UNSUPPORTED_INPUT: { label: "Nepodržan format", className: "object-status--failed" },
};

const MATCH_RESULT_STATUSES: { status: MatchResultStatus; label: string }[] = [
  { status: "EXACT_MATCH", label: "Pronađeno" },
  { status: "SUGGESTED_MATCH", label: "Delimično poklapanje" },
  { status: "AMBIGUOUS", label: "AI nije siguran" },
  { status: "UNMATCHED", label: "Nije pronađeno" },
];

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
  const [isLoading, setIsLoading] = useState(true);
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

    return () => {
      isCurrent = false;
    };
  }, [documentId]);

  const status = document ? DOCUMENT_STATUS[document.status] : null;
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
                <Badge className={`object-status ${status.className}`} variant="outline">
                  {status.label}
                </Badge>
                <Button className="object-preview-button" onClick={() => setPreviewOpen(true)} type="button" variant="outline">
                  <Eye aria-hidden="true" size={15} />Pregled izvora
                </Button>
                <Button className="primary-action" onClick={() => setProcessNotice("Obrada nije povezana. Nijedna provera baze nije pokrenuta.")} type="button">
                  <Play aria-hidden="true" size={15} />Obradi dokument
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
                  <p>Stavke i statusi poklapanja pojaviće se nakon povezivanja obrade.</p>
                </div>
                <span className="object-results-count"><Database aria-hidden="true" size={15} />0 obrađenih stavki</span>
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
                    <tr>
                      <td className="object-results-empty" colSpan={5}>
                        <Clock3 aria-hidden="true" size={20} />
                        <strong>Obrada još nije pokrenuta</strong>
                        <span>Rezultati se neće pojaviti dok ne povežemo dugme sa processing API-jem.</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div aria-label="Statusi poklapanja" className="object-match-statuses">
                {MATCH_RESULT_STATUSES.map(({ status: matchStatus, label }) => (
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