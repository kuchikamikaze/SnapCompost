// core.js — logika murni SnapCompost (tanpa DOM, tanpa Supabase). Spesifikasi §2–§8.
export const BATAS_KONFIRMASI_GRAM = 10000;
export const BATAS_MAKS_GRAM = 1000000;
export const AMBANG_MIRIP = 0.45, MAKS_SARAN = 5, MIN_HURUF = 2;

const KAT_S = ['normal', 'air_sedang', 'air_ekstrem', 'pati', 'kering_lambat']; // masuk S
const KAT_SEMUA = [...KAT_S, 'mineral_terpisah'];                                 // cangkang telur: di luar S
let REF = null;

// ---------- Referensi + validasi (§9.1, §12.1) ----------
// Jadwal yang HARUS sama dengan blok CASE di mulai_fermentasi (03_patch_keamanan.sql): [durasi, interval, pemantauan aktif].
// Server memakai angka ini; JSON yang berbeda akan ditolak saat aplikasi dimuat (cegah jadwal tampilan ≠ jadwal server).
export const JADWAL_SERVER = { kompos: [42, 4, 35], kompos_kering: [42, 7, 35], eco_enzyme: [90, 2, 30] };
const NILAI_STATUS = ['full', 'excluded'];
const BAGIAN = ['sampah_organik', 'syarat_sampah', 'data_sampah', 'resep', 'parameter_resep', 'langkah_resep', 'alat_modifikasi', 'bahan_pendukung'];
const KUNCI_PENDUKUNG = ['bahan_coklat', 'pelembap_tambahan', 'em4', 'gula', 'air']; // kunci keluaran formula()

