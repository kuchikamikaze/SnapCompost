// alokasi.js — Alokasi Cerdas & Shared Pool (§2.1). Semua fungsi MURNI: tidak menulis apa pun ke Supabase.
import * as C from './core.js';

const statusW = w => w.status_efektif ?? w.status;

// Langkah 2: wadah "sedang_mengisi" yang bisa menerima minimal satu entri batch
export function kandidatWadah(batch, wadahList) {
  return wadahList.filter(w => statusW(w) === 'sedang_mengisi')
    .map(w => ({ wadah: w, id_entri_cocok: batch.filter(e => C.dapatkanStatus(e, w.nama_resep) !== 'excluded').map(e => e.id_entri) }))
    .filter(k => k.id_entri_cocok.length);
}

// batch[i] = { id_entri, nama_sampah, berat_gram, kondisi_tercentang[] }  (berat_gram sudah gram, dari validasiInputJumlah)
export function buatSesiAlokasi(batch, wadahList) {
  const pool = new Map(batch.map(e => [e.id_entri, e]));
  const kandidat = kandidatWadah(batch, wadahList);
  const cocok = new Map(kandidat.map(k => [k.wadah.id, new Set(k.id_entri_cocok)]));
  const alokasi = {}; // id_wadah → { id_entri: gram }
  const terpakai = idE => Object.values(alokasi).reduce((a, per) => a + (per[idE] || 0), 0);

  const sesi = {
    kandidat, pool,
    sisa: idE => pool.get(idE).berat_gram - terpakai(idE),                       // tampil live, tanpa tombol "hitung" (selalu gram)
    sisaSemua: () => Object.fromEntries([...pool.keys()].map(id => [id, sesi.sisa(id)])),
    jumlah: (idW, idE) => alokasi[idW]?.[idE] ?? 0,                              // gram
    // Satuan isian & tampilan per entri: 'hitungan' (cangkang_telur) → butir, selain itu gram.
    satuanInput: idE => {
      const m = C.dataSampah(pool.get(idE).nama_sampah);
      return m.tipe_input === 'hitungan'
        ? { tipe: 'hitungan', satuan: 'butir', gramPerSatuan: m.berat_per_satuan }
        : { tipe: 'berat_langsung', satuan: 'g', gramPerSatuan: 1 };
    },
    // Nilai untuk ditampilkan di kolom/label (butir untuk hitungan, gram untuk lainnya)
    jumlahTampil: (idW, idE) => sesi.jumlah(idW, idE) / sesi.satuanInput(idE).gramPerSatuan,
    sisaTampil: idE => sesi.sisa(idE) / sesi.satuanInput(idE).gramPerSatuan,
    alokasi: () => structuredClone(alokasi),
    // Dipanggil tiap user mengubah satu kolom. Kolom kosong = 0. Tidak mengubah state bila ditolak.
    // `teks` memakai satuan sesi.satuanInput(idE): butir untuk hitungan, gram untuk berat_langsung.
    atur(idW, idE, teks) {
      const t = String(teks).trim() || '0';
      if (!/^[0-9]+$/.test(t)) return { ok: false, pesan: 'Masukkan angka bulat saja, tanpa koma, titik, atau satuan.' };
      if (!cocok.get(idW)?.has(idE)) return { ok: false, pesan: 'Bahan ini tidak cocok untuk wadah tersebut.' };
      const gram = C.konversiKeGram(pool.get(idE).nama_sampah, Number(t)); // butir → gram (hitungan), apa adanya (berat_langsung)
      if (gram - sesi.jumlah(idW, idE) > sesi.sisa(idE)) return { ok: false, pesan: 'Melebihi sisa bahan yang tersedia.' };
      (alokasi[idW] ??= {})[idE] = gram;
      return { ok: true, sisa: sesi.sisa(idE), sisaTampil: sesi.sisaTampil(idE) };
    },
    batchSisa: () => [...pool.values()].map(e => ({ ...e, berat_gram: sesi.sisa(e.id_entri) })).filter(e => e.berat_gram > 0),
  };
  return sesi;
}

// §7.4 — payload tambah_item_ke_wadah. itemLama[i] = { nama_sampah, berat }
export function rencanaTambahKeWadah(wadah, itemLama, sampahBaru) {
  if (statusW(wadah) !== 'sedang_mengisi') throw new Error('Wadah sudah fermentasi, tidak bisa ditambah sampah baru');
  for (const s of sampahBaru)
    if (C.dapatkanStatus(s, wadah.nama_resep) === 'excluded') throw new Error(`${s.nama_sampah} tidak cocok untuk resep wadah ini`);
  const item_baru = sampahBaru.map(s => ({ id: crypto.randomUUID(), nama_sampah: s.nama_sampah, berat: s.berat_gram, kondisi_tercentang: s.kondisi_tercentang }));
  const pendukung = C.hitungBahanPendukung([...itemLama, ...item_baru], wadah.nama_resep);
  return { id_wadah: wadah.id, item_baru, checklist: C.hitungChecklistBaru(wadah.checklist_pending ?? {}, pendukung) };
}

// §7.4 — payload buat_wadah_baru
export function rencanaWadahBaru(namaResep, batchSisa) {
  if (!C.penentuanResep(batchSisa).includes(namaResep)) throw new Error('Resep tidak cocok untuk bahan ini');
  const item_list = batchSisa.map(e => ({ id: crypto.randomUUID(), nama_sampah: e.nama_sampah, berat: e.berat_gram, kondisi_tercentang: e.kondisi_tercentang }));
  return { id_wadah: crypto.randomUUID(), nama_resep: namaResep, item_list,
    checklist: C.hitungChecklistBaru({}, C.hitungBahanPendukung(item_list, namaResep)) };
}

// Langkah 5–6: susun seluruh rencana. itemLamaPer = { id_wadah: [item dari item_wadah] }.
// Panggil dulu tanpa resepDipilih → baca opsiResep & perluPilihResep; setelah user memilih, panggil lagi dengan resepDipilih.
export function susunRencana(sesi, itemLamaPer, resepDipilih = null) {
  const tambah = [];
  for (const [idW, per] of Object.entries(sesi.alokasi())) {
    const wadah = sesi.kandidat.find(k => k.wadah.id === idW).wadah;
    const daftar = Object.entries(per).filter(([, g]) => g > 0).map(([idE, g]) => {
      const e = sesi.pool.get(idE);
      return { nama_sampah: e.nama_sampah, berat_gram: g, kondisi_tercentang: e.kondisi_tercentang };
    });
    if (daftar.length) tambah.push(rencanaTambahKeWadah(wadah, itemLamaPer[idW] ?? [], daftar));
  }
  const sisa = sesi.batchSisa();
  return {
    tambah, batchSisa: sisa,
    opsiResep: sisa.length ? C.penentuanResep(sisa) : [],   // default terpilih = opsi pertama
    perluPilihResep: sisa.length > 0 && !resepDipilih,
    wadah_baru: sisa.length && resepDipilih ? rencanaWadahBaru(resepDipilih, sisa) : null,
  };
}
// Hasil susunRencana → kirim { tambah, wadah_baru } lewat api.konfirmasiAlokasi (satu transaksi).