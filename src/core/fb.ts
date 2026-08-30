/**
 * FB（左桥 / First Block）坐标。
 *
 * 左桥 = 左侧的 1×2×3 区域（D 层 + E 层，不含 U 层），由 3 个棱块（DL, FL, BL）+ 2 个角块（DLF, DBL）构成。
 * 本模块只关心这 5 个 piece 的位置与朝向，忽略其余 15 个 piece。
 *
 * 坐标编码（24 位整数，位打包，便于用位运算高速解码）：
 *   bits  0-10 : 3 棱排列索引 12P3 = 1320 (11 bits)
 *   bits 11-13 : 3 棱朝向 2^3 = 8 (3 bits)
 *   bits 14-19 : 2 角排列索引 8P2 = 56 (6 bits)
 *   bits 20-23 : 2 角朝向 3^2 = 9 (4 bits)
 *
 * 逻辑状态数 = 1320 * 8 * 56 * 9 = 5,322,240；坐标空间 = 2^24（含空洞）。
 */

import {
  FB_EDGES,
  FB_CORNERS,
  EDGE_PERM,
  EDGE_ORI,
  CORNER_PERM,
  CORNER_ORI,
  faceletToCubie,
  type Cubie,
} from './cube';
import type { Facelet } from './moves';

export const FB_STATE_COUNT = 1320 * 8 * 56 * 9; // 逻辑状态数
export const FB_COORD_SPACE = 1 << 24; // dist 数组大小

// ---- 排列编解码（从 n 个元素中选 k 个的排列，字典序） ----

function encodePerm3(p: [number, number, number], n: number): number {
  const r0 = p[0];
  const r1 = p[1] - (p[1] > p[0] ? 1 : 0);
  const lo = p[0] < p[1] ? p[0] : p[1];
  const hi = p[0] < p[1] ? p[1] : p[0];
  const r2 = p[2] - (p[2] > lo ? 1 : 0) - (p[2] > hi ? 1 : 0);
  return r0 * (n - 1) * (n - 2) + r1 * (n - 2) + r2;
}

function decodePerm3(idx: number, n: number): [number, number, number] {
  const r0 = Math.floor(idx / ((n - 1) * (n - 2)));
  const rem = idx % ((n - 1) * (n - 2));
  const r1 = Math.floor(rem / (n - 2));
  const r2 = rem % (n - 2);
  const p0 = r0;
  const p1 = r1 < p0 ? r1 : r1 + 1;
  const lo = p0 < p1 ? p0 : p1;
  const hi = p0 < p1 ? p1 : p0;
  let p2 = r2;
  if (p2 >= lo) p2++;
  if (p2 >= hi) p2++;
  return [p0, p1, p2];
}

function encodePerm2(p: [number, number], n: number): number {
  const r0 = p[0];
  const r1 = p[1] - (p[1] > p[0] ? 1 : 0);
  return r0 * (n - 1) + r1;
}

function decodePerm2(idx: number, n: number): [number, number] {
  const r0 = Math.floor(idx / (n - 1));
  const r1 = idx % (n - 1);
  const p0 = r0;
  const p1 = r1 < p0 ? r1 : r1 + 1;
  return [p0, p1];
}

// ---- cubie <-> FB 坐标 ----

/**
 * 从 cubie 提取任意 5 个 piece 的 FB 坐标。
 * 坐标是「位置」导向的：edges 顺序须为 DL/FL/BL、corners 顺序须为 DLF/DBL，
 * 这样「已还原」位置恒为 [7,9,11] 与 [7,6]（见 solvedFbCoord），与具体 piece 身份无关。
 */
export function cubieToFbCoordGeneric(
  c: Cubie,
  edges: readonly [number, number, number],
  corners: readonly [number, number],
): number {
  const e0 = c.ep.indexOf(edges[0]);
  const e1 = c.ep.indexOf(edges[1]);
  const e2 = c.ep.indexOf(edges[2]);
  const c0 = c.cp.indexOf(corners[0]);
  const c1 = c.cp.indexOf(corners[1]);

  const edgePerm = encodePerm3([e0, e1, e2], 12);
  const edgeOri = c.eo[e0] + 2 * c.eo[e1] + 4 * c.eo[e2];
  const cornerPerm = encodePerm2([c0, c1], 8);
  const cornerOri = c.co[c0] + 3 * c.co[c1];

  return edgePerm | (edgeOri << 11) | (cornerPerm << 14) | (cornerOri << 20);
}

/** 从 cubie 提取标准 FB 坐标（黄底橙桥的 5 个 piece） */
export function cubieToFbCoord(c: Cubie): number {
  return cubieToFbCoordGeneric(c, FB_EDGES, FB_CORNERS);
}

