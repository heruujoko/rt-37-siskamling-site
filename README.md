# Situs Jadwal Siskamling RT 37

Situs statis untuk menampilkan jadwal ronda bulanan. Tanpa framework, tanpa
build step, tanpa server API — cukup berkas HTML/CSS/JS dan aset JSON.

## Pratinjau lokal

Dari root repositori:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory exports/website
```

Lalu buka <http://127.0.0.1:8000/> di peramban.

## Rilis bulan baru

Cukup salin satu berkas JSON jadwal bulan tersebut ke folder aset, tanpa
mengubah apa pun yang lain. Nama berkas harus mengikuti pola (huruf kecil):

```
siskamling-schedule-<bulan>-<tahun>.json
   contoh: siskamling-schedule-november-2026.json
```

```sh
cp siskamling-schedule-november-2026.json exports/website/assets/schedules/
```

Bulan yang belum tersedia akan menampilkan "Jadwal belum tersedia" di situs,
dan otomatis muncul begitu berkasnya disalin. Tidak ada manifest atau build
step yang perlu diperbarui.

## Pembaruan data warga (nama / nomor rumah)

Jalankan helper ekspor **hanya saat metadata roster berubah** (nama atau nomor
rumah baru/berubah):

```sh
python3 helpers/export_website_roster.py
```

Helper ini menulis ulang `exports/website/assets/people.json` (hanya field
`name` dan `houseNumber`) dan menyalin ulang tiga berkas jadwal yang sudah
ada. Helper ini **bukan** prasyarat rilis bulan baru — rilis bulan baru hanya
perlu menyalin JSON jadwal.

## Privasi dan penyebaran

- **Sebarkan HANYA direktori `exports/website/`**, tidak pernah root
  repositori. JSON sumber di root berisi nomor telepon dan catatan pribadi
  warga; folder `exports/website/` sudah difilter (nama + nomor rumah saja).
- Jangan pernah menyalin `siskamling-groups-30-enriched.json` atau berkas
  sumber lain ke dalam `exports/website/`.
- Nama dan nomor rumah tetap merupakan data pribadi warga yang dipublikasikan
  sebatas kebutuhan jadwal; jangan tambahkan field lain tanpa persetujuan.
- Tanpa analitik, tanpa service worker, tanpa tautan telepon.

## Publikasi (GitHub Pages)

Situs dipublikasikan sebagai **mirror** ke repositori publik
`heruujoko/rt-37-siskamling-site` (GitHub Pages). Repositori privat ini tetap
menjadi sumber kebenaran:

```sh
python3 helpers/publish_site.py
```

Helper menyalin isi folder ini ke checkout gitignored `.site-mirror/`, commit,
dan push ke `main` repositori publik. Sebelum push, helper memeriksa ulang
bahwa tidak ada nomor telepon atau catatan pribadi yang ikut tersalin. Situs
terbit di `https://heruujoko.github.io/rt-37-siskamling-site/`.

## Log perubahan keluaran turunan Dasawisma

- 2026-10-21 — Ekspor turunan awal untuk situs web: `exports/website/assets/people.json`
  (nama + nomor rumah, disaring dari `siskamling-groups-30-enriched.json`) dan salinan
  JSON jadwal Agustus–Oktober 2026 ke `exports/website/assets/schedules/`.
  Tidak ada perubahan aturan kelayakan.
