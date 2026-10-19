# SnapCompost — Panduan Packaging Android dengan PWA Builder

Dokumen ini menjelaskan langkah demi langkah cara mengonversi SnapCompost (web PWA) menjadi aplikasi Android (.APK/.AAB) yang siap upload ke Google Play Store menggunakan **PWA Builder** (Microsoft).

---

## ✅ Status PWA SnapCompost (setelah perbaikan di commit ini)

| Kriteria PWA Builder | Status | Catatan |
|---|---|---|
| `manifest.json` valid | ✅ | Path diperbaiki dari `/public/manifest.json` → `/manifest.json`. Config awal: `id:"/"`, `start_url:"/"`, `scope:"/"`, `display:"standalone"` |
| Service Worker (offline) | ✅ | `sw.js` sudah punya precache + stale-while-revalidate, aman untuk FCM |
| Ikon 192 & 512 | ✅ | `/icons/icon-192.png`, `/icons/icon-512.png` |
| Maskable icon | ✅ | `purpose: "maskable"` ditambahkan |
| Theme color & background | ✅ | `#f8fbf7` (sesuai `<meta name="theme-color">` di `index.html`) |
| Shortcuts (app shortcuts) | ✅ | "Scan Sampah" & "Wadah Saya" (ikon merujuk ke `/icons/icon-192.png` yang ada) |
| `display: standalone` | ✅ | Fullscreen tanpa browser chrome |
| Screenshots | ⏸️ Dihapus sementara | Field `screenshots` sengaja tidak dimasukkan karena file PNG 1080×1920 belum dibuat. Tambahkan kembali setelah Anda capture screenshot |
| `assetlinks.json` (TWA deep link) | ❌ BELUM ADA | File `public/.well-known/assetlinks.json` **dihapus sementara** karena SHA256 Play App Signing belum tersedia. Template tetap tersedia di bagian **"Template assetlinks.json"** di bawah. **Wajib dibuat ulang** setelah `package_name` dan `sha256_cert_fingerprints` asli tersedia, sebelum di-deploy ke production. Tanpa file ini, TWA tidak bisa membuka deep link OAuth Google |
| HTTPS (Vercel) | ✅ | Otomatis |

**Skor PWA Builder yang diharapkan:** ≥ 90/100 → siap dipackage.

---

## 📦 Perubahan yang Dilakukan di Commit Ini

1. **`index.html`** — Perbaikan bug: `<link rel="manifest" href="/manifest.json">` (sebelumnya `/public/manifest.json` yang 404 setelah build Vite).
2. **`vercel.json`** — Perbaikan cache header: `/sw.js` (sebelumnya `/public/sw.js`). Ditambah `no-cache` untuk `/manifest.json`.
3. **`public/manifest.json`** — Optimasi untuk PWA Builder (config awal dipertahankan: `id="/"`, `start_url="/"`, `scope="/"`, `display="standalone"`):
   - `display_override`, `orientation`, `dir`, `categories`
   - `shortcuts` (app shortcuts di launcher Android — URL `/`,`/icons/icon-192.png` yang sudah ada)
   - `launch_handler` (mencegah multiple instance)
   - **Field `screenshots` sengaja TIDAK dimasukkan** karena file screenshot 1080×1920 belum tersedia. Jangan biarkan manifest mengarah ke file 404. Tambahkan setelah Anda capture screenshot.
4. **`public/sw.js`** — Ditambahkan strategi caching offline yang aman untuk FCM:
   - Precache app shell (/, /index.html, /manifest.json, ikon, data referensi)
   - Stale-while-revalidate untuk aset statis (CSS/JS/model ONNX)
   - Network-first untuk navigasi (HTML), fallback offline ke app shell
   - **Lewati cache** untuk: request Supabase, Firebase, gstatic.com, request POST/PUT/PATCH/DELETE, URL dengan parameter auth (`access_token`, `refresh_token`, `code`, `error_description`, dll.)
   - **Lewati cache juga** untuk semua URL dengan pathname `/api/*` (mis. `/api/cek-jadwal`) — SELALU ke jaringan: tidak dibaca dari cache, tidak ditulis ke cache, tidak SWR, tidak fallback offline
   - **Hanya cache** response same-origin yang berstatus 2xx, `type: "basic"`, bukan 206 partial
   - Response opaque / CORS / error TIDAK di-cache
   - Tetap mempertahankan handler FCM (`onBackgroundMessage` + `notificationclick`) tanpa perubahan
