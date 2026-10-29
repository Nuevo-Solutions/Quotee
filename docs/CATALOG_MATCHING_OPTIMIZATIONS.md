# Optimizacije prepoznavanja zahteva i povezivanja sa katalogom

Datum: 28.10.2026. Status: predlog izmena zasnovan na analizi priloženih fajlova i trenutnog koda. Aplikacija ovim dokumentom nije izmenjena.

## 1. Cilj

Korisnik učitava originalni zahtev i pokreće obradu. Sistem sam pronalazi tabele, zaglavlja, kolone i stavke. Nije potrebno prepravljati Excel, praviti šablon, birati kolone ili potvrđivati mapiranje pre svake obrade.

Korisnički pregled ostaje na nivou poslovnih nedoumica: koji je proizvod tražen, da li nedostaje količina i postoji li stvaran konflikt specifikacije. Potvrda ponude je zaseban korak od automatskog prepoznavanja dokumenta.

Za ovaj demo prioritet su parser i normalizacija. Svih osam traženih SKU-ova postoji u priloženom katalogu. Jači model i vektorska pretraga nisu preduslov za rešavanje ovog primera.

## 2. Konkretni nalazi iz fajlova

Izvori:

- `/home/ogisa/Downloads/zahtev_za_ponudu.xlsx`, list `Zahtev za ponudu`.
- `/home/ogisa/Downloads/demo_katalog_proizvoda.xlsx`, list `Katalog`.

Zahtev ima naslov i podatke o firmi iznad tabele. Zaglavlje je `A12:E12`, osam proizvoda je u `A13:E20`, a ispod su napomene. Katalog ima 30 proizvoda u `A2:G31`; kolona J sadrži objašnjenja, koja nisu deo proizvoda.

| Red zahteva | SKU | Količina i jedinica | Red kataloga | Nalaz |
| --- | --- | --- | --- | --- |
| 13 | CAB-3X25 | 300 m | 2 | Isti SKU; zahtev koristi `mm²`, katalog `mm2` |
| 14 | CAB-3X15 | 200 m | 3 | Isti problem sa zapisom jedinice preseka |
| 15 | BRK-B16-1P | 24 kom | 9 | Isti SKU, naziv i jedinica |
| 16 | BOX-24M | 2 kom | 16 | Isti SKU, naziv i jedinica |
| 17 | SOC-SCH-W | 40 kom | 24 | Isti SKU, naziv i jedinica |
| 18 | SW-1P-W | 20 kom | 25 | Isti SKU, naziv i jedinica |
| 19 | LED-PNL-36W | 12 kom | 28 | Isti SKU, naziv i jedinica |
| 20 | TIE-200-100 | 5 pak | 31 | Isti SKU; traži se 5 pakovanja, ne 5 komada |

### 2.1. Parser ne pronalazi početak tabele

U `services/api/app/documents/product_parser.py` funkcija `parse_product_document()` pretpostavlja da je zaglavlje `rows[0]`, a da su svi naredni neprazni redovi stavke.

Na originalnom zahtevu je prvi red prazan. Direktan poziv trenutnog parsera bez mapiranja reprodukuje `MAPPING_REQUIRED`, uz deset praznih naziva kolona. LLM za mapiranje dobija prvih pet redova posle tog praznog reda: naslov, podnaslov, prazan red i podatke o firmi. Pravo zaglavlje i proizvodi uopšte nisu u tom uzorku.

Čak i sa ručno zadatim ispravnim indeksima kolona (`position=0`, `sku=1`, `description=2`, `quantity=3`, `unit=4`), parser reprodukuje **19 stavki umesto 8**:

- 8 stvarnih proizvoda, bez parser zastavica.
- 10 redova naslova, kontakta i napomena sa `MISSING_QUANTITY` i `MISSING_UNIT`.
- Sam red zaglavlja sa `INVALID_QUANTITY`, jer pokušava da parsira tekst „Količina“ kao broj.

