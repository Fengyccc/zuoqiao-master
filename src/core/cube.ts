/**
 * cubie 表示（12 棱 + 8 角）与 facelet 表示的互换，以及 cubie 转动表。
 *
 * 注意：本表示的完备性前提是「中心块不被移动」，即只使用 18 个面转
 * （U D R L F B 及其变体）。中层转 M/E/S 会移动中心，MVP 求解器不使用。
 *
 * 身份与朝向：
 *   - 棱朝向 eo=0 当且仅当该棱的主色贴纸位于主色所在轴（U/D 棱看 z 轴，中层棱看 y 轴）。
 *   - 角朝向 co = 主色(U/D 色)贴纸所在面：0=U/D 面，1=F/B 面，2=R/L 面。
 */

import {
  type Facelet,
  type Vec3,
  FACE_U,
  FACE_R,
  FACE_F,
  FACE_D,
  FACE_L,
  FACE_B,
  MOVE_PERMS,
  solvedFacelet,
  applyMove,
  stickerIndex,
} from './moves';

// 面法向量（与 moves.ts 内部一致）
const NORMALS: Vec3[] = [
  [0, 0, 1], // U
  [1, 0, 0], // R
  [0, 1, 0], // F
  [0, 0, -1], // D
  [-1, 0, 0], // L
  [0, -1, 0], // B
];
export interface Cubie {
  cp: Int8Array; // 8 角位置 -> 角身份 (0-7)
  co: Int8Array; // 8 角朝向 (0-2)
  ep: Int8Array; // 12 棱位置 -> 棱身份 (0-11)
  eo: Int8Array; // 12 棱朝向 (0-1)
}

// ---- 位置定义（pos 为中心坐标，faces 为该位置的面） ----

const EDGE_POS: Vec3[] = [
  [0, 1, 1], [1, 0, 1], [0, -1, 1], [-1, 0, 1], // UF UR UB UL
  [0, 1, -1], [1, 0, -1], [0, -1, -1], [-1, 0, -1], // DF DR DB DL
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], // FR FL BR BL
];
export const EDGE_FACES: [number, number][] = [
  [FACE_U, FACE_F], [FACE_U, FACE_R], [FACE_U, FACE_B], [FACE_U, FACE_L],
  [FACE_D, FACE_F], [FACE_D, FACE_R], [FACE_D, FACE_B], [FACE_D, FACE_L],
  [FACE_F, FACE_R], [FACE_F, FACE_L], [FACE_B, FACE_R], [FACE_B, FACE_L],
];

const CORNER_POS: Vec3[] = [
  [1, 1, 1], [1, -1, 1], [-1, -1, 1], [-1, 1, 1], // UFR URB UBL ULF
  [1, 1, -1], [1, -1, -1], [-1, -1, -1], [-1, 1, -1], // DRF DBR DBL DLF
];
// 每个角位置 3 个面的「顺时针」顺序（沿体对角线看，与 kociemba 约定一致）：
// 第一面是 U/D 面，第二、三面按顺时针排列。这是 co 循环移位正确性的关键。
export const CORNER_FACES: [number, number, number][] = [
  [FACE_U, FACE_R, FACE_F], [FACE_U, FACE_B, FACE_R], [FACE_U, FACE_L, FACE_B], [FACE_U, FACE_F, FACE_L],
  [FACE_D, FACE_F, FACE_R], [FACE_D, FACE_R, FACE_B], [FACE_D, FACE_B, FACE_L], [FACE_D, FACE_L, FACE_F],
];

// ---- 身份的颜色 ----

// 棱身份 0-11 = UF UR UB UL DF DR DB DL FR FL BR BL，颜色序 [主色, 副色]
export const EDGE_COLORS: [number, number][] = [
  [0, 2], [0, 1], [0, 5], [0, 4], [3, 2], [3, 1], [3, 5], [3, 4], [2, 1], [2, 4], [5, 1], [5, 4],
];

// 角身份 0-7 = UFR URB UBL ULF DRF DBR DBL DLF，
// 颜色序与对应位置的 CORNER_FACES 顺序一致（第一色是 U/D 色）。
export const CORNER_COLORS: [number, number, number][] = [
  [0, 1, 2], [0, 5, 1], [0, 4, 5], [0, 2, 4],
  [3, 2, 1], [3, 1, 5], [3, 5, 4], [3, 4, 2],
];

// 左桥(FB)的 5 个 piece 身份
export const FB_EDGES = [7, 9, 11] as const; // DL, FL, BL
export const FB_CORNERS = [7, 6] as const; // DLF, DBL

function key2(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}
function key3(a: number, b: number, c: number): string {
  return [a, b, c].sort((x, y) => x - y).join(',');
}

export const edgeIdByColors = new Map<string, number>();
EDGE_COLORS.forEach((c, i) => edgeIdByColors.set(key2(c[0], c[1]), i));
export const cornerIdByColors = new Map<string, number>();
CORNER_COLORS.forEach((c, i) => cornerIdByColors.set(key3(c[0], c[1], c[2]), i));

