"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  History,
  Link2,
  LockKeyhole,
  Plug,
  Upload,
} from "lucide-react";

import {
  CATALOG_FIELD_OPTIONS,
  importCatalogFile,
  listCatalogImports,
  mapCatalogPreviewRows,
  missingRequiredCatalogFields,
  parseCatalogFile,
  suggestCatalogColumnMapping,
  validateDocumentFile,
} from "@/api";
import type {
  CatalogColumnMapping,
  CatalogField,
  CatalogImportSummary,
  DocumentFormat,
  ParsedCatalogSheet,
} from "@/api";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const CATALOG_FORMATS = ["CSV", "XLSX"] as const satisfies readonly DocumentFormat[];

const CONNECTORS = [
  {
    name: "PANTHEON",
    kind: "ERP",
    description: "Konektor nije implementiran. Potrebni su API pristup, verzija i potvrđene dozvole.",
  },
  {
    name: "Odoo",
    kind: "ERP",
    description: "Konektor nije implementiran. Verzija i API dozvole moraju biti potvrđene.",
  },
  {
    name: "Selltico",
    kind: "ERP",
    description: "API pristup i partnerske dozvole nisu potvrđeni.",
  },
  {
    name: "SAP",
    kind: "ERP",
    description: "Konektor nije implementiran. Potrebna je procena konkretnog sistema i API-ja.",
  },
  {
    name: "Minimax",
    kind: "ERP",
    description: "Konektor nije implementiran. Potrebni su API dokumentacija i autorizovan test nalog.",
  },
  {
    name: "Drugi ERP / CRM",
    kind: "ERP / CRM",
    description: "Mogućnosti konektora procenjuju se tek nakon potvrđenog API-ja i odobrenog pristupa.",
  },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function spreadsheetColumnLabel(index: number) {
  let number = index + 1;
  let label = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    number = Math.floor((number - 1) / 26);
  }
  return label;
}

