# Ce e nou

## 1.1.0
**Securitate**
- Parolele nu mai stau în clar: doar ca hash (scrypt). Telefonul primește un token de sesiune, nu parola.
- Roluri: **administrator** (tot) și **operator** (PIN separat, opțional: conținut + control, fără setări).
- Starea panoului și lista nu mai sunt publice: doar ecranul de pe PC-ul panoului sau cine e autentificat.
- Blocare după încercări greșite (pe adresă + limită globală pentru accesul prin internet).
- Protecție DNS-rebinding (nume de gazdă permise), headere de securitate, `data.json` cu drepturi restrânse.
- Conectarea Canva/YouTube folosește bilete de o singură folosință (parola nu mai apare în adresă).
- „Deconectează toate celelalte telefoane”.

**Ecran (player) stabil**
- Paza ecranului: semn de viață la 10 s; dacă ecranul se blochează sau procesul grafic cade, se repornește singur.
- Paznic independent (proces separat): dacă aplicația se închide neașteptat, o pornește din nou.
- PDF-urile merg fără internet (pdf.js inclus în aplicație). Preîncărcarea următoarei poze.
- Stare panou pe ecranul principal: ecran oprit, ecranul ales lipsă, un singur monitor, procesor încărcat.

**Acces de oriunde (fără Terminal)**
- Setări → Acces de oriunde: instalează Tailscale, pornește acces privat sau link public, cod QR, „telefon conectat acum”.
- Linkul public cere parolă de administrator puternică și confirmare.

**Actualizări automate**
- Pe Windows aplicația își descarcă singură versiunile noi și le instalează noaptea (3–5) sau când panoul e oprit, sau imediat la cerere.
- Înainte de instalare se face copie de siguranță a datelor (folderul `backup`). Playlistul, fișierele și setările se păstrează.
- Pe Mac: anunț + link de descărcare.

**AI Studio**
- Generează de la zero, modifică prin instrucțiuni (AI-ul primește codul anterior), editare manuală a codului SVG, istoric de versiuni, revenire, salvare în bibliotecă sau direct în playlist, „Editează cu AI” pentru slide-urile existente.
- Sanitizare strictă a SVG-ului (listă albă de elemente și atribute, fără script, evenimente, resurse externe).

**Operator**
- Pe ecranul principal: ce rulează, ce urmează, Înapoi/Înainte, ecran negru, stare panou.