/** facelet -> cubie */
export function faceletToCubie(f: Facelet): Cubie {
  const ep = new Int8Array(12);
  const eo = new Int8Array(12);
  const cp = new Int8Array(8);
  const co = new Int8Array(8);

  for (let i = 0; i < 12; i++) {
    const [f1, f2] = EDGE_FACES[i];
    const c1 = f[stickerIndex(EDGE_POS[i], NORMALS[f1])];
    const c2 = f[stickerIndex(EDGE_POS[i], NORMALS[f2])];
    const id = edgeIdByColors.get(key2(c1, c2))!;
    ep[i] = id;
    // 朝向：主色(col0)在 f1 面则为 0，否则为 1
    eo[i] = c1 === EDGE_COLORS[id][0] ? 0 : 1;
  }

  for (let i = 0; i < 8; i++) {
    const [f1, f2, f3] = CORNER_FACES[i];
    const c1 = f[stickerIndex(CORNER_POS[i], NORMALS[f1])];
    const c2 = f[stickerIndex(CORNER_POS[i], NORMALS[f2])];
    const c3 = f[stickerIndex(CORNER_POS[i], NORMALS[f3])];
    const id = cornerIdByColors.get(key3(c1, c2, c3))!;
    cp[i] = id;
    // co = 主色(U/D 色)在 3 个面里的位置索引
    const mainColor = CORNER_COLORS[id][0];
    co[i] = c1 === mainColor ? 0 : c2 === mainColor ? 1 : 2;
  }

  return { cp, co, ep, eo };
}

/** cubie -> facelet */
export function cubieToFacelet(c: Cubie): Facelet {
  const f = new Uint8Array(54);
  // 中心贴纸：面转不移动中心，颜色 = 面
  for (let face = 0; face < 6; face++) {
    const n = NORMALS[face];
    f[stickerIndex(n, n)] = face;
  }
  // 棱：朝向 flip=0 时主色(col0)在 f1 面
  for (let i = 0; i < 12; i++) {
    const id = c.ep[i];
    const [col0, col1] = EDGE_COLORS[id];
    const flip = c.eo[i];
    const [f1, f2] = EDGE_FACES[i];
    f[stickerIndex(EDGE_POS[i], NORMALS[f1])] = flip === 0 ? col0 : col1;
    f[stickerIndex(EDGE_POS[i], NORMALS[f2])] = flip === 0 ? col1 : col0;
  }
  // 角：co=k 表示 color[0] 落在 face[k]，其余颜色按顺时针顺序循环移位
  for (let i = 0; i < 8; i++) {
    const id = c.cp[i];
    const colors = CORNER_COLORS[id];
    const k = c.co[i];
    const [f1, f2, f3] = CORNER_FACES[i];
    f[stickerIndex(CORNER_POS[i], NORMALS[f1])] = colors[(0 - k + 3) % 3];
    f[stickerIndex(CORNER_POS[i], NORMALS[f2])] = colors[(1 - k + 3) % 3];
    f[stickerIndex(CORNER_POS[i], NORMALS[f3])] = colors[(2 - k + 3) % 3];
  }
  return f;
}

/** 已还原的 cubie */
export function solvedCubie(): Cubie {
  const ep = new Int8Array(12);
  const eo = new Int8Array(12);
  const cp = new Int8Array(8);
  const co = new Int8Array(8);
  for (let i = 0; i < 12; i++) ep[i] = i;
  for (let i = 0; i < 8; i++) cp[i] = i;
  return { cp, co, ep, eo };
}

// ---- cubie 转动表（从还原态应用 facelet 转动推导） ----

/** EDGE_PERM[m][p] = 位置 p 的棱，转动 m 后去到的位置 */
export const EDGE_PERM: Int8Array[] = [];
/** EDGE_ORI[m][p] = 转动 m 对位置 p 的棱朝向翻转（0/1） */
export const EDGE_ORI: Int8Array[] = [];
/** CORNER_PERM[m][p] = 位置 p 的角，转动 m 后去到的位置 */
export const CORNER_PERM: Int8Array[] = [];
/** CORNER_ORI[m][p] = 转动 m 对位置 p 的角朝向增量（0/1/2） */
export const CORNER_ORI: Int8Array[] = [];

(function buildMoveTables() {
  const solved = solvedFacelet();
  const M = MOVE_PERMS.length;
  for (let m = 0; m < M; m++) {
    const moved = applyMove(solved, m);
    const c = faceletToCubie(moved);
    const ep = new Int8Array(12);
    const eo = new Int8Array(12);
    const cp = new Int8Array(8);
    const co = new Int8Array(8);
    for (let p = 0; p < 12; p++) {
      const id = p; // 初始位置 p 的棱身份 = p
      const j = c.ep.indexOf(id);
      ep[p] = j;
      eo[p] = c.eo[j];
    }
    for (let p = 0; p < 8; p++) {
      const id = p;
      const j = c.cp.indexOf(id);
      cp[p] = j;
      co[p] = c.co[j];
    }
    EDGE_PERM.push(ep);
    EDGE_ORI.push(eo);
    CORNER_PERM.push(cp);
    CORNER_ORI.push(co);
  }
})();
