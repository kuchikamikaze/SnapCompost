import * as C from './core.js';

const $ = s => document.querySelector(s);
// Teks dari user/data selalu lewat textContent (via append), tidak pernah innerHTML.
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e[k] = v;
  }
  e.append(...kids.flat().filter(x => x != null));
  return e;
};

const sesi = C.buatSesiScan();
const isian = new Map(); // nama → { kondisi:Set, teks:'' }
let tundaCari = 0;

// ---------- Pencarian nama (§2.2) ----------
function renderSaran() {
  const teks = $('#q').value;
  const saran = C.cariSaran(teks);
  $('#saran').replaceChildren(...saran.map(s => {
    const sudah = sesi.terverifikasi.has(s.nama);
    return h('li', {}, h('button', {
      type: 'button', disabled: sudah,
      onclick: () => pilih(s.nama),
    }, sudah ? `${s.label_tampilan} (Sudah dipilih)` : s.label_tampilan));
  }));
  clearTimeout(tundaCari); // "Tidak Ditemukan" ditunda ±300 ms supaya tidak berkedip
  const nf = $('#tidak-ditemukan');
  nf.hidden = true;
  if (teks.trim().length >= C.MIN_HURUF && !saran.length) {
    tundaCari = setTimeout(() => {
      nf.textContent = `“${teks.trim()}” belum ada di daftar bahan yang didukung SnapCompost untuk saat ini.`;
      nf.hidden = false;
    }, 300);
  }
}
$('#q').addEventListener('input', renderSaran);

function pilih(nama) {
  sesi.lanjutkanManual(nama);
  isian.set(nama, { kondisi: new Set(), teks: '' });
  $('#q').value = '';
  renderSaran();
  renderDaftar();
  $('#hasil').hidden = true;
}

// ---------- Kondisi (§3) + jumlah (§7.3) ----------
function renderDaftar() {
  const ref = C.ref();
  $('#daftar').replaceChildren(...[...sesi.terverifikasi.keys()].map(nama => {
    const s = ref.peta.get(nama), st = isian.get(nama);
    const kond = C.daftarKondisiUntukLabel(nama).map(k => h('label', { class: 'cek' },
      h('input', { type: 'checkbox', checked: st.kondisi.has(k.id),
        onchange: e => { e.target.checked ? st.kondisi.add(k.id) : st.kondisi.delete(k.id); } }),
      h('span', {}, k.label_tampilan)));
    const p = C.perlakuan(nama, 'kompos');
    return h('article', { class: 'bahan' },
      h('header', {}, h('strong', {}, s.label_tampilan),
        h('button', { class: 'tautan', type: 'button', onclick: () => { sesi.hapus(nama); isian.delete(nama); renderDaftar(); } }, 'Hapus')),
      ...kond,
      h('div', { class: 'baris' },
        h('label', { htmlFor: 'jml-' + nama }, s.tipe_input === 'hitungan' ? 'Jumlah' : 'Berat'),
        h('input', { id: 'jml-' + nama, type: 'text', inputMode: 'numeric', value: st.teks,
          oninput: e => { st.teks = e.target.value; } }),
        h('span', {}, s.tipe_input === 'hitungan' ? 'butir' : 'g')),
      h('p', { class: 'galat', id: 'err-' + nama, hidden: true }),
      p.instruksi ? h('p', { class: 'catatan' }, (p.wajib ? 'Wajib: ' : 'Disarankan: ') + p.instruksi) : null);
  }));
  $('#hitung').disabled = sesi.terverifikasi.size === 0;
}

