// Aturan tata letak runner yang perlu diukur ("tidak menutupi layar"), sebagai fungsi murni
// atas kotak {left, top, right, bottom} supaya bisa diuji tanpa browser; panel memanggilnya dengan
// getBoundingClientRect().

/** Tutupan panel atas screenshot dalam px horizontal (0 bila tidak bertumpuk secara vertikal). */
export function tutupan(shot, panel) {
  if (!shot || !panel) return 0
  if (panel.bottom <= shot.top || panel.top >= shot.bottom) return 0
  return Math.max(0, Math.min(shot.right, panel.right) - Math.max(shot.left, panel.left))
}

/** Kotak cincin target (px halaman) dari bbox relatif 0–1 dan kotak screenshot; `luar` = jarak bingkai. */
export function kotakCincin(target, shot, luar = 5) {
  const b = target?.bbox
  if (!b || !shot) return null
  const w = shot.right - shot.left
  const h = shot.bottom - shot.top
  return {
    left: shot.left + b.x * w - luar,
    top: shot.top + b.y * h - luar,
    right: shot.left + (b.x + b.w) * w + luar,
    bottom: shot.top + (b.y + b.h) * h + luar,
  }
}

export const bertumpuk = (a, b) =>
  !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** true bila cincin target (pada tata letak biasa) tertutup salah satu panel → screenshot digeser. */
export function perluGeser(target, shot, panels = []) {
  const c = kotakCincin(target, shot)
  return !!c && panels.some((p) => bertumpuk(c, p))
}
