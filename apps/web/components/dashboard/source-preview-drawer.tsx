"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Mail,
  TableProperties,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type SourcePreviewFormat = "PDF" | "XLSX" | "CSV" | "EML";

export type SourcePreviewDocument = {
  id: string;
  title: string;
  filename: string;
  format: SourcePreviewFormat;
  updatedAt: string;
  selectedReference?: string;
  viewMode?: "product" | "technical";
  storage?: "server";
  storedSizeBytes?: number;
};

type SourcePreviewDrawerProps = {
  document: SourcePreviewDocument | null;
  onOpenChange: (open: boolean) => void;
};

type StoredPreviewState =
  | { id: string; kind: "pdf"; url: string }
  | { id: string; kind: "text"; text: string; truncated: boolean }
  | { id: string; kind: "workbook"; sheets: WorkbookSheetPreview[]; hiddenSheetCount: number }
  | { id: string; kind: "error"; message: string };

type WorkbookSheetPreview = {
  name: string;
  rows: string[][];
  rowCount: number;
  truncated: boolean;
};

const MAX_WORKBOOK_SHEETS = 20;
const MAX_WORKBOOK_ROWS = 250;
const MAX_WORKBOOK_COLUMNS = 24;
const MAX_CELL_TEXT_LENGTH = 500;

function getDocumentLabel(document: SourcePreviewDocument) {
  if (document.format === "XLSX") return "Excel · pregled radnih listova";
  if (document.format === "PDF") return "PDF · pregled izvornog fajla";
  if (document.format === "CSV") return "CSV · tekstualni pregled";
  return "Email · tekstualni pregled";
}

function formatWorkbookCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return new Intl.DateTimeFormat("sr-Latn-RS").format(value);
  const text = String(value);
  return text.length > MAX_CELL_TEXT_LENGTH
    ? `${text.slice(0, MAX_CELL_TEXT_LENGTH)}…`
    : text;
}

function columnLabel(index: number) {
  let number = index + 1;
  let label = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    number = Math.floor((number - 1) / 26);
  }

  return label;
}

