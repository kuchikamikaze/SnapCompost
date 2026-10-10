// api.js — satu-satunya tempat yang menyentuh Supabase. Pakai: const api = buatApi(supabaseClient)
// Aturan: tampilan diperbarui HANYA setelah promise berhasil; bila melempar Error, tampilkan error.message.
import { hariIniWIB } from './core.js';

export function buatApi(sb) {
  const online = () => { if (!navigator.onLine) throw new Error('Butuh internet'); };

  // [PATCH #2] Pesan untuk user: awalan 'USER:' dari RPC (02_rpc.sql) diteruskan apa adanya; gagal jaringan → 'Butuh internet';
  // selain itu pesan generik (detail teknis hanya di console).
  const pesanDari = (error, cadangan) => {
    const m = String(error?.message ?? '');
    if (m.startsWith('USER:')) return m.slice(5).trim();
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return 'Butuh internet';
    return cadangan;
  };
  const jalan = async (q, pesan) => {
    online();
    let res;
    try { res = await q; }
    catch (e) { console.error('Supabase/RPC Exception:', e); throw new Error(pesanDari(e, pesan)); } // fetch yang melempar (bukan dikembalikan)
    const { data, error } = res;
    if (error) {
      console.error('Supabase/RPC Error Detail:', error);
      throw new Error(pesanDari(error, pesan));
    }
    return data;
  };

  const baca = q => jalan(q, 'Gagal memuat data, coba lagi.');
  const tulis = q => jalan(q, 'Gagal menyimpan, coba lagi.');
  const rpc = (fn, payload) => tulis(sb.rpc(fn, { payload }));

  // [PATCH #3] UPDATE/DELETE yang mengenai 0 baris TIDAK menghasilkan error di PostgREST → "sukses semu".
  // .select('id') membuat baris yang terpengaruh dikembalikan; kosong = gagal.
  const MUAT_ULANG = 'Wadah tidak ditemukan atau sudah berubah. Muat ulang halaman.';
  const ubahBaris = async (q, pesanGagal) => {
    const data = await tulis(q.select('id'));
    if (!Array.isArray(data) || data.length === 0) throw new Error(pesanGagal);
    return data;
  };

  return {
    // Baca (status selalu lewat VIEW, bukan kolom mentah)
    daftarWadah: () => baca(sb.from('wadah_status_efektif').select('*')),
    wadah: id => baca(sb.from('wadah_status_efektif').select('*').eq('id', id).single()),
    itemWadah: id => baca(sb.from('item_wadah').select('*').eq('id_wadah', id)),

    // maybeSingle() agar tidak crash saat login pertama (trigger saat_user_baru belum selesai)
    profil: async () => {
      online();
      const { data, error } = await sb.from('user').select('*').maybeSingle();
      if (error) {
        console.error('Supabase Error (profil):', error);
        throw new Error(pesanDari(error, 'Gagal memuat data profil.'));
      }
      if (!data) {
        const { data: { user: authUser } } = await sb.auth.getUser();
        if (!authUser) throw new Error('Sesi login tidak valid.');
        return {
          id: authUser.id, email: authUser.email, total_gram_dimanfaatkan: 0,
          counter_kompos: 0, counter_kompos_kering: 0, counter_eco_enzyme: 0
        };
      }
      return data;
    },

    // Tulis multi-baris = satu RPC = satu transaksi (§7.5)
    konfirmasiAlokasi: ({ tambah, wadah_baru }) => rpc('konfirmasi_alokasi', { tambah, wadah_baru }),
    ubahJumlahItem: p => rpc('ubah_jumlah_item', p),
    hapusItem: p => rpc('hapus_item_wadah', p),
    mulaiFermentasi: p => rpc('mulai_fermentasi', p),

    // Tulis satu pernyataan (atomik) — wajib mengenai ≥1 baris
    // checklist hanya boleh diubah saat 'sedang_mengisi' (di mode proses/matang checklist hanya daftar baca)
    // DEPRECATED: menimpa seluruh checklist (last-write-wins). Dipertahankan agar kode lama tidak patah; pakai centangChecklist.
    toggleChecklist: (id, checklist) => ubahBaris(
      sb.from('wadah').update({ checklist_pending: checklist }).eq('id', id).eq('status', 'sedang_mengisi'),
      'Wadah sudah tidak bisa diubah. Muat ulang halaman.'),
    gantiNama: async (id, nama) => {   // async: validasi gagal = promise ditolak, konsisten dengan method lain
      const n = String(nama ?? '').trim();
      if (!n) throw new Error('Nama wadah tidak boleh kosong.');
      if (n.length > 255) throw new Error('Nama wadah terlalu panjang.');
      return ubahBaris(sb.from('wadah').update({ nama: n }).eq('id', id), MUAT_ULANG);
    },
    hapusWadah: id => ubahBaris(sb.from('wadah').delete().eq('id', id), MUAT_ULANG),

    // Centang SATU bahan di server (tidak menimpa centang bahan lain dari perangkat lain). Pakai ini, bukan toggleChecklist.
    // Hasil: { ok, checklist } — checklist terbaru dari server.
    centangChecklist: (id, kunci, tercentang) => rpc('centang_checklist', { id_wadah: id, kunci, tercentang }),

    // Token notifikasi (FCM). daftarkan memindahkan kepemilikan bila token yang sama sebelumnya milik akun lain; lepas = saat logout.
    daftarkanPerangkat: token => rpc('daftarkan_perangkat', { fcm_token: token }),
    lepasPerangkat: token => rpc('lepas_perangkat', { fcm_token: token }),

    // Transisi status lewat RPC (tanggal & status diperiksa di server)
    batalkanFermentasi: id => rpc('batalkan_fermentasi', { id_wadah: id }),
    tandaiSudahDipanen: id => rpc('tandai_sudah_dipanen', { id_wadah: id }),
  };
}