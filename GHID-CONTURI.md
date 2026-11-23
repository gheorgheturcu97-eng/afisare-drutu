# Conectarea YouTube și Canva

Conectarea se face **o singură dată, de pe PC-ul panoului**, fie direct, fie prin AnyDesk. După aceea, clipurile și designurile tale apar în aplicație și pe iPhone.

## YouTube (cont Google)

1. Intră pe https://console.cloud.google.com, cu contul Google al canalului YouTube.
2. Sus, la selectorul de proiect, apasă **New Project**, dă-i numele „Afișare Druțu” și apasă **Create**.
3. Din meniu mergi la **APIs & Services → Library**, caută **YouTube Data API v3** și apasă **Enable**.
4. Mergi la **APIs & Services → OAuth consent screen**:
   - tip **External**, nume „Afișare Druțu”, emailul tău;
   - la **Test users**, adaugă emailul tău.
5. Mergi la **APIs & Services → Credentials** și apasă **Create credentials → OAuth client ID**:
   - Application type: **Web application**;
   - Authorized redirect URIs: `http://localhost:8080/oauth/youtube/callback`.
6. Copiază **Client ID** și **Client Secret**.
7. Pe PC-ul panoului, în aplicație, mergi la **Setări → Conturi**. Lipește cele două valori și apasă **Salvează datele**, apoi **Conectează YouTube**. Alege contul și apasă **Continuă**.

Un detaliu: cât timp aplicația Google e în modul „Testing”, conexiunea expiră la 7 zile. Ca să nu mai expire, la **OAuth consent screen** apasă **Publish app**. Google va afișa „aplicație neverificată”. E normal pentru uz propriu: apeși **Advanced → Continuă**.

## Canva

1. Intră pe https://www.canva.com/developers, cu contul tău Canva, și creează o integrare nouă.
2. La **Scopes**, bifează: *design:meta:read*, *design:content:read*, *profile:read*.
3. La **Authentication → Redirect URLs** adaugă: `http://127.0.0.1:8080/oauth/canva/callback`.
4. Generează **Client secret**, apoi copiază **Client ID** și **Client secret**.
5. Pe PC-ul panoului, în aplicație, mergi la **Setări → Conturi**. Lipește valorile, apoi apasă **Salvează datele** și **Conectează Canva**.

Dacă pentru contul tău Canva cere aprobarea integrării înainte să o poți folosi, între timp poți lucra manual. În Canva alegi **Share → Download** ca PNG (fiecare pagină) sau MP4. Apoi în aplicație: **＋ Adaugă → Poze, video, PDF**.

### Ce face legătura cu Canva
- **＋ Adaugă → Din Canva:** alegi designurile. Fiecare pagină devine un slide; dacă alegi „Video”, un design animat vine ca un singur clip.
- **Slide din Canva → Editează în Canva:** se deschide editorul Canva. Când te întorci în aplicație, slide-urile se actualizează singure.
