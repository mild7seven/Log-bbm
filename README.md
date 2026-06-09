# BBM MID Toyota PWA

PWA log konsumsi BBM tanpa backend, dengan:
- Dashboard MID ala Toyota
- Fuel gauge visual
- Estimasi jarak tersisa
- Trip A / Trip B
- Reminder servis
- Grafik konsumsi KM/L
- Backup / restore JSON
- Kirim log ke Telegram langsung dari browser

## Cara menjalankan
Disarankan lewat server lokal karena service worker tidak aktif dari file `file://`.

### Termux
```bash
pkg update
pkg install nodejs
cd /storage/emulated/0/Download/bbm-mid-toyota-pwa
npx http-server -p 8080
```

Buka:
`http://127.0.0.1:8080`

## Telegram tanpa backend
Isi Bot Token dan Chat ID di halaman.
Aplikasi mengirim langsung ke endpoint Telegram dari browser dengan mode `no-cors`.

## Catatan
- Token bot tersimpan di browser dan terlihat di source.
- Cocok untuk penggunaan pribadi.
- Untuk publik, gunakan backend kecil.
