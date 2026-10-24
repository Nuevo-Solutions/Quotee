# AI Inbox-to-Quote — Pravila razvoja i specifikacija pilota

> **Status:** Product charter + razvojni vodič, **v0.2 — prošireni pilot**  
> **Datum ažuriranja:** 22. oktobar 2026.  
> **Tržište:** Srbija i Hrvatska (kasnije BiH i region)  
> **Proizvod:** AI platforma za obradu zahteva i pripremu **nacrta ponuda**, ne autonomni ERP  
> **Dva toka:** **Product Quoting** (artikli) + **Technical Quoting** (predmeri, radovi i usluge)  
> **Prvi demo segment:** elektroinstalacioni materijal i jednostavni elektroinstalacioni predmeri  
> **Oblik:** multi-tenant B2B SaaS, prvi pilot ograničen po dokumentima, obimu i podršci  
> **Razvoj:** solo developer paralelno sa redovnim poslom  
> **Status tržišnih tvrdnji:** cene, ciljevi, obim tržišta i spremnost klijenata da plate ostaju hipoteze

> **Šta je novo u v0.2:** zajednički processing engine; dva odvojena toka za robu i tehničke predmere; podrška za hijerarhiju pozicija i vrste stavki `PRODUCT/WORK/SERVICE/COMPOSITE`; razdvajanje dobavljačke i izvođačke ponude; ERP-agnostic konektorski interfejs sa eksplicitnim mogućnostima. Prvi **plaćeni pilot bira jedan tok**, dok demo može da pokaže oba.

---

## 0. Kako koristiti ovaj dokument

Ovo je **radni ugovor sa samim sobom** tokom razvoja — nije lista funkcija koje sve moraju odmah da se implementiraju.

- **MUST / OBAVEZNO:** neophodno za označenu fazu (demo ili stvarni pilot).
- **SHOULD / POŽELJNO:** uključiti samo ako ne ugrožava kvalitet, privatnost ili rok.
- **LATER / KASNIJE:** nije obećano u prvom plaćenom pilotu.
- Svaka nova funkcija mora odgovoriti: **Koji posao ubrzava? Kako merimo korist? Da li je neophodna za prvi plaćeni pilot?**
- Odluke zapisati u `docs/DECISIONS.md` uz datum, razlog i uticaj na scope.
- „Pokriva još jednu industriju“ **nije** dovoljan razlog da se odmah implementiraju njena pravila kalkulacije.

### Jedna rečenica koja definiše proizvod

**„AI Inbox-to-Quote pretvara emailove, tekstualne PDF-ove, Excel specifikacije i jednostavne predmere u proverljive nacrte ponuda: prepoznaje originalne stavke, povezuje materijal sa katalogom gde je primenljivo, označava nejasnoće i omogućava zaposlenom da potvrdi rezultat i izveze ga.“**

### Dva toka — isti proizvod, različita poslovna pravila

| Tok | Ciljni korisnik | Glavna izlazna vrednost |
|---|---|---|
| **Product Quoting** | Veleprodaje i distributeri | Predlog kataloških artikala i nacrt ponude za robu |
| **Technical Quoting** | Elektroinstalateri, HVAC i tehnički izvođači | Očuvane BOQ/predmer pozicije i nacrt predračuna sa materijalom, radovima i uslugama |

Ne obećavamo inženjerski projekat, normiranje radnih sati, automatsko ugovaranje, slanje konačnih ponuda ili zamenu ERP-a.

### Prioriteti

1. **Ispravna ekstrakcija sa dokazom iz izvora.**
2. **Pouzdana validacija i ručni pregled.**
3. **Reproduktivna i ispravna kalkulacija iz potvrđenih cena.**
4. **Brz izvoz nacrta i merenje uštede.**
5. **Integracije i dodatna automatizacija tek uz dokazanu vrednost.**

---

## 1. Problem, kupci i jedinstvena vrednost

### Zajednički problem

Komercijalista, kalkulant ili izvođač dobija upit u emailu, PDF-u ili Excelu; ručno prepisuje redove, tumači količine i tehničke karakteristike, proverava katalog/cenovnik i sastavlja ponudu. Dokument često sadrži nepotpune opise, više grupa radova, nejasne jedinice mere ili kombinovane pozicije.

**Naša vrednost:** kraće vreme od dolaska dokumenta do **pregledanog** nacrta, uz jasan trag izvora i vidljiva nepoznata polja.

### ICP A — Product Quoting (primarna validacija)

- B2B distributeri i veleprodaje, posebno elektroinstalacioni i tehnički materijal.
- Tipično 10–50 zaposlenih, 2–8 komercijalista (radna hipoteza).
- Često dobijaju email/Excel/PDF spiskove; idealno >200 mesečno, proveriti intervjuima.
- Mogu dostaviti odobren katalog u CSV/XLSX formatu, po mogućnosti sa SKU i jedinicama.
- ERP/B2B portal je opcionalan, **nikad preduslov** za probu.

### ICP B — Technical Quoting (druga validaciona grupa)

- Manji/srednji izvođači elektroinstalacija i HVAC radova; kasnije drugi zanati i projektne firme.
- Dobijaju **predmere/troškovnike/BOQ** po pozicijama i ručno prepisuju količine i opise u predračun.
- Imaju sopstvene *odobrene* jedinične cene za rad/usluge i/ili katalog materijala, ili ih mogu ručno uneti.
- Prepoznaju razliku između ponude za **isporuku materijala** i ponude za **isporuku i izvođenje radova**.
- Ne zahtevaju BIM, CAD, automatske normative ili kompleksnu tehničku proveru u pilotu.

### Prve dve demo vertikale (namerno povezane)

1. **Distributer elektromaterijala:** kablovi, zaštitni aparati, razvodne kutije.
2. **Elektroinstalater:** jednostavan `.xlsx` predmer sa poglavljima, pozicijama materijala, isporuke/montaže i servisnih radova.

### Šta ne radimo

Ne nudimo „ponude za svaku industriju“ kao garantovanu funkciju. Osnovni engine može biti opšti, ali svaka nova vertikala traži svoje testove, validaciona pravila i komercijalno odobrenje.

---

## 2. Četrnaest nepromenljivih pravila proizvoda

1. **Human-in-the-loop:** korisnik pregleda svaku stavku, količinu, cenu i ukupan iznos pre odobravanja. „Obrađeno“ nije „odobreno“.
2. **AI ne izmišlja činjenice:** SKU, cene, rabati, lager, normativi, PDV, tehničke osobine i rokovi dolaze iz odobrenih izvora ili ručnog unosa.
3. **Sačuvaj originalni predmer:** redosled, oznake pozicija, nazive poglavlja, jedinice i originalne količine. Nema tihog brisanja, spajanja, deljenja ni dopunjavanja.
4. **Ne poistovećuj materijal i radove:** „isporuka kabla“ nije isto što i „isporuka i montaža kabla“; kombinovana stavka zahteva eksplicitnu obradu.
5. **Nema automatskih normativa:** prvi pilot ne izračunava potreban rad, mehanizaciju ili dodatni materijal na osnovu slobodnog teksta.
6. **ERP-agnostic by design:** nijedna funkcija AI jezgra ne poziva neposredno PANTHEON/Selltico/Odoo/SAP API; sve ide kroz deklarisani konektorski sloj.
7. **Nema prikrivenih eksternih akcija:** bez slanja emaila, kreiranja porudžbine, izmene ERP-a ili promene lagera bez ugovorenog prava i posebne potvrde.
8. **Nejasno ostaje nejasno:** `AMBIGUOUS`, `UNMATCHED`, `NEEDS_REVIEW` i `MISSING_PRICE` su legitimni rezultati. Bolje nezavršena ponuda nego lažno potvrđena.
9. **Računa backend, ne LLM:** za količine i novac koristi `Decimal`, proverene jedinice mere, odobrene cenovnike i jasna pravila za poreze.
10. **Bez pravih tajni u javnom demou:** samo sintetički katalozi, dokumenti, podaci i poslovne cene.
11. **Izolacija klijenata:** server-side tenant, membership i permission provera za bazu, storage, jobs, embedding/pretragu i izvoz.
12. **Merimo stvarnu vrednost:** vreme obrade, greške, uspešno izvučene stavke, ručne korekcije, trošak obrade i spremnost za plaćanje — odvojeno po toku.
13. **Čvrst limit pilota:** broj dokumenata, obim, izlaz, jedan radni tok, podrška, vreme i dodatne integracije se definišu pismeno.
14. **Sopstveni razvoj i IP:** samo sopstveni kod, privatna oprema/nalozi i zakonito pribavljeni test podaci; proveriti obaveze iz radnog odnosa, bez korišćenja internih poslovnih tajni.

---

## 3. Granice scope-a — demo i pilot od 249 €

**Komercijalna hipoteza:** 14 dana, 249 € jednokratno, moguć kredit ka kasnijem onboardingu. Cena nije potvrđena tržištem. **Demo može prikazati oba toka, ali 249 € uključuje jedan izabrani tok i jedan reprezentativni obrazac rada po klijentu.** Ako traži oba toka ili posebno prilagođenu kalkulaciju, sastaviti dodatnu ponudu.

### MUST — zajedničko jezgro za oba toka

