"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  FileSpreadsheet,
  FileText,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Save,
  Search,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SourcePreviewDrawer } from "@/components/dashboard/source-preview-drawer";
import {
  getSavedProductFile,
  listSavedProductDocuments,
  saveProductDocument,
  validateProductUpload,
  type ProductDocumentType,
  type ProductFileFormat,
  type StoredProductRequest,
} from "@/lib/product-document-store";

type RequestStatus = "uploaded" | "review" | "processing" | "approved" | "exported" | "failed";
type RequestFilter = "all" | "uploaded" | "review" | "processing" | "completed" | "failed";

type ProductRequest = {
  id: string;
  title: string;
  filename: string;
  format: ProductFileFormat;
  documentType: ProductDocumentType;
  updatedAt: string;
  itemCount: number;
  reviewCount: number;
  status: RequestStatus;
  storage?: "browser";
  sizeBytes?: number;
  mimeType?: string;
  createdAt?: number;
};

const REQUESTS: ProductRequest[] = [
  {
    id: "REQ-024",
    title: "Lista materijala — Objekat Zemun 04",
    filename: "lista-materijala-objekat-zemun.pdf",
    format: "PDF",
    documentType: "PRODUCT_LIST",
    updatedAt: "Danas, 10:24",
    itemCount: 18,
    reviewCount: 3,
    status: "review",
  },
  {
    id: "REQ-023",
    title: "Lista materijala — Hala B",
    filename: "materijal-hala-b.xlsx",
    format: "XLSX",
    documentType: "PRODUCT_LIST",
    updatedAt: "Danas, 09:52",
    itemCount: 26,
    reviewCount: 0,
    status: "processing",
  },
  {
    id: "REQ-022",
    title: "Upit za razvodni ormar",
    filename: "upit-razvodni-ormar.eml",
    format: "EML",
    documentType: "INQUIRY",
    updatedAt: "Danas, 09:12",
    itemCount: 8,
    reviewCount: 2,
    status: "review",
  },
  {
    id: "REQ-021",
    title: "Instalacije — Objekat 12",
    filename: "instalacije-objekat-12.pdf",
    format: "PDF",
    documentType: "INQUIRY",
    updatedAt: "Juče, 15:28",
    itemCount: 34,
    reviewCount: 0,
    status: "approved",
  },
  {
    id: "REQ-020",
    title: "Spisak kablova — Etaža 2",
    filename: "spisak-kablova-etaza-2.csv",
    format: "CSV",
    documentType: "PRODUCT_LIST",
    updatedAt: "Juče, 14:02",
    itemCount: 12,
    reviewCount: 0,
    status: "exported",
  },
  {
    id: "REQ-019",
    title: "Oprema za garažu",
    filename: "oprema-garaza.xlsx",
    format: "XLSX",
    documentType: "PRODUCT_LIST",
    updatedAt: "20. okt, 11:19",
    itemCount: 21,
    reviewCount: 6,
    status: "failed",
  },
];

const STATUS_DETAILS: Record<
  RequestStatus,
  { label: string; Icon: typeof CircleAlert; className: string }
> = {
  uploaded: {
    label: "Sačuvano lokalno",
    Icon: Inbox,
    className: "status-badge--uploaded",
  },
  review: {
    label: "Potreban pregled",
    Icon: CircleAlert,
    className: "status-badge--review",
  },
  processing: {
    label: "U obradi",
    Icon: LoaderCircle,
    className: "status-badge--processing",
  },
  approved: {
    label: "Odobreno",
    Icon: CircleCheck,
    className: "status-badge--approved",
  },
  exported: {
    label: "Izvezen nacrt",
    Icon: CheckCircle2,
    className: "status-badge--exported",
  },
  failed: {
    label: "Greška",
    Icon: CircleX,
    className: "status-badge--failed",
  },
};

const FILE_DETAILS: Record<ProductFileFormat, { Icon: typeof FileText; className: string }> = {
  PDF: { Icon: FileText, className: "file-type-icon--pdf" },
  XLSX: { Icon: FileSpreadsheet, className: "file-type-icon--xlsx" },
  CSV: { Icon: FileSpreadsheet, className: "file-type-icon--csv" },
  EML: { Icon: Mail, className: "file-type-icon--eml" },
};

const DOCUMENT_LABELS: Record<ProductDocumentType, string> = {
  INQUIRY: "UPIT",
  PRODUCT_LIST: "LISTA ARTIKALA",
  OTHER: "OSTALO",
};

