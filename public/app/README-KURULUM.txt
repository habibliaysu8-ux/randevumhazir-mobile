RANDEVUMHAZIR MUSTERI MOBILE APP - EN KOLAY KURULUM

Bu klasor sadece musteri appidir. Partner ve admin panel yok.
App mevcut backend API'lerini kullanir.

1) ZIP'i ac.
2) icindeki dosyalari mevcut projenin su klasorune kopyala:
   randevumhazir-production-v16-real-signup/public/app/

   Yani boyle olacak:
   public/app/index.html
   public/app/styles.css
   public/app/app.js
   public/app/manifest.webmanifest
   public/app/sw.js
   public/app/icon.svg

3) VS Code terminalinde proje klasorunde sunu calistir:
   npm install
   npm start

4) Bilgisayarda ac:
   http://localhost:3000/app/

5) Canli sitede acmak icin dosyalari GitHub'a commit edip deploy et.
   Sonra telefondan ac:
   https://randevumhazir.online/app/

6) Telefonda app gibi kullanmak icin:
   iPhone Safari: Paylas > Ana Ekrana Ekle
   Android Chrome: Uc nokta > Ana ekrana ekle

NOT:
Salonlar bos gorunurse sorun appte degil. Partner panelinden salon, hizmet, personel ve saat eklemek gerekir.
