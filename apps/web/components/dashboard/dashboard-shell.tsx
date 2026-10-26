"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Database,
  FileText,
  Inbox,
  Menu,
  Package,
  Sparkles,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
type DashboardModule = "product" | "technical" | "catalog";

type DashboardShellProps = {
  activeModule: DashboardModule;
  sourcePreviewOpen?: boolean;
  children: ReactNode;
};

const MODULES = [
  {
    id: "product" as const,
    label: "Product Quoting",
    href: "/",
    Icon: Package,
  },
  {
    id: "technical" as const,
    label: "Technical Quoting",
    href: "/technical-quoting",
    Icon: ClipboardList,
  },
  {
    id: "catalog" as const,
    label: "Katalog i izvori",
    href: "/catalog",
    Icon: Database,
  },
];

export function DashboardShell({
  activeModule,
  sourcePreviewOpen = false,
  children,
}: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const workspaceName = "Lokalni workspace";
  const currentPageLabel = activeModule === "technical"
    ? "Predmeri"
    : activeModule === "catalog"
      ? "Katalog i izvori"
      : "Zahtevi";
  const moduleNavigation = activeModule === "technical"
    ? [
        { label: "Predmeri", Icon: ClipboardList, active: true },
        { label: "Cenovnik rada i usluga", Icon: FileText, active: false },
        { label: "Predračuni", Icon: Inbox, active: false },
        { label: "Pilot metrike", Icon: BarChart3, active: false },
      ]
    : activeModule === "product"
      ? [
        { label: "Zahtevi", Icon: Inbox, active: true },
        { label: "Katalog artikala", Icon: Package, active: false },
        { label: "Ponude", Icon: FileText, active: false },
        { label: "Pilot metrike", Icon: BarChart3, active: false },
      ]
      : [];

  function showComingSoon(label: string) {
    setMobileMenuOpen(false);
    setToastMessage(`„${label}” je planiran za naredni korak dizajna.`);
  }

  return (
    <div className={`app-shell ${sourcePreviewOpen ? "app-shell--source-preview-open" : ""}`}>
      {mobileMenuOpen && (
        <button
          aria-label="Zatvori navigaciju"
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          type="button"
        />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-brand-row">
          <Link
            aria-label="Inbox-to-Quote početna strana"
            className="brand-lockup"
            href="/"
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="brand-mark">
              <Sparkles aria-hidden="true" size={17} />
            </span>
            <span className="brand-wordmark">
              inbox-to-quote
              <small>pilot workspace</small>
            </span>
          </Link>
          <span className="brand-demo-label">LOCAL</span>
          <button
            aria-label="Zatvori navigaciju"
            className="sidebar-mobile-close"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          >
            <X aria-hidden="true" size={17} />
          </button>
        </div>

        <button
          aria-label={`Radni prostor: ${workspaceName}`}
          className="workspace-switcher"
          onClick={() => setToastMessage("Aktivno je lokalno razvojno okruženje.")}
          type="button"
        >
          <span className="workspace-icon">
            <Building2 aria-hidden="true" size={17} />
          </span>
          <span className="workspace-copy">
            <span>Radni prostor</span>
            <strong>{workspaceName}</strong>
          </span>
          <ChevronDown aria-hidden="true" className="workspace-chevron" size={15} />
        </button>

        <nav aria-label="Glavna navigacija" className="sidebar-nav">
          <div className="sidebar-nav-group">
            <span className="sidebar-section-label">Moduli</span>
            {MODULES.map(({ id, label, href, Icon }) => {
              const isActive = activeModule === id;

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`sidebar-nav-link ${isActive ? "is-active" : ""}`}
                  href={href}
                  key={id}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span>{label}</span>
                  {isActive && <span className="module-active-dot" />}
                </Link>
              );
            })}
          </div>

          {activeModule !== "catalog" && (
            <div className="sidebar-nav-group">
              <span className="sidebar-section-label">
                {activeModule === "technical" ? "Technical Quoting" : "Product Quoting"}
              </span>
              {moduleNavigation.map(({ label, Icon, active }) => (
                <button
                  aria-current={active ? "page" : undefined}
                  className={`sidebar-nav-link ${active ? "is-active" : ""}`}
                  key={label}
                  onClick={() =>
                    active ? setMobileMenuOpen(false) : showComingSoon(label)
                  }
                  type="button"
                >
                  <Icon aria-hidden="true" size={17} />
                  <span>{label}</span>
                  {active && <ChevronRight aria-hidden="true" className="nav-current-icon" size={14} />}
                </button>
              ))}
              <button
                className="sidebar-nav-link"
                onClick={() => showComingSoon("Pomoć i podešavanja")}
                type="button"
              >
                <CircleHelp aria-hidden="true" size={17} />
                <span>Pomoć i podešavanja</span>
              </button>
            </div>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="pilot-card">
            <span className="pilot-card-kicker">Lokalni storage</span>
            <div className="pilot-card-title">
              <Sparkles aria-hidden="true" size={15} />
              Backend upload
            </div>
            <p>Dokumenti se čuvaju u lokalnom API volume-u.</p>
            <div className="pilot-card-status">
              <span className="status-live-dot" />
              Bez obrade i tenant izolacije
            </div>
          </div>

          <div className="sidebar-user">
            <Avatar className="user-avatar">
              <AvatarFallback>DM</AvatarFallback>
            </Avatar>
            <div className="sidebar-user-copy">
              <strong>Lokalni korisnik</strong>
              <span>{activeModule === "technical" ? "Kalkulant" : activeModule === "catalog" ? "Upravljanje podacima" : "Komercijalista"}</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Otvori korisnički meni"
                  className="sidebar-user-menu-trigger"
                  size="icon-sm"
                  variant="ghost"
                >
                  <ChevronDown aria-hidden="true" size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="account-menu">
                <DropdownMenuLabel>Lokalni korisnik</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setToastMessage("Autentikacija nije uključena u lokalnom okruženju.")}
                >
                  Profil naloga
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setToastMessage("Podešavanja nisu dostupna u lokalnom okruženju.")}
                >
                  Podešavanja
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <Button
              aria-label="Otvori navigaciju"
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen(true)}
              size="icon-sm"
              variant="outline"
            >
              <Menu aria-hidden="true" size={18} />
            </Button>
            <div aria-label="Putanja" className="breadcrumb">
              <span className="topbar-org">{workspaceName}</span>
              <ChevronRight aria-hidden="true" size={13} />
              <strong>{currentPageLabel}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <span className="demo-workspace-pill">
              <span className="status-live-dot" />
              Lokalno okruženje
            </span>
            <span className="date-pill topbar-date">
              <CalendarDays aria-hidden="true" size={14} />
              Lokalni API
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="topbar-profile" type="button">
                  <Avatar className="user-avatar">
                    <AvatarFallback>LK</AvatarFallback>
                  </Avatar>
                  <span className="topbar-profile-copy">
                    <strong>Lokalni korisnik</strong>
                    <span>{workspaceName}</span>
                  </span>
                  <ChevronDown aria-hidden="true" size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="account-menu">
                <DropdownMenuLabel>{workspaceName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setToastMessage("Promena radnog prostora nije dostupna lokalno.")}
                >
                  Promeni radni prostor
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="content-area" id="main-content">
          {children}
        </main>
      </div>

      {toastMessage && (
        <div className="app-toast" role="status">
          <CircleHelp aria-hidden="true" size={16} />
          <span>{toastMessage}</span>
          <Button
            aria-label="Zatvori obaveštenje"
            className="app-toast-close"
            onClick={() => setToastMessage("")}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}