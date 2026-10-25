"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Eye,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Plus,
  Upload,
} from "lucide-react";

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
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  SourcePreviewDrawer,
  type SourcePreviewDocument,
} from "@/components/dashboard/source-preview-drawer";

type OfferBasis = "SUPPLY_ONLY" | "SUPPLY_AND_INSTALL" | "LABOR_ONLY" | "MIXED";
type ItemType = "PRODUCT" | "WORK" | "SERVICE" | "COMPOSITE";
type PositionFilter = "ALL" | ItemType;

type BoqPosition = {
  position: string;
  description: string;
  type: ItemType;
  quantity: string;
  unit: string;
  source: string;
  price: string | null;
  priceSource: string | null;
  status: "suggested" | "missing-price";
};

const OFFER_BASIS_OPTIONS: { value: OfferBasis; label: string; help: string }[] = [
  {
    value: "SUPPLY_ONLY",
    label: "Samo isporuka materijala",
    help: "Ne dodaje rad ili montažu pozicijama materijala.",
  },
  {
    value: "SUPPLY_AND_INSTALL",
    label: "Isporuka i izvođenje radova",
    help: "Prikazuje materijal, rad i usluge samo iz odobrenih izvora.",
  },
  {
    value: "LABOR_ONLY",
    label: "Samo radovi / usluge",
    help: "Ne generiše niti dodaje materijalne stavke.",
  },
  {
    value: "MIXED",
    label: "Mešovita ponuda",
    help: "Vrsta i cena svake pozicije moraju biti eksplicitno potvrđene.",
  },
  {
    value: "MIXED",
    label: "Mešovita ponuda 2",
    help: "Testiranje",
  },
];

const POSITIONS: BoqPosition[] = [
  {
    position: "1.1",
    description: "Kabl PP-Y 3×2,5 mm²",
    type: "PRODUCT",
    quantity: "250",
    unit: "m",
    source: "Elektro · red 8",
    price: "125,00 RSD / m",
    priceSource: "Demo katalog v1 · potvrditi",
    status: "suggested",
  },
  {
    position: "1.2",
    description: "PVC kanalice 40×25 mm",
    type: "PRODUCT",
    quantity: "60",
    unit: "m",
    source: "Elektro · red 9",
    price: "—",
    priceSource: null,
    status: "missing-price",
  },
  {
    position: "1.3",
    description: "Isporuka i montaža LED svetiljki",
    type: "COMPOSITE",
    quantity: "12",
    unit: "kom",
    source: "Elektro · red 10",
    price: null,
    priceSource: null,
    status: "missing-price",
  },
  {
    position: "1.4",
    description: "Ispitivanje elektroinstalacija",
    type: "SERVICE",
    quantity: "1",
    unit: "paušal",
    source: "Elektro · red 11",
    price: null,
    priceSource: null,
    status: "missing-price",
  },
];

const ITEM_TYPES: { value: PositionFilter; label: string }[] = [
  { value: "ALL", label: "Sve pozicije" },
  { value: "PRODUCT", label: "Materijal" },
  { value: "WORK", label: "Radovi" },
  { value: "SERVICE", label: "Usluge" },
  { value: "COMPOSITE", label: "Kombinovane" },
];

const TYPE_LABELS: Record<ItemType, string> = {
  PRODUCT: "Materijal",
  WORK: "Rad",
  SERVICE: "Usluga",
  COMPOSITE: "Kombinovano",
};

