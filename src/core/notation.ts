/**
 * 旋转记号解析与格式化。支持 27 个命名转动（18 面转 + 9 中层转 M/E/S）。
 */

import { MOVE_NAMES, moveIdByName } from './moves';

/** move id -> 记号（如 "U'", "R2"） */
export function moveToString(move: number): string {
  return MOVE_NAMES[move];
}

/** move id 序列 -> 空格分隔的记号串 */
export function movesToString(moves: number[]): string {
  return moves.map(moveToString).join(' ');
}

/** 记号串 -> move id 序列（"R U' F2 M" 等） */
export function parseMoves(input: string): number[] {
  const tokens = input.trim().split(/\s+/).filter((t) => t.length > 0);
  const result: number[] = [];
  for (const t of tokens) {
    const id = moveIdByName(t);
    if (id < 0) {
      throw new Error(`未知转动记号: "${t}"`);
    }
    result.push(id);
  }
  return result;
}

/** 生成一个转动序列的逆序列（用于「应用打乱再应用逆打乱 = 还原」的验证） */
export function invertMoves(moves: number[]): number[] {
  // 每个 move id 的逆：同 base 内 0<->2（1 次<->3 次），1 次(180°) 不变
  return moves.slice().reverse().map((m) => {
    const base = Math.floor(m / 3);
    const turn = m % 3;
    const inv = turn === 0 ? 2 : turn === 2 ? 0 : 1;
    return base * 3 + inv;
  });
}
