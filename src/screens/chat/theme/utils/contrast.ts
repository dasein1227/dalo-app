// src/screens/chat/theme/utils/contrast.ts

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB | null {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;

  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return null;

  return { r, g, b };
}

function rgbaToRgb(input: string): RGB | null {
  const s = String(input || '').trim();
  const m = s.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i,
  );
  if (!m) return null;

  const r = Math.round(Number(m[1]));
  const g = Math.round(Number(m[2]));
  const b = Math.round(Number(m[3]));
  if (![r, g, b].every(Number.isFinite)) return null;

  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
  };
}

function parseColorToRgb(input: string): RGB | null {
  const c = String(input || '').trim();
  if (!c) return null;

  if (c.startsWith('#')) return hexToRgb(c);
  if (c.toLowerCase().startsWith('rgb')) return rgbaToRgb(c);

  // 기타 포맷(예: 'transparent', 'red', etc.)은 여기서 안전하게 null 처리
  return null;
}

// --- WCAG-style relative luminance / contrast (sRGB) ---
function srgbToLinear(u: number) {
  const s = u / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relLuminance(rgb: RGB) {
  const R = srgbToLinear(rgb.r);
  const G = srgbToLinear(rgb.g);
  const B = srgbToLinear(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function luminance(color: string) {
  const rgb = parseColorToRgb(color);
  if (!rgb) return 0.5;
  return clamp01(relLuminance(rgb));
}

function contrastRatio(bg: string, fg: string) {
  const b = parseColorToRgb(bg);
  const f = parseColorToRgb(fg);

  // 파싱 실패 시 “중간값”으로 보수적으로 처리
  const Lb = b ? relLuminance(b) : 0.5;
  const Lf = f ? relLuminance(f) : 0.5;

  const L1 = Math.max(Lb, Lf);
  const L2 = Math.min(Lb, Lf);
  return (L1 + 0.05) / (L2 + 0.05);
}

/**
 * 지정 알파로 색상을 rgba로 변환/덮어쓰기
 * - 입력이 #RRGGBB / rgb() / rgba() 일 때 처리
 * - 그 외 포맷은 그대로 반환(안전)
 */
export function withAlpha(color: string, alpha: number) {
  const a = clamp01(Number(alpha));
  const s = String(color || '').trim();
  if (!s) return `rgba(0,0,0,${a})`;

  const rgb = parseColorToRgb(s);
  if (rgb) return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;

  // rgba()에서 알파만 교체
  const m = s.match(
    /^rgba\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/i,
  );
  if (m) {
    const r = Math.round(Number(m[1]));
    const g = Math.round(Number(m[2]));
    const b = Math.round(Number(m[3]));
    if ([r, g, b].every(Number.isFinite)) return `rgba(${r},${g},${b},${a})`;
  }

  return s;
}

/**
 * 배경색(bgColor)에 대해 “가독성 높은” 텍스트 색상(라이트/다크)을 선택
 * - 기본 후보: 다크(#0F1115) vs 라이트(#FFFFFF)
 * - 둘 중 대비(contrast ratio)가 더 높은 쪽 선택
 */
export function pickReadableTextColor(bgColor: string) {
  const bg = String(bgColor || '').trim();
  if (!bg) return '#0F1115';

  const dark = '#0F1115';
  const light = '#FFFFFF';

  const cd = contrastRatio(bg, dark);
  const cl = contrastRatio(bg, light);

  return cl >= cd ? light : dark;
}

/**
 * 배경색(bgColor)에 따라 “은은한(muted)” 텍스트 컬러를 선택
 * - readable 컬러 기반으로 알파만 낮춤
 */
export function pickMutedTextColor(bgColor: string, alpha = 0.72) {
  const base = pickReadableTextColor(bgColor);
  return withAlpha(base, alpha);
}

/**
 * 배경색(bgColor)에 따라 "메타 텍스트(시간 등)" 색을 선택
 * - 완전 흰/검정 대신 차콜/슬레이트/오프화이트 계열
 * - 쉐도우 없이도 최대한 읽히는 알파 범위
 */
export function pickMetaTextColor(bgColor: string) {
  const lum = luminance(bgColor);

  // 밝은 배경: 차콜/슬레이트
  if (lum > 0.86) return 'rgba(22, 24, 30, 0.56)';
  if (lum > 0.72) return 'rgba(45, 50, 62, 0.54)';

  // 어두운 배경: 오프화이트
  if (lum > 0.52) return 'rgba(232, 236, 244, 0.60)';
  return 'rgba(248, 248, 252, 0.72)';
}