Processor tih 11 dodatnih redova klasifikuje kao `INVALID_INPUT`. To objašnjava veliki broj „Neispravni podaci“ bez ikakve greške u osam stvarnih stavki.

### 2.2. Ekvivalentne specifikacije izazivaju konflikt

U `services/api/app/matching/service.py` funkcija `_specification_tokens()` na stvarnim opisima vraća:

```text
Kabl PP-Y 3x2.5 mm²  -> {"3x2.5"}
Kabl PP-Y 3x2.5 mm2  -> {"3x2.5mm2"}
```

Poređenje skupova tokena to proglašava za `SPECIFICATION_CONFLICT`, iako je presek isti. Isto važi za kabl `3x1.5`.

Processor potom preskače LLM ako početna odluka sadrži ovaj konflikt. Ova dva reda zato mogu ostati nesigurna i uz tačan SKU i podešen model.

### 2.3. Ostala ograničenja potvrđena kodom

- Zaglavlja `R. br.` i `Naziv proizvoda` nisu pokrivena trenutnim aliasima parsera. Čak i izbor pravog reda nije dovoljan bez proširenja prepoznavanja kolona. `Šifra`, `Količina` i `Jedinica` jesu prepoznatljivi.
- Čita se samo prvi radni list. Nema prepoznavanja više tabela ili granica sekcije.
- `ProductColumnMapping` čuva samo indekse kolona. Ne može da izrazi da podaci počinju u 13. i završavaju u 20. redu.
- Nepostojeća količina ili jedinica zaustavljaju i samo pronalaženje proizvoda, iako identitet često može da se utvrdi iz SKU-a ili opisa.
- Kod prvog kandidata konflikt blokira LLM za celu listu; drugi kompatibilan kandidat ne dobija priliku.
- LLM vidi najviše pet kandidata, bez izdvojenih atributa i bez dokaza iz originalnih ćelija.
- `POST /catalog/imports` zahteva `mapping`. Automatsko mapiranje kataloga mora da postoji i na backendu, uz opcioni napredni ručni izbor.
- Ponovni `POST /documents/{id}/process` za postojeći posao u `NEEDS_REVIEW` vraća taj posao. Posle promene parsera isti dokument može nastaviti da prikazuje stare rezultate.

**Granica zaključka:** analizirani su originalni fajlovi i reprodukovano ponašanje parsera i izdvajanja specifikacija. Nije pregledan konkretan sačuvani job, njegov odabrani katalog ili stvarni OpenAI odgovor. „Nije pronađeno“ za neki od ovih osam tačnih SKU-ova zahteva dodatnu proveru uvezenih podataka, mapiranja, verzije kataloga i starog rezultata posla. Sam sadržaj fajlova ne opravdava odsustvo tih proizvoda.

## 3. P0: automatsko prepoznavanje strukture dokumenta

### 3.1. Pronaći tabelu pre parsiranja stavki

Uvesti fazu `detect_document_layout()` koju koriste i zahtev i katalog:

1. Pregledati radne listove, Excel Table opsege ako postoje i ograničene uzorke nepraznih oblasti. Za demo je dovoljan početni prozor od 50 redova po listu; ako nema tabele, skenirati sledeće blokove do konfigurisanog limita.
2. Rangirati moguće redove zaglavlja prema nazivima kolona i tipu vrednosti u redovima ispod: SKU, opis, broj i jedinica. Formatiranje je pomoćni signal.
3. Podržati prazne uvodne redove, naslovne blokove, spojene ćelije, dvoredna zaglavlja i pomerene kolone.
4. Odrediti granice jedne ili više tabela. Prazan red je signal, ali nije dovoljan razlog da se izgube proizvodi ispod njega.
5. Prepoznati ponovljena zaglavlja, zbirne redove, napomene i sekcije. Sačuvati razlog preskakanja i originalne koordinate.

Interni rezultat za dati zahtev treba da izgleda približno ovako; brojevi redova su Excel brojevi, kolone su indeksi od nule:

