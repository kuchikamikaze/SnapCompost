# SnapCompost

SnapCompost adalah aplikasi pengelolaan kompos rumah tangga yang membantu pengguna mengenali sampah organik, menentukan perlakuan yang sesuai, mengalokasikan bahan ke wadah kompos, memantau fermentasi, dan menerima pengingat perawatan.

Aplikasi ini dikembangkan sebagai Progressive Web App (PWA), menggunakan JavaScript modular, Vite, Supabase, Firebase Cloud Messaging, serta ONNX Runtime Web untuk deteksi gambar di perangkat pengguna.

## Fitur utama

- Deteksi sampah organik dari foto menggunakan model ONNX.
- Input bahan secara manual apabila deteksi tidak tersedia atau hasilnya kurang sesuai.
- Rekomendasi resep dan perlakuan berdasarkan data referensi SnapCompost.
- Perhitungan kebutuhan bahan cokelat dan bahan pendukung.
- Pengelolaan beberapa wadah kompos.
- Checklist persiapan sebelum fermentasi.
- Pemantauan status, jadwal, dan progres fermentasi.
- Pusat notifikasi dan dukungan push notification.
- Autentikasi pengguna dan penyimpanan data melalui Supabase.
- Dukungan instalasi sebagai PWA pada perangkat yang kompatibel.

## Teknologi

| Bagian | Teknologi |
|---|---|
| Frontend | HTML, CSS, JavaScript ES Modules |
| Build tool | Vite |
| Database dan autentikasi | Supabase |
| Push notification | Firebase Cloud Messaging |
| Deteksi gambar | ONNX Runtime Web |
| PWA | Web App Manifest dan Service Worker |
| Deployment | Vercel |

## Struktur proyek

```text
SnapCompost/
├── api/                         # Endpoint server Vercel
├── css/
│   ├── base/                    # Reset, token, dan gaya dasar
│   ├── components/              # Gaya komponen antarmuka
│   ├── layout/                  # Struktur dan tata letak halaman
│   └── pages/                   # Gaya khusus halaman
├── js/
│   ├── app/
│   │   ├── auth.js              # Autentikasi dan sesi pengguna
│   │   ├── bootstrap.js         # Inisialisasi aplikasi
│   │   ├── firebase.js          # Konfigurasi layanan Firebase
│   │   ├── main.js              # Entry point aplikasi
│   │   ├── push-sambung.js      # Pendaftaran push notification
│   │   └── supabase.js          # Konfigurasi klien Supabase
│   ├── logic/                   # Aturan dan logika domain SnapCompost
│   └── ui/
│       ├── components/          # Komponen UI
│       ├── core/                # Utilitas inti UI
│       ├── pages/               # Pengendali halaman
│       ├── services/            # Penghubung UI dengan layanan aplikasi
│       └── main-ui.js           # Inisialisasi antarmuka
├── public/
│   ├── assets/                  # Aset statis dan model deteksi
│   ├── icons/                   # Ikon PWA
│   ├── data-referensi-snapcompost.json
│   ├── manifest.json            # Web App Manifest
│   └── sw.js                    # Service Worker
├── .env.example                 # Contoh konfigurasi environment
├── index.html                   # Dokumen utama aplikasi
├── package.json                 # Dependensi dan script proyek
├── vercel.json                  # Konfigurasi deployment Vercel
└── vite.config.js               # Konfigurasi Vite
```

## Persyaratan

Sebelum menjalankan proyek, siapkan:

- Node.js versi LTS, disarankan Node.js 20 atau lebih baru.
- npm yang tersedia bersama instalasi Node.js.
- Proyek Supabase untuk autentikasi dan penyimpanan data.
- Git untuk mengunduh repository.
- Browser modern seperti Google Chrome, Microsoft Edge, atau Firefox.

Firebase hanya diperlukan apabila fitur push notification akan digunakan.

## Instalasi

### 1. Clone repository