const FILTERS: { value: RequestFilter; label: string }[] = [
  { value: "all", label: "Svi zahtevi" },
  { value: "uploaded", label: "Sačuvano lokalno" },
  { value: "review", label: "Potreban pregled" },
  { value: "processing", label: "U obradi" },
  { value: "completed", label: "Završeni" },
  { value: "failed", label: "Greška" },
];

function StatusBadge({ status }: { status: RequestStatus }) {
  const { Icon, label, className } = STATUS_DETAILS[status];

  return (
    <Badge className={`status-badge ${className}`} variant="outline">
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProductQuotingDashboard() {
  const [activeFilter, setActiveFilter] = useState<RequestFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<ProductRequest | null>(null);
  const [savedRequests, setSavedRequests] = useState<StoredProductRequest[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<ProductDocumentType>("INQUIRY");
  const [uploadMessage, setUploadMessage] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [previewFile, setPreviewFile] = useState<{ id: string; blob: Blob } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isCurrent = true;

    listSavedProductDocuments()
      .then((requests) => {
        if (isCurrent) setSavedRequests(requests);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setStorageError(
            error instanceof Error
              ? error.message
              : "Nije moguće otvoriti lokalno skladište u ovom browseru.",
          );
        }
      })
      .finally(() => {
        if (isCurrent) setStorageLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    if (selectedRequest?.storage !== "browser") return;

    getSavedProductFile(selectedRequest.id)
      .then((blob) => {
        if (isCurrent) {
          setPreviewFile(blob ? { id: selectedRequest.id, blob } : null);
        }
      })
      .catch(() => {
        if (isCurrent) setPreviewFile(null);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedRequest]);

  const allRequests = useMemo<ProductRequest[]>(
    () => [...savedRequests, ...REQUESTS],
    [savedRequests],
  );

  const counts = useMemo(() => {
    const completed = allRequests.filter(
      (request) => request.status === "approved" || request.status === "exported",
    ).length;

    return {
      all: allRequests.length,
      uploaded: savedRequests.length,
      review: allRequests.filter((request) => request.status === "review").length,
      processing: allRequests.filter((request) => request.status === "processing").length,
      completed,
      failed: allRequests.filter((request) => request.status === "failed").length,
      reviewItems: allRequests.reduce(
        (total, request) => total + (request.status === "review" ? request.reviewCount : 0),
        0,
      ),
    };
  }, [allRequests, savedRequests]);

  const filteredRequests = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("sr-Latn");

    return allRequests.filter((request) => {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "completed" &&
          (request.status === "approved" || request.status === "exported")) ||
        request.status === activeFilter;
      const matchesSearch =
        !normalizedSearch ||
        `${request.title} ${request.filename} ${request.id}`
          .toLocaleLowerCase("sr-Latn")
          .includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, allRequests, searchTerm]);

  function openUpload() {
    setSelectedFile(null);
    setDocumentType("INQUIRY");
    setUploadMessage("");
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
    const input = event.currentTarget;
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    void validateProductUpload(file).then((validationError) => {
      if (validationError) {
        setSelectedFile(null);
        setUploadMessage(validationError);
        input.value = "";
        return;
      }

      setSelectedFile(file);
      setUploadMessage("");
    });
  }

  async function handleSaveUpload() {
    if (!selectedFile) {
      setUploadMessage("Prvo izaberite fajl koji želite da sačuvate.");
      return;
    }

    setIsSaving(true);
    setUploadMessage("");
    try {
      const savedRequest = await saveProductDocument(selectedFile, documentType);
      setSavedRequests((current) => [savedRequest, ...current]);
      setActiveFilter("uploaded");
      setSearchTerm("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadOpen(false);
      setSaveNotice(`${savedRequest.filename} je sačuvan u ovom browseru.`);
    } catch (error) {
      setUploadMessage(
        error instanceof Error
          ? error.message
          : "Fajl nije sačuvan. Proverite raspoloživi prostor u browseru.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function dismissSaveNotice() {
    setSaveNotice("");
  }

  const previewDocument = selectedRequest
    ? {
        ...selectedRequest,
        viewMode: "product" as const,
        ...(selectedRequest.storage === "browser"
          ? {
              storage: "browser" as const,
              storedBlob:
                previewFile?.id === selectedRequest.id ? previewFile.blob : undefined,
              storedSizeBytes: selectedRequest.sizeBytes,
            }
          : {}),
      }
    : null;

  return (
    <DashboardShell activeModule="product" sourcePreviewOpen={selectedRequest !== null}>
      <div className="demo-banner" role="note">
        <span className="demo-banner-icon">
          <LockKeyhole aria-hidden="true" size={16} />
        </span>
        <div className="demo-banner-copy">
          <strong>Product Quoting · lokalno čuvanje demo fajlova</strong>
          <span>
            Koristite samo sintetičke podatke. Fajlovi ostaju u ovom browseru;
            slanje na server i obrada još nisu povezani.
          </span>
        </div>
        <span className="demo-banner-badge">BEZ SERVERA</span>
      </div>

      <section aria-labelledby="page-title" className="page-heading">
        <div>
          <span className="heading-eyebrow">Product Quoting · Distributeri</span>
          <h1 id="page-title">Zahtevi</h1>
          <p>Sačuvajte upite i spiskove artikala za kasniji pregled.</p>
        </div>
        <div className="heading-actions">
          <Button className="primary-action" onClick={openUpload} size="lg" type="button">
            <Upload aria-hidden="true" size={16} />
            Uvezi zahtev
          </Button>
        </div>
      </section>

      {saveNotice && (
        <div className="upload-saved-banner" role="status">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span>{saveNotice}</span>
          <button aria-label="Zatvori potvrdu čuvanja" onClick={dismissSaveNotice} type="button">
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      )}

      {storageError && (
        <div className="upload-storage-error" role="alert">
          <CircleAlert aria-hidden="true" size={17} />
          <span>Lokalno čuvanje nije dostupno: {storageError}</span>
        </div>
      )}

      <section aria-label="Product Quoting pregled" className="metrics-grid product-summary-grid">
        <Card className="metric-card">
          <CardContent className="p-0">
            <div className="metric-card-top">
              <span className="metric-label">Sačuvani u ovom browseru</span>
              <span className="metric-icon metric-icon--blue"><Inbox aria-hidden="true" size={16} /></span>
            </div>
            <div className="metric-value-row">
              <strong className="metric-value">{counts.uploaded}</strong>
              <span className="metric-context">od {counts.all} zahteva</span>
            </div>
            <p className="metric-caption">Fajlovi sačuvani lokalno</p>
          </CardContent>
        </Card>
        <Card className="metric-card">
          <CardContent className="p-0">
            <div className="metric-card-top">
              <span className="metric-label">Stavke za pregled</span>
              <span className="metric-icon metric-icon--amber"><CircleAlert aria-hidden="true" size={16} /></span>
            </div>
            <div className="metric-value-row">
              <strong className="metric-value">{counts.reviewItems}</strong>
              <span className="metric-context">u {counts.review} zahteva</span>
            </div>
            <p className="metric-caption">Potrebna ljudska provera SKU-a i cene</p>
          </CardContent>
        </Card>
      </section>

      <Card className="requests-card">
        <div className="requests-card-heading">
          <div>
            <h2>Zahtevi</h2>
            <p>Sintetički primeri i fajlovi sačuvani lokalno u ovom browseru.</p>
          </div>
          <div className="requests-card-actions">
            <label className="search-field">
              <Search aria-hidden="true" size={15} />
              <Input
                aria-label="Pretraži zahteve"
                className="search-input"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Pretraži zahteve..."
                type="search"
                value={searchTerm}
              />
              {searchTerm && (
                <Button
                  aria-label="Obriši pretragu"
                  className="search-clear"
                  onClick={() => setSearchTerm("")}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" size={13} />
                </Button>
              )}
            </label>
          </div>
        </div>

        <Tabs
          className="requests-tabs"
          onValueChange={(value) => setActiveFilter(value as RequestFilter)}
          value={activeFilter}
        >
          <TabsList aria-label="Filtriraj zahteve" className="filter-tabs">
            {FILTERS.map(({ value, label }) => (
              <TabsTrigger className="filter-tab" key={value} value={value}>
                <span className="filter-tab-content">
                  {label}<span className="filter-count">{counts[value]}</span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent className="request-tab-panel" value={activeFilter}>
            <div className="request-table-wrap">
              <Table className="request-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Zahtev / dokument</TableHead>
                    <TableHead>Stavke</TableHead>
                    <TableHead>Za pregled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length > 0 ? filteredRequests.map((request) => {
                    const { Icon: FileIcon, className } = FILE_DETAILS[request.format];

                    return (
                      <TableRow className="request-row" key={request.id}>
                        <TableCell>
                          <div className="request-title-wrap">
                            <span className={`file-type-icon ${className}`}>
                              <FileIcon aria-hidden="true" size={17} />
                            </span>
                            <div className="request-title-copy">
                              <button
                                className="request-title-button"
                                onClick={() => setSelectedRequest(request)}
                                type="button"
                              >
                                {request.title}
                              </button>
                              <span className="request-file-meta">
                                <span className="file-kind-label">{DOCUMENT_LABELS[request.documentType]}</span>
                                {request.storage === "browser" && (
                                  <span className="local-storage-label">SAČUVANO U BROWSERU</span>
                                )}
                                <span>{request.filename}</span>
                                <span>·</span>
                                <span>{request.id}</span>
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><span className="items-count">{request.itemCount}</span></TableCell>
                        <TableCell>
                          <span className={`review-count ${request.reviewCount === 0 ? "review-count--none" : ""}`}>
                            {request.reviewCount || "—"}
                          </span>
                        </TableCell>
                        <TableCell><StatusBadge status={request.status} /></TableCell>
                        <TableCell>
                          <Button
                            aria-label={`Otvori izvorni dokument za ${request.title}`}
                            className="request-open-button"
                            onClick={() => setSelectedRequest(request)}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <ChevronRight aria-hidden="true" size={16} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell className="request-empty-state" colSpan={5}>
                        <Search aria-hidden="true" size={19} />
                        <strong>Nema rezultata za ovaj filter</strong>
                        <span>Promenite filter ili pokušajte drugu pretragu.</span>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <div className="requests-card-footer">
          <span>Prikazano <strong>{filteredRequests.length}</strong> od <strong>{counts.all}</strong> zahteva</span>
          <span>{storageLoading ? "Učitavam lokalne zahteve…" : "Lokalni fajlovi se ne sinhronizuju sa serverom."}</span>
        </div>
      </Card>

      <SourcePreviewDrawer
        document={previewDocument}
        onOpenChange={(open) => {
          if (!open) setSelectedRequest(null);
        }}
      />

      <Dialog onOpenChange={handleUploadOpenChange} open={uploadOpen}>
        <DialogContent className="upload-dialog">
          <DialogHeader className="upload-dialog-header">
            <div className="upload-title-row">
              <span className="upload-title-icon"><Upload aria-hidden="true" size={18} /></span>
              <div className="dialog-heading-copy">
                <DialogTitle>Uvezi Product zahtev</DialogTitle>
                <DialogDescription>
                  Izaberite sintetički fajl. Biće sačuvan lokalno u ovom browseru.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="upload-content">
            <label className="upload-field">
              <span>Tip dokumenta</span>
              <select
                className="upload-select"
                onChange={(event) => setDocumentType(event.target.value as ProductDocumentType)}
                value={documentType}
              >
                <option value="INQUIRY">Upit / email</option>
                <option value="PRODUCT_LIST">Lista artikala</option>
                <option value="OTHER">Drugi dokument</option>
              </select>
            </label>
            <input
              accept=".pdf,.xlsx,.csv,.eml"
              aria-label="Izaberi lokalni fajl za demo prikaz"
              className="sr-only"
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
            <div className="upload-zone">
              {selectedFile ? (
                <div className="upload-selected-file">
                  <FileText aria-hidden="true" size={18} />
                  <span><strong>{selectedFile.name}</strong><small>{fileSizeLabel(selectedFile.size)} · ostaje u browseru</small></span>
                  <CheckCircle2 aria-hidden="true" size={16} />
                </div>
              ) : (
                <>
                  <span className="upload-zone-icon"><Upload aria-hidden="true" size={17} /></span>
                  <strong>Dodajte upit ili listu artikala</strong>
                  <span>PDF, XLSX, CSV ili EML · najviše 20 MB</span>
                </>
              )}
              <Button
                className="outline-button"
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                {selectedFile ? "Izaberi drugi fajl" : "Odaberi fajl"}
              </Button>
              {uploadMessage && <span className="upload-validation-message" role="alert">{uploadMessage}</span>}
            </div>
            <div className="upload-notice">
              <LockKeyhole aria-hidden="true" size={14} />
              <span>
                Čuva se samo na ovom uređaju u IndexedDB-u. Nije poslato na server,
                nije sinhronizovano sa drugim korisnicima i još se ne parsira.
                Koristite samo sintetičke demo fajlove.
              </span>
            </div>
            {storageError && (
              <div className="upload-storage-error" role="alert">
                <CircleAlert aria-hidden="true" size={16} />
                <span>{storageError}</span>
              </div>
            )}
          </div>
          <DialogFooter className="upload-dialog-footer">
            <Button className="cancel-button" onClick={() => handleUploadOpenChange(false)} type="button" variant="outline">Zatvori</Button>
            <Button
              className="save-upload-button"
              disabled={!selectedFile || isSaving || storageLoading || Boolean(storageError)}
              size="lg"
              onClick={handleSaveUpload}
              type="button"
            >
              <Save aria-hidden="true" size={14} />
              {isSaving ? "Čuvam fajl…" : storageLoading ? "Pripremam skladište…" : "Sačuvaj zahtev"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}