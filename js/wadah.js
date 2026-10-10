// wadah.js — logika tampilan wadah (App §7–§9). Murni: menghasilkan data untuk di-render HTML teman Anda.
import * as C from './core.js';

const efektif = (w, h) => w.status_efektif ?? C.statusEfektif(w, h); // idealnya dari VIEW wadah_status_efektif
const labelResep = n => C.ref().resep.find(r => r.nama === n)?.label_tampilan ?? n;
const cl = w => w.checklist_pending ?? {};
const tgl = w => Date.parse(w.tanggal_dibuat);

// Teks kanan kartu (App §7)
export function teksKanan(w, hariIni) {
  const s = efektif(w, hariIni);
  if (s === 'sedang_fermentasi') return `~${C.progress(w, hariIni).sisaHari} hari lagi`;
  if (s === 'matang') return 'Siap dipanen!';
  if (s === 'sudah_dipanen') return '';
  return C.checklistLengkap(cl(w)) ? 'Siap dimulai' : 'Menunggu bahan pendukung dilengkapi';
}

// Data satu kartu. `persen` null = tanpa bar (sedang mengisi). Homepage: pakai bar saja; halaman Wadah: bar + angka persen.
export function kartuWadah(w, hariIni) {
  const s = efektif(w, hariIni), p = s === 'sedang_mengisi' ? null : C.progress(w, hariIni);
  return { id: w.id, nama: w.nama, resep: labelResep(w.nama_resep), status: s, teksKanan: teksKanan(w, hariIni), persen: p ? p.persen : null,
    teksHari: p ? `Hari ke-${p.hariKe} dari ${w.estimasi_durasi_hari}` : null };
}

