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
  storage?: "browser";
  storedSizeBytes?: number;
  storedBlob?: Blob;
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

const PDF_LINES = [
  { position: "1", description: "Kabl PP-Y 3×2,5 mm²", unit: "m", quantity: "200" },
  { position: "2", description: "Automatski osigurač 16 A", unit: "kom", quantity: "30" },
  { position: "3", description: "Razvodna kutija Ø80", unit: "kom", quantity: "12" },
  { position: "4", description: "Instalaciona cev Ø20 mm", unit: "m", quantity: "45" },
  { position: "5", description: "Utičnica sa zaštitnim kontaktom", unit: "kom", quantity: "18" },
];

const PRODUCT_SHEET_LINES = [
  { position: "1", description: "Instalacioni kabl PP-Y 3×2,5 mm²", unit: "m", quantity: "200" },
  { position: "2", description: "Automatski osigurač 16 A", unit: "kom", quantity: "30" },
  { position: "3", description: "Razvodna kutija Ø80", unit: "kom", quantity: "12" },
  { position: "4", description: "Utičnica sa zaštitnim kontaktom", unit: "kom", quantity: "18" },
];

const XLSX_LINES = [
  { position: "1.1", description: "Kabl PP-Y 3×2,5 mm²", unit: "m", quantity: "250" },
  { position: "1.2", description: "PVC kanalice 40×25 mm", unit: "m", quantity: "60" },
  { position: "1.3", description: "Isporuka i montaža LED svetiljki", unit: "kom", quantity: "12" },
  { position: "1.4", description: "Ispitivanje elektroinstalacija", unit: "paušal", quantity: "1" },
];