5. **`public/.well-known/assetlinks.json`** — **DIHAPUS SEMENTARA**.
   - File ini berisi placeholder SHA256 (`"GANTI_DENGAN_SHA256_DARI_PLAY_APP_SIGNING"`) yang tidak valid.
   - Deploy Digital Asset Links yang invalid dapat merusak TWA deep link, sehingga file sengaja tidak disertakan.
   - Template tetap tersimpan di bagian **"Template assetlinks.json"** di bawah.
   - **Wajib dibuat ulang** setelah `package_name` dan `sha256_cert_fingerprints` asli dari Play App Signing tersedia (lihat Langkah 8).
   - Saat dibuat, taruh di path: `public/.well-known/assetlinks.json` (Vite akan copy ke `dist/.well-known/assetlinks.json` saat build).

---

## 🚀 Langkah-langkah Packaging ke Android

### Langkah 1: Deploy perubahan ke Vercel

```bash
git add -A
git commit -m "feat(pwa): optimize manifest, sw offline caching, fix path bugs for PWA Builder"
git push origin main
```

Tunggu Vercel deploy selesai (1-2 menit). Verifikasi:
- Buka `https://snapcompost.vercel.app/manifest.json` → harus return JSON (bukan 404)
- Buka `https://snapcompost.vercel.app/sw.js` → harus return JS service worker
- (Catatan: `https://snapcompost.vercel.app/.well-known/assetlinks.json` saat ini **akan 404** — ini normal. File belum dibuat sampai Langkah 8. PWA Builder tidak memerlukannya untuk packaging — hanya dibutuhkan setelah app dipublish untuk validasi deep link TWA.)

### Langkah 2: Validasi PWA di PWA Builder

1. Buka https://www.pwabuilder.com/
2. Masukkan URL: `https://snapcompost.vercel.app/`
3. Klik **Start**
4. Tunggu skor analisis (±30 detik). Skor harus ≥ 90 di semua kategori:
   - **Manifest** ✅
   - **Service Worker** ✅
   - **Security (HTTPS)** ✅
   - **Installable** ✅

### Langkah 3: Generate ikon tambahan (opsional tapi disarankan)

PWA Builder perlu ikon 512x512 untuk Play Store. Anda sudah punya. Tapi untuk hasil terbaik, generate juga:
- Maskable icon dengan padding (background aman di tengah 80%)
- Adaptive icon (foreground + background)

**Cara cepat:** Upload `public/icons/icon-512.png` ke https://maskable.app/editor → download hasil → ganti `icon-512.png`.

### Langkah 4: Capture screenshot untuk Play Store

PWA Builder butuh minimal 2 screenshot (portrait 1080x1920). Cara:
1. Buka `https://snapcompost.vercel.app/` di browser desktop
2. DevTools (F12) → Toggle device toolbar (Ctrl+Shift+M)
3. Pilih device "iPhone 12 Pro" atau custom 1080x1920
4. Login, capture:
   - Screenshot 1: layar Beranda (daftar wadah)
   - Screenshot 2: layar deteksi/kamera
5. Simpan sebagai:
   - `public/icons/screenshot-narrow-1.png`
   - `public/icons/screenshot-narrow-2.png`
6. Commit & push lagi.

### Langkah 5: Package APK/AAB di PWA Builder

1. Di PWA Builder, klik **Package For Stores**
2. Pilih **Android**
3. Isi formulir:
   - **App ID (Package ID):** `com.snapcompost.app`
   - **App Name:** `SnapCompost`
   - **App Short Name:** `SnapCompost`
   - **Version:** `1.0.0`
   - **URL:** `https://snapcompost.vercel.app/`
   - **Signing Key:** Pilih "New Key" (download & simpan `.keystore` aman!)
   - **Display Mode:** `standalone`
   - **Orientation:** `portrait`
   - **Theme Color:** `#2d7a4f`
   - **Background Color:** `#f8fbf7`
   - **Start URL:** `/`
4. Klik **Generate** → download file `.zip`

### Langkah 6: Buka di Android Studio & build

