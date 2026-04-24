# randevumhazır — admin live deploy

Bu paket müşteri ve partner paneline dokunulmadan admin paneli ile birlikte gelir.

## Admin panel
- URL: /admin
- E-posta: admin@randevumhazir.com
- Şifre: Admin123!

Admin panelden:
- tüm kullanıcıları görebilirsin
- tüm salonları görebilirsin
- rezervasyonları görebilirsin
- salonu öne çıkar / pasife al / aktife al yapabilirsin

## Local test
npm install
npm start

## VPS canlı kurulum özeti
1. Node.js kur
2. projeyi sunucuya yükle
3. npm install
4. ecosystem.config.js içindeki PM2 ile çalıştır
5. deploy/nginx-randevumhazir.conf dosyasını Nginx'e koy
6. YOUR_DOMAIN yerlerini gerçek domaininle değiştir
7. SSL kur
8. public/robots.txt ve public/sitemap.xml dosyalarında YOUR_DOMAIN yerlerini değiştir
9. Google Search Console'a sitemap.xml gönder

## Routes
- /
- /partner
- /admin
