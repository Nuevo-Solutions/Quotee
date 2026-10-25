# Odluke

## 2026-10-23 — Product Quoting demo fajlovi u browser-local skladištu

- **Status:** Privremeno za frontend demo; nije produkciono rešenje.
- **Odluka:** Product Quoting prihvata sintetičke PDF, XLSX, CSV i EML fajlove i čuva binarni sadržaj i metapodatke u IndexedDB-u u istom browser profilu.
- **Razlog:** Omogućiti upload i stvarno čuvanje fajla bez uvođenja backend-a u ovoj fazi.
- **Granice:** Nema mrežnog slanja, FastAPI-ja, parsiranja, ekstrakcije, obrade ponude, sinhronizacije među korisnicima/uređajima ni tenant izolacije. Podaci mogu nestati kada se obriše browser storage. Koristiti samo sintetičke demo fajlove.
- **Validacija prototipa:** ekstenzija + osnovni potpis PDF/XLSX; tekstualni format CSV/EML; demo limit 20 MB po fajlu. Ovo je tehnički limit prototipa, ne potvrđen limit plaćenog pilota.
- **Sledeća odluka pre shared/pilot upotrebe:** izabrati autentifikovano API skladištenje u S3-kompatibilnom object storage-u, uz tenant proveru, dozvole, retention, checksum, backup i server-side MIME/size/content validaciju. IndexedDB kopija ne sme postati zamena za pilot storage.

## 2026-10-25 — Lokalni upload preko Next proxy-ja

- **Status:** Samo lokalni razvoj i sintetički dokumenti.
- **Odluka:** Product i Technical UI šalju fajl na Next.js `/api/documents` proxy, koji ga prosleđuje FastAPI-ju. FastAPI čuva original i metapodatke u lokalnom filesystem storage-u; Compose koristi named volume. Next prosleđuje listing i sadržaj fajla za preview.
- **Granice:** Podržani upload formati su PDF, XLSX, CSV i EML za Product i samo XLSX za Technical; limit je 20 MB. Upload ne pokreće parsiranje niti obradu ponude. Nema autentikacije, tenant izolacije, retention politike, malware skeniranja ili produkcionog object storage-a.
- **Sledeća odluka pre stvarnih dokumenata:** Uvesti autorizaciju i tenant-aware object storage, server-side kontrolu veličine/sadržaja, retention/brisanje i audit.

## 2026-10-25 — Backend scaffold bez poslovne obrade

- **Status:** Razvojni scaffold; nije spreman za stvarne klijentske podatke.
- **Odluka:** Uvesti FastAPI aplikaciju, verzionisane API putanje, početne SQLAlchemy modele, Pydantic ugovore i Alembic konfiguraciju.
- **Razlog:** Pripremiti granice backend-a za Product Quoting i Technical Quoting pre implementacije obrade.
- **Granice:** Samo health ruta radi; poslovne API rute vraćaju HTTP 501. Nema autentikacije/RBAC-a, tenant izolacije, upload/storage-a, parsiranja, ekstrakcije, matching-a, kalkulacije, odobravanja ni izvoza. Koristiti samo lokalne sintetičke podatke.
- **Sledeći koraci pre pilot upotrebe:** Implementirati i testirati tenant/RBAC provere, bezbedan storage i obradu dokumenata, audit, backup i politike zadržavanja podataka.
