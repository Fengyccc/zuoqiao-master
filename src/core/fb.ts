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

// ---- home 位置常量与「标准参照系」映射 ----

const HOME_EDGE_PERM = encodePerm3([7, 9, 11], 12); // DL=7, FL=9, BL=11
const HOME_CORNER_PERM = encodePerm2([7, 6], 8); // DLF=7, DBL=6

/** 该坐标的 5 个 piece 是否都位于 home 位置（即「某朝向下的已还原」坐标） */
export function isHomePositions(coord: number): boolean {
  return (coord & 0x7ff) === HOME_EDGE_PERM && ((coord >> 14) & 0x3f) === HOME_CORNER_PERM;
}

/**
 * 把 coord 映射到「标准已还原（朝向全 0）」参照系：减去 targetCoord 的朝向偏移（棱按位 XOR、角 mod-3 相减），位置不变。
 * 仅当 targetCoord 处于 home 位置时有效。移动群对朝向的作用与逐块朝向偏移可交换，
 * 故 dist(coord, targetCoord) == dist(mapToSolvedFrame(coord, targetCoord), solvedFbCoord)。
 */
export function mapToSolvedFrame(coord: number, targetCoord: number): number {
  const edgeOri = ((coord >> 11) & 0x7) ^ ((targetCoord >> 11) & 0x7);
  const cornerOri = (coord >> 20) & 0xf;
  const tCornerOri = (targetCoord >> 20) & 0xf;
  const co0 = cornerOri % 3;
  const co1 = (cornerOri - co0) / 3;
  const tco0 = tCornerOri % 3;
  const tco1 = (tCornerOri - tco0) / 3;
  const nco0 = (co0 - tco0 + 3) % 3;
  const nco1 = (co1 - tco1 + 3) % 3;
  // 清除朝向位（bits 11-13 棱、bits 20-23 角），保留位置位
  const cleared = coord & (0xffffff & ~((0x7 << 11) | (0xf << 20)));
  return cleared | (edgeOri << 11) | ((nco0 + 3 * nco1) << 20);
}

// ---- 预计算转动迁移表（消除 applyMoveToFb 高频调用里的排列解码/编码与除法/取模） ----
// 由 cube.ts 的 EDGE_PERM/EDGE_ORI/CORNER_PERM/CORNER_ORI 一次性推导，模块加载时构建。

const EDGE_PERM_TRANS: Uint16Array[] = [];
const EDGE_FLIP: Uint8Array[] = [];
const CORNER_PERM_TRANS: Uint8Array[] = [];
const CORNER_ORI_ADD: Uint8Array[] = [];

(function buildTransitionTables() {
  const moveCount = EDGE_PERM.length;
  for (let m = 0; m < moveCount; m++) {
    const ep = new Uint16Array(1320);
    const ef = new Uint8Array(1320);
    for (let p = 0; p < 1320; p++) {
      const [e0, e1, e2] = decodePerm3(p, 12);
      ep[p] = encodePerm3([EDGE_PERM[m][e0], EDGE_PERM[m][e1], EDGE_PERM[m][e2]], 12);
      ef[p] = EDGE_ORI[m][e0] | (EDGE_ORI[m][e1] << 1) | (EDGE_ORI[m][e2] << 2);
    }
    EDGE_PERM_TRANS.push(ep);
    EDGE_FLIP.push(ef);

    const cp = new Uint8Array(56);
    const ca = new Uint8Array(56 * 9);
    for (let p = 0; p < 56; p++) {
      const [c0, c1] = decodePerm2(p, 8);
      cp[p] = encodePerm2([CORNER_PERM[m][c0], CORNER_PERM[m][c1]], 8);
      const d0 = CORNER_ORI[m][c0];
      const d1 = CORNER_ORI[m][c1];
      for (let o = 0; o < 9; o++) {
        const co0 = o % 3;
        const co1 = (o - co0) / 3;
        ca[p * 9 + o] = ((co0 + d0) % 3) + 3 * ((co1 + d1) % 3);
      }
    }
    CORNER_PERM_TRANS.push(cp);
    CORNER_ORI_ADD.push(ca);
  }
})();

/** 对 FB 坐标应用一个转动，返回新坐标（查表，高频调用） */
export function applyMoveToFb(coord: number, move: number): number {
  const edgePerm = coord & 0x7ff;
  const edgeOri = (coord >> 11) & 0x7;
  const cornerPerm = (coord >> 14) & 0x3f;
  const cornerOri = (coord >> 20) & 0xf;

  const newEdgePerm = EDGE_PERM_TRANS[move][edgePerm];
  const newEdgeOri = edgeOri ^ EDGE_FLIP[move][edgePerm];
  const newCornerPerm = CORNER_PERM_TRANS[move][cornerPerm];
  const newCornerOri = CORNER_ORI_ADD[move][cornerPerm * 9 + cornerOri];

  return newEdgePerm | (newEdgeOri << 11) | (newCornerPerm << 14) | (newCornerOri << 20);
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
