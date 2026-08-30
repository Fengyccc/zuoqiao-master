/**
 * 三阶打乱生成与解析 —— 对应 csTimer `333ni`（random-move，非 random-state）。
 *
 * 规则：随机 20 步面转，相邻两步不同面、且不落在同一轴组（U/D、R/L、F/B 各为一组）。
 * 生成即时，无需求解器/剪枝表。
 */

import { applyMoves, solvedFacelet, type Facelet } from './moves';

// 面索引顺序 U,D,R,L,F,B（与 MOVE_NAMES 的 base 顺序一致）
const FACE_AXIS_GROUP = [0, 0, 1, 1, 2, 2]; // U/D=0, R/L=1, F/B=2

/**
 * 生成随机打乱（move id 序列）。
 * @param rng 随机数生成器（默认 Math.random），测试可注入确定性实现
 * @param length 步数，默认 20
 */
export function randomScramble(rng: () => number = Math.random, length = 20): number[] {
  const moves: number[] = [];
  let prevFace = -1;
  let prevAxis = -1;
  while (moves.length < length) {
    const face = Math.floor(rng() * 6);
    if (face === prevFace) continue;
    const axis = FACE_AXIS_GROUP[face];
    if (axis === prevAxis) continue;
    const turn = Math.floor(rng() * 3); // 0=90°, 1=180°, 2=270°(-90°)
    moves.push(face * 3 + turn);
    prevFace = face;
    prevAxis = axis;
  }
  return moves;
}

/** 打乱序列 -> facelet 状态 */
export function scrambleToFacelet(moves: number[]): Facelet {
  return applyMoves(solvedFacelet(), moves);
}