```json
{
  "sheet": "Zahtev za ponudu",
  "header_rows": [12],
  "data_start_row": 13,
  "data_end_row": 20,
  "columns": {
    "position": 0,
    "sku": 1,
    "description": 2,
    "quantity": 3,
    "unit": 4
  },
  "method": "header_and_row_validation"
}
```

Proširiti normalizaciju zaglavlja da obrađuje tačke, prelome reda i uobičajene kombinacije reči. Dodati `R. br.`, `Redni broj`, `Naziv proizvoda`, `Opis artikla`, `Jed. mere`, `J.M.` i odgovarajuće ćirilične zapise. Pravila proveravati uz sadržaj kolone: „Šifra kupca“ ne sme automatski postati šifra proizvoda.

### 3.2. LLM određuje strukturu kada pravila nisu dovoljna

Zameniti obaveznu potvrdu predloga mapiranja automatskom validacijom i nastavkom obrade.

Model treba da dobije sažet pregled listova i reprezentativne blokove sa originalnim brojevima redova/kolona, uključujući najbolje kandidate za zaglavlje i nekoliko redova ispod. Prvih pet redova dokumenta nije dovoljan uzorak. Uvesti zasebnu šemu `DocumentLayoutDecision`: list, blokovi tabela, redovi zaglavlja, kolone i izvorni dokazi.

Backend proverava da svi opsezi postoje, da se obavezne kolone ne preklapaju i da podaci odgovaraju predloženim tipovima. Zatim radi probno parsiranje. Kada većina pronađenih „proizvoda“ liči na kontakt ili napomenu, predlog se odbacuje i radi se najviše jedan ciljani pokušaj na drugom bloku.

Predlog modela se prihvata tek posle tih provera. Samoprijavljena „pouzdanost 95%“ nije dovoljan kriterijum. Budžet strukturiranja mora posebno da se izmeri; postojeći limit za kratko mapiranje kolona ne mora biti dovoljan za više tabela.

### 3.3. Korisnički tok bez obaveznih kolona

- Podrazumevani tok: **Učitaj fajl → Obradi → Pregledaj pronađene proizvode**.
- Ne otvarati ekran „Potvrdite kolone“ kada sistem može da validira strukturu.
- Ako identitet proizvoda može da se izdvoji, nastaviti pretragu i označiti samo nedostajuće poslovne podatke.
- Ako ni pravila ni ograničeni LLM pokušaj ne daju upotrebljivu strukturu, prikazati „Nismo uspeli da izdvojimo stavke“ sa izvorom i razlogom. Ne predstavljati izmišljene redove kao neispravne proizvode. Ručno mapiranje može ostati napredna opcija, ali nije obavezan deo toka.

Isti princip primeniti na import kataloga: automatski prepoznati list, zaglavlje i polja, pokazati sažetak uvoza, a kolone otvoriti samo na zahtev. Postojeći pozivaoci sa eksplicitnim `mapping` ostaju podržani.

## 4. P0: odvojiti identitet proizvoda od kompletnosti zahteva

Ukinuti zajedničku zabranu pretrage zbog svake zastavice ulaza. Uvesti odvojene dimenzije rezultata:

| Dimenzija | Primeri predloženih vrednosti | Uticaj |
| --- | --- | --- |
| Izdvajanje stavke | `PARSED`, `PARTIAL`, `UNREADABLE` | Da li znamo šta u izvoru predstavlja stavku |
| Identitet proizvoda | `EXACT_MATCH`, `SUGGESTED_MATCH`, `AMBIGUOUS`, `UNMATCHED` | Koji artikal odgovara zahtevu |
| Količina | `VALID`, `MISSING`, `INVALID` | Da li se može računati iznos |
| Jedinica | `EXPLICIT`, `CATALOG_SUGGESTED`, `CONFLICT`, `MISSING` | Da li je tražena mera jasna i uporediva |

