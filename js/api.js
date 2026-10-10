// api.js — satu-satunya tempat yang menyentuh Supabase. Pakai: const api = buatApi(supabaseClient)
// Aturan: tampilan diperbarui HANYA setelah promise berhasil; bila melempar Error, tampilkan error.message.
import { hariIniWIB } from './core.js';

export function buatApi(sb) {
  const online = () => { if (!navigator.onLine) throw new Error('Butuh internet'); };
  const jalan = async (q, pesan) => { online(); const { data, error } = await q; if (error) throw new Error(pesan); return data; };
  const baca = q => jalan(q, 'Gagal memuat data, coba lagi.');
  const tulis = q => jalan(q, 'Gagal menyimpan, coba lagi.');
  // ASUMSI: tiap fungsi RPC punya satu argumen jsonb bernama "payload" — samakan saat menulis SQL-nya.
  const rpc = (fn, payload) => tulis(sb.rpc(fn, { payload }));

  return {
    // Baca (status selalu lewat VIEW, bukan kolom mentah)
    daftarWadah: () => baca(sb.from('wadah_status_efektif').select('*')),
    wadah: id => baca(sb.from('wadah_status_efektif').select('*').eq('id', id).single()),
    itemWadah: id => baca(sb.from('item_wadah').select('*').eq('id_wadah', id)),
    profil: () => baca(sb.from('user').select('*').single()),

    // Tulis multi-baris = satu RPC = satu transaksi (§7.5)
    konfirmasiAlokasi: ({ tambah, wadah_baru }) => rpc('konfirmasi_alokasi', { tambah, wadah_baru }),
    ubahJumlahItem: p => rpc('ubah_jumlah_item', p),
    hapusItem: p => rpc('hapus_item_wadah', p),
    mulaiFermentasi: p => rpc('mulai_fermentasi', p),

    // Tulis satu pernyataan (sudah atomik)
    toggleChecklist: (id, checklist) => tulis(sb.from('wadah').update({ checklist_pending: checklist }).eq('id', id)),
    gantiNama: (id, nama) => tulis(sb.from('wadah').update({ nama }).eq('id', id)),
    hapusWadah: id => tulis(sb.from('wadah').delete().eq('id', id)),
    batalkanFermentasi: id => tulis(sb.from('wadah').update({   // checklist TIDAK diubah; hanya sebelum matang
      status: 'sedang_mengisi', tanggal_mulai_fermentasi: null, estimasi_durasi_hari: null, tanggal_matang: null,
      interval_pemantauan_hari: null, durasi_pemantauan_aktif_hari: null, pesan_pemantauan: null, tanggal_pemantauan_berikutnya: null,
    }).eq('id', id).eq('status', 'sedang_fermentasi').gt('tanggal_matang', hariIniWIB())),
    tandaiSudahDipanen: id => tulis(sb.from('wadah').update({ status: 'sudah_dipanen' })
      .eq('id', id).eq('status', 'sedang_fermentasi').lte('tanggal_matang', hariIniWIB())),
  };
}