const TYPE_COUNTS = {
  PRODUCT: POSITIONS.filter((position) => position.type === "PRODUCT").length,
  WORK: POSITIONS.filter((position) => position.type === "WORK").length,
  SERVICE: POSITIONS.filter((position) => position.type === "SERVICE").length,
  COMPOSITE: POSITIONS.filter((position) => position.type === "COMPOSITE").length,
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TechnicalQuotingDashboard() {
  const [offerBasis, setOfferBasis] = useState<OfferBasis>("SUPPLY_AND_INSTALL");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [sectionOpen, setSectionOpen] = useState(true);
  const [sourcePreview, setSourcePreview] = useState<SourcePreviewDocument | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPositions = useMemo(
    () =>
      positionFilter === "ALL"
        ? POSITIONS
        : POSITIONS.filter((position) => position.type === positionFilter),
    [positionFilter],
  );

  function openUploadDialog() {
    setSelectedFile(null);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadOpen(true);
  }

  function openSourcePreview(selectedReference?: string) {
    setSourcePreview({
      id: "BOQ-004",
      title: "Predmer — Elektroinstalacije",
      filename: "predmer-elektroinstalacije.xlsx",
      format: "XLSX",
      updatedAt: "Danas, 10:24",
      viewMode: "technical",
      selectedReference,
    });
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

    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      setSelectedFile(null);
      setUploadError("Za Technical Quoting demo izaberite jednostavan XLSX predmer.");
      event.currentTarget.value = "";
      return;
    }

    setSelectedFile(file);
    setUploadError("");
  }

  const unresolvedPositionCount = POSITIONS.filter(
    (position) => position.status === "missing-price" || position.status === "suggested",
  ).length;
  const selectedBasis = OFFER_BASIS_OPTIONS.find((option) => option.value === offerBasis);

  return (
    <DashboardShell activeModule="technical" sourcePreviewOpen={sourcePreview !== null}>
      <div className="demo-banner technical-demo-banner" role="note">
        <span className="demo-banner-icon">
          <LockKeyhole aria-hidden="true" size={16} />
        </span>
        <div className="demo-banner-copy">
          <strong>Technical Quoting · demo jednostavnog XLSX predmera</strong>
          <span>
            Sintetički primer. Nema automatskih normativa, stručnog verifikovanja
            ni stvarnih cena.
          </span>
        </div>
        <span className="demo-banner-badge">BEZ SERVERA</span>
      </div>

      <section aria-labelledby="technical-title" className="page-heading technical-page-heading">
        <div>
          <span className="heading-eyebrow">Technical Quoting · Elektroinstalater</span>
          <h1 id="technical-title">Predmeri</h1>
          <p>
            Očuvajte strukturu BOQ-a, klasifikujte pozicije i pripremite nacrt
            predračuna.
          </p>
        </div>
        <div className="heading-actions">
          <Button className="technical-secondary-action" onClick={openUploadDialog} type="button" variant="outline">
            <Upload aria-hidden="true" size={15} />
            Uvezi predmer
          </Button>
          <Button
            className="primary-action"
            disabled={unresolvedPositionCount > 0}
            onClick={() => undefined}
            size="lg"
            type="button"
          >
            <FileText aria-hidden="true" size={15} />
            Pripremi nacrt
          </Button>
        </div>
      </section>

      <section aria-label="Pregled i uređivanje predmera" className="technical-workspace technical-workspace--single">
        <Card className="boq-editor-card">
          <div className="boq-editor-header">
            <div>
              <span className="technical-panel-kicker">Technical Quoting · nacrt</span>
              <div className="boq-title-row">
                <h2>Predračun — Elektroinstalacije</h2>
                <Badge className="draft-label" variant="outline">NACRT</Badge>
              </div>
              <p>Pregledajte originalne pozicije, klasifikaciju i cenu iz odobrenog izvora.</p>
            </div>
            <Button aria-label="Više akcija za predračun" className="boq-more-button" size="icon-sm" type="button" variant="outline">
              <ChevronDown aria-hidden="true" size={16} />
            </Button>
          </div>

          <div className="boq-source-strip">
            <span className="boq-source-file-icon">
              <FileSpreadsheet aria-hidden="true" size={17} />
            </span>
            <span className="boq-source-file-copy">
              <strong>predmer-elektroinstalacije.xlsx</strong>
              <span>Sheet Elektro · 4 izvorne pozicije · sintetički primer</span>
            </span>
            <Button
              className="technical-source-open-button"
              onClick={() => openSourcePreview()}
              type="button"
              variant="outline"
            >
              <Eye aria-hidden="true" size={14} />
              Pregledaj izvor
            </Button>
          </div>

          <div className="offer-basis-panel">
            <div className="offer-basis-label-row">
              <div>
                <strong>Osnova ponude</strong>
                <span>Izaberite šta predračun obuhvata</span>
              </div>
              <span className="required-chip">OBAVEZAN IZBOR</span>
            </div>
            <label className="offer-basis-select-wrap">
              <span className="sr-only">Osnova ponude</span>
              <select
                aria-label="Izaberite osnovu ponude"
                className="offer-basis-select"
                onChange={(event) => setOfferBasis(event.target.value as OfferBasis)}
                value={offerBasis}
              >
                {OFFER_BASIS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" size={15} />
            </label>
            <p className="offer-basis-help">{selectedBasis?.help}</p>
          </div>

          <div className="boq-toolbar">
            <div>
              <strong>Pozicije predmera</strong>
              <span>{POSITIONS.length} izvorne pozicije · redosled očuvan</span>
            </div>
            <Button className="boq-add-position" onClick={() => undefined} size="sm" type="button" variant="outline">
              <Plus aria-hidden="true" size={14} />
              Dodaj ručnu poziciju
            </Button>
          </div>

          <div className="position-filter-row" aria-label="Filter vrsta pozicija">
            {ITEM_TYPES.map(({ value, label }) => (
              <button
                aria-pressed={positionFilter === value}
                className={`position-filter ${positionFilter === value ? "position-filter--active" : ""}`}
                key={value}
                onClick={() => setPositionFilter(value)}
                type="button"
              >
                {label}
                {value !== "ALL" && (
                  <span>{TYPE_COUNTS[value]}</span>
                )}
              </button>
            ))}
          </div>

          <button
            aria-expanded={sectionOpen}
            className="boq-section-header"
            onClick={() => setSectionOpen((open) => !open)}
            type="button"
          >
            <span className="boq-section-leading">
              <ChevronDown className={sectionOpen ? "" : "boq-section-chevron--closed"} aria-hidden="true" size={15} />
              <span className="boq-section-code">1</span>
              <strong>Elektroinstalacije</strong>
            </span>
            <span className="boq-section-meta">4 pozicije <span>·</span> međuzbir nije stavka</span>
          </button>

          {sectionOpen ? (
            <div className="boq-positions">
              <div className="boq-table-header">
                <span>Pozicija / opis</span>
                <span>Vrsta</span>
                <span>Količina</span>
                <span>Jedinična cena / izvor</span>
                <span>Status</span>
              </div>
              {filteredPositions.map((position) => (
                <article
                  className={`boq-position-row ${sourcePreview?.selectedReference === position.position ? "boq-position-row--selected" : ""}`}
                  key={position.position}
                >
                  <div className="boq-description-cell">
                    <div className="boq-description-topline">
                      <span className="boq-position-code">{position.position}</span>
                      <button
                        aria-label={`Otvori izvor za poziciju ${position.position}, ${position.source}`}
                        className="source-location source-ref-button"
                        onClick={() => openSourcePreview(position.position)}
                        type="button"
                      >
                        <FileSpreadsheet aria-hidden="true" size={13} />
                        {position.source}
                      </button>
                    </div>
                    <strong>{position.description}</strong>
                    <span className="boq-original-note">Originalni opis sačuvan</span>
                  </div>
                  <div className="boq-type-cell">
                    <span className={`item-type-chip item-type-chip--${position.type.toLowerCase()}`}>
                      {position.type}
                    </span>
                    <span className="boq-type-label">{TYPE_LABELS[position.type]}</span>
                  </div>
                  <div className="boq-quantity-cell">
                    <strong>{position.quantity}</strong>
                    <span>{position.unit}</span>
                  </div>
                  <div className="boq-price-cell">
                    {position.price ? (
                      <>
                        <strong className="synthetic-price">{position.price}</strong>
                        <span>{position.priceSource}</span>
                      </>
                    ) : (
                      <>
                        <strong className="missing-price-label">Cena nije uneta</strong>
                        <button className="manual-price-action" onClick={() => undefined} type="button">
                          Unesi / izaberi iz cenovnika
                        </button>
                      </>
                    )}
                  </div>
                  <div className="boq-status-cell">
                    {position.status === "missing-price" ? (
                      <Badge className="boq-status-badge boq-status-badge--missing" variant="outline">
                        <CircleAlert aria-hidden="true" size={12} /> MISSING_PRICE
                      </Badge>
                    ) : (
                      <Badge className="boq-status-badge boq-status-badge--review" variant="outline">
                        <CircleAlert aria-hidden="true" size={12} /> Potvrditi
                      </Badge>
                    )}
                  </div>
                </article>
              ))}
              {filteredPositions.length === 0 && (
                <div className="boq-filter-empty">
                  Za ovaj tip nema pozicija u sintetičkom predmeru.
                </div>
              )}
            </div>
          ) : (
            <div className="boq-collapsed-note">Poglavlje je sklopljeno. Izvorne pozicije nisu menjane.</div>
          )}

          <div className="boq-editor-footer">
            <div className="boq-unresolved-summary">
              <span className="boq-unresolved-icon"><LockKeyhole aria-hidden="true" size={14} /></span>
              <span><strong>{unresolvedPositionCount} pozicije blokiraju odobravanje</strong><small>Potvrdite stavke i unesite samo odobrene cene; nema automatskih normativa.</small></span>
            </div>
            <Button className="boq-approval-button" disabled type="button">
              <Check aria-hidden="true" size={14} />
              Odobri nacrt
            </Button>
          </div>
          <div className="boq-total-note">
            Nema ukupnog iznosa dok nedostaju cene. COMPOSITE ostaje originalna pozicija; nema automatskog razlaganja ili normativa.
          </div>
        </Card>
      </section>

      <Dialog onOpenChange={handleUploadOpenChange} open={uploadOpen}>
        <DialogContent className="upload-dialog">
          <DialogHeader className="upload-dialog-header">
            <div className="upload-title-row">
              <span className="upload-title-icon"><Upload aria-hidden="true" size={18} /></span>
              <div className="dialog-heading-copy">
                <DialogTitle>Uvezi Technical predmer</DialogTitle>
                <DialogDescription>
                  Za ovaj demo podržan je samo dogovoreni jednostavan XLSX oblik.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="upload-content">
            <input
              accept=".xlsx"
              aria-label="Izaberi lokalni XLSX predmer za demo"
              className="sr-only"
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
            <div className="upload-zone">
              {selectedFile ? (
                <div className="upload-selected-file">
                  <FileSpreadsheet aria-hidden="true" size={18} />
                  <span><strong>{selectedFile.name}</strong><small>{formatFileSize(selectedFile.size)} · ostaje u browseru</small></span>
                  <CheckCircle2 aria-hidden="true" size={16} />
                </div>
              ) : (
                <>
                  <span className="upload-zone-icon"><Upload aria-hidden="true" size={17} /></span>
                  <strong>Odaberite jednostavan XLSX predmer</strong>
                  <span>PDF predmeri nisu potvrđeni kao podržani za ovaj demo.</span>
                </>
              )}
              <Button className="outline-button" onClick={() => fileInputRef.current?.click()} size="sm" type="button" variant="outline">
                {selectedFile ? "Izaberi drugi fajl" : "Odaberi XLSX fajl"}
              </Button>
              {uploadError && <span className="upload-validation-message" role="alert">{uploadError}</span>}
            </div>
            <div className="upload-notice">
              <LockKeyhole aria-hidden="true" size={14} />
              <span>Prototip ne šalje fajl serveru, ne čita ga i ne izvršava Excel formule.</span>
            </div>
          </div>
          <DialogFooter className="upload-dialog-footer">
            <Button className="cancel-button" onClick={() => handleUploadOpenChange(false)} type="button" variant="outline">Zatvori</Button>
            <Button
              className="clear-file-button"
              disabled={!selectedFile}
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              type="button"
              variant="ghost"
            >
              Ukloni izbor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SourcePreviewDrawer
        document={sourcePreview}
        onOpenChange={(open) => {
          if (!open) setSourcePreview(null);
        }}
      />
    </DashboardShell>
  );
}