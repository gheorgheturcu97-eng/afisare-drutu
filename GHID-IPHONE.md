# Aplicația pentru iPhone

Există două variante. Prima merge imediat. A doua e aplicația nativă, pentru App Store.

## Varianta A — imediat, fără Mac (recomandat la început)

1. Pe iPhone deschide în **Safari** adresa panoului, de exemplu `http://192.168.1.50:8080` sau adresa Tailscale `https://minix.….ts.net`.
2. Introdu PIN-ul.
3. Apasă **Share → Adaugă pe ecranul principal**.

Primești iconița „Panou” pe ecranul telefonului. Aplicația se deschide pe tot ecranul, ca una normală.

## Varianta B — aplicație nativă (Xcode, apoi App Store)

**Ai nevoie de:**
- un **Mac** cu **Xcode** (gratuit, din App Store) și **Node.js** (nodejs.org);
- un cont Apple. Pentru test pe telefonul tău contul gratuit e suficient, dar aplicația trebuie reinstalată din Xcode la 7 zile. Pentru App Store sau TestFlight e nevoie de Apple Developer Program, 99 USD pe an.

**Pași (o singură dată):**
1. Copiază folderul `iphone` pe Mac.
2. Deschide Terminal în folderul `iphone` și rulează:
   ```
   bash setup-ios.sh
   ```
   Scriptul instalează tot ce trebuie, creează proiectul Xcode, setează permisiunile și iconița, apoi deschide Xcode.
3. În Xcode:
   - Conectează iPhone-ul prin cablu și alege-l sus, ca destinație.
   - La **Signing & Capabilities** alege **Team** = contul tău Apple.
   - Apasă **▶**.
4. Pe iPhone, prima dată: **Setări → General → VPN și administrare dispozitiv**, apoi „Ai încredere” în contul tău. Pe iOS 16 sau mai nou, activează și **Setări → Confidențialitate → Mod dezvoltator**.
5. Deschide aplicația, scrie adresa PC-ului panoului și apasă **Conectează**.
   Aplicația ține minte adresa. Din Setări → „Schimbă PC-ul panoului” o poți schimba.

**Pentru App Store, după ce merge:**
1. Înscrie-te în Apple Developer Program.
2. În Xcode alege **Product → Archive → Distribute App → App Store Connect**.
3. Testează întâi cu **TestFlight**, apoi trimite aplicația la verificare.

Apple poate cere ca aplicația să fie folositoare și pentru alți oameni. Dacă e doar pentru echipa voastră, TestFlight sau „Unlisted App” sunt variantele potrivite.

## Fără Mac?

Poți închiria un Mac în cloud, de exemplu MacinCloud, sau poți folosi un serviciu de build, de exemplu Codemagic, care construiește aplicația din acest folder. Pentru instalarea pe iPhone prin TestFlight e nevoie oricum de contul Apple Developer, 99 USD pe an.