| Funkcionalnost | Prvi demo / ograničeni pilot |
|---|---|
| Unos | Ručni upload tekstualnog `.pdf`, `.xlsx`, `.csv`, `.eml` ili lepljenje email teksta |
| Parsiranje | Tekst/tabele/ćelije uz `source_ref` (stranica, list, red, ćelija kad je moguće) |
| Ekstrakcija | Pozicija, izvorni opis, količina, jedinica mere, tehničke karakteristike, upozorenja |
| Pregled | Dvokolonski prikaz izvora i prepoznatih stavki; izmena i potvrđivanje |
| Kalkulacija | Samo odobrene kataloške/ručno potvrđene jedinične cene, `Decimal` i kontrola valuta |
| Izvoz | PDF sa velikom oznakom **NACRT** + CSV/XLSX ili CSV format za dalji rad |
| Evidencija | Verzionisan dokument, izvor i zapis o svim ispravkama i odobravanju |
| Merenje | Posebni rezultati za Product Quoting i Technical Quoting |

### Product Quoting — obavezno za prvi demo i pilot ovog toka

- Jedan CSV/XLSX katalog sa do **3.000 SKU-ova** i dozvoljenim aliasima.
- Pronalazak kandidata: `SKU → alias → full-text/trigram` uz tvrdu tehničku validaciju.
- Kataloški artikl nije automatski potvrđen samo na osnovu sličnog naziva.
- Izvor cene i verzija kataloga vidljivi su tokom pregleda.

### Technical Quoting — minimalna podržana funkcionalnost

- **Za demo prvenstveno `.xlsx` predmer** u unapred podržanom jednostavnom obliku; tekstualni PDF predmer samo kada test set potvrdi pouzdanost. Nema tvrdnje „radi svaki PDF“.
- Prepoznavanje `section/heading/position`, hijerarhije grupa, redosleda, `raw_description`, `qty`, `unit`, napomena i vrste stavke: `PRODUCT`, `WORK`, `SERVICE`, `COMPOSITE`.
- Materijal se može povezati sa istim katalogom kao u Product Quoting-u. Rad/usluga dobija ručno potvrđenu ili unapred konfigurisanu jediničnu cenu; bez normiranja.
- `COMPOSITE` (npr. „isporuka i montaža“) ostaje jedna verna izvorna pozicija. Eventualno razlaganje na podstavke postoji samo kao **korisnički potvrđena pomoćna kalkulacija**, bez prepisivanja originala.
- Pregled praznih cena, nepravilnih jedinica, dvosmislenih stavki i međuzbirova; odobravanje blokirano dok obavezna polja nisu razrešena.
- Izvoz **nacrta predračuna** sa originalnim pozicijama, očuvanim redosledom, cenama iz odobrenih izvora i upozorenjima.

### Limiti za jedan plaćeni pilot

Jedna firma, **jedan odabrani radni tok**, do **3 imenovana korisnika**, najviše **100 dokumenata**, **3.000 kataloških artikala** ako se koristi katalog, **jedan PDF šablon**, jedna valuta po dokumentu. Predlog tehničkog limita: do **20 tekstualnih strana / 100 stavki** po dokumentu. Ako je pilot Technical Quoting, unapred usaglasiti 1–2 podržane šeme XLSX predmera i jedan tip kalkulacije.

### OUT OF SCOPE — ne nuditi u osnovnoj ceni

- Pristup živom Gmail/Outlook inboxu i automatizovano slanje ponuda.
- Direktni Selltico/PANTHEON/Odoo/SAP/Dynamics/Minimax konektori; custom ERP projekti i write-back.
- BIM, CAD, DWG, IFC, nacrti kao grafički crteži, geometrijsko merenje i takeoff.
- Automatski normativi potrošnje, radnih sati, mehanizacije, građevinske norme i tehnički/verifikacioni potpis inženjera.
- Automatsko sastavljanje novih pozicija radova, ugovorno obavezujuće ponude, automatsko prihvatanje narudžbina.
- OCR skeniranih PDF-ova, rukopisa, loših fotografija; PDF tabele kompleksnih formata bez prethodnog testiranja.
- Napredni kupčevi rabati, više valuta u jednoj kalkulaciji, dnevni kursevi, posebna poreska pravila i SEF/fiskalizacija.
- Više magacina, real-time lager, enterprise SLA, custom hosting, veliki servisni support.
- Generički konfiguratori stolarije, HVAC dimenzionisanje, elektro projektovanje, predlaganje bezbednosnih zamena artikala.
- Fine-tuning, multi-agent orkestracija, namenska vektorska infrastruktura bez merene potrebe.

### Pravilo za dodatne zahteve

**Van scope-a → `DECISIONS.md` / backlog → nova cena i rok → pisana saglasnost.** Nikad ne obećavati besplatnu ERP integraciju niti ceo obračun radova zarad prvog kupca.

> „Pilot ubrzava čitanje i pregled zahteva/predmera i izvoz nacrta, bez zamene vašeg ERP-a. Za integraciju ili stručnu kalkulaciju radova radimo posebnu procenu nakon što dokažemo vrednost osnovnog toka.“

---

## 4. Demo koji možeš odmah da pokažeš — dva scenarija

**Demo A — Product Quoting (60–90 sekundi)**

1. Fiktivna firma „Demo Elektro Distribucija“, katalog 100–300 sintetičkih SKU-ova.
2. Uvoz PDF/Excel zahteva: „200 m PP-Y 3×2,5“, „30 osigurača 16 A“.
3. Prikaz `source_ref`, izdvojenih količina i opisa.
4. Kabl nalazi odgovarajući SKU; „osigurač 16 A“ ostaje `AMBIGUOUS` dok ne znamo B/C i 1P/3P.
5. Ručno odobravanje predloženih artikala, obračun i izvoz PDF **NACRT**.

**Demo B — Technical Quoting (60–90 sekundi)**

1. Fiktivni izvođač „Demo Elektro Montaža“, sintetički `.xlsx` predmer sa poglavljem „Elektroinstalacije“.
2. Sistem čita i **čuva oznake pozicija** i strukturu, npr. `1.1`, `1.2`, `1.3`, `1.4`.
3. Prikazuje četiri reda: `Kabl PP-Y 3×2,5 | m | 250` (`PRODUCT`), `PVC kanalice | m | 60` (`PRODUCT`), `Isporuka i montaža LED svetiljki | kom | 12` (`COMPOSITE`), `Ispitivanje instalacija | paušal | 1` (`SERVICE`).
4. Materijal dobija ponuđen SKU; montaža i ispitivanje dobijaju oznaku `MISSING_PRICE` dok korisnik ne unese/odobri cenu. **Ne izmišljamo broj sati niti normativ.**
5. Korisnik potvrdi izmene, sistem računa vrednosti po cenama iz odobrenog izvora i izvozi predračun **NACRT** sa originalnim redosledom.

### Obavezna demonstracija granica

- Nepoznati proizvod → `UNMATCHED`.
- Nepotpuni tehnički atributi → `AMBIGUOUS`, bez lažne zamene.
- Kombinovana pozicija „isporuka i montaža“ → **ne** pretvarati je neprimetno u običan kataloški artikl.
- Nečitljiv/skenirani PDF → jasno `UNSUPPORTED_INPUT` ili poziv za ručni unos.
- Promena originalne količine → vidljiv audit; izvozni nacrt koristi potvrđenu vrednost, sa sačuvanim originalom.

### Sintetički primer predmera

```csv
position,section,description,unit,quantity,type
1.1,Elektroinstalacije,"Kabl PP-Y 3x2.5 mm2",m,250,PRODUCT
1.2,Elektroinstalacije,"PVC kanalice 40x25 mm",m,60,PRODUCT
1.3,Elektroinstalacije,"Isporuka i montaza LED svetiljki",kom,12,COMPOSITE
1.4,Elektroinstalacije,"Ispitivanje elektroinstalacija",pausal,1,SERVICE
```

**Upozorenje:** primeri, cene i SKU-ovi su izmišljeni. Ovo su demonstracije toka rada, ne inženjersko verifikovanje predmera.

---

## 5. Preporučeni tech stack (bez preteranog inženjeringa)

| Sloj | Izbor za MVP | Napomena |
|---|---|---|
| Frontend/admin | **Next.js + TypeScript + React** | Jedna web aplikacija, responsivan UI |
| UI | Tailwind CSS + shadcn/ui ili slična biblioteka | Brže konzistentne tabele, dijalozi i forme |
| Backend API | **Python + FastAPI + Pydantic** | Ekstrakcija dokumenata, AI orkestracija i biznis pravila |
| ORM i migracije | SQLAlchemy + Alembic | Kontrolisana evolucija baze |
| Baza | **PostgreSQL** | Tenant podaci, katalozi, upiti, stavke, audit |
| PDF parsing | PyMuPDF | Tekstualni PDF; skenirani PDF javlja „potreban OCR“ |
| Excel/CSV | openpyxl + Python `csv` | Podrška za `.xlsx` predmere; proveriti formule/keširane vrednosti i vrednosti iz ćelija |
| AI | **OpenAI Responses API** sa strukturiranim JSON izlazom | Pozivanje modela samo gde donosi vrednost |
| Pretraga artikala | SQL `sku` + aliasi + PostgreSQL full-text / trigram | `pgvector` tek ako merena preciznost zahteva |
| Domain model | Pydantic DTO: `QuoteItem`, `BOQSection`, `TechnicalPosition` | Odvojena validacija proizvodnih i tehničkih pozicija |
| Integracije | `Connector` interfejs + `FileConnector` | Selltico/PANTHEON/Odoo samo planirani adapteri, ne gotova funkcija |
| PDF izlaz | HTML template + WeasyPrint ili Playwright PDF | Jedan jasan šablon |
| Storage | S3-kompatibilan object storage | Za odobrene dokumente; lokalni disk samo za sintetički demo |
| Auth | Proveren auth provider ili pouzdana biblioteka | Server-side validacija uloge i tenant konteksta |
| Jobs | Jednostavan **persistirani** job worker | Duga obrada nije idealna unutar jednog HTTP zahteva |
| Monitoring | Sentry + strukturirani logovi + metrike | Bez pune sadržine poverljivih dokumenata u logovima |
| Lokalni razvoj | Docker Compose | `web`, `api`, `worker`, `postgres` |
| Deployment | Render + managed Postgres **ili** Hetzner + Docker | Izabrati jednu opciju, ne dve istovremeno |
| CI/CD | GitHub Actions | Lint → test → build → deploy |


