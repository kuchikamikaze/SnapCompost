// api.js — satu-satunya tempat yang menyentuh Supabase. Pakai: const api = buatApi(supabaseClient)
// Aturan: tampilan diperbarui HANYA setelah promise berhasil; bila melempar Error, tampilkan error.message.
import { hariIniWIB } from './core.js';

export function buatApi(sb) {
  const online = () => { if (!navigator.onLine) throw new Error('Butuh internet'); };
  
  // [PERBAIKAN 1] Log error asli & bedakan pesan bisnis spesifik
  const jalan = async (q, pesan) => { 
    online(); 
    const { data, error } = await q; 
    if (error) {
      console.error('Supabase/RPC Error Detail:', error); // <-- Log error asli untuk debugging developer
      throw new Error(pesan); 
    }
    return data; 
  };
  
  const baca = q => jalan(q, 'Gagal memuat data, coba lagi.');
  const tulis = q => jalan(q, 'Gagal menyimpan, coba lagi.');
  const rpc = (fn, payload) => tulis(sb.rpc(fn, { payload }));

  return {
    // Baca (status selalu lewat VIEW, bukan kolom mentah)
    daftarWadah: () => baca(sb.from('wadah_status_efektif').select('*')),
    wadah: id => baca(sb.from('wadah_status_efektif').select('*').eq('id', id).single()),
    itemWadah: id => baca(sb.from('item_wadah').select('*').eq('id_wadah', id)),
    
    // [PERBAIKAN 2] Gunakan maybeSingle() agar tidak crash saat login pertama (Race Condition Trigger)
    profil: async () => {
      online(); // offline → "Butuh internet", konsisten dengan fungsi lain
      const { data, error } = await sb.from('user').select('*').maybeSingle();
      if (error) {
        console.error('Supabase Error (profil):', error);
        throw new Error('Gagal memuat data profil.');
      }
      if (!data) {
        // Fallback aman jika trigger 'saat_user_baru' di DB belum selesai dieksekusi
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
    
    // Tulis satu pernyataan (sudah atomik)
    toggleChecklist: (id, checklist) => tulis(sb.from('wadah').update({ checklist_pending: checklist }).eq('id', id)),
    gantiNama: (id, nama) => tulis(sb.from('wadah').update({ nama }).eq('id', id)),
    hapusWadah: id => tulis(sb.from('wadah').delete().eq('id', id)),
    
    // [PERBAIKAN 3] Ganti query .update() client-side dengan RPC database untuk cegah "Sukses Semu"
    batalkanFermentasi: id => rpc('batalkan_fermentasi', { id_wadah: id }),
    tandaiSudahDipanen: id => rpc('tandai_sudah_dipanen', { id_wadah: id }),
  };
}