1. Ekstrak file `.zip` dari PWA Builder
2. Buka folder di **Android Studio** (bukan Android Studio perlu di-install: https://developer.android.com/studio)
3. Tunggu Gradle sync (±2-3 menit)
4. Cek `app/src/main/AndroidManifest.xml` — pastikan ada permission:
   ```xml
   <uses-permission android:name="android.permission.INTERNET"/>
   <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
   <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
   ```
5. Build → **Build Bundle(s)/APK(s)** → **Build APK(s)**
6. File APK ada di `app/build/outputs/apk/release/app-release.apk`

### Langkah 7: Daftar akun Google Play Developer

1. Buka https://play.google.com/console/signup
2. Bayar **$25** (sekali seumur hidup, pakai kartu kredit)
3. Verifikasi identitas (KTP/SIM) — proses 1-3 hari
4. Lengkapi profil developer (nama, kontak, alamat)

### Langkah 8: Dapatkan SHA256, Buat assetlinks.json, Deploy

> ⚠️ **File `public/.well-known/assetlinks.json` sengaja TIDAK disertakan dalam repo / ZIP ini** karena SHA256 asli belum tersedia. Jangan deploy Digital Asset Links yang invalid. Ikuti langkah di bawah untuk membuatnya dari nol.

Setelah akun Play Console aktif:

1. Buka Play Console → **SnapCompost app** → **Release → Setup → App signing**
2. Di bagian "App signing key certificate", copy **SHA-256 certificate fingerprint** (format hex dengan tanda titik dua, mis. `1A:2B:3C:...`).
3. Di repo lokal Anda, buat folder dan file baru:
   ```bash
   mkdir -p public/.well-known
   ```
4. Buat file `public/.well-known/assetlinks.json` dengan isi berikut (ganti `package_name` dan SHA-256 dengan nilai asli):
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.snapcompost.app",
         "sha256_cert_fingerprints": [
           "1A:2B:3C:4D:5E:6F:7G:8H:9I:0J:1K:2L:3M:4N:5O:6P:7Q:8R:9S:0T:1U:2V:3W:4X:5Y:6Z:7A:8B:9C:0D:1E:2F"
         ]
       }
     }
   ]
   ```
   - `package_name`: HARUS sama dengan Application ID di Android Studio project hasil PWA Builder
   - `sha256_cert_fingerprints`: SHA-256 dari Play App Signing (BUKAN SHA-256 dari keystore lokal Anda — Google menggunakan Play App Signing untuk menandatangani rilis production)
5. Commit & push ke Vercel.
6. Verifikasi: `https://snapcompost.vercel.app/.well-known/assetlinks.json` mengembalikan JSON dengan SHA yang benar (Content-Type harus `application/json`).
7. Test deep link dengan tool: https://developers.google.com/digital-asset-links/tools/generator

> ⚠️ **PENTING:** Tanpa `assetlinks.json` yang valid (dengan SHA256 yang benar), TWA Anda tidak akan bisa membuka deep link (termasuk OAuth Google callback). User akan terjebak di browser setelah login.

**Template asli (untuk referensi):**

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.snapcompost.app",
      "sha256_cert_fingerprints": [
        "GANTI_DENGAN_SHA256_DARI_PLAY_APP_SIGNING"
      ]
    }
  }
]
```

### Langkah 9: Upload ke Play Console

1. Play Console → **SnapCompost app** → **Production → Create release**
2. Upload file `.aab` (App Bundle, lebih disukai Google dari pada .apk)
3. Isi release notes (mis. "Rilis awal SnapCompost v1.0.0")
4. Lengkapi **Store Listing**:
   - **App name:** SnapCompost
   - **Short description:** (max 80 char) "Kelola kompos & eco enzyme dengan deteksi sampah AI"
   - **Full description:** (lihat template di bawah)
   - **App icon:** upload `icon-512.png`
   - **Feature graphic:** 1024x500 PNG (buat di Canva/Figma)
   - **Phone screenshots:** upload screenshot-narrow-1.png & 2
   - **Application type:** Apps
   - **Category:** Lifestyle (atau Productivity)
   - **Privacy Policy URL:** wajib (buat di situs Anda)
5. Isi **Data safety form** (karena app akses kamera + auth Google)
6. Isi **Content rating questionnaire** (dapatkan rating "Everyone")
7. Klik **Send for review**

### Langkah 10: Tunggu review Google

- **Review pertama:** 1-3 hari kerja (kadang sampai 7 hari)
- Jika ditolak, baca alasan → perbaiki → submit ulang
- Setelah approve, app langsung muncul di Play Store dalam beberapa jam

---

## 📝 Template Deskripsi Aplikasi (Play Store)

```
SnapCompost — Asisten Cerdas Pengelolaan Kompos & Eco Enzyme

🌿 TENTANG SNAPCOMPOST
SnapCompost adalah aplikasi mobile yang membantu Anda mengelola wadah kompos dan eco enzyme, memantau proses fermentasi, dan mengenali jenis sampah organik lewat foto dengan teknologi AI.