export function muatReferensi(d) {
  const err = [];
  const hilang = BAGIAN.filter(k => !Array.isArray(d?.[k]));
  if (hilang.length) throw new Error('Data referensi tidak valid:\nBagian hilang atau bukan array: ' + hilang.join(', '));

  const namaResep = new Set(d.resep.map(r => r.nama));
  const rasioOk = v => v === null || (typeof v === 'number' && v > 0);
  const bulatPositif = v => Number.isInteger(v) && v > 0;
  const teksAda = v => typeof v === 'string' && v.trim() !== '';
  const unik = (arr, kunci, label) => {
    const s = new Set();
    arr.forEach(x => { const k = kunci(x); if (s.has(k)) err.push(`${label} ganda: ${k}`); s.add(k); });
    return s;
  };
  const namaSampah = unik(d.sampah_organik, s => s.nama, 'Nama sampah');
  const idSyarat = unik(d.syarat_sampah, k => k.id, 'ID syarat');

  // ---- resep & parameter_resep
  d.resep.forEach(r => {
    if (d.parameter_resep.filter(p => p.nama_resep === r.nama).length !== 1) err.push(`resep "${r.nama}" harus punya tepat 1 parameter_resep`);
  });
  d.parameter_resep.forEach(p => {
    if (!namaResep.has(p.nama_resep)) err.push(`parameter_resep untuk resep tak dikenal: ${p.nama_resep}`);
    ['rasio_em4', 'rasio_pelembap_tambahan', 'rasio_gula', 'rasio_air']
      .forEach(k => { if (!rasioOk(p[k])) err.push(`${p.nama_resep}.${k} harus null atau > 0`); });
    if (p.pesan_pemantauan && p.pesan_pemantauan.length > 1000)
      err.push(`pesan_pemantauan untuk ${p.nama_resep} terlalu panjang (>1000 karakter). Periksa file JSON.`);
    if (!bulatPositif(p.base_durasi_hari)) err.push(`${p.nama_resep}.base_durasi_hari harus bilangan bulat > 0`);
    if (p.interval_pemantauan_hari !== null && !bulatPositif(p.interval_pemantauan_hari)) err.push(`${p.nama_resep}.interval_pemantauan_hari harus null atau bilangan bulat > 0`);
    if (p.masa_curing_hari != null && !(bulatPositif(p.masa_curing_hari) && p.masa_curing_hari < p.base_durasi_hari))
      err.push(`${p.nama_resep}.masa_curing_hari harus bilangan bulat > 0 dan < base_durasi_hari`);
    const aktif = p.masa_curing_hari != null ? p.base_durasi_hari - p.masa_curing_hari : p.durasi_pemantauan_aktif_hari;
    const js = JADWAL_SERVER[p.nama_resep];
    if (!js) err.push(`resep "${p.nama_resep}" belum ada di mulai_fermentasi (SQL) / JADWAL_SERVER`);
    else if (js[0] !== p.base_durasi_hari || js[1] !== p.interval_pemantauan_hari || js[2] !== aktif)
      err.push(`jadwal ${p.nama_resep} di JSON [${p.base_durasi_hari}, ${p.interval_pemantauan_hari}, ${aktif}] ≠ SQL [${js}]; ubah keduanya bersamaan`);
    if (p.nama_resep !== 'kompos' && p.nama_resep !== 'kompos_kering' && !(p.rasio_gula > 0 && p.rasio_air > 0))
      err.push(`${p.nama_resep}: rasio_gula & rasio_air wajib > 0 (dipakai formula() resep non-kompos)`);
  });

  // ---- sampah_organik
  d.sampah_organik.forEach(s => {
    if (!teksAda(s.label_tampilan)) err.push(`${s.nama}: label_tampilan kosong`);
    if (!KAT_SEMUA.includes(s.kategori_kompos)) err.push(`kategori "${s.kategori_kompos}" (${s.nama}) tidak dikenali Formula()`);
    if (!['berat_langsung', 'hitungan'].includes(s.tipe_input)) err.push(`${s.nama}.tipe_input "${s.tipe_input}" tidak dikenal`);
    if (s.tipe_input === 'hitungan' && !bulatPositif(s.berat_per_satuan)) err.push(`${s.nama}: tipe hitungan wajib punya berat_per_satuan bilangan bulat > 0`);
    if (s.faktor_bahan_coklat !== null && !(Number.isFinite(s.faktor_bahan_coklat) && s.faktor_bahan_coklat >= 0))
      err.push(`${s.nama}.faktor_bahan_coklat harus null atau angka ≥ 0`);
    // default 'full' untuk resep tanpa field status_<resep> disengaja (spec §2); yang DITULIS harus valid & mengacu resep nyata
    Object.keys(s).filter(k => k.startsWith('status_')).forEach(k => {
      if (!namaResep.has(k.slice(7))) err.push(`${s.nama}.${k}: resep "${k.slice(7)}" tidak ada`);
      if (!NILAI_STATUS.includes(s[k])) err.push(`${s.nama}.${k} = "${s[k]}" (harus ${NILAI_STATUS.join('/')})`);
    });
    Object.keys(s.override_per_resep ?? {}).forEach(r => { if (!namaResep.has(r)) err.push(`${s.nama}.override_per_resep: resep "${r}" tidak ada`); });
  });

  // ---- syarat_sampah & data_sampah
  d.syarat_sampah.forEach(k => {
    if (!k.efek_status || typeof k.efek_status !== 'object') { err.push(`syarat ${k.id}: efek_status wajib objek`); return; }
    Object.entries(k.efek_status).forEach(([r, v]) => {
      if (!namaResep.has(r)) err.push(`syarat ${k.id}.efek_status: resep "${r}" tidak ada`);
      if (!NILAI_STATUS.includes(v)) err.push(`syarat ${k.id}.efek_status.${r} = "${v}" (harus ${NILAI_STATUS.join('/')})`);
    });
  });
  d.data_sampah.forEach(x => {
    if (!namaSampah.has(x.nama_sampah)) err.push(`data_sampah: sampah "${x.nama_sampah}" tidak ada`);
    if (!idSyarat.has(x.id_kondisi)) err.push(`data_sampah: kondisi "${x.id_kondisi}" tidak ada di syarat_sampah`);
  });

  // ---- bahan_pendukung, langkah, alat
  const namaPendukung = new Set(d.bahan_pendukung.map(b => b.nama));
  KUNCI_PENDUKUNG.forEach(k => { if (!namaPendukung.has(k)) err.push(`bahan_pendukung "${k}" hilang (dipakai formula())`); });
  d.bahan_pendukung.forEach(b => { if (!teksAda(b.label_tampilan)) err.push(`bahan_pendukung ${b.nama}: label_tampilan kosong`); });
  unik(d.langkah_resep, l => `${l.nama_resep}#${l.urutan}`, 'Urutan langkah');
  d.langkah_resep.forEach(l => { if (!namaResep.has(l.nama_resep)) err.push(`langkah_resep: resep "${l.nama_resep}" tidak ada`); });
  d.alat_modifikasi.forEach(a => {
    if (!namaResep.has(a.nama_resep)) err.push(`alat_modifikasi: resep "${a.nama_resep}" tidak ada`);
    a.spesifikasi.forEach(t => {
      if (/^\s*(\d+[.)]|[-•*])/.test(t)) err.push(`alat ${a.nama_resep}: poin tidak boleh diawali nomor/tanda poin`);
    });
  });

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
      && k.efek_status?.[r.nama] === 'excluded'));
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
// Mengikuti status_efektif dari VIEW (jam SERVER) bila ada, agar bar & "hari lagi" tidak bertentangan dengan label kartu
// walau jam HP meleset: matang → selalu 100%/0 hari; belum matang → tidak pernah 100%/0 hari.
export function progress(w, hariIni = hariIniWIB()) {
  if (w.status === 'sedang_mengisi') return null;
  const d = w.estimasi_durasi_hari;
  if (w.status === 'sudah_dipanen') return { hariKe: d, sisaHari: 0, persen: 100 };
  if ((w.status_efektif ?? statusEfektif(w, hariIni)) === 'matang') return { hariKe: d, sisaHari: 0, persen: 100 };
  const hariKe = Math.min(Math.max(0, selisihHari(hariIni, w.tanggal_mulai_fermentasi)), d - 1);
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