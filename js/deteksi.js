// deteksi.js — deteksi sampah YOLOv8 di perangkat (ONNX Runtime Web). Tidak menyentuh HTML.
// Keluaran: [{ label, confidence }] (confidence 0–1, satu entri per label) → langsung ke sesi.terimaHasilScan().
//
// Pakai:
//   import * as ort from 'onnxruntime-web';            // atau objek global `ort` dari <script> CDN
//   const detektor = await buatDetektor({
//    ort,
//    urlModel: 'assets/models/best.onnx',
//    urlLabels: 'assets/labels/labels.txt',
//    namaJson: C.ref().sampah_organik.map(s => s.nama),
// });
//                                        
//   sesi.terimaHasilScan(await detektor.deteksi(fileFoto));   // fileFoto: File/Blob dari kamera atau galeri

export const AMBANG_CONFIDENCE = 0.10;   // sama dengan uji Flutter/Python (conf=0.1); di bawah ini tidak ditampilkan ke user
const UKURAN_DEFAULT = 640;              // HARUS sama dengan imgsz saat export ONNX

export const parseLabels = teks => teks.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

// Spesifikasi §9.1: semua kelas model harus ada di `nama` pada data referensi
export function periksaLabel(labels, namaJson) {
  const hilang = labels.filter(l => !namaJson.includes(l));
  if (hilang.length) throw new Error('Label model tidak ada di data referensi: ' + hilang.join(', '));
}

// RGBA (S×S) → float32 CHW 0–1, urutan RGB seperti input YOLOv8
export function rgbaKeFloat(rgba, S) {
  const n = S * S, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4] / 255; out[n + i] = rgba[i * 4 + 1] / 255; out[2 * n + i] = rgba[i * 4 + 2] / 255;
  }
  return out;
}

// Foto → letterbox S×S (rasio asli dijaga, sisi kosong abu-abu 114) → tensor. Perlu canvas (browser).
async function gambarKeFloat(sumber, S) {
  const bmp = sumber instanceof Blob ? await createImageBitmap(sumber, { imageOrientation: 'from-image' }) : sumber; // from-image = patuhi EXIF foto kamera
  try {
    const w = bmp.naturalWidth || bmp.videoWidth || bmp.width, h = bmp.naturalHeight || bmp.videoHeight || bmp.height;
    if (!w || !h) throw new Error('Gambar kosong');
    const skala = Math.min(S / w, S / h), lw = Math.round(w * skala), lh = Math.round(h * skala);
    const kanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
    const g = kanvas.getContext('2d', { willReadFrequently: true });
    g.fillStyle = 'rgb(114,114,114)'; g.fillRect(0, 0, S, S);
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, Math.floor((S - lw) / 2), Math.floor((S - lh) / 2), lw, lh);
    return rgbaKeFloat(g.getImageData(0, 0, S, S).data, S);
  } finally { if (sumber instanceof Blob) bmp.close?.(); }
}

// Keluaran YOLOv8: [1, 4+nc, N] (bawaan export) atau [1, N, 4+nc]; 4 angka pertama = kotak, sisanya skor tiap kelas.
// Spesifikasi hanya memakai label + confidence tertinggi per label (kotak & jumlah objek tidak dipakai),
// jadi NMS tidak diperlukan: skor tertinggi per label sama dengan hasil NMS lalu digabung.
export function ekstrakDeteksi(data, dims, labels, ambang = AMBANG_CONFIDENCE, maks = null) {
  const nc = labels.length, ch = 4 + nc, [, a, b] = dims;
  let N, skor;
  if (a === ch) { N = b; skor = (i, c) => data[(4 + c) * N + i]; }
  else if (b === ch) { N = a; skor = (i, c) => data[i * ch + 4 + c]; }
  else throw new Error(`Bentuk keluaran model [${dims}] tidak cocok dengan ${nc} label. Periksa labels.txt dan model.`);
  const terbaik = new Map();
  for (let i = 0; i < N; i++) for (let c = 0; c < nc; c++) {
    const s = skor(i, c);
    if (s >= ambang && s > (terbaik.get(c) ?? 0)) terbaik.set(c, s);
  }
  const hasil = [...terbaik].map(([c, s]) => ({ label: labels[c], confidence: s })).sort((x, y) => y.confidence - x.confidence);
  return maks ? hasil.slice(0, maks) : hasil; // maks = null → tampilkan semua yang lolos ambang
}

export async function buatDetektor({ ort, urlModel, urlLabels, namaJson = null, ukuran = UKURAN_DEFAULT,
  ambang = AMBANG_CONFIDENCE, maks = null, executionProviders = ['wasm'], wasmPaths = null }) {
  if (wasmPaths) ort.env.wasm.wasmPaths = wasmPaths;
  let labels, model;
  try {
    const res = await fetch(urlLabels);
    if (!res.ok) throw new Error('labels.txt HTTP ' + res.status);
    labels = parseLabels(await res.text());
    if (namaJson) periksaLabel(labels, namaJson);
    model = await ort.InferenceSession.create(urlModel, { executionProviders });
  } catch (e) { throw new Error('Model deteksi gagal dimuat: ' + e.message); }

  const [namaIn, namaOut] = [model.inputNames[0], model.outputNames[0]];
  let sibuk = false; // cegah dua deteksi bersamaan (ketuk ganda)
  return {
    labels, ukuran, ambang, maks,
    async deteksi(sumber) {
      if (sibuk) throw new Error('Deteksi sedang berjalan');
      sibuk = true;
      try {
        const tensor = new ort.Tensor('float32', await gambarKeFloat(sumber, ukuran), [1, 3, ukuran, ukuran]);
        const out = (await model.run({ [namaIn]: tensor }))[namaOut];
        return ekstrakDeteksi(out.data, out.dims, labels, ambang, maks);
      } finally { sibuk = false; }
    },
  };
}
