/**
 * 成绩统计 —— ao5 / ao12 平均与时间格式化（纯函数，无副作用）。
 */

/** 去掉最好与最坏，剩余取平均（csTimer ao5/ao12 规则）。不足 size 个返回 null */
export function averageOf(times: number[], size: number): number | null {
  if (times.length < size) return null;
  const window = times.slice(-size);
  const sorted = [...window].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);
  const sum = trimmed.reduce((a, b) => a + b, 0);
  return sum / trimmed.length;
}

export function ao5(times: number[]): number | null {
  return averageOf(times, 5);
}

export function ao12(times: number[]): number | null {
  return averageOf(times, 12);
}

/** 毫秒 -> "12.34" / "1:23.45"（0.01s 精度，csTimer 风格） */
export function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const centis = Math.floor((ms % 1000) / 10);
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  if (min >= 1) return `${min}:${pad(sec, 2)}.${pad(centis, 2)}`;
  return `${sec}.${pad(centis, 2)}`;
}