// ---------- Hitung resep (§2) ----------
$('#hitung').addEventListener('click', () => {
  let adaGalat = false;
  const entri = [];
  for (const [nama, st] of isian) {
    const v = C.validasiInputJumlah(nama, st.teks);
    const el = $('#err-' + nama);
    el.hidden = v.valid; el.textContent = v.valid ? '' : v.pesan;
    if (!v.valid) { adaGalat = true; continue; }
    if (v.perlu_konfirmasi && !confirm(`${v.gram.toLocaleString('id-ID')} g — yakin jumlahnya benar? Pastikan satuannya gram.`)) { adaGalat = true; continue; }
    entri.push({ id_entri: crypto.randomUUID(), nama_sampah: nama, berat_gram: v.gram, kondisi_tercentang: [...st.kondisi] });
  }
  $('#galat').hidden = !adaGalat;
  $('#galat').textContent = adaGalat ? 'Periksa isian yang bertanda merah.' : '';
  if (adaGalat) return;

  const opsi = C.penentuanResep(entri); // selalu berisi minimal kompos & kompos_kering
  const ref = C.ref();
  const hasil = $('#hasil');
  const detail = h('div', {});
  const tombol = opsi.map((nama, i) => h('button', { type: 'button', 'aria-pressed': String(i === 0),
    onclick: e => {
      tombol.forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      renderResep(detail, nama, entri);
    } }, ref.resep.find(r => r.nama === nama).label_tampilan));
  hasil.replaceChildren(h('h2', {}, 'Resep yang cocok'), h('div', { class: 'pilihan' }, ...tombol), detail);
  hasil.hidden = false;
  renderResep(detail, opsi[0], entri);
  hasil.scrollIntoView({ behavior: 'smooth' });
});

// ---------- Detail resep: bahan pendukung, perlakuan, alat, langkah, jadwal ----------
function renderResep(wadah, namaResep, entri) {
  const ref = C.ref();
  const items = entri.map(e => ({ nama_sampah: e.nama_sampah, berat: e.berat_gram }));
  const cl = C.hitungChecklistBaru({}, C.hitungBahanPendukung(items, namaResep));
  const jadwal = C.hitungJadwal(namaResep);
  const total = items.reduce((a, i) => a + i.berat, 0);

  const bahan = Object.entries(cl).map(([k, c]) => {
    const b = C.teksBahan(k);
    return h('li', {}, `${b.teks}: `, h('span', { class: 'jumlah' }, `${c.jumlah.toLocaleString('id-ID')} ${b.satuan}`));
  });
  const perl = entri.map(e => ({ e, p: C.perlakuan(e.nama_sampah, namaResep) })).filter(x => x.p.instruksi)
    .map(({ e, p }) => h('li', {}, h('strong', {}, ref.peta.get(e.nama_sampah).label_tampilan + ': '),
      p.wajib ? h('span', { class: 'wajib' }, 'Wajib. ') : null, p.instruksi));
  const alat = ref.alat_modifikasi.filter(a => a.nama_resep === namaResep).flatMap(a => [
    h('h3', {}, a.nama_komponen), h('ol', {}, ...a.spesifikasi.map(t => h('li', {}, t)))]);
  const langkah = ref.langkah_resep.filter(l => l.nama_resep === namaResep)
    .sort((a, b) => a.urutan - b.urutan).map(l => h('li', {}, l.detail_langkah));
  const tgl = iso => new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  wadah.replaceChildren(
    h('div', { class: 'kartu' }, h('h2', {}, 'Bahan pendukung'),
      h('p', { class: 'catatan' }, `Untuk total ${total.toLocaleString('id-ID')} g sampah organik.`),
      bahan.length ? h('ul', {}, ...bahan) : h('p', {}, 'Tidak ada bahan pendukung yang perlu disiapkan.')),
    perl.length ? h('div', { class: 'kartu' }, h('h2', {}, 'Siapkan sampahnya'), h('ul', {}, ...perl)) : null,
    h('div', { class: 'kartu' }, h('h2', {}, 'Wadah yang perlu dimodifikasi'), ...alat),
    h('div', { class: 'kartu' }, h('h2', {}, 'Langkah pengolahan'), h('ol', {}, ...langkah)),
    h('div', { class: 'kartu' }, h('h2', {}, 'Perkiraan jadwal'),
      h('p', {}, `Jika dimulai hari ini: matang dalam ${jadwal.estimasi_durasi_hari} hari (${tgl(jadwal.tanggal_matang)}). `
        + `Pengingat setiap ${jadwal.interval_pemantauan_hari} hari selama ${jadwal.durasi_pemantauan_aktif_hari} hari pertama.`)));
}

// ---------- Mulai ----------
try {
  const res = await fetch('data/data-referensi-snapcompost.json');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  C.muatReferensi(await res.json());
  renderSaran();
} catch (err) {
  $('#galat').hidden = false;
  $('#galat').textContent = 'Data referensi gagal dimuat: ' + err.message + '. Jalankan lewat server lokal, bukan membuka file langsung.';
}
