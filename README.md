# Afișare Druțu — ghid de pornire

Cu aplicația pui pe panoul LED de pe clădire reclame, anunțuri de vânzare, poze, video, PDF, clipuri YouTube și designuri din Canva. Le controlezi de pe iPhone sau de pe PC, de oriunde.

```
iPhone / PC de acasă ──► MINIX (Windows) cu aplicația „Afișare Druțu” ──HDMI──► NovaStar TB60 ──► ecran LED
```

## Descărcare

Ia ultima versiune din **[Releases](../../releases/latest)**:

| Sistem | Fișier |
|---|---|
| Windows | `Afisare-Drutu-…-win-x64.exe` (instalator) sau `…-win-x64.zip` (fără instalare) |
| Mac cu Apple Silicon (M1–M4) | `Afisare-Drutu-…-mac-arm64.dmg` |
| Mac cu Intel | `Afisare-Drutu-…-mac-x64.dmg` |
| iPhone | se construiește pe un Mac cu Xcode, vezi [GHID-IPHONE.md](GHID-IPHONE.md) |

**Prima deschidere pe Mac:** aplicația nu e încă semnată de Apple, așa că macOS o blochează. Trage aplicația în **Aplicații**, încearcă s-o deschizi o dată, apoi mergi la **Setări sistem → Confidențialitate și securitate → Deschide oricum**. Dacă scrie că aplicația „e deteriorată”, rulează o dată în Terminal:

```
xattr -cr "/Applications/Afișare Druțu.app"
```

## 1. Pe PC-ul panoului (MINIX, Windows)

1. Instalează `Afisare-Drutu-…-win-x64.exe` sau dezarhivează varianta `.zip`, de exemplu în `C:\Afisare Drutu`.
2. Pornește **`Afișare Druțu.exe`**.
   La prima pornire, Windows poate afișa „Windows a protejat PC-ul”. Apasă **Mai multe informații → Executare oricum**. Mesajul apare pentru că aplicația nu are încă semnătură digitală plătită.
3. Ce face aplicația singură:
   - pune ecranul panoului pe **tot monitorul secundar** (HDMI spre TB60) și deschide aplicația de control pe monitorul principal;
   - pornește automat odată cu Windows și împiedică stingerea ecranului;
   - pune o iconiță lângă ceas. De acolo vezi **PIN-ul** și adresa pentru telefon, redeschizi controlul sau oprești aplicația.
4. În aplicație apasă linia de stare de sus (**„Panou conectat”**). Alege ecranul pe care e panoul, apoi apasă **Identifică**. Pe panou trebuie să apară „✓ PANOU”.

În BIOS-ul MINIX activează „Power on after AC loss”, ca PC-ul să repornească singur după o pană de curent.

**Pe Mac** (dacă PC-ul panoului e Mac): instalează `.dmg`-ul din Releases. Funcționează la fel ca pe Windows.

## 2. NovaStar TB60

TB60 trebuie să fie în **mod sincron (HDMI)**: în ViPlex Express mergi la Screen Control → Sync / HDMI.
În aplicație, la **Setări → Zona panoului LED**, pune rezoluția panoului din NovaLCT, de exemplu 192 × 96. TB60 afișează colțul din stânga-sus al imaginii.

## 3. De pe telefon

- **În aceeași rețea Wi-Fi:** deschide în Safari adresa din aplicația de pe PC (**Setări → Conectează telefonul**), de exemplu `http://192.168.1.50:8080`, și introdu PIN-ul. Apoi alege Share → **Adaugă pe ecranul principal**.
- **De acasă:** instalează **Tailscale** (gratuit) pe MINIX și pe iPhone, cu același cont. Pe MINIX rulează o dată, în Command Prompt: `tailscale serve --bg 8080`. Primești o adresă `https://minix.….ts.net` care merge de oriunde.
- **Aplicația iPhone adevărată:** vezi `GHID-IPHONE.md`.

## 4. Cum se folosește

| Vrei să… | Faci așa |
|---|---|
| Pui ceva pe panou | **＋ Adaugă**: poze / video / PDF, Canva, YouTube, anunț rapid sau un link |
| Alegi cât stă o poză | Pe ecranul principal: **Durată slide − 10 s +**. Video și YouTube rulează mereu până la final |
| Alegi altă durată pentru un singur slide | Atinge slide-ul → **Cât stă pe ecran** (Auto = timpul general) |
| Alegi zilele și orele | Atinge slide-ul → **Când apare**: zile, „Toată ziua” sau interval, plus „Se oprește singur pe” pentru oferte |
| Vezi ce rulează într-o zi | Literele **L M M J V S D** de pe ecranul principal |
| Schimbi ordinea | Trage de **⠿** |
| Scoți ceva doar dintr-o zi | **×** pe rând. Elementul rămâne în „Din bibliotecă” |
| Pui imediat ceva pe panou | Ține apăsat pe slide → **Redă acum** (sau ▶ în editor). După ce se termină, panoul revine la listă |
| Setezi orele panoului și luminozitatea | Iconița 📅 → **Program** |
| Treci la slide-ul următor sau pui ecranul pe negru | Butoanele din cardul „Acum pe panou” |

Pe PC poți trage fișierele direct în fereastră sau le poți lipi cu Ctrl+V. Ctrl/⌘+Z anulează ultima acțiune. N adaugă un element nou. Pe slide-uri merge click-dreapta.

## 5. YouTube și Canva

Ca să conectezi conturile, urmează pașii din `GHID-CONTURI.md`. Durează cam 10 minute pentru fiecare și se face o singură dată, de pe PC-ul panoului.

## 6. Bine de știut

- **Fișiere acceptate:** poze (JPG, PNG, GIF, WebP, SVG), video (MP4, MOV, WebM, MKV) și PDF, unde fiecare pagină devine un slide. Pozele HEIC de pe iPhone sunt convertite automat de telefon.
  PowerPoint și Word nu se pot afișa direct: salvează-le ca **PDF** sau ca **video**, apoi încarcă-le.
- **YouTube:**
  - Clipurile **private** nu pot fi redate pe panou. Fă-le „Nelistate”: nu apar public pe YouTube, dar merg pe panou.
  - Unele clipuri au redarea în afara YouTube blocată de proprietar. Pot apărea și reclame YouTube.
  - Pentru reclamele voastre e mai sigur să încărcați fișierul video direct.
- **Luminozitatea** din aplicație întunecă imaginea trimisă. Luminozitatea hardware a modulelor LED rămâne cea din ViPlex.
- **Unde sunt datele:** playlistul și fișierele încărcate stau în `%APPDATA%\Afișare Druțu` (Windows).

## Pentru dezvoltatori

```
npm install
npm start            # pornește aplicația desktop (Electron)
npm run server       # doar serverul, pe http://localhost:8080
npm run dist:win     # instalator Windows
npm run dist:mac     # .dmg pentru Mac (rulează pe macOS)
```

Fișierele de instalare se construiesc automat pe GitHub (Actions) pentru Windows și Mac. Pentru o versiune nouă: schimbă `version` în `package.json`, apoi `git tag v1.0.1 && git push --tags`. Se creează singur un Release cu fișierele.