// Dashboard Home (App §8)
export function dashboard(list, hariIni) {
  const n = { mengisi: 0, proses: 0, matang: 0 };
  for (const w of list) {
    const s = efektif(w, hariIni);
    if (s === 'sedang_mengisi') n.mengisi++; else if (s === 'sedang_fermentasi') n.proses++; else if (s === 'matang') n.matang++;
  }
  return { totalAktif: n.mengisi + n.proses + n.matang, ...n };
}
export const teksTotalKg = gram => (gram / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Home: 1 tahap. ASUMSI: matang (butuh aksi) → proses → mengisi, lalu terbaru dulu. Ubah RANK bila maksudnya beda.
const RANK = { matang: 0, sedang_fermentasi: 1, sedang_mengisi: 2 };
// urut: 'progress_tinggi' (default, sesuai dropdown UI) | 'progress_rendah' | 'terbaru' | 'terlama' | 'status' (pakai RANK)
export function daftarHomepage(list, hariIni, urut = 'progress_tinggi') {
  if (urut !== 'status') return filterDanUrut(list, { status: 'aktif', jenis: 'semua', urut }, hariIni);
  return list.filter(w => efektif(w, hariIni) !== 'sudah_dipanen')
    .sort((a, b) => RANK[efektif(a, hariIni)] - RANK[efektif(b, hariIni)] || tgl(b) - tgl(a));
}

// Halaman Wadah (App §9). status: 'aktif'|'dipanen'; jenis: 'semua'|'kompos'|'eco_enzyme';
// urut: 'progress_tinggi'|'progress_rendah'|'terbaru'|'terlama'. "kompos" mencakup kompos_kering.
export function filterDanUrut(list, { status = 'aktif', jenis = 'semua', urut = 'progress_tinggi' } = {}, hariIni) {
  const ok = list.filter(w => {
    if ((status === 'aktif') === (efektif(w, hariIni) === 'sudah_dipanen')) return false;
    if (jenis === 'kompos') return w.nama_resep.startsWith('kompos');
    if (jenis === 'eco_enzyme') return w.nama_resep === 'eco_enzyme';
    return true;
  });
  if (urut === 'terbaru') return ok.sort((a, b) => tgl(b) - tgl(a));
  if (urut === 'terlama') return ok.sort((a, b) => tgl(a) - tgl(b));
  const pr = w => efektif(w, hariIni) === 'sedang_mengisi' ? null : C.progress(w, hariIni).persen;
  const arah = urut === 'progress_rendah' ? -1 : 1;
  return ok.sort((a, b) => {
    const pa = pr(a), pb = pr(b);
    if (pa === null || pb === null) return pa === pb ? tgl(b) - tgl(a) : pa === null ? 1 : -1; // "mengisi" selalu di bawah
    return (pb - pa) * arah || tgl(b) - tgl(a);
  });
}

// Detail wadah (9a/9b/9c). items = baris item_wadah milik wadah ini.
export function detailWadah(w, items, hariIni) {
  const s = efektif(w, hariIni), ref = C.ref(), c = cl(w);
  // Label yang sama bisa muncul di >1 baris (kondisi tiap baris berbeda) → beri nomor agar tidak membingungkan: "Apel (1)", "Apel (2)"
  const total = {}, urut = {};
  items.forEach(i => { total[i.nama_sampah] = (total[i.nama_sampah] || 0) + 1; });
  const p = s === 'sedang_mengisi' ? null : C.progress(w, hariIni);
  return {
    id: w.id, nama: w.nama, mode: s, resep: labelResep(w.nama_resep),
    progressTeks: p && s !== 'sudah_dipanen' ? `hari ke-${p.hariKe} dari ${w.estimasi_durasi_hari} hari` : null,
    // gram = tampilan baca (selalu gram). edit = cara mengedit: 'hitungan' → stepper butir (≈ nilai × gramPerSatuan g), 'berat_langsung' → ketik gram.
    items: items.map(i => {
      const m = ref.peta.get(i.nama_sampah), hit = m?.tipe_input === 'hitungan';
      const label = m?.label_tampilan ?? i.nama_sampah;
      return { id: i.id, nama: i.nama_sampah, label, kondisi: i.kondisi_tercentang ?? [],
        labelTampil: total[i.nama_sampah] > 1 ? `${label} (${urut[i.nama_sampah] = (urut[i.nama_sampah] || 0) + 1})` : label,
        gram: i.berat, bisaEdit: s === 'sedang_mengisi',
        edit: hit ? { tipe: 'hitungan', satuan: 'butir', nilai: Math.round(i.berat / m.berat_per_satuan), gramPerSatuan: m.berat_per_satuan }
                  : { tipe: 'berat_langsung', satuan: 'g', nilai: i.berat } };
    }),
    // Baris jumlah 0 disembunyikan; belum tercentang & sudah ada yang dituang → "+ sisa". Mode proses/matang: tampilkan sebagai list biasa.
    checklist: Object.entries(c).filter(([, x]) => x.jumlah > 0).map(([kunci, x]) => {
      const b = C.teksBahan(kunci), sisa = C.sisaDituang(x), plus = !x.tercentang && (x.sudah_dituang || 0) > 0 && sisa > 0; // "+ X" hanya bila sudah ada yang dituang DAN masih ada sisa
      return { kunci, teks: b.teks, tercentang: x.tercentang, teksJumlah: plus ? `+ ${sisa} ${b.satuan}` : `${x.jumlah} ${b.satuan}` };
    }),
    alat: ref.alat_modifikasi.filter(a => a.nama_resep === w.nama_resep),
    langkah: ref.langkah_resep.filter(l => l.nama_resep === w.nama_resep).sort((a, b) => a.urutan - b.urutan).map(l => l.detail_langkah),
    tombol: {
      mulaiFermentasi: s === 'sedang_mengisi' && C.checklistLengkap(c),
      batalkan: s === 'sedang_fermentasi',          // hilang saat matang
      panen: s === 'matang',
      fotoWadahLain: s === 'sedang_fermentasi',
      hapus: true,
    },
  };
}

// Centang checklist: kembalikan checklist baru (sudah_dituang sengaja tidak diubah, §7.2). Untuk tampilan optimistis.
export function toggleCentang(w, kunci) {
  const c = cl(w);
  if (!c[kunci]) throw new Error('Bahan tidak ada di checklist. Muat ulang halaman.');
  return { ...c, [kunci]: { ...c[kunci], tercentang: !c[kunci].tercentang } };
}

// Payload untuk api.centangChecklist: server hanya mengubah SATU kunci (jsonb_set di bawah kunci baris),
// jadi centang dari dua perangkat pada bahan berbeda tidak saling menimpa. `checklist` = tampilan optimistis.
export function rencanaCentang(w, kunci, hariIni) {
  if (efektif(w, hariIni) !== 'sedang_mengisi') throw new Error('Wadah tidak menerima perubahan');
  const checklist = toggleCentang(w, kunci);
  return { payload: { id_wadah: w.id, kunci, tercentang: checklist[kunci].tercentang }, checklist };
}

// Dialog "Mulai Fermentasi" → bila user pilih Lanjut, kirim payload ini lewat api.mulaiFermentasi
export function rencanaMulaiFermentasi(w, hariIni = C.hariIniWIB()) {
  if (efektif(w, hariIni) !== 'sedang_mengisi') throw new Error('Wadah tidak dalam status sedang mengisi');
  if (!C.checklistLengkap(cl(w))) throw new Error('Checklist bahan pendukung belum lengkap');
  return { id_wadah: w.id, status: 'sedang_fermentasi', tanggal_mulai_fermentasi: hariIni,
    ...C.hitungJadwal(w.nama_resep, hariIni), notif_matang_terkirim: false };
}

// Hapus item (9a). perluDialogTerakhir=true → tampilkan dialog "Hapus Item & Wadah" / "Kembali" dulu.
export function rencanaHapusItem(w, items, idItem) {
  if (efektif(w) !== 'sedang_mengisi') throw new Error('Wadah tidak menerima perubahan');
  if (!items.some(i => i.id === idItem)) throw new Error('Item tidak ditemukan di wadah.');
  if (items.length === 1) return { perluDialogTerakhir: true, payload: { id_item: idItem, hapus_wadah: true } };
  const sisa = items.filter(i => i.id !== idItem);
  return { perluDialogTerakhir: false, payload: { id_item: idItem, hapus_wadah: false,
    checklist: C.hitungChecklistBaru(cl(w), C.hitungBahanPendukung(sisa, w.nama_resep)) } };
}

// Edit jumlah item (9a poin 3). aksi: 'tolak' (tampilkan pesan) | 'hapus' (nilai 0) | 'ubah' (minta konfirmasi bila perluKonfirmasi)
export function rencanaUbahJumlah(w, items, idItem, teks) {
  if (efektif(w) !== 'sedang_mengisi') throw new Error('Wadah tidak menerima perubahan');
  const item = items.find(i => i.id === idItem);
  if (!item) throw new Error('Item tidak ditemukan di wadah.'); // Guard baru
  const v = C.validasiInputJumlah(item.nama_sampah, teks, true);
  if (!v.valid) return { aksi: 'tolak', pesan: v.pesan };
  if (v.nilai === 0) return { aksi: 'hapus', ...rencanaHapusItem(w, items, idItem) };
  const baru = items.map(i => i.id === idItem ? { ...i, berat: v.gram } : i);
  return { aksi: 'ubah', perluKonfirmasi: v.perlu_konfirmasi, gram: v.gram,
    payload: { id_item: idItem, berat: v.gram, checklist: C.hitungChecklistBaru(cl(w), C.hitungBahanPendukung(baru, w.nama_resep)) } };
}