✨ FITUR UTAMA
• 📸 Deteksi Sampah AI — Foto sampah, AI langsung mengenali jenisnya (YOLOv8 on-device, privasi terjaga)
• 🪣 Kelola Wadah — Buat & pantau banyak wadah kompos/eco enzyme sekaligus
• 📊 Pemantauan Fermentasi — Jadwal, checklist langkah, dan progress tiap wadah
• 🔔 Notifikasi Pintar — Pengingat pemantauan berkala via push notification
• 📖 Referensi Sampah — Database resep, rasio, dan langkah pengolahan
• 🔒 Privasi Lengkap — Deteksi AI berjalan di perangkat Anda, foto tidak diunggah

🎯 UNTUK SIAPA
• Rumah tangga yang mulai mengompos
• Komunitas lingkungan & bank sampah
• Sekolah/institusi yang mengajarkan pengelolaan sampah organik
• Siapa pun yang ingin mengurangi limbah organik

🚀 MULAI CEPAT
1. Login dengan Google
2. Buat wadah pertama Anda (kompos / eco enzyme)
3. Foto sampah atau pilih dari daftar manual
4. Ikuti checklist fermentasi hingga panen

📱 DIBUAT DENGAN
Teknologi: PWA + TWA (Trusted Web Activity)
AI: ONNX Runtime Web (YOLOv8)
Backend: Supabase + Firebase Cloud Messaging

SnapCompost — olah sampah, jadi berkah. 🌱
```

---

## 🔐 Catatan Penting OAuth Google di TWA

Karena SnapCompost pakai **Supabase Auth Google OAuth**, ada satu hal yang harus di-set:

### Di Supabase Dashboard → Authentication → URL Configuration:
Pastikan **Redirect URLs** berisi:
```
https://snapcompost.vercel.app/
https://snapcompost.vercel.app/?source=pwa
```

Tanpa ini, setelah login Google, user akan diarahkan ke error page.

### Alur login di TWA:
1. User klik "Masuk dengan Google" di app
2. Browser Chrome custom tab terbuka → halaman Google OAuth
3. User login → Google redirect ke `https://snapcompost.vercel.app/`
4. Karena `assetlinks.json` cocok → Android **buka TWA** (bukan browser)
5. Supabase set session (cookie di WebView) → app tampilkan Beranda

---

## 🐛 Troubleshooting Umum

| Masalah | Solusi |
|---|---|
| PWA Builder skor < 90 | Pastikan deploy terbaru sudah live; tunggu 5 menit lalu re-test |
| Kamera tidak jalan di TWA | TWA pakai WebView Chrome 95+ → `getUserMedia` didukung. Pastikan permission `CAMERA` di AndroidManifest |
| Push notification tidak masuk | Pastikan `POST_NOTIFICATIONS` permission (Android 13+) di-grant saat pertama kali buka app |
| Login Google stuck di browser | `assetlinks.json` belum valid → cek SHA256 sama dengan Play App Signing |
| App blank putih setelah splash | Cek `sw.js` precache — mungkin ada aset yang 404. Buka Chrome DevTools via `chrome://inspect` |
| Model ONNX 43MB tidak load | Pastikan internet stabil saat pertama buka app; setelah cache, offline OK |
| AAB ditolak "Use of device ID" | Isi Data Safety form dengan benar — SnapCompost tidak kumpulkan device ID |

---

## 🔄 Update App di Play Store

Salah satu keuntungan PWA Builder/TWA: **update web = update app** (tanpa publish ulang).

### Yang TIDAK perlu republish APK:
- Fix bug UI/UX
- Tambah halaman baru
- Update model ONNX (di CDN)
- Update data referensi sampah
- Update theme color (tapi lebih baik tetap sama dengan Play Store listing)

### Yang PERLU republish APK/AAB:
- Ganti app icon
- Ganti app name / package ID
- Ubah target SDK Android (Google update requirement tiap tahun)
- Ubah permission Android

Cara republish: ulangi Langkah 5-9 dengan version number baru (`1.0.1`, dst.).

---

## 📚 Referensi

- **PWA Builder:** https://www.pwabuilder.com/
- **Dokumentasi TWA:** https://developer.chrome.com/docs/android/trusted-web-activity/
- **Assetlinks.json validator:** https://developers.google.com/digital-asset-links/tools/generator
- **Play Console:** https://play.google.com/console
- **Android Studio:** https://developer.android.com/studio

---

## ❓ Butuh Bantuan?

Jika ada masalah saat packaging, cek:
1. **Vercel deploy log** — pastikan build sukses
2. **PWA Builder report** — baca detail tiap kategori yang gagal
3. **Chrome DevTools → Application tab** — cek manifest & SW status di `https://snapcompost.vercel.app/`

Selamat packaging! 🎉
