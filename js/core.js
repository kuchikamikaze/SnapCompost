// core.js — logika murni SnapCompost (tanpa DOM, tanpa Supabase). Spesifikasi §2–§8.
export const BATAS_KONFIRMASI_GRAM = 10000;
export const BATAS_MAKS_GRAM = 1000000;
export const AMBANG_MIRIP = 0.45, MAKS_SARAN = 5, MIN_HURUF = 2;

const KAT_S = ['normal', 'air_sedang', 'air_ekstrem', 'pati', 'kering_lambat']; // masuk S
const KAT_SEMUA = [...KAT_S, 'mineral_terpisah'];                                 // cangkang telur: di luar S
let REF = null;

// ---------- Referensi + validasi (§9.1, §12.1) ----------
export function muatReferensi(d) {
  const err = [];
  const rasioOk = v => v === null || (typeof v === 'number' && v > 0);
  d.parameter_resep.forEach(p => {['rasio_em4', 'rasio_pelembap_tambahan', 'rasio_gula', 'rasio_air']
    .forEach(k => { if (!rasioOk(p[k])) err.push(`${p.nama_resep}.${k} harus null atau > 0`); })
    if (p.pesan_pemantauan && p.pesan_pemantauan.length > 1000) {
    err.push(`pesan_pemantauan untuk ${p.nama_resep} terlalu panjang (>1000 karakter). Periksa file JSON.`);
  }});
  d.sampah_organik.forEach(s => {
    if (!KAT_SEMUA.includes(s.kategori_kompos)) err.push(`kategori "${s.kategori_kompos}" (${s.nama}) tidak dikenali Formula()`);
  });
  d.alat_modifikasi.forEach(a => a.spesifikasi.forEach(t => {
    if (/^\s*(\d+[.)]|[-•*])/.test(t)) err.push(`alat ${a.nama_resep}: poin tidak boleh diawali nomor/tanda poin`);
  }));
  if (err.length) throw new Error('Data referensi tidak valid:\n' + err.join('\n'));
  REF = { ...d, peta: new Map(d.sampah_organik.map(s => [s.nama, s])) };
}
export const ref = () => REF;
// Ambil data satu label untuk PERHITUNGAN; error jelas bila nama tidak ada di JSON (mis. label dihapus/diganti nama setelah wadah tersimpan).
// Jalur tampilan boleh toleran (lihat teksBahan, detailWadah); perhitungan tidak boleh diam-diam menganggap 0/'full'.
export function dataSampah(nama) {
  const s = REF.peta.get(nama);
  if (!s) throw new Error(`Bahan "${nama}" tidak ada di data referensi. Perbarui aplikasi atau hapus item ini.`);
  return s;
}

// ---------- §2 Penentuan resep ----------
export function dapatkanStatus(entri, namaResep) {
  let status = dataSampah(entri.nama_sampah)['status_' + namaResep] ?? 'full';
  for (const id of entri.kondisi_tercentang ?? []) {
    const k = REF.syarat_sampah.find(x => x.id === id);
    if (k?.efek_status?.[namaResep] === 'excluded') status = 'excluded'; // hanya mempersempit
  }
  return status;
}
export const penentuanResep = daftar =>
  REF.resep.filter(r => !daftar.some(e => dapatkanStatus(e, r.nama) === 'excluded')).map(r => r.nama);

// ---------- §3 Kondisi yang perlu ditanyakan ----------
export function daftarKondisiUntukLabel(nama) {
  const khusus = REF.data_sampah.filter(d => d.nama_sampah === nama).map(d => d.id_kondisi);
  return REF.syarat_sampah
    .filter(k => k.cakupan === 'universal' || khusus.includes(k.id))
    .filter(k => REF.resep.some(r =>
      dapatkanStatus({ nama_sampah: nama, kondisi_tercentang: [] }, r.nama) !== 'excluded'
      && k.efek_status[r.nama] === 'excluded'));
}

