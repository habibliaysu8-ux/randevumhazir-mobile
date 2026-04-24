# randevumhazır

Güzellik salonları için müşteri, partner ve admin panelleri olan yerel çalışan Node.js uygulaması.

## Bu sürümde
- müşteri panelinde çalışan **Giriş yap** ve **Ara** butonları
- hizmet alanında serbest yazı + öneri listesi
- şehir seçimi: **İstanbul / Ankara / İzmir**
- şehir değişince dolan ilçe listesi
- **Gün seç** butonu ile açılan tarih seçimi
- partner giriş / kayıt ana sayfası
- partner girişten sonra salon profili, hizmet, uzman ve açık saat yönetimi
- partnerde oluşturulan salon / hizmet / saat verilerinin müşteri paneline yansıması
- admin paneli
- JSON tabanlı kalıcı veri dosyası

## Başlatma
```bash
npm start
```

Sonra:
```bash
http://localhost:3000
```

## Paneller
- müşteri: `/`
- partner: `/partner`
- admin: `/admin`

## Başlangıç hesapları
- partner ve müşteri için ön tanımlı demo hesap yoktur. Kayıt sayfalarından gerçek hesap açılır.
- admin: `admin@randevumhazir.com` / `Admin123!`

## Not
Bu paket yerelde çalışan bağlı uygulama iskeletidir. Alan adına yayınlamak için VPS / hosting üzerinde Node süreci çalıştırman ve domaini bu sunucuya yönlendirmen gerekir.


## Canlı kullanım
- Partner ve müşteri hesapları önceden yüklü gelmez.
- İlk partner ve müşteri kayıtları arayüzdeki gerçek kayıt formlarından açılır.
- Admin hesabı ilk kurulum için bırakılmıştır; canlıya aldıktan sonra şifresini değiştirmen gerekir.