## 5.1 Izgled UI-a

Koristicemo shadcn/ui za brzu i konzistentnu izradu korisničkog interfejsa.
Ovo ce biti `index.css`

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: rgb(241, 245, 248);
  --foreground: rgb(10, 50, 84);
  --card: rgb(255, 255, 255);
  --card-foreground: rgb(10, 50, 84);
  --popover: rgb(255, 255, 255);
  --popover-foreground: rgb(10, 50, 84);
  --primary: rgb(0, 185, 241);
  --primary-foreground: rgb(255, 255, 255);
  --secondary: rgb(10, 50, 84);
  --secondary-foreground: rgb(255, 255, 255);
  --muted: rgb(204, 241, 252);
  --muted-foreground: rgb(38, 80, 116);
  --accent: rgb(204, 241, 252);
  --accent-foreground: rgb(10, 50, 84);
  --destructive: rgb(188, 0, 34);
  --destructive-foreground: rgb(253, 225, 230);
  --border: rgb(214, 214, 214);
  --input: rgb(255, 255, 255);
  --ring: rgb(10, 50, 84);
  --chart-1: rgb(10, 50, 84);
  --chart-2: rgb(0, 185, 241);
  --chart-3: rgb(160, 211, 223);
  --chart-4: rgb(249, 243, 221);
  --chart-5: rgb(54, 97, 116);
  --sidebar: rgb(10, 50, 84);
  --sidebar-foreground: rgb(255, 255, 255);
  --sidebar-primary: rgb(0, 185, 241);
  --sidebar-primary-foreground: rgb(255, 255, 255);
  --sidebar-accent: rgb(204, 241, 252);
  --sidebar-accent-foreground: rgb(10, 50, 84);
  --sidebar-border: rgb(229, 229, 229);
  --sidebar-ring: rgb(161, 161, 161);
  --font-sans: Inter, ui-sans-serif, sans-serif, system-ui;
  --font-serif: Inter, ui-sans-serif, sans-serif, system-ui;
  --font-mono: Inter, ui-sans-serif, sans-serif, system-ui;
  --radius: 0.75rem;
  --shadow-x: -50px;
  --shadow-y: -50px;
  --shadow-blur: 0px;
  --shadow-spread: -50px;
  --shadow-opacity: 0;
  --shadow-color: oklch(0 0 0);
  --shadow-2xs: -50px -50px 0px -50px hsl(0 0% 0% / 0.00);
  --shadow-xs: -50px -50px 0px -50px hsl(0 0% 0% / 0.00);
  --shadow-sm: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 1px 2px -51px hsl(0 0% 0% / 0.00);
  --shadow: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 1px 2px -51px hsl(0 0% 0% / 0.00);
  --shadow-md: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 2px 4px -51px hsl(0 0% 0% / 0.00);
  --shadow-lg: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 4px 6px -51px hsl(0 0% 0% / 0.00);
  --shadow-xl: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 8px 10px -51px hsl(0 0% 0% / 0.00);
  --shadow-2xl: -50px -50px 0px -50px hsl(0 0% 0% / 0.00);
  --tracking-normal: 0em;
  --spacing: 0.25rem;
}