// ---------- §4 Perlakuan (dengan override_per_resep) ----------
export function perlakuan(nama, namaResep) {
  const s = dataSampah(nama);
  const m = { ...s, ...(s.override_per_resep?.[namaResep] ?? {}) };
  return { instruksi: m.instruksi_perlakuan, wajib: m.wajib_perlakuan };
}

// ---------- §7.3 Input jumlah ----------
export function konversiKeGram(nama, jumlah) {
  const s = dataSampah(nama);
  return s.tipe_input === 'hitungan' ? Math.round(jumlah * s.berat_per_satuan) : jumlah;
}
export function validasiInputJumlah(nama, teks, izinkanNol = false) {
  const t = String(teks).trim();
  if (!/^[0-9]+$/.test(t)) return { valid: false, pesan: 'Masukkan angka bulat saja, tanpa koma, titik, atau satuan.' };
  const nilai = Number(t);
  if (nilai === 0 && !izinkanNol) return { valid: false, pesan: 'Jumlah harus lebih dari 0.' };
  const gram = konversiKeGram(nama, nilai);
  if (gram > BATAS_MAKS_GRAM) return { valid: false, pesan: 'Jumlah terlalu besar. Pastikan satuannya gram.' };
  return { valid: true, nilai, gram, perlu_konfirmasi: gram >= BATAS_KONFIRMASI_GRAM };
}

// ---------- §5 Bahan pendukung (murni, rasio semua dari JSON) ----------
export function hitungBahanCoklat(items) {
  // cangkang_telur punya faktor null (terpisah dari rasio) → dihitung 0
  return Math.round(items.reduce((t, i) => t + i.berat * (dataSampah(i.nama_sampah).faktor_bahan_coklat ?? 0), 0));
}
function formula(namaResep, items, agg) {
  const p = REF.parameter_resep.find(x => x.nama_resep === namaResep);
  if (namaResep === 'kompos' || namaResep === 'kompos_kering') {
    const S = KAT_S.reduce((a, k) => a + (agg['S_' + k] || 0), 0);
    return {
      bahan_coklat: hitungBahanCoklat(items),
      pelembap_tambahan: p.rasio_pelembap_tambahan != null ? Math.round((agg.S_kering_lambat || 0) * p.rasio_pelembap_tambahan) : 0,
      em4: p.rasio_em4 != null ? Math.round(S * p.rasio_em4) : 0,
      gula: 0, air: 0,
    };
  }
  const S = items.reduce((a, i) => a + i.berat, 0); // eco_enzyme: semua item FULL
  return { bahan_coklat: 0, pelembap_tambahan: 0, em4: 0, gula: Math.round(S * p.rasio_gula), air: Math.round(S * p.rasio_air) };
}
export function hitungBahanPendukung(items, namaResep) {
  if (!items.length) return {};
  const agg = {};
  for (const i of items) { const k = 'S_' + dataSampah(i.nama_sampah).kategori_kompos; agg[k] = (agg[k] || 0) + i.berat; }
  return Object.fromEntries(Object.entries(formula(namaResep, items, agg)).filter(([, v]) => v > 0));
}

// ---------- §7.2 Checklist persisted ----------
// SudahDituang: yang sudah tercentang dianggap sudah menuang sebesar `jumlah` saat itu (kasus {1000,0,true}).
export const sudahDituang = c => c.tercentang ? Math.max(c.sudah_dituang || 0, c.jumlah) : (c.sudah_dituang || 0);
export const sisaDituang = c => c.tercentang ? 0 : Math.max(0, c.jumlah - (c.sudah_dituang || 0));
export function hitungChecklistBaru(lama = {}, baru) {
  const out = {};
  for (const [k, jumlah] of Object.entries(baru)) {
    const l = lama[k];
    if (!l) out[k] = { jumlah, sudah_dituang: 0, tercentang: false };
    else { const d = sudahDituang(l); out[k] = { jumlah, sudah_dituang: d, tercentang: jumlah <= d }; }
  }
  for (const [k, l] of Object.entries(lama))
    if (!(k in baru) && sudahDituang(l) > 0) out[k] = { jumlah: 0, sudah_dituang: sudahDituang(l), tercentang: true };
  return out;
}
export const checklistLengkap = c => Object.values(c || {}).every(x => x.tercentang);
export function teksBahan(kunci) {
  const b = REF.bahan_pendukung.find(x => x.nama === kunci);
  return { teks: (b?.label_tampilan ?? kunci) + (b?.keterangan ? ` (${b.keterangan})` : ''), satuan: b?.satuan ?? '' };
}