Primer: `CAB-3X25` bez količine treba da vrati pronađen artikal i „Nedostaje količina“. Ne može da se izračuna ukupan iznos niti odobri kompletna ponuda, ali identitet proizvoda nije neispravan.

Jedinica iz kataloga može biti predlog uz oznaku porekla. Ne prepisivati je kao izvornu korisničku vrednost i ne pretvarati pakovanja u komade bez poznatog faktora. Za `TIE-200-100` sačuvati `5 pak`; „100 kom“ je sadržaj pakovanja iz naziva.

Količine parsirati zajedničkim pravilima za tipizirane Excel brojeve i lokalne zapise. Jasne vrednosti poput `300`, `300,5`, `1.250,00` i `1 250` podržati uz kontekst formata; dvosmisleno `1.250` bez konteksta ne pretvarati proizvoljno. Ne popunjavati odsutnu količinu jedinicom ili nulom.

## 5. P0: normalizacija specifikacija bez lažnih konflikata

Uvesti zajednički modul za normalizaciju zahteva i kataloga. Sačuvati originalne vrednosti i verziju normalizacije.

- Kanonizovati `mm²`, `mm2` i `mm^2`, znakove `×`/`x`, razmake i decimalni zarez u prepoznatim tehničkim vrednostima.
- Identifikatore normalizovati konzervativno; uklanjanje crtica ili svih razmaka iz SKU-a ne sme spojiti različite proizvode. Definisati i proveriti kolizije po verziji kataloga.
- Umesto poređenja skupova regex stringova porediti tipizirane atribute po kategoriji: za kabl broj provodnika i presek; za osigurač karakteristiku, struju i polove; za panel dimenzije, snagu i temperaturu boje.
- Uz svaki atribut sačuvati vrednost, jedinicu i deo izvornog teksta. Neprepoznat zapis znači nepoznat atribut, ne automatski konflikt.
- Odsutni i konfliktni atributi imaju različite razloge. Eksplicitni `B16` naspram `C16`, `3x1.5` naspram `3x2.5` i `1P` naspram `3P` ostaju stvarni konflikti.

Za dva kabla iz ovog zahteva očekivani atributi su `(3, 2.5 mm²)` i `(3, 1.5 mm²)` na obe strane. Uz jedinstven SKU i kompatibilnu jedinicu to daje visoku pouzdanost bez LLM poziva.

## 6. P1: bolja pretraga i ciljano uključivanje LLM-a

Prvo rešiti osam tačnih SKU-ova iz ovog primera. Zatim poboljšavati zahtev bez šifre:

1. Tačan normalizovan SKU, uz proveru opisa i stvarnih tehničkih konflikata.
2. Jedinstven naziv ili potvrđen alias, uz proveru atributa.
3. Pretraga tokena i trigram pretraga nad normalizovanim nazivima i aliasima.
4. Dodati kategoriju i kompatibilne strukturirane atribute kao signale za rangiranje.
5. Ako kandidata nema ili nema kompatibilnih, dozvoliti jedno kontrolisano proširenje upita iz izdvojenih sinonima/atributa, pa ponoviti backend pretragu.
6. LLM bira između najbolje rangiranih kompatibilnih ili nepotpuno opisanih kandidata. Nijedan poziv ne dobija proizvode druge organizacije ili druge verzije kataloga.

Proveravati ograničenja za svakog kandidata pre konačnog skraćivanja liste. Konflikt prvog kandidata ne sme da blokira druge. Kandidati sa stvarnim konfliktom mogu biti prikazani kao odbijene alternative, uz konkretan razlog.

Modelu poslati normalizovanu stavku, relevantne izvorne delove i atribute kandidata. Backend proverava ID i kompatibilnost posle odgovora. LLM ne menja cene, količine niti sam odobrava ponudu.

Za sada zadržati mali broj kandidata u pozivu i meriti koliko često pravi proizvod uopšte ulazi u izbor. Embedding pretragu razmotriti tek na primerima gde sinonimi i leksička pretraga dokazano propuštaju pravi proizvod. Izbor jačeg modela uporediti na istom označenom skupu, posle popravke ekstrakcije.

