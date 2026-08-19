# Terra Panorama · Site Yönetim Paneli

Aidat, gelir-gider ve yapılacak iş takibi. Sunucu ücreti yok — site GitHub Pages'te
yayınlanır, veriler sizin **özel** GitHub deponuzda `data.json` olarak durur.
Biriniz bir şey değiştirince diğeri en geç 30 saniye içinde görür.

---

## Kurulum (bir kez, ~10 dakika)

### 1 · Özel veri deposu
1. GitHub → **New repository**
2. Ad: `apartman-veri` · görünürlük: **Private** · Create
3. **Add file → Upload files** → bu klasördeki `ozel-repoya-yukle/data.json` dosyasını yükle → Commit

> Bu dosyada 255 bağımsız bölüm (malik adlarıyla) hazır. Özel depoda olduğu için
> sizden başka kimse göremez.

### 2 · Site deposu
1. GitHub → **New repository** → ad: `terra-panorama` · **Public** (zaten açtın) · Create
2. Dosyalar yüklendi (`ozel-repoya-yukle` ve Excel hariç — orada malik isimleri var)
3. Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `root` → Save
4. Bir iki dakika sonra siten hazır: `https://umutlaguler.github.io/terra-panorama/`

### 3 · Erişim anahtarı
Sitedeki `kurulum.html` sayfasını aç (`https://umutlaguler.github.io/terra-panorama/kurulum.html`)
ve oradaki adımları izle:
- GitHub'da **fine-grained token** üret (sadece `apartman-veri` deposuna, `Contents: Read and write`)
- Anahtarı + belirlediğin **ortak şifreyi** gir
- Çıkan metni `vault.js` dosyasına yapıştır ve GitHub'a yükle

Bitti. Artık sen ve Hakan sadece **şifreyi** yazarak giriyorsunuz.

---

## Kullanım

| Sekme | Ne işe yarar |
|---|---|
| **Panel** | Kasa bakiyesi, ayın tahsilatı, toplam alacak, blok bazında tahsilat oranı, son hareketler |
| **Aidat** | Her bağımsız bölümün aylık durumu. "Tahsil et" ile ödeme kaydı; satıra tıklayınca o dairenin tüm geçmişi |
| **Gelir / Gider** | Aidat dışı kasa hareketleri, kategori bazında gider dağılımı |
| **Yapılacaklar** | İş listesi: öncelik, sorumlu, termin, tahmini maliyet |
| **Daireler** | Malik / kiracı / telefon bilgileri, aidattan muaf işaretleme |
| **Ayarlar** | Aidat tarifeleri, site adı, yedek indirme, işlem geçmişi |

**İlk iş:** Ayarlar → *Yeni tarife* ile konut ve işyeri aidatını gir.
Sonradan zam yaparsan yeni bir tarife eklersin — **geçmiş aylar eski tutardan hesaplanmaya devam eder.**

---

## Sık sorulanlar

**Şifreyi unutursak?** Kurulumu (adım 3) yeni bir şifreyle tekrarla. Veriler etkilenmez.

**Yanlışlıkla bir şey sildik?** `apartman-veri` deposu → dosya → **History**. Her değişiklik
kimin yaptığıyla birlikte kayıtlı, eski hale döndürülebilir. Ayrıca Ayarlar → *Yedek indir*.

**İkimiz aynı anda kaydedersek?** Sistem çakışmayı görüp değişikliği taze veri üzerine
yeniden uygular; hiçbir kayıt kaybolmaz.

**Şifre neden en az 10 karakter?** Anahtar şifrelenmiş halde herkese açık sitede duruyor.
Şifre güçlü olduğu sürece açılamaz. Basit şifre (1234, apartman) kullanmayın.

**Telefondan çalışır mı?** Evet, arayüz mobil uyumlu.
