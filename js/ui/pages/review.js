// js/ui/pages/review.js — Cek Kondisi (spec §3) dan Perlakuan Khusus (spec §4), SATU HALAMAN PER JENIS SAMPAH.
//
// Urutan alur:  Hasil Deteksi → Cek Kondisi (per sampah) → Berapa Banyak? (quantity.js) → Perlakuan Khusus (per sampah)
//
//   fase "kondisi"   : hanya sampah yang punya pertanyaan kondisi. Tiap kondisi dijawab Ya / Tidak.
//                      Begitu semua pertanyaan di halaman itu terjawab, otomatis lanjut ke sampah berikutnya.
//                      Sampah tanpa kondisi dilewati (tetap ikut ke langkah jumlah).
//   fase "perlakuan" : dipanggil quantity.js setelah jumlah dikonfirmasi (mulaiPerlakuan). Hanya sampah yang
//                      punya perlakuan. Tombol "Sudah, Lanjut!" menuju hooks.lanjutDariJumlah (alokasi).
//
// Kedua fase memakai layar "review" yang sama (hanya judul header dan isinya yang berganti),
// jadi tidak ada layar baru di index.html / workflow.js.
// Aturan ada di core.js; data layar disusun logic/kondisi.js. Kondisi hanya MEMPERSEMPIT pilihan resep (spec §3.3).

import { reviewList } from "../core/dom.js";
import { hooks } from "../core/hooks.js";
import { showToast } from "../core/ui.js";
import { setWorkflowScreen } from "../core/workflow.js";
import { ikonSampah } from "../core/waste-icon.js";
import { bukaHasilDeteksi } from "./scan.js";
import { bentukLangkahKondisi, terapkanKondisi } from "../../logic/kondisi.js";

const JEDA_OTOMATIS_MS = 180; // jeda singkat agar pilihan Ya/Tidak terlihat sebelum pindah halaman

let sesiAktif = null;     // sesi scan pemilik state di bawah; berganti sesi = jawaban dibuang
let daftarEntri = [];     // keluaran sesi.deteksiSudahBenar()
let langkah = [];         // keluaran bentukLangkahKondisi (satu blok per label)
let jawaban = {};         // { [nama]: { [id_kondisi]: true (Ya) | false (Tidak) } }
let halamanKondisi = [];  // blok yang punya kondisi
let halamanPerlakuan = []; // blok yang punya perlakuan dan ikut di batch jumlah
let batchJumlah = null;   // keluaran quantity.js, diteruskan ke hooks.lanjutDariJumlah setelah perlakuan
let fase = "kondisi";
let indeks = 0;
let token = 0;            // naik setiap pindah halaman; membatalkan auto-lanjut yang tertunda

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const judulHeader = () => document.querySelector('[data-workflow-screen="review"] .workflow-header h2');

// { [nama]: Set<id_kondisi> } — bentuk yang diminta terapkanKondisi
function tercentang() {
  return Object.fromEntries(Object.entries(jawaban).map(([nama, peta]) =>
    [nama, new Set(Object.keys(peta).filter((id) => peta[id]))]));
}

function tampilkan(isi, keAtas) {
  reviewList.replaceChildren(...isi);
  if (keAtas && reviewList.parentElement) reviewList.parentElement.scrollTop = 0;
  setWorkflowScreen("review");
}

// ---------- Fase 1: Cek Kondisi ----------

function tombolJawab(teks, jenis, nama, id, terpilih) {
  const t = el("button", `review-answer ${jenis}${terpilih ? " selected" : ""}`, teks);
  t.type = "button";
  t.dataset.nama = nama;
  t.dataset.id = id;
  t.dataset.jawab = jenis === "yes" ? "ya" : "tidak";
  t.setAttribute("aria-pressed", String(terpilih));
  return t;
}

function renderKondisi(keAtas = false) {
  const b = halamanKondisi[indeks];
  const sudah = jawaban[b.nama] ?? {};
  judulHeader().textContent = "Cek Kondisi";

  const isiBar = document.createElement("span");
  isiBar.style.width = `${((indeks + 1) / halamanKondisi.length) * 100}%`;
  const progres = el("div", "review-progress");
  progres.append(el("span", "review-progress-track"), el("span", null, `Sampah ${indeks + 1} dari ${halamanKondisi.length}`));
  progres.firstChild.append(isiBar);

  const art = el("span", "review-card-art", ikonSampah(b.nama));
  art.setAttribute("aria-hidden", "true");
  const kartu = el("section", "review-card");
  kartu.append(art, el("h3", "review-card-name", b.label_tampilan));

  const pertanyaan = b.kondisi.map((k) => {
    const blok = el("section", "review-question");
    const kotak = el("div", "review-question-box");
    kotak.append(el("p", "review-question-lead", "Apakah kondisinya seperti ini?"),
      el("p", "review-question-text", k.label_tampilan));
    const tombol = el("div", "review-answers");
    tombol.append(
      tombolJawab("Ya", "yes", b.nama, k.id, sudah[k.id] === true),
      tombolJawab("Tidak", "no", b.nama, k.id, sudah[k.id] === false)
    );
    blok.append(kotak, tombol);
    return blok;
  });

  tampilkan([progres, kartu, ...pertanyaan], keAtas);
}

