# Odluke

## 2026-10-23 — Product Quoting demo fajlovi u browser-local skladištu

- **Status:** Privremeno za frontend demo; nije produkciono rešenje.
- **Odluka:** Product Quoting prihvata sintetičke PDF, XLSX, CSV i EML fajlove i čuva binarni sadržaj i metapodatke u IndexedDB-u u istom browser profilu.
- **Razlog:** Omogućiti upload i stvarno čuvanje fajla bez uvođenja backend-a u ovoj fazi.
- **Granice:** Nema mrežnog slanja, FastAPI-ja, parsiranja, ekstrakcije, obrade ponude, sinhronizacije među korisnicima/uređajima ni tenant izolacije. Podaci mogu nestati kada se obriše browser storage. Koristiti samo sintetičke demo fajlove.
- **Validacija prototipa:** ekstenzija + osnovni potpis PDF/XLSX; tekstualni format CSV/EML; demo limit 20 MB po fajlu. Ovo je tehnički limit prototipa, ne potvrđen limit plaćenog pilota.
- **Sledeća odluka pre shared/pilot upotrebe:** izabrati autentifikovano API skladištenje u S3-kompatibilnom object storage-u, uz tenant proveru, dozvole, retention, checksum, backup i server-side MIME/size/content validaciju. IndexedDB kopija ne sme postati zamena za pilot storage.