export function DataSourcesPage() {
  const [selectedCatalog, setSelectedCatalog] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [parsedSheets, setParsedSheets] = useState<ParsedCatalogSheet[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [columnMapping, setColumnMapping] = useState<CatalogColumnMapping | null>(null);
  const [useManualMapping, setUseManualMapping] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [imports, setImports] = useState<CatalogImportSummary[]>([]);
  const [importsLoading, setImportsLoading] = useState(true);
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSheet = parsedSheets[activeSheetIndex] ?? null;
  const missingRequiredFields = columnMapping
    ? missingRequiredCatalogFields(columnMapping)
    : [];
  const mappedPreviewRows = activeSheet && columnMapping
    ? mapCatalogPreviewRows(activeSheet.rows, columnMapping)
    : [];

  useEffect(() => {
    let isCurrent = true;

    listCatalogImports()
      .then((result) => {
        if (isCurrent) setImports(result);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setImportError(error instanceof Error ? error.message : "Uvezeni katalozi nisu dostupni.");
        }
      })
      .finally(() => {
        if (isCurrent) setImportsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function handleCatalogFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const validationError = validateDocumentFile(file, CATALOG_FORMATS);
    if (validationError) {
      setSelectedCatalog(null);
      setSelectionNotice("");
      setParsedSheets([]);
      setColumnMapping(null);
      setFileError(validationError);
      event.currentTarget.value = "";
      return;
    }

    setSelectedCatalog(file);
    setParsedSheets([]);
    setColumnMapping(null);
    setUseManualMapping(false);
    setActiveSheetIndex(0);
    setFileError("");
    setSelectionNotice("");
    setIsParsing(true);

    try {
      const sheets = await parseCatalogFile(file);
      if (sheets.length === 0 || sheets.every((sheet) => sheet.headers.length === 0)) {
        throw new Error("Fajl ne sadrži red zaglavlja koji može da se mapira.");
      }

      setParsedSheets(sheets);
      setColumnMapping(suggestCatalogColumnMapping(sheets[0].headers));
      setSelectionNotice("Fajl je parsiran lokalno radi mapiranja; nije poslat niti sačuvan.");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Nije moguće parsirati katalog fajl.");
      setSelectedCatalog(null);
    } finally {
      setIsParsing(false);
    }
  }

  function selectSheet(index: number) {
    setActiveSheetIndex(index);
    setUseManualMapping(true);
    const sheet = parsedSheets[index];
    if (sheet) setColumnMapping(suggestCatalogColumnMapping(sheet.headers));
  }

  function updateColumnMapping(field: CatalogField, value: string) {
    setUseManualMapping(true);
    setColumnMapping((current) => current ? { ...current, [field]: value } : current);
  }

  async function handleCatalogImport() {
    if (!selectedCatalog || !activeSheet) return;

    const confirmedMapping = useManualMapping && columnMapping && missingRequiredFields.length === 0
      ? columnMapping
      : undefined;
    setIsImporting(true);
    setFileError("");
    setImportError("");
    setSelectionNotice("");
    let imported;
    try {
      imported = await importCatalogFile(
        selectedCatalog,
        confirmedMapping,
        confirmedMapping && selectedCatalog.name.toLowerCase().endsWith(".xlsx")
          ? activeSheet.name
          : undefined,
      );
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Uvoz kataloga nije uspeo.");
      setIsImporting(false);
      return;
    } finally {
      setIsImporting(false);
    }

    setSelectionNotice(
      `Uvezen katalog v${imported.version}: ${imported.products_imported} proizvoda i ${imported.aliases_imported} alias-a.`,
    );
    setSelectedCatalog(null);
    setParsedSheets([]);
    setColumnMapping(null);
    setActiveSheetIndex(0);
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      setImports(await listCatalogImports());
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Istorija importa nije osvežena.");
    }
  }

  return (
    <DashboardShell activeModule="catalog">
      <section aria-labelledby="data-sources-title" className="page-heading data-sources-heading">
        <div>
          <span className="heading-eyebrow">Podaci organizacije</span>
          <h1 id="data-sources-title">Katalog i izvori</h1>
          <p>Upravljajte katalogom proizvoda i planirajte povezivanje sa poslovnim sistemima.</p>
        </div>
      </section>

      <div className="data-sources-notice" role="note">
        <LockKeyhole aria-hidden="true" size={16} />
        <span>Mapiranje se radi lokalno u browseru, a potvrđeni import se čuva u lokalnom API-ju. Katalog i storage nisu tenant-izolovani; koristite samo sintetičke podatke. ERP/CRM konektori nisu implementirani.</span>
      </div>

      <Tabs className="data-sources-tabs" defaultValue="catalog">
        <TabsList aria-label="Izvori podataka" className="data-sources-tab-list" variant="line">
          <TabsTrigger className="data-sources-tab" value="catalog">
            <Database aria-hidden="true" size={15} />Katalog proizvoda
          </TabsTrigger>
          <TabsTrigger className="data-sources-tab" value="integrations">
            <Plug aria-hidden="true" size={15} />ERP / CRM integracije
          </TabsTrigger>
        </TabsList>

        <TabsContent className="data-sources-panel" value="catalog">
          <div className="data-source-section-heading">
            <div>
              <span className="object-section-kicker">Product Quoting</span>
              <h2>Katalog proizvoda</h2>
              <p>CSV ili XLSX katalog sa SKU šifrom, nazivom i jedinicom mere. Pilot model predviđa do 3.000 artikala.</p>
            </div>
            <Badge className="data-source-status" variant="outline">
              {importsLoading ? "Učitavam kataloge…" : imports[0] ? `Aktivna verzija v${imports[0].version}` : "Nema aktivnog kataloga"}
            </Badge>
          </div>

          <div className="catalog-import-layout">
            <section aria-labelledby="catalog-file-title" className="catalog-file-panel">
              <div className="catalog-panel-heading">
                <span className="catalog-panel-icon"><FileSpreadsheet aria-hidden="true" size={18} /></span>
                <div>
                  <h3 id="catalog-file-title">Uvoz kataloga iz fajla</h3>
                  <p>Podržani formati: CSV i XLSX · najviše 20 MB</p>
                </div>
              </div>

              <input
                accept=".csv,.xlsx"
                aria-label="Izaberi CSV ili XLSX katalog"
                className="sr-only"
                onChange={handleCatalogFileChange}
                ref={fileInputRef}
                type="file"
              />

              <div className="catalog-file-selection">
                {selectedCatalog ? (
                  <>
                    <FileSpreadsheet aria-hidden="true" size={19} />
                    <span><strong>{selectedCatalog.name}</strong><small>{formatFileSize(selectedCatalog.size)}</small></span>
                  </>
                ) : (
                  <>
                    <Upload aria-hidden="true" size={19} />
                    <span><strong>Izaberite katalog fajl</strong><small>CSV ili XLSX</small></span>
                  </>
                )}
                <Button className="catalog-select-button" disabled={isParsing} onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
                  {isParsing ? "Parsiram…" : selectedCatalog ? "Promeni fajl" : "Odaberi fajl"}
                </Button>
              </div>

              {fileError && <div className="catalog-inline-message catalog-inline-message--error" role="alert"><AlertCircle aria-hidden="true" size={15} />{fileError}</div>}
              {selectionNotice && <div className="catalog-inline-message" role="status"><AlertCircle aria-hidden="true" size={15} />{selectionNotice}</div>}

              {activeSheet && columnMapping && missingRequiredFields.length === 0 && (
                <div className="catalog-inline-message" role="status">
                  <CheckCircle2 aria-hidden="true" size={15} />
                  Lokalni predlog je spreman; API će nezavisno prepoznati strukturu kataloga.
                </div>
              )}

              <Button
                className="catalog-import-button"
                disabled={!selectedCatalog || !activeSheet || isImporting}
                onClick={handleCatalogImport}
                type="button"
              >
                {isImporting ? "Prepoznajem i uvozim…" : "Automatski prepoznaj i uvezi"}
              </Button>
            </section>

            <section aria-labelledby="catalog-fields-title" className="catalog-fields-panel">
              <div className="catalog-panel-heading">
                <span className="catalog-panel-icon catalog-panel-icon--fields"><Database aria-hidden="true" size={18} /></span>
                <div>
                  <h3 id="catalog-fields-title">Podaci kataloga</h3>
                  <p>Polja koja model trenutno može da sačuva</p>
                </div>
              </div>
              <dl className="catalog-fields-list">
                <div><dt>Obavezno</dt><dd>SKU · naziv · jedinica mere</dd></div>
                <div><dt>Opcionalno</dt><dd>Cena · valuta · PDV stopa · aktivan status</dd></div>
                <div><dt>Alternativni nazivi</dt><dd>Podržani kroz zasebne alias zapise</dd></div>
                <div><dt>Verzionisanje</dt><dd>Svaki uvoz pripada verziji kataloga</dd></div>
              </dl>
              <span className="catalog-schema-link">API automatski prepoznaje kolone; ručna izmena je dostupna po potrebi.</span>
            </section>
          </div>

          {activeSheet && columnMapping && (
            <details className="catalog-mapping-details">
              <summary>Napredno mapiranje kolona i izbor radnog lista</summary>
              <section aria-labelledby="catalog-mapping-title" className="catalog-mapping-section">
              <div className="catalog-mapping-heading">
                <div>
                  <span className="object-section-kicker">Opcionalno</span>
                  <h2 id="catalog-mapping-title">Mapiranje kolona</h2>
                  <p>{activeSheet.rowCount} lokalno parsiranih redova · ovo mapiranje važi samo ako ga potvrdiš.</p>
                </div>
                {parsedSheets.length > 1 && (
                  <label className="catalog-sheet-field">
                    <span>Radni list</span>
                    <select onChange={(event) => selectSheet(Number(event.target.value))} value={activeSheetIndex}>
                      {parsedSheets.map((sheet, index) => <option key={`${sheet.name}-${index}`} value={index}>{sheet.name}</option>)}
                    </select>
                  </label>
                )}
              </div>

              <div className="catalog-mapping-grid">
                {CATALOG_FIELD_OPTIONS.map((field) => (
                  <label className="catalog-mapping-field" key={field.value}>
                    <span>{field.label}{field.required && <strong aria-label="obavezno"> *</strong>}</span>
                    <select onChange={(event) => updateColumnMapping(field.value, event.target.value)} value={columnMapping[field.value]}>
                      <option value="">Ne mapirati</option>
                      {activeSheet.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={String(index)}>{spreadsheetColumnLabel(index)} · {header || "(prazno zaglavlje)"}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {missingRequiredFields.length > 0 ? (
                <div className="catalog-inline-message catalog-inline-message--error" role="status">
                  <AlertCircle aria-hidden="true" size={15} />
                  <span>Mapiraj obavezna polja: {missingRequiredFields.join(", ")}.</span>
                </div>
              ) : (
                <div className="catalog-inline-message" role="status">
                  <Database aria-hidden="true" size={15} />
                  <span>Obavezna polja su mapirana. Ovaj preview je lokalni i još nije sačuvan kao katalog.</span>
                </div>
              )}

              <div className="catalog-preview-heading">
                <h3>Pregled mapiranih redova</h3>
                <span>Prvih {mappedPreviewRows.length} od {activeSheet.rowCount} redova</span>
              </div>
              <div className="catalog-mapping-preview-wrap">
                <table className="catalog-mapping-preview-table">
                  <thead><tr><th>SKU</th><th>Naziv</th><th>Jedinica mere</th><th>Cena</th><th>Valuta</th><th>PDV</th><th>Aliasi</th><th>Aktivan</th></tr></thead>
                  <tbody>
                    {mappedPreviewRows.length > 0 ? mappedPreviewRows.map((row, index) => (
                      <tr key={index}>
                        <td>{row.sku || "—"}</td><td>{row.name || "—"}</td><td>{row.unit || "—"}</td>
                        <td>{row.price || "—"}</td><td>{row.currency || "—"}</td><td>{row.vat_rate || "—"}</td><td>{row.aliases || "—"}</td><td>{row.active || "—"}</td>
                      </tr>
                    )) : (
                      <tr><td className="catalog-preview-empty" colSpan={8}>Nema redova za pregled.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              </section>
            </details>
          )}

          <section aria-labelledby="catalog-import-history-title" className="catalog-history-section">
            <div className="catalog-history-heading">
              <span className="catalog-panel-icon catalog-panel-icon--fields"><History aria-hidden="true" size={17} /></span>
              <div>
                <h3 id="catalog-import-history-title">Uvezeni katalozi</h3>
                <p>Verzionisani importi trenutnog lokalnog workspace-a.</p>
              </div>
            </div>
            {importError && <div className="catalog-inline-message catalog-inline-message--error" role="alert"><AlertCircle aria-hidden="true" size={15} />{importError}</div>}
            {imports.length > 0 ? (
              <div className="catalog-history-table-wrap">
                <table className="catalog-history-table">
                  <thead><tr><th>Verzija</th><th>Status</th><th>Proizvodi</th><th>Alias-i</th><th>SHA-256</th><th>Uvezeno</th></tr></thead>
                  <tbody>
                    {imports.map((catalog) => (
                      <tr key={catalog.id}>
                        <td>v{catalog.version}</td>
                        <td><Badge className="catalog-history-status" variant="outline">{catalog.status}</Badge></td>
                        <td>{catalog.products_imported}</td>
                        <td>{catalog.aliases_imported}</td>
                        <td><code>{catalog.checksum?.slice(0, 12) ?? "—"}</code></td>
                        <td>{new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" }).format(new Date(catalog.created_at))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !importsLoading && !importError && <div className="catalog-history-empty">Još nema uvezenih verzija kataloga.</div>
            )}
          </section>
        </TabsContent>

        <TabsContent className="data-sources-panel" value="integrations">
          <div className="data-source-section-heading">
            <div>
              <span className="object-section-kicker">Business data connectors</span>
              <h2>ERP i CRM sistemi</h2>
              <p>Svaki konektor zahteva potvrđenu API dokumentaciju, dozvole i konkretan test sistem.</p>
            </div>
            <Badge className="data-source-status data-source-status--planned" variant="outline">Nijedan sistem nije povezan</Badge>
          </div>

          <div aria-label="Dostupni poslovni sistemi" className="connector-list">
            {CONNECTORS.map((connector) => (
              <div className="connector-row" key={connector.name}>
                <span className="connector-icon"><Link2 aria-hidden="true" size={17} /></span>
                <div className="connector-copy">
                  <div className="connector-title-line">
                    <strong>{connector.name}</strong>
                    <span className="connector-kind">{connector.kind}</span>
                  </div>
                  <p>{connector.description}</p>
                </div>
                <Badge className="connector-status" variant="outline">Nije povezano</Badge>
                <Button aria-label={`Povezivanje za ${connector.name} nije implementirano`} className="connector-action" disabled type="button" variant="outline">
                  Poveži
                  <ArrowRight aria-hidden="true" size={14} />
                </Button>
              </div>
            ))}
          </div>

          <div className="connector-footer-note">
            <LockKeyhole aria-hidden="true" size={15} />
            <span>Ne unosite API ključeve ili pristupne podatke. Povezivanje još nije implementirano niti su ovi sistemi potvrđeni kao podržani.</span>
          </div>

        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}