## 7. P1: razumljivi rezultati, praćenje i ponovna obrada

Visoku pouzdanost vezati za konkretne dokaze. Za ovaj demo je to „Tačna šifra, usaglašene specifikacije i jedinica“. Predlog LLM-a sam po sebi ne podiže rezultat na visoku pouzdanost. Identitet, cena, zaliha i odobrenje imaju zasebna stanja.

U pregledu dokumenta prikazati:

- „Pronađeno 8 stavki“ i sažetak preskočenih redova, uz detalje na zahtev.
- Konkretan razlog problema: „Nedostaje količina“, „Presek se razlikuje“, „Više odgovarajućih proizvoda“ ili „Nema kandidata u ovoj verziji kataloga“.
- Izvornu ćeliju/opseg, odabrani proizvod i alternativne kandidate.
- Poseban razlog kada model nije pozvan, nije dostupan, nije uspeo ili je iscrpljen budžet. Greška modela nije dokaz da proizvod ne postoji.

U job sačuvati `pipeline_version`, verzije parsera/normalizacije/prompta, stvarni model, ID kataloga, način prepoznavanja strukture, broj izdvojenih/preskočenih/nerešenih redova, trajanja faza i tokene. Za matching sačuvati metod, dokaze atributa i razloge za odbacivanje kandidata.

Dodati eksplicitnu novu obradu dokumenta posle promene pipeline-a ili kataloga. Nova obrada dobija svoj identitet i rezultate; stari nalazi i korisničke potvrde ostaju vezani za prethodni prolaz. Sam klik „Obradi“ trenutno može vratiti stari završen rezultat, što otežava proveru svake popravke.

## 8. Predložene promene po fajlovima

Putanje su relativne prema korenu repozitorijuma.

| Fajl/oblast | Izmena |
| --- | --- |
| `services/api/app/documents/product_parser.py` | Detekcija tabela i početka/kraja podataka, bolja zaglavlja, klasifikacija redova, reference na ćelije |
| Novi modul za layout u `services/api/app/documents/` | Zajednički ugovor za listove, blokove, kolone, izvore i validaciju |
| `services/api/app/llm/schemas.py` | Nova strukturisana šema za layout i izvore; proširenje matching ulaza atributima |
| `services/api/app/llm/client.py` | Poziv za strukturu dokumenta, reprezentativni blokovi, posebno merenje budžeta |
| `services/api/app/jobs/processor.py` | Automatski nastavak nakon validacije layout-a; pretraga i kod nedostajuće količine; provera svakog kandidata |
| `services/api/app/matching/service.py` | Kanonski atributi, razlikovanje nepoznatog od konflikta, proširenje pretrage |
| `services/api/app/catalog/importer.py` i `app/catalog/service.py` | Automatsko tumačenje kataloga i normalizovani podaci za pretragu; podrška za stvarnu `active` kolonu ako postoji |
| `services/api/app/api/v1/endpoints/catalog.py` | `mapping` postaje opcion; backend sam prepoznaje strukturu |
| `services/api/app/api/v1/endpoints/documents.py` | Nova obrada i verzija pipeline-a; kompatibilnost sa postojećim mapping endpointom |
| Modeli, Pydantic ugovori i migracije | Odvojena stanja izdvajanja, identiteta, količine i jedinice; layout i verzije prolaza |
| `apps/web/components/dashboard/document-object-page.tsx` | Automatski tok, jasni poslovni razlozi i nova obrada; mapiranje samo napredno |
| `apps/web/components/dashboard/data-sources-page.tsx` | Automatski import kataloga sa sažetkom i opcionim naprednim izmenama |

Navedena nova polja i statusi su predlozi, ne postojeće mogućnosti API-ja. Za `active`, sadašnji katalog parser nema mapiranje tog polja, a persistence ga ne prosleđuje modelu. U ovom fajlu su svi proizvodi aktivni, pa to nije uzrok prijavljenog problema.

