"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Inbox,
  LockKeyhole,
  Mail,
  Search,
  Upload,
  X,
} from "lucide-react";

import { listDocuments, uploadDocument, validateDocumentFile } from "@/api";
import type { DocumentFormat, DocumentType, StoredDocument } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SourcePreviewDrawer } from "@/components/dashboard/source-preview-drawer";

const ACCEPTED_FORMATS = ["PDF", "XLSX", "CSV", "EML"] as const satisfies readonly DocumentFormat[];
const FORMAT_ICONS = {
  PDF: FileText,
  XLSX: FileSpreadsheet,
  CSV: FileSpreadsheet,
  EML: Mail,
} satisfies Record<DocumentFormat, typeof FileText>;
const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "INQUIRY", label: "Upit" },
  { value: "PRODUCT_LIST", label: "Lista artikala" },
  { value: "OTHER", label: "Drugo" },
];
const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INQUIRY: "Upit",
  PRODUCT_LIST: "Lista artikala",
  BOQ: "Predmer",
  OTHER: "Drugo",
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

export function ProductQuotingPage() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<StoredDocument | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>("INQUIRY");
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isCurrent = true;

    listDocuments("PRODUCT_QUOTE")
      .then((result) => {
        if (isCurrent) setDocuments(result);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : "Dokumenti nisu dostupni.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const filteredDocuments = documents.filter((document) =>
    `${document.original_filename} ${document.id}`
      .toLocaleLowerCase("sr-Latn")
      .includes(searchTerm.trim().toLocaleLowerCase("sr-Latn")),
  );

  function openUpload() {
    setSelectedFile(null);
    setDocumentType("INQUIRY");
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadOpen(true);
  }

  function handleUploadOpenChange(open: boolean) {
    setUploadOpen(open);
    if (!open) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const validationError = validateDocumentFile(file, ACCEPTED_FORMATS);
    if (validationError) {
      setSelectedFile(null);
      setUploadError(validationError);
      event.currentTarget.value = "";
      return;
    }

    setSelectedFile(file);
    setUploadError("");
  }

  async function submitUpload() {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError("");
    try {
      const uploaded = await uploadDocument(selectedFile, documentType, "PRODUCT_QUOTE");
      setDocuments((current) => [uploaded, ...current]);
      // Prikazujemo ime fajla, message strip da je upload-an fajl
      setUploadNotice(`${uploaded.original_filename} je otpremljen.`);
      setSearchTerm("");
      handleUploadOpenChange(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload nije uspeo.");
    } finally {
      setIsUploading(false);
    }
  }

  const previewDocument = selectedDocument
    ? {
        id: selectedDocument.id,
        title: selectedDocument.original_filename.replace(/\.[^.]+$/, ""),
        filename: selectedDocument.original_filename,
        format: selectedDocument.format,
        updatedAt: formatDate(selectedDocument.created_at),
        viewMode: "product" as const,
        storage: "server" as const,
        storedSizeBytes: selectedDocument.size_bytes,
      }
    : null;

  return (
    <DashboardShell activeModule="product" sourcePreviewOpen={selectedDocument !== null}>
      <section aria-labelledby="product-page-title" className="page-heading">
        <div>
          <span className="heading-eyebrow">Product Quoting · Distributeri</span>
          <h1 id="product-page-title">Zahtevi</h1>
          <p>Učitajte upite i liste artikala za kasniji pregled.</p>
        </div>
        <div className="heading-actions">
          <Button className="primary-action" onClick={openUpload} size="lg" type="button">
            <Upload aria-hidden="true" size={16} />
            Uvezi zahtev
          </Button>
        </div>
      </section>
        {/* Kad se fajl uploaduje, pokazuje se ovaj div, odn poruka kao zeleni msg strip*/}
      {uploadNotice && (
        <div className="upload-saved-banner" role="status">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span>{uploadNotice}</span>
          <button aria-label="Zatvori potvrdu upload-a" onClick={() => setUploadNotice("")} type="button">
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      )}
      {loadError && <div className="upload-storage-error" role="alert"><AlertCircle aria-hidden="true" size={17} />{loadError}</div>}

      <section aria-label="Product Quoting dokumenti" className="metrics-grid product-summary-grid">
        {/* Kartica sa prikazom koliko ima dokumenata otpremljenih za Product Quoting. */}
        <Card className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Otpremljeni dokumenti</span>
            <span className="metric-icon metric-icon--blue"><Inbox aria-hidden="true" size={24} /></span>
          </div>
          <div className="metric-value-row"><strong className="metric-value">{documents.length}</strong></div>
          <p className="metric-caption">Product Quoting · lokalni API</p>
        </Card>
      </section>

      <Card className="requests-card">
        <div className="requests-card-heading">
          <div>
            <h2>Zahtevi</h2>
            <p>Dokumenti otpremljeni za Product Quoting.</p>
          </div>
          <label className="search-field">
            <Search aria-hidden="true" size={15} />
            <Input aria-label="Pretraži Product zahteve" className="search-input" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Pretraži zahteve..." type="search" value={searchTerm} />
          </label>
        </div>

        <div className="request-table-wrap">
          <Table className="request-table">
            <TableHeader><TableRow><TableHead>Dokument</TableHead><TableHead>Tip</TableHead><TableHead>Veličina</TableHead><TableHead>Otpremljen</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredDocuments.map((document) => {
                const FileIcon = FORMAT_ICONS[document.format];
                return (
                  <TableRow className="request-row" key={document.id}>
                    <TableCell>
                      <div className="request-title-wrap">
                        <span className={`file-type-icon file-type-icon--${document.format.toLowerCase()}`}><FileIcon aria-hidden="true" size={17} /></span>
                        <div className="request-title-copy">
                          <Link className="request-title-button" href={`/documents/${document.id}`}>{document.original_filename}</Link>
                          <span className="request-file-meta">{document.id}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{DOCUMENT_TYPE_LABELS[document.document_type]}</TableCell>
                    <TableCell>{formatFileSize(document.size_bytes)}</TableCell>
                    <TableCell>{formatDate(document.created_at)}</TableCell>
                    <TableCell><Badge className="status-badge status-badge--uploaded" variant="outline">OTPREMLJEN</Badge></TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && filteredDocuments.length === 0 && (
                <TableRow><TableCell className="request-empty-state" colSpan={5}>
                  {loadError ? <AlertCircle aria-hidden="true" size={19} /> : <Inbox aria-hidden="true" size={19} />}
                  <strong>{loadError ? "Dokumenti nisu dostupni" : searchTerm ? "Nema rezultata pretrage" : "Još nema Product zahteva"}</strong>
                  <span>{searchTerm ? "Promenite pojam za pretragu." : "Otpremljeni zahtevi će se pojaviti ovde."}</span>
                </TableCell></TableRow>
              )}
              {isLoading && <TableRow><TableCell className="request-empty-state" colSpan={5}>Učitavam Product zahteve…</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="requests-card-footer">
          <span>Prikazano <strong>{filteredDocuments.length}</strong> od <strong>{documents.length}</strong> Product zahteva</span>
          <span>Obrada još nije pokrenuta</span>
        </div>
      </Card>

      <SourcePreviewDrawer document={previewDocument} onOpenChange={(open) => !open && setSelectedDocument(null)} />

      <Dialog onOpenChange={handleUploadOpenChange} open={uploadOpen}>
        <DialogContent className="upload-dialog">
          <DialogHeader className="upload-dialog-header">
            <DialogTitle>Uvezi Product zahtev</DialogTitle>
            <DialogDescription>Izaberite dokument za Product Quoting. Sadržaj se ne parsira i obrada ne pokreće.</DialogDescription>
          </DialogHeader>
          <div className="upload-content">
            <label className="upload-field">
              <span>Tip dokumenta</span>
              <select className="upload-select" onChange={(event) => setDocumentType(event.target.value as DocumentType)} value={documentType}>
                {DOCUMENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <input accept=".pdf,.xlsx,.csv,.eml" aria-label="Izaberi Product dokument" className="sr-only" onChange={handleFileChange} ref={fileInputRef} type="file" />
            <div className="upload-zone">
              {selectedFile ? (
                <div className="upload-selected-file">
                  <FileText aria-hidden="true" size={18} />
                  <span><strong>{selectedFile.name}</strong><small>{formatFileSize(selectedFile.size)} · šalje se API-ju</small></span>
                  <CheckCircle2 aria-hidden="true" size={16} />
                </div>
              ) : (
                <>
                  <span className="upload-zone-icon"><Upload aria-hidden="true" size={17} /></span>
                  <strong>Dodajte upit ili listu artikala</strong>
                  <span>PDF, XLSX, CSV ili EML · najviše 20 MB</span>
                </>
              )}
              <Button className="outline-button" onClick={() => fileInputRef.current?.click()} size="sm" type="button" variant="outline">{selectedFile ? "Izaberi drugi fajl" : "Odaberi fajl"}</Button>
              {uploadError && <span className="upload-validation-message" role="alert">{uploadError}</span>}
            </div>
            <div className="upload-notice"><LockKeyhole aria-hidden="true" size={14} /><span>Lokalni storage nije tenant-izolovan. Učitavajte samo sintetičke fajlove.</span></div>
          </div>
          <DialogFooter className="upload-dialog-footer">
            <Button className="cancel-button" onClick={() => handleUploadOpenChange(false)} type="button" variant="outline">Otkaži</Button>
            <Button className="save-upload-button" disabled={!selectedFile || isUploading} onClick={submitUpload} size="lg" type="button"><Upload aria-hidden="true" size={14} />{isUploading ? "Otpremam fajl…" : "Otpremi zahtev"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}