// ---------- §8 Jadwal & progress (tanggal kalender WIB) ----------
export const hariIniWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const hari = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
export const selisihHari = (a, b) => hari(a) - hari(b);
export const tambahHari = (iso, n) => new Date((hari(iso) + n) * 864e5).toISOString().slice(0, 10);

export function hitungJadwal(namaResep, mulai = hariIniWIB()) {
  const p = REF.parameter_resep.find(x => x.nama_resep === namaResep);
  const durasi = p.base_durasi_hari;
  return {
    estimasi_durasi_hari: durasi,
    tanggal_matang: tambahHari(mulai, durasi),
    interval_pemantauan_hari: p.interval_pemantauan_hari,
    durasi_pemantauan_aktif_hari: p.masa_curing_hari != null ? durasi - p.masa_curing_hari : p.durasi_pemantauan_aktif_hari,
    pesan_pemantauan: p.pesan_pemantauan,
    tanggal_pemantauan_berikutnya: p.interval_pemantauan_hari != null ? tambahHari(mulai, p.interval_pemantauan_hari) : null,
  };
}
export const statusEfektif = (w, hariIni = hariIniWIB()) =>
  w.status === 'sedang_fermentasi' && w.tanggal_matang <= hariIni ? 'matang' : w.status;
export function progress(w, hariIni = hariIniWIB()) {
  if (w.status === 'sedang_mengisi') return null;
  const d = w.estimasi_durasi_hari;
  if (w.status === 'sudah_dipanen') return { hariKe: d, sisaHari: 0, persen: 100 };
  const hariKe = Math.min(Math.max(0, selisihHari(hariIni, w.tanggal_mulai_fermentasi)), d);
  return { hariKe, sisaHari: d - hariKe, persen: Math.floor((hariKe / d) * 100) };
}