```bash
git clone https://github.com/kuchikamikaze/SnapCompost.git
cd SnapCompost
```

### 2. Instal dependensi

```bash
npm install
```

### 3. Buat konfigurasi environment

Salin `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Untuk Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Isi nilai berikut menggunakan konfigurasi proyek Supabase:

```env
VITE_SUPABASE_URL=https://PROJECT_ID.supabase.co
VITE_SUPABASE_KEY=SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

> Gunakan hanya anon key atau publishable key pada variabel yang diawali `VITE_`. Variabel tersebut akan dimasukkan ke bundle frontend dan dapat dilihat oleh browser.

Jangan menaruh credential berikut di dalam `.env` frontend atau source code:

- `SUPABASE_SERVICE_ROLE_KEY`
- Firebase service account JSON
- private key atau credential administratif lainnya

Credential server harus disimpan sebagai environment variable pada Vercel atau platform server yang digunakan.

### 4. Jalankan development server

```bash
npm run dev
```

Buka alamat yang ditampilkan Vite, umumnya:

```text
http://localhost:5173
```

Jangan menjalankan aplikasi dengan membuka `index.html` secara langsung melalui `file://`, karena ES Modules, Service Worker, model, dan data referensi memerlukan HTTP server.

## Build produksi

Buat build produksi dengan:

```bash
npm run build
```

Jalankan hasil build secara lokal untuk pemeriksaan akhir:

```bash
npm run preview
```

Folder hasil build Vite biasanya berada di `dist/`.

## Konfigurasi backend

Frontend SnapCompost membutuhkan backend Supabase yang sesuai dengan kontrak data dan operasi yang digunakan aplikasi. Backend perlu menyediakan setidaknya:

- tabel profil pengguna;
- tabel wadah kompos;
- tabel item atau bahan di dalam wadah;
- data checklist;
- data notifikasi;
- penyimpanan token perangkat;
- RPC atau endpoint untuk operasi yang perlu dijalankan secara atomik;
- Row-Level Security (RLS) untuk membatasi akses berdasarkan pemilik data.

Repository ini belum dapat dianggap reproducible hanya dengan mengisi `.env` apabila schema, migration, RPC, trigger, dan kebijakan RLS belum tersedia. Simpan seluruh definisi backend dalam migration Supabase agar environment development, staging, dan production dapat dibuat secara konsisten.

Struktur yang disarankan:

```text
supabase/
├── config.toml
├── migrations/
└── seed.sql
```

## Deteksi gambar

SnapCompost menjalankan deteksi foto menggunakan ONNX Runtime Web. Model, label, dan data referensi harus tetap konsisten.

Alur deteksi:

1. Pengguna mengambil atau memilih foto.
2. Foto diproses menjadi tensor input.
3. Model ONNX menghasilkan kandidat label dan confidence score.
4. Pengguna mengonfirmasi hasil deteksi.
5. Logika SnapCompost menentukan resep, syarat, dan perlakuan.
6. Bahan dialokasikan ke wadah baru atau wadah yang sudah tersedia.

Apabila model gagal dimuat, label tidak dikenali, atau confidence terlalu rendah, aplikasi harus tetap menyediakan input manual.

## Progressive Web App

SnapCompost menyediakan:

- `public/manifest.json` untuk metadata instalasi;
- `public/sw.js` untuk Service Worker;
- ikon aplikasi di `public/icons/`;
- dukungan deployment HTTPS melalui Vercel.

Untuk menguji PWA:

1. Jalankan build produksi.
2. Buka aplikasi melalui HTTPS atau `localhost`.
3. Buka Chrome DevTools.
4. Periksa menu **Application > Manifest**.
5. Periksa registrasi Service Worker.
6. Jalankan audit menggunakan Lighthouse.
7. Uji instalasi, pembaruan versi, offline fallback, dan penghapusan cache lama.

Hindari menyimpan response autentikasi, data pribadi, atau request Supabase secara permanen di Cache Storage.

## Deployment ke Vercel