.dark {
  --background: rgb(241, 245, 248);
  --foreground: rgb(10, 50, 84);
  --card: rgb(255, 255, 255);
  --card-foreground: rgb(10, 50, 84);
  --popover: rgb(255, 255, 255);
  --popover-foreground: rgb(10, 50, 84);
  --primary: rgb(0, 185, 241);
  --primary-foreground: rgb(255, 255, 255);
  --secondary: rgb(10, 50, 84);
  --secondary-foreground: rgb(255, 255, 255);
  --muted: rgb(204, 241, 252);
  --muted-foreground: rgb(38, 80, 116);
  --accent: rgb(204, 241, 252);
  --accent-foreground: rgb(10, 50, 84);
  --destructive: rgb(188, 0, 34);
  --destructive-foreground: rgb(253, 225, 230);
  --border: rgb(214, 214, 214);
  --input: rgb(255, 255, 255);
  --ring: rgb(10, 50, 84);
  --chart-1: rgb(10, 50, 84);
  --chart-2: rgb(0, 185, 241);
  --chart-3: rgb(160, 211, 223);
  --chart-4: rgb(249, 243, 221);
  --chart-5: rgb(54, 97, 116);
  --sidebar: rgb(10, 50, 84);
  --sidebar-foreground: rgb(255, 255, 255);
  --sidebar-primary: rgb(0, 185, 241);
  --sidebar-primary-foreground: rgb(255, 255, 255);
  --sidebar-accent: rgb(204, 241, 252);
  --sidebar-accent-foreground: rgb(10, 50, 84);
  --sidebar-border: rgb(40, 40, 40);
  --sidebar-ring: rgb(115, 115, 115);
  --font-sans: Inter, ui-sans-serif, sans-serif, system-ui;
  --font-serif: Inter, ui-sans-serif, sans-serif, system-ui;
  --font-mono: Inter, ui-sans-serif, sans-serif, system-ui;
  --radius: 0.75rem;
  --shadow-x: -50px;
  --shadow-y: -50px;
  --shadow-blur: 0px;
  --shadow-spread: -50px;
  --shadow-opacity: 0;
  --shadow-color: oklch(0 0 0);
  --shadow-2xs: -50px -50px 0px -50px hsl(0 0% 0% / 0.00);
  --shadow-xs: -50px -50px 0px -50px hsl(0 0% 0% / 0.00);
  --shadow-sm: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 1px 2px -51px hsl(0 0% 0% / 0.00);
  --shadow: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 1px 2px -51px hsl(0 0% 0% / 0.00);
  --shadow-md: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 2px 4px -51px hsl(0 0% 0% / 0.00);
  --shadow-lg: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 4px 6px -51px hsl(0 0% 0% / 0.00);
  --shadow-xl: -50px -50px 0px -50px hsl(0 0% 0% / 0.00), -50px 8px 10px -51px hsl(0 0% 0% / 0.00);
  --shadow-2xl: -50px -50px 0px -50px hsl(0 0% 0% / 0.00);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

Ovo ce biti `layout.tsx`
```tsx
// For adding custom fonts with other frameworks, see:
// https://tailwindcss.com/docs/font-family
import type { Metadata } from "next";
import { Inter, Inter, Inter } from "next/font/google";
import "./globals.css";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontSerif = Inter({
  subsets: ["latin"],
  variable: "--font-serif",
});

const fontMono = Inter({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

### Odluke za pilot

- **Prvo pravilo: monolitni backend.** Modularni FastAPI servis je dovoljan; nema mikroservisa i Kubernetesa.
- **Ne uvoditi RAG „zbog AI etikete“.** Za katalog male veličine krenuti od precizne baze i aliasa.
- **Excel sa formulama nije pouzdano preračunat samo otvaranjem u `openpyxl`.** Ne izvršavati makroe; detektovati formule, provere keširanih vrednosti i tražiti potvrdu kod neusklađenosti.
- **Ne čuvati „agent memoriju“.** Svaka obrada je deterministički auditabilan posao nad konkretnim fajlom.
- **Ne trenirati model.** Prvo proveriti parsing, matching i kvalitet prompta.
- **Koristiti stabilne, zaključane verzije biblioteka** i testirati ažuriranja pre produkcije.
- **Čuvati dokumente kao objekte, ne kao `bytea` u Postgresu.** U bazi čuvati metapodatke i hash dokumenta.
- Ako se koristi dodatni worker, obrada mora imati `job_id`, idempotency key, retry strategiju i jasan status greške.

---

## 6. Arhitektura: jedan engine, dva workflowa, opcioni ERP konektori

```text
                        Next.js / React
                    Upload → Review → Export
                               │ HTTPS
                         FastAPI monolit
                    Auth / Tenant / RBAC
                               │
                 ┌─────────────┴─────────────┐
                 │ Document Processing Engine│
                 │ parse → extract → normalize│
                 │ source tracking + version │
                 └─────────────┬─────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
          Product Quoting               Technical Quoting
          SKU matching                 BOQ hierarchy/types
          catalog price                work/service/composite
                └──────────────┬──────────────┘
                               ▼
                     Human Review / Approval
                               │
                        Quote Draft Engine
                               │
                         PDF / CSV export
                               │
                      Integration Interface
                         │             │
                  FileConnector     API connectors (LATER)
                  CSV / XLSX        PANTHEON / Odoo / Selltico
```

### Kanonski tok obrade

1. **Upload:** identifikacija organizacije iz autentikacije, MIME/veličina, bezbedno čuvanje, checksum, limit po dokumentu.
2. **Parse:** prvo lokalno izvući tekst i tabličnu strukturu; sačuvati stranice, listove, pozicije i originalne vrednosti.
3. **Detect:** klasifikovati zahtev kao `PRODUCT_QUOTE` ili `TECHNICAL_QUOTE` — uz mogućnost da korisnik ručno promeni tip.
4. **Extract:** LLM vraća isključivo **strukturisani opis izvornog zahteva**, ne gotovu poslovnu ponudu.
5. **Normalize:** nazivi jedinica, decimalni separator, opis atributa; **nikada ne menjati količinu ili tehničku specifikaciju tiho**.
6. **Validate:** schema, obavezni podaci, hijerarhija pozicija, numeričke vrednosti i podržane jedinice.
7. **Resolve:** Product Quoting → kandidati iz kataloga; Technical Quoting → vrste pozicija + opcionalni materijalni SKU + cena rada/usluge iz odobrenog cenovnika ili ručni unos.
8. **Review:** operater poredi izvor sa predlogom, unosi nedostajuće podatke i potvrđuje.
9. **Calculate:** precizan `Decimal` obračun, sa pravilima za ukupno, međuzbirove i valute. LLM se ne koristi za finansijsku aritmetiku.
10. **Approve:** korisnik sa dozvolom potvrđuje **verziju nacrta**, uključujući stavke i izvorne reference.
11. **Export:** PDF sa oznakom NACRT i podržani CSV/XLSX rezultat; bez slanja prema kupcu ili izmene ERP podataka.

### Obavezne oznake poslovnog procesa

- `quote_workflow`: `PRODUCT_QUOTE | TECHNICAL_QUOTE`
- `offer_basis`: `SUPPLY_ONLY | SUPPLY_AND_INSTALL | LABOR_ONLY | MIXED`
- `document_type`: `INQUIRY | PRODUCT_LIST | BOQ | OTHER`
- `approval_state`: `DRAFT | NEEDS_REVIEW | APPROVED | EXPORTED | FAILED`

**Ne pretpostavljati da su tip dokumenta i način obračuna isto.** Jedan BOQ može služiti distributeru da ponudi **samo materijal**, ili izvođaču da ponudi **materijal + rad**. Način obračuna je eksplicitan izbor korisnika/organizacije.

### Adapteri — ERP-agnostic by design

```python
from typing import Protocol

class BusinessDataConnector(Protocol):
    async def capabilities(self) -> dict: ...
    async def list_products(self, *, cursor: str | None = None): ...
    async def lookup_product(self, external_id: str): ...
    async def get_price(self, external_id: str, customer_ref: str | None): ...
    async def export_draft(self, approved_draft: dict): ...
```

Ovaj interfejs je **projektni predlog**, ne potvrda API-ja nekog provajdera. U implementaciji koristiti zasebne capability flagove i jasne greške za nepodržane funkcije. `export_draft` je izlaz fajla u MVP-u; **nije** automatski create/update u eksternom ERP-u.

```json
{
  "provider": "selltico",
  "status": "PENDING_PARTNER_ACCESS",
  "capabilities": {
    "read_products": false,
    "read_customer_prices": false,
    "read_inventory": false,
    "create_draft_quote": false,
    "create_order": false
  }
}
```

**Pravila integracija:**

- U MVP-u implementirati **jedino `FileConnector`** i uvoz/izvoz preko odobrenog formata.
- Selltico: javni partnerski/API pristup i dozvole nisu potvrđeni; nema izmišljanja endpointa niti pristupa privatnim internim interfejsima.
- PANTHEON/Odoo/Minimax/SAP: tek nakon provjere verzije, prava na API, konkretnih entiteta i potreba kupca.
- Svaka integracija mora imati mogućnosti, vreme poslednje sinhronizacije, status greške, tenant-bound credentials i audit.
- Cene, rabati i zalihe iz snapshots mogu biti zastareli; prikazati `source_timestamp` i ponovnu proveru ako se ugovori live integracija.
- Budući write-back mora biti eksplicitno odobren, idempotentan i otporan na dupliranje.

---

## 7. Ekstrakcija, matching i pravila tehničkog predmera

### 7.1 Status stavke (zajednički)

| Status | Značenje | Odobravanje |
|---|---|---|
| `EXTRACTED` | Izvorna pozicija je pročitana i strukturisana | Potreban pregled |
| `EXACT_MATCH` | SKU/alias + obavezni atributi precizno potvrđeni | Potreban pregled |
| `SUGGESTED_MATCH` | Jedan ili više mogućih artikala | Ručni izbor |
| `AMBIGUOUS` | Dvosmislena specifikacija | Ne dok se ne razreši |
| `UNMATCHED` | Nije pronađen odgovarajući artikal | Ne dok se ne razreši ili svesno označi kao ručna stavka |
| `MISSING_PRICE` | Cena nije dostupna/odobrena | Ne dok se ne unese/potvrdi |
| `INVALID_INPUT` | Količina, jedinica ili struktura nisu validne | Blokirati |
| `MANUALLY_CONFIRMED` | Pregledan i potvrđen podatak | Da, uz kompletan dokument |

`confidence=0.97` koji izgovori LLM **nije dokaz**. Hard validation i odgovoran korisnik ostaju obavezni.

### 7.2 Product Quoting: tvrdi uslovi

- `PP-Y 3×2,5 mm²` ≠ `PP-Y 3×1,5 mm²` ≠ `PP-Y 5×2,5 mm²`.
- Prekidač `B16 1P` ≠ `C16 1P` ≠ `B16 3P`.
- `m`, `kom`, `pak`, `set` i `paušal` nisu međusobno zamenljive jedinice. Konverziju raditi samo preko eksplicitno odobrenog faktora.
- Kada nedostaje presudan atribut, stavka je `AMBIGUOUS`.
- Podaci proizvoda dolaze iz organizacionog kataloga i sačuvane verzije.

### 7.3 Technical Quoting: čuvanje BOQ strukture

- **Originalna pozicija (`1.1`, `1.1.1`, itd.) i njeno poglavlje su nepromenljivi referentni podaci.** Izmene nastaju u zasebnoj potvrđenoj verziji.
- Čuvati redosled, hijerarhiju (`parent_section_id`), podpozicije, napomene, originalni opis, jedinicu, količinu i izvornu ćeliju/stranicu.
- `PRODUCT` — artikl/materijal, opciono povezivanje sa katalogom.
- `WORK` — radnja/izvođenje; cena iz odobrenog cenovnika radova ili ručno potvrđena.
- `SERVICE` — usluga; cena iz odobrenog cenovnika usluga ili ručna.
- `COMPOSITE` — kombinacija isporuke/materijala i rada; ostaje originalna pozicija. Zasebne kalkulacione komponente smeju biti samo **eksplicitno dodate/odobrene**.
- Ne tumačiti „montaža“ kao implicitno uključen radni sat, trošak materijala, garanciju ili transport.
- Ako tehničku podobnost artikla potvrđuje stručna osoba, sačuvati ko ju je potvrdio; aplikacija ne izdaje izjavu o usklađenosti.
- `paušal` se ne može automatski pretvoriti u `kom`, `m²` ili sate.
- Zaglavlja poglavlja i međuzbirovi se ne smeju uvesti kao naplatne pozicije; kalkulacije rade nad validnim listovima/stavkama.

### 7.4 Supply-only vs supply-and-install

| Ako je ponuda… | Sistem sme | Sistem ne sme |
|---|---|---|
| `SUPPLY_ONLY` | Povezati materijalne stavke sa artiklima, ponuditi potvrđenu cenu i količinu | Automatski dodati rad/montažu |
| `SUPPLY_AND_INSTALL` | Prikazati materijal, rad/uslugu i postojeće potvrđene cene | Izmišljati normative, trajanje posla ili broj radnika |
| `LABOR_ONLY` | Ručni/odobren cenovnik radova i pozicije | Kreirati katalog potrebnog materijala bez pravila |
| `MIXED` | Eksplicitno označiti vrstu svake pozicije | Sakriti ili spojiti komponente bez odobrenja |

### 7.5 Minimalni strukturisani primer

```json
{
  "workflow": "TECHNICAL_QUOTE",
  "offer_basis": "SUPPLY_AND_INSTALL",
  "source_ref": {"file_id": "demo", "sheet": "Elektro", "row": 14},
  "position": "1.3",
  "section_path": ["1", "Elektroinstalacije"],
  "raw_description": "Isporuka i montaza LED svetiljki",
  "type": "COMPOSITE",
  "quantity": "12",
  "unit": "kom",
  "catalog_product_id": null,
  "unit_price": null,
  "status": "MISSING_PRICE",
  "review_reasons": ["Potrebna odobrena cena materijala/rada ili ukupna jedinična cena"]
}
```

### 7.6 Proračun

- Izvorni brojevi i cene u bazi: `NUMERIC` ili decimalni string/`Decimal`, bez `float` u finansijama.
- Sačuvati odobrenu cenu, valutu, PDV tretman, izvor i verziju cenovnika.
- Računanje `quantity × approved_unit_price`, grupni međuzbirovi i zbir samo nad validnim pozicijama.
- Bez obračuna ako nedostaje cena ili obavezni podaci; opcija izvoz *neocenjenog predmera* mora biti jasno označena i ne sme glumiti finalnu ponudu.
- Promena cenovnika nakon odobravanja **ne sme retroaktivno promeniti** postojeću ponudu.

---

## 8. Model podataka — spreman za oba toka, bez overengineeringa

```text
organizations (id, name, locale, default_currency)
users (id, email, ...)
memberships (organization_id, user_id, role)

catalog_imports (id, organization_id, version, checksum, status)
products (id, organization_id, catalog_import_id, sku, name, unit, price, currency, vat_rate, active)
product_aliases (id, organization_id, product_id, alias)
service_price_lists (id, organization_id, version, name)
service_prices (id, organization_id, price_list_id, code, description, type, unit, unit_price, currency)

documents (id, organization_id, uploader_id, document_type, mime_type, object_key, sha256, status)
processing_jobs (id, organization_id, document_id, job_type, status, attempts, cost, timestamps)
source_sections (id, organization_id, document_id, parent_section_id, position_code, heading, sort_order, source_ref)
extracted_positions (id, organization_id, document_id, section_id, position_code, sort_order,
                     raw_text, item_type, original_qty, original_unit, source_ref, flags)
match_candidates (id, organization_id, extracted_position_id, product_id, evidence, rank)

quote_drafts (id, organization_id, document_id, workflow, offer_basis, currency, status,
              catalog_snapshot_id, price_list_snapshot_id)
quote_lines (id, organization_id, quote_draft_id, extracted_position_id, position_code,
             item_type, selected_product_id, approved_qty, approved_unit, approved_unit_price,
             approved_vat_rate, price_source, review_status, notes)
quote_line_components (id, organization_id, quote_line_id, component_type, product_id,
                       approved_qty, approved_unit, approved_unit_price, price_source)
quote_versions (id, organization_id, quote_draft_id, version, snapshot_data, approved_by, approved_at)

audit_events (id, organization_id, actor_id, entity_type, entity_id, action, metadata, created_at)
usage_events (id, organization_id, job_id, model, input_tokens, output_tokens, estimated_cost)

integration_connections (id, organization_id, provider, status, capabilities, last_sync_at)
```

### Minimalni tipovi stavki

```typescript
type WorkflowType = "PRODUCT_QUOTE" | "TECHNICAL_QUOTE";
type ItemType = "PRODUCT" | "WORK" | "SERVICE" | "COMPOSITE";
type OfferBasis = "SUPPLY_ONLY" | "SUPPLY_AND_INSTALL" | "LABOR_ONLY" | "MIXED";

interface SourceRef {
  documentId: string;
  page?: number;
  sheet?: string;
  row?: number;
  column?: string;
}

interface ExtractedPosition {
  positionCode: string;
  sectionPath: string[];
  sortOrder: number;
  itemType: ItemType;
  rawDescription: string;
  originalQuantity: string; // Decimal string
  originalUnit: string;
  sourceRef: SourceRef;
}
```

**Napomena:** ova šema je smernica za evoluciju baze, ne obaveza da se sve tabele implementiraju u prvoj nedelji. `quote_line_components` se uvodi kada se dokaže potreba za ručnom razradom `COMPOSITE` pozicija, ne unapred.

### Baza, verzionisanje i izolacija

- Tenant se utvrđuje kroz sesiju i membership; browser-prosleđeni `organization_id` ne sme određivati autorizaciju.
- Ključevi, FK-ovi i jedinstvenost proizvoda definišu se **po organizaciji + verziji kataloga**.
- Odobreni nacrt mora biti reproduktibilan sa cenama, tekstom, količinama, redosledom i verzijom izvora koje je korisnik video.
- Čuvati originalnu poziciju, korisničku ispravku i audit; nikad ne prepisati original bez traga.
- Fajlovi idu u object storage, ne u `bytea`; u bazi su metapodaci, checksum i verzije.
- Za kontekst u kom se podaci eksportuju u Excel neutralisati ćelije koje počinju formula prefiksima (`=`, `+`, `-`, `@`) gde format i korisnički scenario to zahtevaju — bez izvršavanja sadržaja iz dokumenta.

---

## 9. Minimalni API ugovor — proširiv bez ERP zavisnosti

```http
POST   /api/v1/catalog/imports
GET    /api/v1/catalog/products
POST   /api/v1/documents
GET    /api/v1/documents/{id}
POST   /api/v1/documents/{id}/process   # workflow optional; auto-detection uz ručni override
GET    /api/v1/jobs/{id}
GET    /api/v1/documents/{id}/positions
GET    /api/v1/quotes/{id}
PATCH  /api/v1/quotes/{id}/lines/{line_id}
POST   /api/v1/quotes/{id}/approve
GET    /api/v1/quotes/{id}/export?format=pdf
GET    /api/v1/quotes/{id}/export?format=csv
GET    /api/v1/metrics/pilot?workflow=PRODUCT_QUOTE
GET    /api/v1/metrics/pilot?workflow=TECHNICAL_QUOTE
```

**LATER, ne implementirati bez kupca i dokumentovanog API-ja:** `/api/v1/integrations`, `sync`, `ERP draft write-back`, `email connections`.

- Status dokumenta/posla: `UPLOADED`, `PROCESSING`, `NEEDS_REVIEW`, `APPROVED`, `EXPORTED`, `FAILED`, `UNSUPPORTED_INPUT`.
- Jasno razdvojiti `processingStatus` i `approvalStatus`; tehnička ekstrakcija ne znači da je ponuda odobrena.
- Svaki upload i `process` moraju biti idempotentni, sa ograničenim retry-ima i vidljivom greškom.
- FastAPI OpenAPI je izvor istine za TypeScript generisane API tipove.
- U payloadovima prepoznate pozicije koristiti stabilan `position_id` i `source_ref`; ne identifikovati redove samo po rednom broju u UI-u.
- Breaking API promene zahtevaju migracioni plan i regresione testove.

---

## 10. UX — alat za komercijalistu i kalkulanta, ne AI showcase

### Zajednički layout

Levo **originalni dokument** (PDF strana / Excel sheet i red), desno **prepoznate pozicije i nacrt ponude**. Klik na red ističe izvor. Na mobilnom prikazu je navigacija sekvencijalna, a desktop je prioritet.

### Product Quoting ekran

`Originalni opis → SKU kandidati → Tehnički atributi → Količina/JM → Cena → Status pregleda`.

### Technical Quoting ekran

`Poglavlje / Pozicija / Originalni opis / Vrsta stavke / Količina / JM / Materijal (opciono) / Jedinična cena / Status`.

**Obavezne UX smernice:**

- Sačuvati originalne pozicije (npr. `1.1`, `1.2`) i njihov redosled; omogućiti sklapanje/širenje poglavlja.
- Označiti `PRODUCT`, `WORK`, `SERVICE`, `COMPOSITE`, bez prećutnog prevođenja kompozitne pozicije u pojedinačan SKU.
- Jasno razlikovati `EXACT_MATCH`, `SUGGESTED_MATCH`, `AMBIGUOUS`, `UNMATCHED`, `MISSING_PRICE` i `MANUALLY_CONFIRMED`.
- Omogućiti brzu ručnu izmenu, undo gde je izvodljivo i zapis promena.
- Prikazati *odakle* su došli proizvod/cena: katalog, cenovnik rada, ručni unos, verzija i vreme osveženja.
- Broj nerazrešenih stavki i razlog blokade odobravanja moraju biti vidljivi.
- Ako PDF ne može da se pročita, UI kaže zašto i šta korisnik može dalje uraditi.
- Korisnik eksplicitno bira `SUPPLY_ONLY` ili `SUPPLY_AND_INSTALL` kada obrađuje tehnički predmer.
- Izvoz je **NACRT** čak i kada je interno pregledan/odobren; nema zavaravajuće oznake „poslato klijentu“.
- Ne prikazivati izmišljene procente tačnosti; prikazati samo stvarne pilot metrike.

### Minimalni ekrani

1. Login / organizacija ili bezbedni sintetički demo.
2. Documents: upload, tip dokumenta, izbor workflow-a.
3. Processing: koraci, napredak, podržani/nepodržani ulazi.
4. Quote review: original + Product ili Technical editor.
5. Export: predlog PDF/CSV i revizija odobrene verzije.
6. Catalog: katalog proizvoda + minimalna konfiguracija cena rada/usluga za Technical.
7. Pilot metrics: odvojeni uporedni pokazatelji po toku.

---

## 11. Bezbednost, privatnost i zakonitost

### Demo / sandbox

- Isključivo sintetički katalog, izmišljene cene i fiktivni kontakti.
- Ne prikazivati niti uploadovati dokumenta stvarnih kompanija bez dozvole; posebno paziti na poverljive projektne predmere, tehničke specifikacije i cenovnike radova.
- Odvojeni demo nalog, API key, baza i storage od potencijalnih produkcionih podataka.
- Sve demonstracije oznaciti kao simulaciju; ne implicirati postojeću integraciju sa konkretnom firmom.

### Pre prvih stvarnih dokumenata

- Pisano odobrenje firme i jasan opis namene obrade, podržan ugovorom / DPA gde je primenljivo.
- Minimalno prikupljanje podataka; redakcija ličnih podataka kad nisu potrebni za matching.
- Evidentirati provajdere i lokaciju obrade/storage-a; uskladiti transfer podataka sa primenljivim pravilima (Srbija, a za EU kupce i GDPR).
- Definisati rok čuvanja: za pilot **predlog** do 30 dana po završetku, uz drugačiji dogovor ako poslovni/pravni osnov zahteva; dokumentovati brisanje i backup retention.
- Uslovi upotrebe i ograničenje odgovornosti moraju biti pregledani pre prodaje.
- Proveriti pod kojim uslovima izabrani AI provajder obrađuje/zadržava ulazne podatke pre upotrebe poverljivih dokumenata.

### Tehnički MUST

- HTTPS, secrets u environment/secret manager-u, bez ključeva u Git-u.
- MFA za administratorske naloge kada je dostupno, jake sesije, kratke privilegije, tenant-aware RBAC.
- Validacija MIME + veličine, anti-malware skeniranje i izolovana obrada fajlova; bez izvršavanja makroa.
- Za PDF/Excel zaštita od malicious payload-a; ne dopuštati proizvoljne URL fetch pozive ni lokalne fajl putanje iz dokumenta.
- Bez automatskog izvršavanja Excel formula ili makroa; zaštita CSV/XLSX izvoza od formula injection-a.
- Prompt-injection zaštita: tekst emaila/PDF-a je **podatak**, ne sistemska komanda; model nema tool za slanje emaila ili pristup drugim tenantima.
- Rate limits, ograničena potrošnja tokena/posla, timeout, retry limit, redakcija logova.
- Rezervne kopije i vežba vraćanja pre stvarnog pilota; proces gašenja/brisanja organizacije.
- Audit: ko je uneo dokument, ko je promenio stavku, ko je odobrio i koju verziju je izvezao.

**Nije pravni savet.** Pre rada sa stvarnim podacima potražiti stručnu proveru zaštite podataka, ugovora i načina naplate.

---

## 12. Kvalitet, testiranje i kriterijumi za puštanje

### Dva nezavisna test skupa

**Product Quoting:** 30–50 sintetičkih dokumenata, ukupno ≥200 stavki; SKU, alias, B16/C16, 1P/3P, kablovi 3×2,5 i 3×1,5, nepoznati proizvodi, nesaglasne jedinice, decimalni separator, prazni redovi, prompt-injection.

**Technical Quoting:** najmanje 20 sintetičkih jednostavnih `.xlsx` predmera za demo/pilot; zatim proširiti na 30–50 različitih dokumenata pre širenja prodaje. Slučajevi: poglavlja/podpozicije, redni brojevi, međuzbirovi koji nisu naplatne pozicije, `PRODUCT/WORK/SERVICE/COMPOSITE`, isporuka + montaža, `paušal`, prazne cene, spojene ćelije, prelomljeni opisi, Excel formule, različiti decimalni separator, više sheet-ova, nedostajuća jedinica, nulta/negativna količina, red kao naslov a ne pozicija.

**PDF predmeri:** zasebna regresiona grupa tek kada ih eksplicitno označimo kao podržane. Skenirani PDF, crteži i rukopis ostaju nepodržani ili zaseban eksperiment.

### Obavezni automatski testovi

- Unit: parsing, `source_ref`, sekcije i sortiranje, klasifikacija tipova, `Decimal`, status mašina, validacija jedinica.
- Product matching: tvrdi atributi, aliasi i dvosmislenost.
- Technical: očuvane pozicije/poglavlja, bez tihog spajanja, bez izmišljenih normativa i cena, ispravno označene kombinovane pozicije.
- Integration: upload → extraction → review → price confirmation → approval → PDF/CSV.
- Security: tenant izolacija, dozvole odobravanja, storage linkovi, limit dokumenta, formula injection, prompt-injection.
- Regression: zlatni skupovi (`fixtures/expected_results/product/` i `technical/`) i verzionisani očekivani izlazi.
- E2E: jedan kompletan scenario po toku kroz Playwright.

### KPI — odvojeno po toku (pilot ciljevi, ne obećanja)

| Metrika | Kako se meri | Prvi predlog cilja |
|---|---|---|
| Extraction recall | Ispravno izdvojene pozicije / sve očekivane na podržanim formatima | ≥95%, testirati zasebno |
| Position preservation (Technical) | Izvorne pozicije i struktura bez gubitka/dupliranja | 100% na odobrenom test setu |
| Classification accuracy | `PRODUCT/WORK/SERVICE/COMPOSITE` naspram ručne oznake | Pratiti, ručna korekcija obavezna |
| Wrong silent substitution | Pogrešna zamena tehničke stavke bez upozorenja | 0 |
| Price provenance | Svaka ponuđena cena ima dokaz izvora/odobrenja | 100% |
| Auto-match precision (Product) | Tačno izabrani / svi automatski izabrani SKU-ovi | Cilj 99–100% u ograničenom skupu |
| Time to reviewed draft | Isto reprezentativno gradivo ručno vs alat, odvojeno po toku | Cilj ≥40% kraće, tek dokazati |
| Unsupported handling | Nepodržan dokument nije lažno prihvaćen kao potpun | 100% u testu |
| Approval safety | Nema samostalno poslatih konačnih ponuda | 0 incidenata |
| Variable processing cost | AI + worker + storage + retries / dokument | Meriti i ograničiti |
| Payment signal | Stvarno plaćen pilot / odbijanje s razlogom | 1–2 pilota pre širenja |

**Važno:** nijedna agregatna „95% tačnost AI-ja“ metrika ne sme sakriti loš rezultat kod `COMPOSITE`, poglavlja ili pojedinačnih kritičnih atributa.

### Definition of Done — svaka funkcija

- [ ] Konkretan use case, acceptance criteria i deklarisan workflow.
- [ ] Bezbedna backend validacija + tenant/role provere.
- [ ] Pozitivni, negativni i rubni testovi.
- [ ] Izvor i originalne vrednosti se čuvaju, izmene su auditabilne.
- [ ] Tehnički/finansijski proračun ne koristi nekontrolisan model output.
- [ ] Greške, loading i unsupported stanja su upotrebljiva.
- [ ] Promena funkcionalnosti ne potajno proširuje scope drugog workflow-a.
- [ ] Potrošnja i operativni trošak mogu se ograničiti.

---

## 13. Plan razvoja — dva demo toka, jedan ograničen prvi pilot

**Plan:** 6–10 nedelja do stabilnog MVP-a za oba demonstraciona toka uz ~10–15 sati nedeljno; nije obećanje roka. Počni sa jednom demonstracijom, a drugi tok dodaj posle zajedničkog extraction/review jezgra. Ako pilot partner traži samo jedan workflow, **ne čekati završetak drugog**.

| Faza | Isporuka | Šta se još ne radi |
|---|---|---|
| 0 — Discovery | 5 razgovora sa distributerima + 5 sa izvođačima; 2 vrste primera | Nema obećanja za sve industrije |
| 1 — Document core | Upload, parsing PDF/XLSX/EML, `source_ref`, sekcije, test ulazi | Nema automatske kalkulacije |
| 2 — Product core | Katalog CSV, matcher, kandidati, hard rules | Nema live ERP-a |
| 3 — Review + export | Jedinstven editor nacrta, odobravanje, PDF NACRT | Nema slanja kupcu |
| 4 — Technical mode | XLSX predmeri, hijerarhija, item types, rad/usluga/kompozitne stavke | Nema BIM/automatskih normativa |
| 5 — Evaluation | Dva zlatna test skupa i dve demo demonstracije | Nema masovnog marketinga |
| 6 — Pilot readiness | Tenant auth, audit, backup, storage, legal, troškovi | Nema custom ERP konektora |
| 7 — Plaćeni pilot | **Jedan** workflow po kupcu, merena ušteda na dogovorenim dokumentima | Nema „sve industrije“ |
| 8 — Integracije (LATER) | Potvrđen kupac → jedan autorizovani konektor | Nema izmišljanja ERP mogućnosti |

### Backlog P0 — mora pre javnog demo snimka

- [ ] `DOC-01`: Učitavanje sintetičkih tekstualnih PDF/XLSX/CSV/EML zahteva.
- [ ] `DOC-02`: `source_ref`, redosled pozicija i odvajanje zaglavlja od obračunskih stavki.
- [ ] `AI-01`: Pydantic strukturirana ekstrakcija sa očuvanim `raw_text`.
- [ ] `CAT-01`: Import CSV/XLSX kataloga i validacija SKU/JM.
- [ ] `MATCH-01`: Kandidati po SKU/alias/trigram + tvrdi atributi.
- [ ] `QUOTE-01`: Editor + Decimal + approval + PDF NACRT.
- [ ] `BOQ-01`: Jednostavan XLSX BOQ parser sa pozicijama/poglavljima.
- [ ] `BOQ-02`: `PRODUCT/WORK/SERVICE/COMPOSITE` i `MISSING_PRICE`.
- [ ] `EVAL-01`: Product happy/ambiguous/unmatched test; Technical composite/paušal/nedostajuća cena test.

### Backlog P1 — pre rada sa stvarnim podacima / naplatom

- [ ] `AUTH-01`: tenant / RBAC izolacija.
- [ ] `SEC-01`: validacija i izolacija dokumenata, retention, privatnost, audit.
- [ ] `OPS-01`: worker/job status, idempotency, monitoring, backup i restore proba.
- [ ] `QUOTE-02`: snapshot kataloga/cenovnika, podrška za izvozne verzije, PDF/CSV.
- [ ] `BOQ-03`: validacija hijerarhije/pozicija i preservation regression testovi.
- [ ] `LEGAL-01`: pisani uslovi pilota + dozvole za dokumente i LLM obradu.

### Backlog P2 — samo nakon kupčevog signala

- [ ] `INTEGRATION-01`: FileConnector produkciona robusnost i ponovljeni importi.
- [ ] `INTEGRATION-02`: Selltico/PANTHEON/Odoo, uz proveru API-ja i komercijalni ugovor.
- [ ] `INTEGRATION-03`: Gmail/Graph inbox sync sa dozvolama.
- [ ] `BOQ-04`: podrška kompleksnim PDF tabelama.
- [ ] `BOQ-05`: eksplicitno konfigurisani cenovnici radova, BOM/normativi, samo uz domenskog partnera.
- [ ] `AI-02`: embeddings/pgvector, kada evaluacija dokaže potrebu.
- [ ] `OCR-01`: OCR skeniranih dokumenata kao zaseban projekat.
- [ ] `BILLING-01`: automatizovana pretplata kada se dokaže potražnja.

---

## 14. Deploy, troškovi i operativna disciplina

### Pravilo izbora hostinga

Za demo može lokalni Docker ili jednostavna cloud instanca sa **sintetičkim podacima**. Za pilot sa realnim podacima birati infrastrukturu tek kada je jasno šta klijent dozvoljava i koje su potrebe za zaštitom podataka.

- **Jednostavnije upravljanje:** Render/Vercel + managed PostgreSQL/storage — obično više mesečnih pretplata, manje ručnog DevOps rada.
- **Veća kontrola i niža osnovna cena:** Hetzner VPS + Docker + offsite backup — više bezbednosnih i operativnih obaveza.
- Ne staviti produkcionu bazu sa pravim klijentskim podacima samo na jedan VPS bez nezavisnog backupa.
- Razdvojiti `dev` / `demo` / `pilot`; najmanje demo ne deli podatke sa pilotom.

### Budžet planiranja (ne garancija)

| Stavka | Okvir / pravilo |
|---|---|
| Cloud, storage, DB | ciljano ~20–80 € mesečno u ranoj fazi, proveriti planove |
| AI pozivi | poseban budžet i limit po dokumentu/klijentu |
| Domen, email, monitoring | odvojeno, prema stvarnim ponudama |
| Demo i korisnički test | sintetički podaci — bez troška pravih integracija |
| Pilot razvoj | vrednost sopstvenih sati pratiti čak i kada nema fakture |
| Pilot 249 € | nije dovoljno za custom ERP projekat ili neograničenu podršku |

**Trošak po dokumentu** meriti **odvojeno za Product i Technical workflow** (složenost BOQ-a može povećati broj tokena/koraka), pre definisanja pretplate: model input/output tokeni, broj koraka, ponovna obrada, vreme workera i storage. Uvesti hard limit, npr. broj poziva modelu po obradi i maksimalan broj redova dokumenta.

### Minimalna operativa

- Deploy na `main` samo uz zelene testove, migracije baze unapred isprobane.
- Error alerts i jednostavno status praćenje.
- Zakazani backup + dokumentovana procedura vraćanja.
- Health check za API, worker i DB.
- Rotacija ključeva, redovna ažuriranja zavisnosti, least privilege.
- Jasno definisati podršku: npr. odgovor u roku od dva radna dana tokom pilota, bez 24/7 obećanja.

---

## 15. Prodaja, validacija i pilot — dve grupe potencijalnih kupaca

### Product Quoting — ranije istražena početna lista (nepotvrđeni kupci)

**Srbija:** Promont Komerc, Reflekta, Fluoelektro, Elektromaterijal, Elektrostar, DK Trade, DS Computers, Jovan Trade.  
**Hrvatska:** Pondeljak, MAR-MIR PROMET, PAT Elektrocentar, Veker, ELLABO, Elektromax, ALETA, Velekem.

Kompanije nisu potvrdile potrebu niti spremnost da plate. ERP/B2B sistem koji koriste ne podrazumeva da njihov upit proces nije automatizovan.

### Technical Quoting — nova istraživačka grupa (tek treba napraviti listu)

Elektroinstalateri, HVAC izvođači, firme za održavanje objekata i izvođači tehničkih radova koji dobijaju **Excel predmere** i ručno pripremaju predračune. **Ne izmišljati kompanije niti tvrditi da koriste određeni ERP dok to nije provereno.**

### Discovery pitanja — Product

1. Koliko upita stiže emailom/PDF-om/Excelom mesečno?
2. Koliko traje obrada i koliko stavki upit prosečno ima?
3. Koje su najskuplje greške u šifri, jedinici i specifikaciji?
4. Imaju li katalog u CSV/XLSX ili autorizovani API? Koliko ima SKU-ova?
5. Da li žele nacrt ponude, ERP export ili samo proveru stavki?

### Discovery pitanja — Technical

1. Koliko predmera/troškovnika dobijaju mesečno i u kom formatu?
2. Da li se isti Excel predmer ručno prekucava u drugo rešenje?
3. Ko određuje cene rada/usluga, da li postoje odobreni cenovnici i normativi?
4. Da li ponude obuhvataju **samo materijal** ili **isporuku i montažu**?
5. Koliko često poglavlja, kombinovane pozicije i paušalne stavke izazivaju greške?
6. Ko verifikuje tehničku ispravnost i ko formalno odobrava ponudu?

### Ponuda pilota

**Naziv:** 14-dnevni AI Quote Pilot (Product **ili** Technical)  
**Cena:** hipoteza 249 € jednokratno  
**Ulaz:** do 100 dozvoljenih dokumenata, jedan izabrani tok, do 3 imenovana korisnika; Product koristi do 3.000 SKU-ova, Technical dogovorene jednostavne XLSX predmere.  
**Izlaz:** PDF NACRT i CSV, review + audit + kratak kvantitativni izveštaj.  
**Isključeno:** kompleksni PDF/OCR, žive ERP integracije, automatsko slanje, inženjersko normiranje.  
**Uspeh:** uporediti ručni baseline i rezultat na istom skupu, zajedno sa kvalitetom i troškovima.  
**Dodatne izmene:** novi scope, cena i rok kroz pisanu ponudu.

### Prodajni proces

1. Kontakt sa konkretnim primerom dokumenta iz njihove industrije.
2. Kvalifikacioni poziv 15–20 minuta i dozvola za bezbedan test.
3. Odgovarajući demo A ili B, ne oba po svaku cenu.
4. Dogovor jasnih ulaznih formata, volumena i ciljnih metrika.
5. Potpisani pilot uslovi, jedan odgovoran korisnik i jedna onboarding sesija.
6. Pilot + baseline; završni izveštaj, rizici, odluka o nastavku.

### Zabranjene marketinške tvrdnje

Ne obećavati „radi svaki predmer“, „bez greške prepoznaje svaki kabl“, „automatski obračunava projekat“ ili „integrisan je sa svim ERP-ovima“. Umesto toga pokazati stvarne primere podržanog formata i merena poboljšanja **za dati workflow**.

---

## 16. Monetizacija nakon pilota — hipoteza

| Paket | Ilustrativna cena | Za koga |
|---|---|---|
| Starter | 149 €/mes. | Manji broj dokumenata, ručni upload |
| Business | 299 €/mes. | Veći obim, više korisnika, osnovna automatizacija |
| Enterprise | od 499 €/mes. + implementacija | Integracije, SLA i posebni zahtevi |

**Obuhvat paketa:** navedene cene su početne hipoteze za **jedan izabrani workflow**; kombinovani Product + Technical ili posebno modeliranje normativa nije automatski obuhvaćeno. ERP write-back i specijalne šeme podataka ugovaraju se dodatno.

**Važno:** ovo su cene za razgovor s kupcima, ne potvrđena spremnost na plaćanje. U onboarding cenu posebno uračunati format kataloga, čišćenje podataka, alias mapiranje, edukaciju korisnika i eventualne integracije. Pre prve naplate proveriti lokalne poreske, ugovorne i platne obaveze.

### Kada širiti proizvod?

Širi obim tek kada postoje sva tri signala:

1. najmanje 2 firme spremne da plate za isti osnovni tok rada;
2. stvarni testovi pokazuju prihvatljiv kvalitet i merljivu uštedu;
3. onboarding novog klijenta ne zahteva izradu nove aplikacije.

Ako je svaki klijent zaseban custom projekat, to je **agencijska usluga**, ne skalabilan SaaS. Takvi projekti mogu se posebno naplaćivati, ali ne treba da definišu MVP.

---

## 17. Pravila rada sa AI coding agentima

Za svaki zadatak u ChatGPT, Codex, Cursor i drugim agentima prosledi ovaj vodič kao izvor pravila.

> 1. Prvo pročitaj ovaj vodič i `DECISIONS.md`; nema proširenja scope-a bez odobrenja.  
> 2. Implementiraj najmanju održivu promenu i jasno navedi za koji workflow važi.  
> 3. Zajednički document engine i Quote Draft ne smeju zavisiti od ERP vendora.  
> 4. Razdvoji `PRODUCT_QUOTE` i `TECHNICAL_QUOTE` u validaciji i testovima.  
> 5. Čuvaj originalne BOQ pozicije, hijerarhiju, redosled, količine i `source_ref`; nema tihih izmena.  
> 6. Nikada ne generiši tehničke normative, radne sate, cene, PDV ili „ekvivalentne“ proizvode kao činjenice.  
> 7. AI output je nepoverljiv i prolazi Pydantic/backend validaciju.  
> 8. Računanje iznosa radi `Decimal`; čuvaj dokaz izvora i verzije cene.  
> 9. Selltico/PANTHEON/Odoo konektori imaju `status=not_implemented` dok nemamo autorizovan API i test.  
> 10. Svaki endpoint ima server-side tenant i RBAC provere; nijedan realan podatak u fixtures/logovima.  
> 11. Testiraj pozitivne, negativne, nejasne i bezbednosne slučajeve; odvojeni golden datasets po toku.  
> 12. Na kraju navedi izmenjene fajlove, testove, ograničenja, otvorena pitanja i uticaj na scope.

### Ticket — Product Quoting

**`MATCH-02`: Kabl 3×2,5 ne sme biti zamenjen kablom 3×1,5**  
Given katalog ima obe varijante, when korisnik traži 3×2,5, then loš kandidat ne sme biti automatski izabran. Testirati nepostojeću dimenziju i opis bez dimenzije.

### Ticket — Technical Quoting

**`BOQ-02`: Kombinovana pozicija ostaje originalna**  
Given predmer sadrži `1.3 Isporuka i montaža LED svetiljke, 12 kom`, when dokument bude obrađen, then ostaju `position=1.3`, `type=COMPOSITE`, `quantity=12`, `unit=kom` sa izvorom. Cena mora biti `MISSING_PRICE` dok korisnik ne odobri njen izvor. Agent ne sme automatski dodati broj radnih sati ili razložiti poziciju kao da je original promenjen.

---

## 18. Tržišne pretpostavke i rizici

| Pretpostavka ili rizik | Kako proveriti | Status |
|---|---|---|
| Distributeri imaju dovoljno ručnih upita | 10 intervjua + dokumentovani baseline | Neprovereno |
| Izvođači imaju dovoljno složenih, ponavljajućih XLSX predmera | 10 intervjua + 2–3 dozvoljena primera | Neprovereno |
| Obe grupe imaju zajedničko jezgro procesa | Uporediti demo A i B + potrebu za specijalnim pravilima | Delimično projektna hipoteza |
| Prvi pilot može raditi bez ERP integracije | Testirajte FileConnector sa svakim pilot kupcem | Neprovereno |
| Kataloški proizvodi pouzdano se prepoznaju | Golden Product testovi / manual review | Neprovereno |
| Predmeri čuvaju pozicije i kombinovane stavke | Golden Technical testovi / pregled stručnjaka | Neprovereno |
| Kupci imaju odobrene cene materijala i radova | Primer cenovnika ili pismena potvrda | Neprovereno |
| Postojeći ERP/B2B softver već ne pokriva slučaj | Konkurentski demo / razgovor sa kupcem | Neprovereno |
| Selltico/PANTHEON/Odoo integracije mogu biti ponovljive | Zvaničan API, licenca, test tenant i potpisana dozvola | Neprovereno |
| 249 € pilot je prihvatljiv | Stvarni plaćeni pilot | Neprovereno |
| 149–299 €/mes. održivo je bez mnogo custom rada | Obnova pretplate + sati podrške | Neprovereno |
| Dokumenti legalno smeju ka eksternom AI provajderu | Odobrenje firme, ugovorni/pravno-tehnički okvir | Neprovereno |
| Ušteda rada ≥40% na podržanim dokumentima | Paralelno merenje ručno vs naš workflow | Neprovereno |

### Go / no-go

- **GO za demo:** oba scenarija su na sintetičkim podacima i sve nepouzdane stavke jasno zahtevaju pregled.
- **GO za stvarni pilot:** jedan tok je stabilan na odgovarajućem test setu, dozvole/podaci/backup su sređeni, potpisan scope i klijent želi merenu probu.
- **NO-GO:** klijent traži da AI sam potvrđuje tehničku bezbednost, gradi normative, menja ERP bez ovlašćenja ili obrađuje poverljive dokumente bez dozvole.
- **PIVOT:** 15–20 kvalitetnih intervjua bez potvrđenog problema ili komercijalnog interesa; promeni nišu/ponudu, ne dodaj beskonačno funkcije.
- **SCALE:** najmanje dva kupca žele isti osnovni workflow, kvalitet i ušteda su izmereni, sledeći onboarding ne zahteva nov proizvod.

---

## 19. Konkretni sledeći koraci i struktura repozitorijuma

### Prva razvojna lista

- [ ] Sačuvati ovaj v0.2 vodič kao `docs/PILOT_GUIDE.md` i upisati v0.2 promenu u `DECISIONS.md`.
- [ ] Napraviti 100–300 sintetičkih SKU-ova i 10 sintetičkih Product Quoting dokumenata.
- [ ] Napraviti 10 sintetičkih **jednostavnih `.xlsx` elektro predmera**, sa najmanje jednom kombinovanom pozicijom i cenom koja nedostaje.
- [ ] Napraviti parser koji čuva originalne redove, pozicije, sekcije i izvore bez pozivanja LLM-a.
- [ ] Dodati Pydantic ekstrakciju i klasifikaciju `PRODUCT_QUOTE/TECHNICAL_QUOTE`.
- [ ] Implementirati SKU matching i tehničke hard filtere za Product.
- [ ] Implementirati BOQ hijerarhiju i `PRODUCT/WORK/SERVICE/COMPOSITE` za Technical.
- [ ] Omogućiti review + ručni unos nedostajuće cene + `Decimal` kalkulaciju + PDF NACRT.
- [ ] Napraviti odvojene zlatne test skupove i snimiti demo A i demo B do 90 sekundi.
- [ ] Razgovarati sa 5 distributera i 5 izvođača; pokušati da prodamo **jedan** plaćeni pilot.
- [ ] Tek nakon interesovanja: production auth/tenant, real data approvals, backup, ugovorni okvir.
- [ ] Potvrditi zvanične API mogućnosti pre planiranja bilo kog vendor konektora.

### Predložena struktura

```text
ai-inbox-to-quote/
├── apps/
│   └── web/                         # Next.js + TypeScript
├── services/
│   └── api/
│       ├── app/
│       │   ├── api/                 # REST + auth + tenant RBAC
│       │   ├── core/                # config, errors, audit
│       │   ├── documents/           # import, parsing, extraction, source refs
│       │   ├── catalog/             # product data, alias, prices
│       │   ├── matching/            # shared retrieval, product validation
│       │   ├── quotes/              # approval, Decimal, versions, export
│       │   ├── workflows/
│       │   │   ├── product_quote/    # product-specific rules
│       │   │   └── technical_quote/  # BOQ hierarchy, type rules
│       │   ├── integrations/
│       │   │   ├── base/             # protocols + capabilities
│       │   │   └── file/             # jedini implementirani MVP konektor
│       │   └── jobs/                # persisted background tasks
│       └── tests/
│           ├── product_quote/
│           ├── technical_quote/
│           └── security/
├── fixtures/
│   ├── synthetic_catalog.csv
│   ├── product_quote/
│   ├── technical_quote/
│   └── expected_results/
├── docs/
│   ├── PILOT_GUIDE.md
│   ├── DECISIONS.md
│   ├── DATA_HANDLING.md
│   ├── PILOT_OFFER.md
│   └── API_CONTRACT.md
├── infra/
│   └── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md
```

**Ne kreirati prazne vendor module radi utiska „podržavamo 10 ERP-ova“.** Novi adapter nastaje tek kada postoji tehnička dokumentacija, ugovoreni kupac i zadatak.

---

## 20. Zvanična tehnička dokumentacija (polazne reference)

- [OpenAI — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI — Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI — File inputs](https://developers.openai.com/api/docs/guides/file-inputs) — proveriti važeći način obrade i zadržavanja podataka pre rada sa poverljivim fajlovima
- [FastAPI — Deploy in Docker](https://fastapi.tiangolo.com/deployment/docker/)
- [PostgreSQL — Documentation](https://www.postgresql.org/docs/)
- [openpyxl — Working with formulas and Excel files](https://openpyxl.readthedocs.io/)
- [Pydantic — Documentation](https://docs.pydantic.dev/)
- [OWASP — File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [pgvector — GitHub](https://github.com/pgvector/pgvector) — kasnija opcija, ne MVP uslov
- [OWASP — Top 10 for LLM Applications](https://owasp.org/projects/top-10-for-large-language-model-applications)
- [GDPR — Regulation (EU) 2016/679, Article 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [Poverenik Srbije za zaštitu podataka o ličnosti](https://www.poverenik.rs/)

**Integracije (istražiti pre implementacije, ne predstavljaju trenutno podržane konektore):** Selltico — dogovor o pristupu sa provajderom; PANTHEON — verzija i prava za Web Service/API; Odoo — verzija i paket za eksterni API; ostali ERP-ovi po stvarnom kupcu.

---

## Kratki manifest (za README i AI agente)

> **Gradimo AI platformu za nacrte B2B ponuda, ne autonomni ERP ili inženjerski kalkulator.**  
> **Jedno jezgro, dva ograničena toka: Product Quoting i Technical Quoting.**  
> **Originalne pozicije i tehničke karakteristike su nedodirljivi izvor istine.**  
> **AI čita i predlaže; čovek potvrđuje; backend računa iz odobrenih podataka.**  
> **`SUPPLY_ONLY` nije isto što i `SUPPLY_AND_INSTALL`. Nema izmišljenih normativa.**  
> **ERP-agnostic, file-first. API konektor postoji tek kada je autorizovan i testiran.**  
> **Demo može pokazati oba toka; prvi plaćeni pilot obuhvata jedan jasno dogovoren tok.**  
> **Cilj: reproducibilan demo → jedan plaćeni pilot → potvrđena ušteda → tek onda širenje.**

---

## Dodatak A — Evidencija izmena

| Verzija | Datum | Promena |
|---|---|---|
| v0.1 | 20.10.2026. | Početni Product Quoting pilot za distributere, CSV katalog, review, PDF nacrt |
| **v0.2** | **22.10.2026.** | Dodat Technical Quoting (BOQ), hijerarhija i tipovi pozicija, supply-only vs supply-and-install, zajedničko AI jezgro, file-first ERP-agnostic integracioni sloj, odvojeni demo/test/validacioni tokovi i pravilo jedan workflow po pilotu |

**Odluka za v0.2:** šire tržište je razlog da podržimo dva srodna scenarija, **ne** razlog da u pilot ubacimo automatske stručne kalkulacije ili univerzalni ERP konektor.