## 9. Provera uspeha

### Obavezni regresioni primer: ova dva fajla

- Uvesti svih 30 proizvoda iz oblasti kataloga bez ručnog izbora kolona.
- Prepoznati list, zaglavlje u 12. redu i tačno 8 proizvoda iz redova 13–20, bez korisničke potvrde mapiranja.
- Nijedan naslov, kontakt, zaglavlje ili napomena ne sme postati `INVALID_INPUT` proizvod.
- Sačuvati sve izvorne količine, jedinice i reference na ćelije.
- Povezati svih 8 SKU-ova sa odgovarajućim proizvodom. Oba kabla prolaze normalizaciju specifikacija.
- Za tih 8 redova očekivati 8 tačnih podudaranja sa visokim poverenjem i 0 matching LLM poziva. Eventualni poziv za strukturu meriti zasebno; prepoznavanje ovog urednog zaglavlja treba da uspe i pravilima.
- Automatsko prepoznavanje ne znači automatsko odobravanje ili slanje ponude.

### Dodatni testovi koji sprečavaju prividno poboljšanje

1. Isti zahtev sa pomerenim kolonama, drugim naslovnim blokom, tabelom na drugom listu i ponovljenim zaglavljem.
2. Zahtev bez SKU kolone: izmeriti recall kandidata i tačnost predloga odvojeno od osnovnog SKU testa.
3. `mm²`, `mm2`, `mm^2`, `3 × 2,5` i `3x2.5`: ekvivalentni zapisi prolaze.
4. Pravi konflikti preseka, karakteristike i broja polova ostaju označeni i uz tačan SKU.
5. Tačan SKU bez količine pronalazi proizvod, ali ne omogućava računanje kompletnog iznosa.
6. Napomena između dve grupe proizvoda ne prekida obradu niti postaje proizvod. Sumnjivi red sa obeležjima stavke ostaje vidljiv za proveru, ne nestaje kao napomena.
7. Nedostupan model ili prekoračen budžet ostavlja završene rezultate i jasan razlog za preostale stavke.
8. Novi prolaz posle promene pipeline-a daje nove rezultate i čuva stare korisničke odluke.
9. Instrukcije u ćelijama su sadržaj dokumenta. Ne smeju promeniti pravila ekstrakcije, izabrati drugi katalog ili zaobići backend validaciju.

Meriti broj stvarnih stavki, lažno dodatih/izostavljenih redova, tačnost polja, recall kandidata, tačnost izbora, broj pogrešno sigurnih rezultata, udeo ručnih intervencija, tokene i trajanje. Prikaz većeg broja sigurnih oznaka bez tačnog proizvoda nije poboljšanje.

## 10. Redosled isporuke

1. **P0 — popravka ovog primera:** otkrivanje zaglavlja i granica tabele, aliasi kolona, kanonizacija preseka i regresioni test za svih osam stavki.
2. **P0 — uklanjanje obaveznog mapiranja:** backend validacija layout-a, LLM fallback za nepoznat raspored i automatski nastavak; isto za katalog i zahtev.
3. **P0 — delimični podaci:** odvojiti pronalaženje proizvoda od količine i jedinice, uz jasne UI razloge i očuvanje izvora.
4. **P1 — proverljivost:** nova obrada, verzije pipeline-a i dijagnostika po fazama.
5. **P1 — zahtevi bez šifre:** atributi, rangiranje svakog kandidata, kontrolisano proširenje upita i ciljani LLM izbor.
6. **P2 — dalja optimizacija:** cache po layout-u i verziji kataloga, poređenje modela i eventualna embedding pretraga na osnovu izmerenih promašaja.

Ovaj predlog ažurira smer ranijeg `docs/LLM_DOCUMENT_MATCHING_PLAN.md`: obavezna potvrda mapiranja više nije željeni podrazumevani tok. Prvi kriterijum završetka je da originalni priloženi zahtev prođe bez prepravljanja fajla i bez izbora kolona.