// ---------- §2.2 Pencocokan nama input manual ----------
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[_-]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
function dice(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const peta = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const A = peta(a), B = peta(b); let c = 0;
  for (const [g, n] of A) c += Math.min(n, B.get(g) || 0);
  return (2 * c) / (a.length + b.length - 2);
}
function jarakEdit(a, b) { // Damerau (OSA): "aple" → "apel" = 1
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
const skorEdit = (q, w) => { const d = jarakEdit(q, w); return d <= (w.length <= 6 ? 1 : 2) ? 1 - d / Math.max(q.length, w.length) : 0; };

export function cariSaran(teks) { // murni: tidak mengenal "terverifikasi"
  const q = norm(teks);
  if (q.length < MIN_HURUF) return [];
  const hasil = [];
  REF.sampah_organik.forEach((s, idx) => {
    const kand = [s.label_tampilan, s.nama, ...(s.sinonim || [])].map(norm);
    const kata = kand.flatMap(k => k.split(' '));
    let tier = 0, skor = 0;
    if (kand.includes(q)) tier = 1;
    else if (kata.some(w => w.startsWith(q))) tier = 2;
    else if (kand.some(k => k.includes(q))) tier = 3;
    else {
      skor = Math.max(...kand.concat(kata).map(c => Math.max(dice(q, c), skorEdit(q, c))));
      if (skor >= AMBANG_MIRIP) tier = 4;
    }
    if (tier) hasil.push({ nama: s.nama, label_tampilan: s.label_tampilan, tier, skor, idx });
  });
  return hasil.sort((a, b) => a.tier - b.tier || b.skor - a.skor || a.idx - b.idx).slice(0, MAKS_SARAN);
}

// ---------- §2.3 Sesi scan: himpunan terverifikasi & kandidat (kunci = nama label) ----------
export function buatSesiScan() {
  const s = { terverifikasi: new Map(), kandidat: new Map() };
  s.terimaHasilScan = mentah => {
    const per = new Map();
    for (const d of mentah) {
      if (!REF.peta.has(d.label)) continue; // di luar 37 label → dibuang
      if (!per.has(d.label) || d.confidence > per.get(d.label).confidence) per.set(d.label, d);
    }
    s.kandidat = new Map();
    for (const [n, d] of per) if (!s.terverifikasi.has(n)) s.kandidat.set(n, { nama: n, confidence: d.confidence });
  };
  s.deteksiSudahBenar = () => {
    if (!s.terverifikasi.size && !s.kandidat.size) return null; // pengaman: tidak ada sampah → tidak boleh lanjut
    for (const [n, d] of s.kandidat) s.terverifikasi.set(n, { nama: n, confidence: d.confidence, sumber: 'ai' });
    s.kandidat = new Map();
    return [...s.terverifikasi.values()]; // daftar_entri, satu entri per label
  };
  s.lanjutDiCek = dicentang => {
    for (const n of dicentang) if (s.kandidat.has(n)) s.terverifikasi.set(n, { nama: n, confidence: s.kandidat.get(n).confidence, sumber: 'ai' });
    s.kandidat = new Map(); // yang tidak dicentang dibuang
    return 'perbaiki';      // layar berikutnya (pakai replaceState)
  };
  // Data layar Hasil Deteksi: terverifikasi (✓) dulu, lalu kandidat (urut confidence tertinggi).
  // persen hanya untuk kandidat (baris ✓ tanpa persen); keterangan "Diisi manual" untuk sumber manual.
  s.daftarHasilDeteksi = () => {
    const label = n => REF.peta.get(n).label_tampilan;
    const ver = [...s.terverifikasi.values()].map(v => ({ nama: v.nama, label_tampilan: label(v.nama), centang: true,
      confidence: v.confidence, persen: null, sumber: v.sumber, keterangan: v.sumber === 'manual' ? 'Diisi manual' : null }));
    const kand = [...s.kandidat.values()].sort((a, b) => b.confidence - a.confidence).map(k => ({ nama: k.nama, label_tampilan: label(k.nama),
      centang: false, confidence: k.confidence, persen: Math.round(k.confidence * 100), sumber: 'ai', keterangan: null }));
    const total = ver.length + kand.length;
    const judul = total === 0 ? 'Tidak ada sampah terdeteksi'
      : kand.length > 0 ? `AI mendeteksi ${kand.length} jenis sampah dari foto kamu:`   // setelah scan (pertama/ulang): hanya yang baru
      : `${total} jenis sampah siap diproses:`;                                          // semua sudah ✓ (mis. setelah isi manual)
    return { judul, baris: [...ver, ...kand], tombol_lanjut_aktif: total > 0 };               // "Ada yang salah" selalu aktif
  };
  s.tekanAdaYangSalah = () => s.kandidat.size ? 'cek' : 'perbaiki';
  s.kembaliDariHasilDeteksi = () => { s.buang(); return 'home'; };
  s.kembaliDariPerbaiki = () => { if (s.terverifikasi.size) return 'hasil'; s.buang(); return 'home'; };
  s.lanjutkanManual = nama => {
    if (s.terverifikasi.has(nama)) return;
    s.terverifikasi.set(nama, { nama, confidence: null, sumber: 'manual' });
    s.kandidat.delete(nama);
  };
  s.hapus = nama => s.terverifikasi.delete(nama);
  s.buang = () => { s.terverifikasi = new Map(); s.kandidat = new Map(); };
  return s;
}