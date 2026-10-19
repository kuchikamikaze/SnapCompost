// api/cek-jadwal.js
// Dipanggil Vercel Cron (GET) sekali sehari.
// Urutan per wadah: klaim → catat notifikasi → cek ulang → kirim FCM.

import { createClient } from '@supabase/supabase-js';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import {
  hariIniWIB,
  tambahHari,
  selisihHari
} from '../js/logic/core.js';

const LANGKAH_PANTAU = {
  kompos: 4,
  kompos_kering: 4,
  eco_enzyme: 5
};

const teksPantau = (resep) =>
  LANGKAH_PANTAU[resep]
    ? `Waktunya pemantauan berkala, lihat langkah resep ke-${LANGKAH_PANTAU[resep]}`
    : 'Waktunya pemantauan berkala, lihat langkah resep';

const FCM_OPSI = {
  webpush: {
    headers: {
      Urgency: 'high',
      TTL: '86400'
    }
  }
};

const TOKEN_MATI = [
  'registration-token-not-registered',
  'invalid-registration-token'
];

const tokenMati = (error) =>
  TOKEN_MATI.some(
    (kode) =>
      String(error?.code ?? '').includes(kode) ||
      String(error?.errorInfo?.code ?? '').includes(kode)
  );

let supabase;

function siapkan() {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    FIREBASE_SERVICE_ACCOUNT
  } = process.env;

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !FIREBASE_SERVICE_ACCOUNT
  ) {
    throw new Error('Env var belum lengkap');
  }

  supabase ??= createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  if (!getApps().length) {
    const akun = JSON.parse(
      Buffer.from(
        FIREBASE_SERVICE_ACCOUNT,
        'base64'
      ).toString('utf8')
    );

    initializeApp({
      credential: cert(akun)
    });
  }
}

async function kirimFCM(idUser, data, opsi) {
  const { data: baris, error } = await supabase
    .from('perangkat_user')
    .select('fcm_token')
    .eq('id_user', idUser);

  if (error) throw error;

  const tokens = (baris ?? [])
    .map((item) => item.fcm_token)
    .filter(Boolean);

  if (!tokens.length) return;

  const pesan = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      String(value ?? '')
    ])
  );

  const hasil = await getMessaging().sendEachForMulticast({
    tokens,
    data: pesan,
    ...opsi
  });

  const mati = tokens.filter(
    (_, index) =>
      !hasil.responses[index].success &&
      tokenMati(hasil.responses[index].error)
  );

  if (mati.length) {
    await supabase
      .from('perangkat_user')
      .delete()
      .in('fcm_token', mati);
  }
}

async function pulihkanPantau(wadah, berikutnya) {
  let query = supabase
    .from('wadah')
    .update({
      tanggal_pemantauan_berikutnya:
        wadah.tanggal_pemantauan_berikutnya
    })
    .eq('id', wadah.id)
    .eq('status', 'sedang_fermentasi');

  query =
    berikutnya === null
      ? query.is('tanggal_pemantauan_berikutnya', null)
      : query.eq('tanggal_pemantauan_berikutnya', berikutnya);

  const { error } = await query;

  if (error) {
    console.error(
      'cek-jadwal pulihkan pemantauan',
      wadah.id,
      error
    );
  }
}

async function masihFermentasi(id) {
  const { data, error } = await supabase
    .from('wadah')
    .select('id')
    .eq('id', id)
    .eq('status', 'sedang_fermentasi')
    .maybeSingle();

  if (error) throw error;

  return Boolean(data);
}