1. Hubungkan repository GitHub ke Vercel.
2. Pilih framework preset Vite.
3. Tambahkan environment variable frontend:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_KEY
```

4. Tambahkan credential server hanya jika endpoint di folder `api/` membutuhkannya, misalnya:

```text
SUPABASE_SERVICE_ROLE_KEY
FIREBASE_SERVICE_ACCOUNT
```

5. Deploy aplikasi.
6. Periksa autentikasi, endpoint API, database, model ONNX, Service Worker, dan push notification pada domain produksi.

Jangan menggunakan service-role key pada kode browser.

## Pengembangan

Saat menambahkan fitur:

1. Simpan aturan kompos dan perhitungan di `js/logic/`.
2. Simpan manipulasi DOM dan tampilan di `js/ui/`.
3. Simpan bootstrap dan konfigurasi layanan eksternal di `js/app/`.
4. Jangan menaruh business logic langsung di komponen UI.
5. Validasi data dari form, file JSON, response API, dan hasil model.
6. Pastikan setiap operasi data memeriksa sesi serta kepemilikan pengguna.
7. Sertakan loading, empty, error, offline, dan retry state.

## Pengujian yang disarankan

Gunakan Vitest untuk unit test dan Playwright untuk end-to-end test.

Prioritas pengujian:

- konversi satuan dan validasi jumlah;
- pemilihan resep dan perlakuan khusus;
- perhitungan bahan pendukung;
- status dan jadwal fermentasi;
- checklist wadah;
- transaksi alokasi yang tidak boleh terduplikasi;
- isolasi data antar pengguna melalui RLS;
- fallback input manual;
- instalasi dan pembaruan PWA;
- alur notifikasi dan push notification.

## Keamanan

- Aktifkan RLS pada seluruh tabel yang dapat diakses frontend.
- Gunakan `auth.uid()` untuk memeriksa pemilik data.
- Jangan mempercayai `user_id` yang dikirim browser tanpa verifikasi server.
- Simpan service-role key dan Firebase service account hanya di server.
- Batasi ukuran dan tipe file gambar.
- Validasi seluruh payload endpoint `api/`.
- Hindari mencatat access token, refresh token, atau credential pada log.
- Batasi origin, rate, dan metode HTTP untuk endpoint sensitif.

## Pemecahan masalah

### Halaman kosong setelah aplikasi dijalankan

- Buka Console pada DevTools.
- Pastikan aplikasi dijalankan melalui `npm run dev`.
- Periksa path import ES Modules.
- Pastikan environment variable yang diperlukan tersedia.

### Gagal terhubung ke Supabase

- Periksa `VITE_SUPABASE_URL`.
- Pastikan key yang digunakan adalah anon atau publishable key.
- Periksa kebijakan RLS.
- Periksa tab Network untuk melihat status dan response request.

### Model deteksi tidak dapat dimuat

- Pastikan file model tersedia di lokasi yang digunakan aplikasi.
- Pastikan label model sesuai dengan data referensi.
- Periksa MIME type dan path file pada tab Network.
- Hapus cache Service Worker apabila browser masih memakai aset versi lama.

### Perubahan frontend tidak muncul

- Lakukan hard refresh.
- Unregister Service Worker melalui DevTools.
- Hapus Cache Storage versi lama.
- Jalankan ulang development server.

## Status proyek

SnapCompost masih dalam tahap pengembangan aktif. Beberapa bagian, terutama schema database, migration, kebijakan RLS, RPC backend, automated testing, dan validasi PWA lintas perangkat, perlu diselesaikan sebelum aplikasi digunakan secara luas pada lingkungan produksi.

## Lisensi

Lisensi proyek belum dicantumkan. Tambahkan file `LICENSE` sebelum mendistribusikan, memublikasikan ulang, atau menerima kontribusi eksternal secara resmi.

## Repository

[github.com/kuchikamikaze/SnapCompost](https://github.com/kuchikamikaze/SnapCompost)