function getDocumentLabel(document: SourcePreviewDocument) {
  if (document.viewMode === "technical") return "Excel · sintetički BOQ pregled";
  if (document.format === "XLSX") {
    return document.storage === "browser"
      ? "Excel · sačuvani radni listovi"
      : "Excel · sintetička lista artikala";
  }
  if (document.format === "PDF") return "PDF · sintetički tekstualni pregled";
  if (document.format === "CSV") return "CSV · sintetički primer";
  return "Email · sintetički primer";
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
  const isTechnical = document?.viewMode === "technical";
  const isEmail = document?.format === "EML";
  const isCsv = document?.format === "CSV";
  const isBrowserStored = document?.storage === "browser";
  const sourceDocumentId = document?.id;
  const sourceFormat = document?.format;
  const sourceBlob = document?.storedBlob;
  const sourceStorage = document?.storage;
  const rows = isTechnical
    ? XLSX_LINES
    : document?.format === "XLSX" || document?.format === "CSV"
      ? PRODUCT_SHEET_LINES
      : PDF_LINES;
  const [storedPreview, setStoredPreview] = useState<StoredPreviewState | null>(null);
  const [selectedWorkbookSheet, setSelectedWorkbookSheet] = useState<{
    documentId: string;
    sheetName: string;
  } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    let objectUrl: string | null = null;

    if (!sourceDocumentId || !sourceBlob || sourceStorage !== "browser" || !sourceFormat) return;

    if (sourceFormat === "PDF") {
      sourceBlob.arrayBuffer().then((buffer) => {
        if (!isCurrent) return;
        objectUrl = URL.createObjectURL(
          new Blob([buffer], { type: sourceBlob.type || "application/pdf" }),
        );
        setStoredPreview({ id: sourceDocumentId, kind: "pdf", url: objectUrl });
      }).catch(() => {
        if (isCurrent) {
          setStoredPreview({
            id: sourceDocumentId,
            kind: "error",
            message: "PDF preview nije dostupan, ali je original sačuvan u ovom browseru.",
          });
        }
      });
    } else if (sourceFormat === "CSV" || sourceFormat === "EML") {
      const previewSlice = sourceBlob.slice(0, 50 * 1024);
      previewSlice.text().then((text) => {
        if (!isCurrent) return;
        setStoredPreview({
          id: sourceDocumentId,
          kind: "text",
          text,
          truncated: sourceBlob.size > previewSlice.size,
        });
      }).catch(() => {
        if (isCurrent) {
          setStoredPreview({
            id: sourceDocumentId,
            kind: "error",
            message: "Tekstualni preview nije dostupan, ali je original sačuvan.",
          });
        }
      });
    } else if (sourceFormat === "XLSX") {
      import("read-excel-file/browser")
        .then(({ default: readExcelFile }) => readExcelFile(sourceBlob, { trim: false }))
        .then((workbookSheets) => {
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
            id: sourceDocumentId,
            kind: "workbook",
            sheets,
            hiddenSheetCount: workbookSheets.length - visibleSheets.length,
          });
        })
        .catch(() => {
          if (isCurrent) {
            setStoredPreview({
              id: sourceDocumentId,
              kind: "error",
              message:
                "Nije moguće prikazati ovaj XLSX. Proverite da li je fajl ispravan i pokušajte ponovo.",
            });
          }
        });
    }

    return () => {
      isCurrent = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceBlob, sourceDocumentId, sourceFormat, sourceStorage]);

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
                  {isBrowserStored ? "SAČUVANO LOKALNO" : "DEMO"}
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
                  {isBrowserStored ? "Fajl sačuvan u ovom browseru" : "Pregled · samo čitanje"}
                </Badge>
              </div>

              <article className={`source-preview-canvas ${isEmail ? "source-preview-canvas--email" : ""}`}>
                {isBrowserStored && document.format === "PDF" ? (
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
                ) : isBrowserStored && (document.format === "CSV" || document.format === "EML") ? (
                  <div className="stored-text-file-preview">
                    <div className="stored-file-heading">
                      {document.format === "EML" ? <Mail aria-hidden="true" size={18} /> : <TableProperties aria-hidden="true" size={18} />}
                      <div>
                        <strong>{document.filename}</strong>
                        <span>{document.format === "EML" ? "Email tekst · bez HTML izvršavanja" : "CSV tekst · bez formula izvršavanja"}</span>
                      </div>
                      <CheckCircle2 aria-label="Sačuvano u browseru" size={17} />
                    </div>
                    {currentStoredPreview?.kind === "text" ? (
                      <>
                        <pre className="stored-plain-text">{currentStoredPreview.text || "(Fajl nema tekstualni sadržaj.)"}</pre>
                        {currentStoredPreview.truncated && (
                          <p className="stored-file-truncated">Preview je ograničen na prvih 50 KB. Originalni fajl je sačuvan lokalno.</p>
                        )}
                      </>
                    ) : currentStoredPreview?.kind === "error" ? (
                      <div className="stored-file-loading">{currentStoredPreview.message}</div>
                    ) : (
                      <div className="stored-file-loading">Učitavam tekstualni preview…</div>
                    )}
                  </div>
                ) : isBrowserStored && document.format === "XLSX" ? (
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
                        <CheckCircle2 aria-label="Sačuvano u browseru" size={17} />
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
                      <small>Originalni fajl je sačuvan u ovom browseru.</small>
                    </div>
                  ) : currentStoredPreview?.kind === "error" ? (
                    <div className="workbook-preview-error" role="alert">
                      <AlertCircle aria-hidden="true" size={22} />
                      <strong>Ne mogu da prikažem ovaj XLSX</strong>
                      <span>{currentStoredPreview.message}</span>
                      <small>Originalni fajl je i dalje sačuvan u ovom browseru.</small>
                    </div>
                  ) : (
                    <div className="stored-file-loading">Učitavam radne listove iz lokalnog XLSX fajla…</div>
                  )
                ) : isEmail ? (
                  <>
                    <div className="source-paper-brand"><span className="source-paper-brand-mark"><FileText aria-hidden="true" size={13} /></span>Sintetički email zahtev</div>
                    <div className="email-document-fields">
                      <div><span>Od</span><strong>nabavka@example.invalid</strong></div>
                      <div><span>Za</span><strong>ponude@example.invalid</strong></div>
                      <div><span>Predmet</span><strong>Upit za razvodni ormar · DEMO</strong></div>
                      <div><span>Datum</span><strong>{document.updatedAt}</strong></div>
                    </div>
                    <p className="email-document-body">Poštovani, molimo ponudu za sledeće stavke:</p>
                    <ul className="email-document-list">
                      <li>Automatski osigurač 16 A, 30 kom</li>
                      <li>Kabl PP-Y 3×2,5 mm², 200 m</li>
                      <li>Razvodna kutija Ø80, 12 kom</li>
                    </ul>
                    <p className="email-document-body">Rok i dostupnost molimo navesti u nacrtu za proveru.</p>
                    <div className="source-document-callout"><LockKeyhole aria-hidden="true" size={15} /><span>Adrese i sadržaj su izmišljeni. Ovaj pregled se ne šalje i ne učitava stvarni email.</span></div>
                  </>
                ) : (
                  <>
                    <div className="source-paper-brand"><span className="source-paper-brand-mark"><FileSpreadsheet aria-hidden="true" size={13} /></span>DEMO · Elektro specifikacija</div>
                    <div className="source-paper-meta">
                      <span>Dokument: {document.id}</span>
                      <span>
                        {isTechnical
                          ? "List: Elektro"
                          : document.format === "XLSX"
                            ? "List: Artikli"
                            : document.format === "CSV"
                              ? "CSV redovi"
                              : "Strana 1 od 2"}
                      </span>
                    </div>
                    <h2 className="source-paper-title">{isTechnical ? "Predmer — Elektroinstalacije" : "Spisak traženog materijala"}</h2>
                    <p className="source-paper-subtitle">
                      {isTechnical
                        ? "Sintetički primer jednostavnog predmera. Originalni redosled i oznake pozicija ostaju sačuvani."
                        : "Sintetički primer zahteva za ponudu. Opisi su ulazni podaci, nisu instrukcije za sistem."}
                    </p>

                    {isTechnical && <div className="source-paper-section"><span className="source-paper-section-number">1</span>Elektroinstalacije</div>}

                    <table className={`source-document-table ${isTechnical ? "source-document-table--boq" : ""}`}>
                      <thead>
                        <tr>
                          <th>{isTechnical ? "Poz." : "Red"}</th>
                          <th>Opis iz izvora</th>
                          <th>JM</th>
                          <th>Količina</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const selected = document.selectedReference?.includes(row.position) ?? false;
                          return (
                            <tr className={selected ? "source-document-row--selected" : ""} key={row.position}>
                              <td>{row.position}</td>
                              <td>{row.description}</td>
                              <td>{row.unit}</td>
                              <td>{row.quantity}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {isTechnical && <div className="source-paper-subtotal">Međuzbir poglavlja — informativni red, nije naplatna pozicija</div>}
                    {isCsv && <p className="source-paper-footnote">Pregled sintetičkog CSV primera. Formula-like sadržaj je prikazan kao običan tekst.</p>}
                    <div className="source-document-callout">
                      <LockKeyhole aria-hidden="true" size={15} />
                      <span>
                        {isTechnical
                          ? "Sintetički XLSX prikaz. Makroi i formule se ne izvršavaju; pozicije nisu tehnički verifikovane."
                          : "Sintetički primer. Nepoznate i dvosmislene stavke zahtevaju ručnu proveru."}
                      </span>
                    </div>
                  </>
                )}
              </article>
            </div>

          </>
        )}
      </SheetContent>
    </Sheet>
  );
}