function jawab(id, ya) {
  const b = halamanKondisi[indeks];
  (jawaban[b.nama] ??= {})[id] = ya;
  renderKondisi();
  // Semua pertanyaan di halaman ini sudah terjawab → lanjut otomatis (bisa kembali untuk mengubah).
  if (b.kondisi.every((k) => k.id in jawaban[b.nama])) {
    const saatIni = ++token;
    window.setTimeout(() => {
      if (saatIni === token && fase === "kondisi") majuKondisi();
    }, JEDA_OTOMATIS_MS);
  }
}

function majuKondisi() {
  token += 1;
  if (indeks < halamanKondisi.length - 1) { indeks += 1; renderKondisi(true); return; }
  hooks.lanjutDariKondisi(terapkanKondisi(daftarEntri, tercentang()), sesiAktif);
}

// Titik masuk dari scan.js (tombol "Deteksi sudah benar, lanjut").
function mulai(entri, sesi) {
  if (sesi !== sesiAktif) { sesiAktif = sesi; jawaban = {}; batchJumlah = null; } // sesi baru: jawaban lama dibuang
  daftarEntri = entri;
  langkah = bentukLangkahKondisi(entri);
  halamanKondisi = langkah.filter((b) => b.kondisi.length);
  fase = "kondisi";
  indeks = 0;
  token += 1;
  if (!halamanKondisi.length) { majuKondisi(); return; } // tidak ada yang ditanyakan: langsung ke jumlah
  renderKondisi(true);
}

// Dipakai quantity.js saat "kembali" dari bahan pertama: tampilkan kondisi sampah terakhir.
// false = tidak ada halaman kondisi (pemanggil kembali ke Hasil Deteksi).
export function kembaliKeKondisi() {
  token += 1;
  fase = "kondisi";
  if (!halamanKondisi.length) return false;
  indeks = halamanKondisi.length - 1;
  renderKondisi(true);
  return true;
}

// ---------- Fase 2: Perlakuan Khusus (setelah jumlah) ----------

function renderPerlakuan(keAtas = false) {
  const b = halamanPerlakuan[indeks];
  const wajib = Boolean(b.perlakuan.wajib);
  judulHeader().textContent = "Sebelum Lanjut...";

  const art = el("div", "review-treat-art", ikonSampah(b.nama));
  art.setAttribute("aria-hidden", "true");
  const judul = el("h3", "review-treat-title", wajib ? `Siapkan ${b.label_tampilan} dulu ya!` : `${b.label_tampilan} bisa dipakai!`);

  const bohlam = el("span", "review-treat-bulb", "💡");
  bohlam.setAttribute("aria-hidden", "true");
  const teks = el("p", "review-treat-text");
  teks.append(el("strong", null, wajib ? "Wajib: " : "Disarankan: "), document.createTextNode(b.perlakuan.instruksi));
  const kotak = el("div", `review-treat-box${wajib ? " wajib" : ""}`);
  kotak.append(bohlam, teks);

  const isi = el("div", "review-treat");
  isi.append(art, judul, kotak);

  const lanjut = el("button", "workflow-primary", "Sudah, Lanjut!");
  lanjut.type = "button";
  lanjut.id = "review-next";
  const kaki = el("div", "review-footer");
  kaki.append(lanjut);

  tampilkan([isi, kaki], keAtas);
}

function selesaiPerlakuan() {
  if (typeof hooks.lanjutDariJumlah === "function") hooks.lanjutDariJumlah(batchJumlah, sesiAktif);
  else showToast("Langkah berikutnya belum tersedia");
}

function majuPerlakuan() {
  token += 1;
  if (indeks < halamanPerlakuan.length - 1) { indeks += 1; renderPerlakuan(true); return; }
  selesaiPerlakuan();
}

// Dipanggil quantity.js setelah jumlah dikonfirmasi. `batch` = batch_input (spec §2.1).
export function mulaiPerlakuan(batch, sesi) {
  batchJumlah = batch;
  if (sesi) sesiAktif = sesi;
  const ikut = new Set(batch.map((x) => x.id_entri));
  halamanPerlakuan = langkah.filter((b) => b.perlakuan && ikut.has(b.nama));
  fase = "perlakuan";
  indeks = 0;
  token += 1;
  if (!halamanPerlakuan.length) { selesaiPerlakuan(); return; } // tidak ada perlakuan khusus
  renderPerlakuan(true);
}

// ---------- Tombol kembali & pemasangan ----------

// Dicegat di sini karena workflow.js hanya menukar layar tanpa menggambar ulang.
function kembali() {
  token += 1;
  if (fase === "kondisi") {
    if (indeks > 0) { indeks -= 1; renderKondisi(true); }
    else bukaHasilDeteksi();                 // digambar ulang: baris yang dikonfirmasi bertanda ✓
    return;
  }
  if (indeks > 0) { indeks -= 1; renderPerlakuan(true); }
  else setWorkflowScreen("quantity-confirm"); // kembali ke ringkasan jumlah (isinya masih ada)
}

export function initReview() {
  hooks.lanjutDariDeteksi = mulai;

  reviewList.addEventListener("click", (event) => {
    const tombol = event.target.closest(".review-answer");
    if (tombol && fase === "kondisi") { jawab(tombol.dataset.id, tombol.dataset.jawab === "ya"); return; }
    if (event.target.closest("#review-next") && fase === "perlakuan") majuPerlakuan();
  });

  document.querySelector('[data-workflow-screen="review"] [data-workflow-back]').addEventListener("click", (event) => {
    event.stopPropagation();
    kembali();
  });
}