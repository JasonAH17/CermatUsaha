import { getAll, getById } from './store.js';
import { arusKas, totalSaldo, saldoPihak, ringkasanPiutangUtang, stokItem } from './selectors.js';
import { buildReport } from './reports.js';
import { rupiah, toDateKey } from '../utils/format.js';

const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
const sisa = (t) => t.total - (t.dibayar ?? t.total);

export function getInsights() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const today = toDateKey(now);
  const startThis = toDateKey(new Date(y, m, 1));
  const startPrev = toDateKey(new Date(y, m - 1, 1));
  const samePrev = toDateKey(new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate())));

  const trx = getAll('transaksi');
  const out = [];

  // 1. Penjualan dibanding periode yang sama bulan lalu
  const jual = (from, to) =>
    sum(trx.filter((t) => t.jenis === 'penjualan' && t.tanggal >= from && t.tanggal <= to), (t) => t.total);
  const jualNow = jual(startThis, today);
  const jualPrev = jual(startPrev, samePrev);
  if (jualPrev > 0) {
    const ch = ((jualNow - jualPrev) / jualPrev) * 100;
    if (Math.abs(ch) >= 5) {
      out.push({
        priority: ch < 0 ? 2 : 4,
        tone: ch >= 0 ? 'good' : 'bad',
        icon: ch >= 0 ? 'trending_up' : 'trending_down',
        title: `Penjualan ${ch >= 0 ? 'naik' : 'turun'} ${Math.abs(Math.round(ch))}%`,
        text: `${rupiah(jualNow)} bulan ini vs ${rupiah(jualPrev)} di periode yang sama bulan lalu.`,
        ask: ch < 0
          ? 'Kenapa penjualan saya turun dan apa yang bisa saya lakukan?'
          : 'Bagaimana cara mempertahankan kenaikan penjualan ini?',
      });
    }
  }

  // 2. Laba bersih bulan ini
  const lr = buildReport('labarugi', { from: startThis, to: today });
  const pendapatan = lr.summary[0].value;
  const bersih = lr.rows.find((r) => r._style === 'total')?.jumlah ?? 0;
  if (pendapatan > 0) {
    out.push({
      priority: bersih < 0 ? 1 : 5,
      tone: bersih < 0 ? 'bad' : 'good',
      icon: bersih < 0 ? 'warning' : 'savings',
      title: bersih < 0 ? 'Usaha sedang rugi bulan ini' : `Laba bersih ${rupiah(bersih)}`,
      text: bersih < 0
        ? `Biaya lebih besar dari laba kotor. Rugi ${rupiah(-bersih)} sejauh ini.`
        : `Margin bersih ${Math.round((bersih / pendapatan) * 100)}% dari pendapatan bulan ini.`,
      ask: 'Analisis laba rugi saya bulan ini dan cara meningkatkan margin.',
    });
  }

  // 3. Tagihan lewat jatuh tempo
  const overdue = {};
  trx
    .filter((t) => t.jenis === 'penjualan' && t.pihakId && t.jatuhTempo && t.jatuhTempo <= today && sisa(t) > 0)
    .forEach((t) => { overdue[t.pihakId] = (overdue[t.pihakId] || 0) + sisa(t); });

  const telat = Object.entries(overdue)
    .map(([id, v]) => ({ p: getById('pihak', id), v: Math.min(v, saldoPihak(id)) }))
    .filter((x) => x.p && x.v > 0)
    .sort((a, b) => b.v - a.v);

  if (telat.length) {
    out.push({
      priority: 1,
      tone: 'warn',
      icon: 'schedule',
      title: `${telat.length} tagihan lewat jatuh tempo`,
      text: `Total ${rupiah(sum(telat, (x) => x.v))}. Terbesar: ${telat[0].p.nama} (${rupiah(telat[0].v)}).`,
      href: `#/pihak/${telat[0].p.id}`,
      cta: 'Tagih sekarang',
    });
  } else {
    const pu = ringkasanPiutangUtang();
    if (pu.terima > 0) {
      out.push({
        priority: 6,
        tone: 'info',
        icon: 'account_balance_wallet',
        title: `Piutang ${rupiah(pu.terima)}`,
        text: 'Belum ada tagihan yang lewat jatuh tempo. Tetap pantau pembayaran pelanggan.',
        href: '#/pihak',
        cta: 'Lihat kontak',
      });
    }
  }

  // 4. Stok menipis
  const low = getAll('item').filter((it) => stokItem(it.id) <= (it.stokMin || 0));
  if (low.length) {
    out.push({
      priority: 2,
      tone: 'warn',
      icon: 'inventory',
      title: `${low.length} barang perlu dibeli lagi`,
      text: `${low.slice(0, 3).map((it) => it.nama).join(', ')}${low.length > 3 ? ', dan lainnya' : ''}.`,
      href: '#/inventaris',
      cta: 'Cek stok',
    });
  }

  // 5. Pengeluaran terbesar
  const biaya = lr.rows.filter((r) => r._style === 'sub');
  const totalBiaya = -(lr.rows.find((r) => r.ket === 'Total biaya operasional')?.jumlah || 0);
  if (biaya.length && totalBiaya > 0) {
    const top = biaya[0];
    out.push({
      priority: 5,
      tone: 'info',
      icon: 'pie_chart',
      title: `${top.ket} jadi biaya terbesar`,
      text: `${rupiah(-top.jumlah)} (${Math.round((-top.jumlah / totalBiaya) * 100)}% dari biaya operasional bulan ini).`,
      ask: `Bagaimana cara menghemat biaya ${top.ket.toLowerCase()} di usaha saya?`,
    });
  }

  // 6. Ketahanan kas
  const from30 = toDateKey(new Date(y, m, d - 29));
  const keluar30 = sum(
    trx.filter((t) => t.tanggal >= from30 && t.tanggal <= today && arusKas(t) < 0),
    (t) => -arusKas(t)
  );
  if (keluar30 > 0) {
    const perHari = keluar30 / 30;
    const hari = Math.floor(totalSaldo() / perHari);
    const kritis = hari < 14;
    out.push({
      priority: kritis ? 1 : 7,
      tone: kritis ? 'bad' : 'good',
      icon: 'hourglass_bottom',
      title: kritis
        ? `Kas hanya cukup ~${Math.max(hari, 0)} hari`
        : `Kas aman ${hari > 365 ? 'lebih dari setahun' : `~${hari} hari`}`,
      text: `Dihitung dari rata-rata uang keluar ${rupiah(Math.round(perHari))}/hari selama 30 hari terakhir.`,
      ask: 'Bagaimana cara menjaga arus kas usaha saya tetap aman?',
    });
  }

  // 7. Item terlaris
  const pj = buildReport('penjualan', { from: startThis, to: today });
  if (pj.rows.length) {
    const top = pj.rows[0];
    out.push({
      priority: 6,
      tone: 'good',
      icon: 'star',
      title: `Terlaris: ${top.nama}`,
      text: `Terjual ${top.qty} dengan omzet ${rupiah(top.omzet)} bulan ini.`,
      ask: `Bagaimana strategi memaksimalkan penjualan ${top.nama}?`,
    });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, 6);
}