export function SourcePreviewDrawer({ document, onOpenChange }: SourcePreviewDrawerProps) {
  const isServerStored = document?.storage === "server";
  const sourceDocumentId = document?.id;
  const sourceFormat = document?.format;
  const [storedPreview, setStoredPreview] = useState<StoredPreviewState | null>(null);
  const [selectedWorkbookSheet, setSelectedWorkbookSheet] = useState<{
    documentId: string;
    sheetName: string;
  } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    let objectUrl: string | null = null;
    const abortController = new AbortController();

    if (!sourceDocumentId || !isServerStored || !sourceFormat) return;
    const documentId = sourceDocumentId;

    async function loadPreview() {
      try {
        const response = await fetch(
          `/api/documents/${encodeURIComponent(documentId)}/content`,
          { cache: "no-store", signal: abortController.signal },
        );
        if (!response.ok) throw new Error("Sadržaj dokumenta nije dostupan.");
        const sourceBlob = await response.blob();

        if (sourceFormat === "PDF") {
          objectUrl = URL.createObjectURL(sourceBlob);
          if (isCurrent) setStoredPreview({ id: documentId, kind: "pdf", url: objectUrl });
        } else if (sourceFormat === "CSV" || sourceFormat === "EML") {
          const previewSlice = sourceBlob.slice(0, 50 * 1024);
          const text = await previewSlice.text();
          if (isCurrent) {
            setStoredPreview({
              id: documentId,
              kind: "text",
              text,
              truncated: sourceBlob.size > previewSlice.size,
            });
          }
        } else {
          const { default: readExcelFile } = await import("read-excel-file/browser");
          const workbookSheets = await readExcelFile(sourceBlob, { trim: false });
          if (!isCurrent) return;

          const visibleSheets = workbookSheets.slice(0, MAX_WORKBOOK_SHEETS);
          const sheets = visibleSheets.map(({ sheet, data }) => ({
            name: sheet,
            rowCount: data.length,
            rows: data
              .slice(0, MAX_WORKBOOK_ROWS)
              .map((row) => row.slice(0, MAX_WORKBOOK_COLUMNS).map(formatWorkbookCell)),
            truncated:
              data.length > MAX_WORKBOOK_ROWS ||
              data.some((row) => row.length > MAX_WORKBOOK_COLUMNS),
          }));

          setStoredPreview({
            id: documentId,
            kind: "workbook",
            sheets,
            hiddenSheetCount: workbookSheets.length - visibleSheets.length,
          });
        }
      } catch {
        if (isCurrent && !abortController.signal.aborted) {
          setStoredPreview({
            id: documentId,
            kind: "error",
            message: "Dokument nije moguće prikazati. Proverite da li je fajl ispravan.",
          });
        }
      }
    }

    void loadPreview();

    return () => {
      isCurrent = false;
      abortController.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceDocumentId, sourceFormat, isServerStored]);

  const currentStoredPreview = storedPreview?.id === document?.id ? storedPreview : null;
  const currentWorkbookPreview =
    currentStoredPreview?.kind === "workbook" ? currentStoredPreview : null;
  const activeWorkbookSheet = currentWorkbookPreview?.sheets.find(
    (sheet) =>
      selectedWorkbookSheet !== null &&
      selectedWorkbookSheet.documentId === document?.id &&
      selectedWorkbookSheet.sheetName === sheet.name,
  ) ?? currentWorkbookPreview?.sheets[0] ?? null;
  const activeWorkbookColumnCount = activeWorkbookSheet?.rows.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  ) ?? 0;

  return (
    <Sheet modal={false} open={document !== null} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby="source-preview-description"
        className="source-preview-drawer"
        onInteractOutside={(event) => event.preventDefault()}
        side="right"
        showCloseButton={false}
      >
        {document && (
          <>
            <SheetHeader className="source-preview-header">
              <div className="source-preview-title-group">
                <span
                  className={`source-preview-file-icon ${document.format === "XLSX" ? "source-preview-file-icon--xlsx" : document.format === "CSV" ? "source-preview-file-icon--csv" : document.format === "EML" ? "source-preview-file-icon--eml" : ""}`}
                >
                  {document.format === "XLSX" || document.format === "CSV" ? (
                    <FileSpreadsheet aria-hidden="true" size={19} />
                  ) : document.format === "EML" ? (
                    <Mail aria-hidden="true" size={19} />
                  ) : (
                    <FileText aria-hidden="true" size={19} />
                  )}
                </span>
                <div className="source-preview-title-copy">
                  <span className="source-preview-kicker">Originalni dokument · {document.id}</span>
                  <SheetTitle>{document.title}</SheetTitle>
                  <SheetDescription id="source-preview-description">
                    {document.filename} · {document.updatedAt}
                  </SheetDescription>
                </div>
              </div>
              <div className="source-preview-header-actions">
                <Badge className="synthetic-label" variant="outline">
                  {isServerStored ? "API STORAGE" : "PREVIEW"}
                </Badge>
                <Button
                  aria-label="Zatvori pregled dokumenta"
                  className="source-preview-close"
                  onClick={() => onOpenChange(false)}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <X aria-hidden="true" size={17} />
                </Button>
              </div>
            </SheetHeader>

            <div className="source-preview-body">
              <div className="source-preview-status">
                <span>{getDocumentLabel(document)}</span>
                <Badge className="source-preview-zoom" variant="outline">
                  {isServerStored ? "Fajl sačuvan na backendu" : "Pregled · samo čitanje"}
                </Badge>
              </div>

              <article className="source-preview-canvas">
                {isServerStored && document.format === "PDF" ? (
                  currentStoredPreview?.kind === "pdf" ? (
                    <iframe
                      className="stored-pdf-preview"
                      src={currentStoredPreview.url}
                      title={`Pregled PDF fajla ${document.filename}`}
                    />
                  ) : currentStoredPreview?.kind === "error" ? (
                    <div className="stored-file-loading">{currentStoredPreview.message}</div>
                  ) : (
                    <div className="stored-file-loading">Otvaram lokalni PDF preview…</div>
                  )
                ) : isServerStored && (document.format === "CSV" || document.format === "EML") ? (
                  <div className="stored-text-file-preview">
                    <div className="stored-file-heading">
                      {document.format === "EML" ? <Mail aria-hidden="true" size={18} /> : <TableProperties aria-hidden="true" size={18} />}
                      <div>
                        <strong>{document.filename}</strong>
                        <span>{document.format === "EML" ? "Email tekst · bez HTML izvršavanja" : "CSV tekst · bez formula izvršavanja"}</span>
                      </div>
                      <CheckCircle2 aria-label="Sačuvano na backendu" size={17} />
                    </div>
                    {currentStoredPreview?.kind === "text" ? (
                      <>
                        <pre className="stored-plain-text">{currentStoredPreview.text || "(Fajl nema tekstualni sadržaj.)"}</pre>
                        {currentStoredPreview.truncated && (
                          <p className="stored-file-truncated">Preview je ograničen na prvih 50 KB. Ceo fajl je sačuvan na backendu.</p>
                        )}
                      </>
                    ) : currentStoredPreview?.kind === "error" ? (
                      <div className="stored-file-loading">{currentStoredPreview.message}</div>
                    ) : (
                      <div className="stored-file-loading">Učitavam tekstualni preview…</div>
                    )}
                  </div>
                ) : isServerStored && document.format === "XLSX" ? (
                  currentWorkbookPreview && activeWorkbookSheet ? (
                    <div className="stored-workbook-preview">
                      <div className="stored-file-heading">
                        <FileSpreadsheet aria-hidden="true" size={19} />
                        <div>
                          <strong>{document.filename}</strong>
                          <span>
                            {currentWorkbookPreview.hiddenSheetCount > 0
                              ? `Prikazano ${currentWorkbookPreview.sheets.length} listova · još ${currentWorkbookPreview.hiddenSheetCount} nije prikazano`
                              : `${currentWorkbookPreview.sheets.length} radnih listova · prikaz samo za čitanje`}
                          </span>
                        </div>
                        <CheckCircle2 aria-label="Sačuvano na backendu" size={17} />
                      </div>

                      <div className="workbook-sheet-picker">
                        <span className="workbook-sheet-picker-label">Radni listovi</span>
                        <div aria-label="Izaberite radni list" className="workbook-sheet-tabs" role="group">
                          {currentWorkbookPreview.sheets.map((sheet) => {
                            const isSelected = sheet.name === activeWorkbookSheet.name;
                            return (
                              <button
                                aria-pressed={isSelected}
                                className={`workbook-sheet-tab ${isSelected ? "workbook-sheet-tab--active" : ""}`}
                                key={sheet.name}
                                onClick={() =>
                                  setSelectedWorkbookSheet({ documentId: document.id, sheetName: sheet.name })
                                }
                                type="button"
                              >
                                {sheet.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="workbook-sheet-caption">
                        <span><strong>{activeWorkbookSheet.name}</strong> · {activeWorkbookSheet.rowCount} redova</span>
                        <span>Kolone su označene Excel oznakama</span>
                      </div>

                      {activeWorkbookSheet.rows.length > 0 && activeWorkbookColumnCount > 0 ? (
                        <div className="workbook-grid-scroll" role="region" aria-label={`Sadržaj lista ${activeWorkbookSheet.name}`} tabIndex={0}>
                          <table className="workbook-grid">
                            <thead>
                              <tr>
                                <th aria-label="Broj reda" className="workbook-row-number-heading">#</th>
                                {Array.from({ length: activeWorkbookColumnCount }, (_, columnIndex) => (
                                  <th key={columnIndex}>{columnLabel(columnIndex)}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {activeWorkbookSheet.rows.map((row, rowIndex) => {
                                const isSelected = document.selectedReference?.includes(String(row[0] ?? "")) ?? false;
                                return (
                                  <tr className={isSelected ? "workbook-row--selected" : ""} key={`${activeWorkbookSheet.name}-${rowIndex}`}>
                                    <th className="workbook-row-number">{rowIndex + 1}</th>
                                    {Array.from({ length: activeWorkbookColumnCount }, (_, columnIndex) => (
                                      <td key={columnIndex}>
                                        {row[columnIndex] || <span className="workbook-empty-cell">—</span>}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="workbook-empty-sheet">
                          <FileSpreadsheet aria-hidden="true" size={23} />
                          <strong>Ovaj radni list je prazan</strong>
                          <span>U fajlu nema ćelija koje mogu da se prikažu.</span>
                        </div>
                      )}

                      {(activeWorkbookSheet.truncated || currentWorkbookPreview.hiddenSheetCount > 0) && (
                        <p className="stored-file-truncated">
                          Po radnom listu prikazujemo najviše {MAX_WORKBOOK_ROWS} redova i {MAX_WORKBOOK_COLUMNS} kolona, a iz fajla najviše {MAX_WORKBOOK_SHEETS} listova. Originalni fajl nije izmenjen.
                        </p>
                      )}

                      <div className="source-document-callout">
                        <LockKeyhole aria-hidden="true" size={15} />
                        <span>Formula ćelije prikazuju samo sačuvani rezultat ako postoji. Formule i makroi se ne izvršavaju; podaci se ne šalju sa uređaja.</span>
                      </div>
                    </div>
                  ) : currentWorkbookPreview ? (
                    <div className="workbook-preview-error" role="status">
                      <AlertCircle aria-hidden="true" size={22} />
                      <strong>Nema radnih listova za prikaz</strong>
                      <span>Ovaj XLSX ne sadrži listove koje pregled može da prikaže.</span>
                      <small>Originalni fajl je sačuvan na backendu.</small>
                    </div>
                  ) : currentStoredPreview?.kind === "error" ? (
                    <div className="workbook-preview-error" role="alert">
                      <AlertCircle aria-hidden="true" size={22} />
                      <strong>Ne mogu da prikažem ovaj XLSX</strong>
                      <span>{currentStoredPreview.message}</span>
                      <small>Originalni fajl je i dalje sačuvan na backendu.</small>
                    </div>
                  ) : (
                    <div className="stored-file-loading">Učitavam radne listove…</div>
                  )
                ) : (
                  <div className="workbook-preview-error" role="status">
                    <AlertCircle aria-hidden="true" size={22} />
                    <strong>Pregled fajla nije dostupan</strong>
                    <span>Izaberite dokument sa liste da biste učitali njegov sadržaj.</span>
                  </div>
                )}
              </article>
            </div>

          </>
        )}
      </SheetContent>
    </Sheet>
  );
}