export default async function handler(req, res) {
  const rahasia = process.env.CRON_SECRET;

  if (
    !rahasia ||
    req.headers.authorization !== `Bearer ${rahasia}`
  ) {
    return res.status(401).json({
      error: 'unauthorized'
    });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'method not allowed'
    });
  }

  try {
    siapkan();
  } catch (error) {
    console.error('cek-jadwal siapkan', error);

    return res.status(500).json({
      error: 'konfigurasi server belum lengkap'
    });
  }

  const hariIni = hariIniWIB();

  const ringkas = {
    hari_ini: hariIni,
    matang: 0,
    pemantauan: 0,
    gagal: 0
  };

  // Notifikasi matang
  const {
    data: daftarMatang,
    error: errorMatang
  } = await supabase
    .from('wadah')
    .select('id, id_user, nama')
    .eq('status', 'sedang_fermentasi')
    .eq('notif_matang_terkirim', false)
    .lte('tanggal_matang', hariIni);

  if (errorMatang) {
    console.error('cek-jadwal daftar matang', errorMatang);

    return res.status(500).json({
      error: 'gagal membaca daftar matang'
    });
  }

  for (const wadah of daftarMatang ?? []) {
    try {
      const { data: klaim, error: errorKlaim } = await supabase
        .from('wadah')
        .update({
          notif_matang_terkirim: true
        })
        .eq('id', wadah.id)
        .eq('status', 'sedang_fermentasi')
        .eq('notif_matang_terkirim', false)
        .lte('tanggal_matang', hariIni)
        .select('id');

      if (errorKlaim) throw errorKlaim;
      if (!klaim?.length) continue;

      const {
        data: notifikasi,
        error: errorNotifikasi
      } = await supabase
        .from('notifikasi')
        .insert({
          id_user: wadah.id_user,
          id_wadah: wadah.id,
          jenis: 'matang',
          isi: 'Siap dipanen!'
        })
        .select('id')
        .single();

      if (errorNotifikasi) {
        await supabase
          .from('wadah')
          .update({
            notif_matang_terkirim: false
          })
          .eq('id', wadah.id);

        ringkas.gagal++;
        continue;
      }

      if (!(await masihFermentasi(wadah.id))) {
        await supabase
          .from('notifikasi')
          .delete()
          .eq('id', notifikasi.id);

        continue;
      }

      await kirimFCM(
        wadah.id_user,
        {
          id_notifikasi: notifikasi.id,
          id_wadah: wadah.id,
          judul: wadah.nama ?? 'SnapCompost',
          isi: 'Siap dipanen!'
        },
        FCM_OPSI
      );

      ringkas.matang++;
    } catch (error) {
      ringkas.gagal++;

      console.error(
        'cek-jadwal matang',
        wadah.id,
        error
      );
    }
  }

  // Notifikasi pemantauan untuk wadah yang belum matang
  const {
    data: daftarPantau,
    error: errorPantau
  } = await supabase
    .from('wadah')
    .select(
      'id, id_user, nama, nama_resep, tanggal_mulai_fermentasi, tanggal_pemantauan_berikutnya, interval_pemantauan_hari, durasi_pemantauan_aktif_hari'
    )
    .eq('status', 'sedang_fermentasi')
    .lte('tanggal_pemantauan_berikutnya', hariIni)
    .gt('tanggal_matang', hariIni);

  if (errorPantau) {
    console.error(
      'cek-jadwal daftar pemantauan',
      errorPantau
    );

    return res.status(500).json({
      ...ringkas,
      error: 'gagal membaca daftar pemantauan'
    });
  }

  for (const wadah of daftarPantau ?? []) {
    try {
      const tanggalBaru = tambahHari(
        wadah.tanggal_pemantauan_berikutnya,
        wadah.interval_pemantauan_hari
      );

      const berikutnya =
        selisihHari(
          tanggalBaru,
          wadah.tanggal_mulai_fermentasi
        ) >= wadah.durasi_pemantauan_aktif_hari
          ? null
          : tanggalBaru;

      const { data: klaim, error: errorKlaim } = await supabase
        .from('wadah')
        .update({
          tanggal_pemantauan_berikutnya: berikutnya
        })
        .eq('id', wadah.id)
        .eq('status', 'sedang_fermentasi')
        .gt('tanggal_matang', hariIni)
        .eq(
          'tanggal_pemantauan_berikutnya',
          wadah.tanggal_pemantauan_berikutnya
        )
        .select('id');

      if (errorKlaim) throw errorKlaim;
      if (!klaim?.length) continue;

      const isi = teksPantau(wadah.nama_resep);

      const {
        data: notifikasi,
        error: errorNotifikasi
      } = await supabase
        .from('notifikasi')
        .insert({
          id_user: wadah.id_user,
          id_wadah: wadah.id,
          jenis: 'pemantauan',
          isi
        })
        .select('id')
        .single();

      if (errorNotifikasi) {
        await pulihkanPantau(wadah, berikutnya);

        ringkas.gagal++;
        continue;
      }

      if (!(await masihFermentasi(wadah.id))) {
        await supabase
          .from('notifikasi')
          .delete()
          .eq('id', notifikasi.id);

        continue;
      }

      await kirimFCM(
        wadah.id_user,
        {
          id_notifikasi: notifikasi.id,
          id_wadah: wadah.id,
          judul: wadah.nama ?? 'SnapCompost',
          isi
        },
        FCM_OPSI
      );

      ringkas.pemantauan++;
    } catch (error) {
      ringkas.gagal++;

      console.error(
        'cek-jadwal pemantauan',
        wadah.id,
        error
      );
    }
  }

  return res.status(200).json(ringkas);
}