/** 从 facelet 直接提取 FB 坐标 */
export function faceletToFbCoord(f: Facelet): number {
  return cubieToFbCoord(faceletToCubie(f));
}

/** 从 facelet 直接提取任意 5 个 piece 的 FB 坐标 */
export function faceletToFbCoordGeneric(
  f: Facelet,
  edges: readonly [number, number, number],
  corners: readonly [number, number],
): number {
  return cubieToFbCoordGeneric(faceletToCubie(f), edges, corners);
}

/** FB 已还原状态的坐标（5 个 piece 全部归位、朝向正确） */
export function solvedFbCoord(): number {
  return solvedFbCoordWithOrientations([0, 0, 0], [0, 0]);
}

/**
 * 构造「5 个 piece 全部归位（DL/FL/BL + DLF/DBL）、指定朝向」的 FB 坐标。
 * 标准朝向（中心未重定向）时棱角朝向均为 0；双底四色桥的非标准朝向会重定向中心，
 * 此时「还原」的棱角朝向不再全为 0，需由中心朝向反推出正确朝向（见 bridge.ts）。
 */
export function solvedFbCoordWithOrientations(
  edgeOri: readonly [number, number, number],
  cornerOri: readonly [number, number],
): number {
  const edgePerm = encodePerm3([7, 9, 11], 12); // DL=7, FL=9, BL=11
  const cornerPerm = encodePerm2([7, 6], 8); // DLF=7, DBL=6
  const edgeOriBits = edgeOri[0] | (edgeOri[1] << 1) | (edgeOri[2] << 2);
  const cornerOriBits = cornerOri[0] + 3 * cornerOri[1];
  return edgePerm | (edgeOriBits << 11) | (cornerPerm << 14) | (cornerOriBits << 20);
}

/** 对 FB 坐标应用一个转动，返回新坐标（位运算解码，高频调用） */
export function applyMoveToFb(coord: number, move: number): number {
  const edgePerm = coord & 0x7ff;
  const edgeOri = (coord >> 11) & 0x7;
  const cornerPerm = (coord >> 14) & 0x3f;
  const cornerOri = (coord >> 20) & 0xf;

  const [e0, e1, e2] = decodePerm3(edgePerm, 12);
  const eo0 = edgeOri & 1;
  const eo1 = (edgeOri >> 1) & 1;
  const eo2 = (edgeOri >> 2) & 1;
  const [c0, c1] = decodePerm2(cornerPerm, 8);
  const co0 = cornerOri % 3;
  const co1 = (cornerOri - co0) / 3;

  const ne0 = EDGE_PERM[move][e0];
  const neo0 = eo0 ^ EDGE_ORI[move][e0];
  const ne1 = EDGE_PERM[move][e1];
  const neo1 = eo1 ^ EDGE_ORI[move][e1];
  const ne2 = EDGE_PERM[move][e2];
  const neo2 = eo2 ^ EDGE_ORI[move][e2];
  const nc0 = CORNER_PERM[move][c0];
  const nco0 = (co0 + CORNER_ORI[move][c0]) % 3;
  const nc1 = CORNER_PERM[move][c1];
  const nco1 = (co1 + CORNER_ORI[move][c1]) % 3;

  const nEdgePerm = encodePerm3([ne0, ne1, ne2], 12);
  const nEdgeOri = neo0 | (neo1 << 1) | (neo2 << 2);
  const nCornerPerm = encodePerm2([nc0, nc1], 8);
  const nCornerOri = nco0 + 3 * nco1;

  return nEdgePerm | (nEdgeOri << 11) | (nCornerPerm << 14) | (nCornerOri << 20);
}

/** 解码 FB 坐标成 5 个 piece 的位置/朝向（供调试与解释使用） */
export function decodeFbCoord(
  coord: number,
): { edges: { pos: number; ori: number }[]; corners: { pos: number; ori: number }[] } {
  const edgePerm = coord & 0x7ff;
  const edgeOri = (coord >> 11) & 0x7;
  const cornerPerm = (coord >> 14) & 0x3f;
  const cornerOri = (coord >> 20) & 0xf;

  const [e0, e1, e2] = decodePerm3(edgePerm, 12);
  const eo0 = edgeOri & 1;
  const eo1 = (edgeOri >> 1) & 1;
  const eo2 = (edgeOri >> 2) & 1;
  const [c0, c1] = decodePerm2(cornerPerm, 8);
  const co0 = cornerOri % 3;
  const co1 = (cornerOri - co0) / 3;

  return {
    edges: [
      { pos: e0, ori: eo0 },
      { pos: e1, ori: eo1 },
      { pos: e2, ori: eo2 },
    ],
    corners: [
      { pos: c0, ori: co0 },
      { pos: c1, ori: co1 },
    ],
  };
}
