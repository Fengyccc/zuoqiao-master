/**
 * 魔方转动定义 —— 基于 3D 坐标的几何模型。
 *
 * 关键设计：所有转动表（facelet 置换、cubie 置换）都由 3D 几何推导生成，
 * 而不是手写 54 元素的置换表，从根源上避免笔误。
 *
 * 坐标系（右手系）：
 *   +x = 右(R)，+y = 前(F)，+z = 上(U)
 *   每个贴纸 = (pos, normal)，pos 是该贴纸所在格子的中心坐标，normal 是朝外法向量。
 *
 * 面转 90°「顺时针」= 面向该面看时顺时针（标准 WCA/csTimer 记号）：
 *   U: 绕 +z +90°  -> (x,y,z) -> (-y, x, z)
 *   D: 绕 +z -90°  -> (x,y,z) -> (y, -x, z)
 *   R: 绕 +x +90°  -> (x,y,z) -> (x, -z, y)
 *   L: 绕 +x -90°  -> (x,y,z) -> (x, z, -y)
 *   F: 绕 +y +90°  -> (x,y,z) -> (z, y, -x)
 *   B: 绕 +y -90°  -> (x,y,z) -> (-z, y, x)
 */

export type Vec3 = [number, number, number];

// 面索引
export const FACE_U = 0;
export const FACE_R = 1;
export const FACE_F = 2;
export const FACE_D = 3;
export const FACE_L = 4;
export const FACE_B = 5;

export const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;

// 面法向量（按面索引顺序）
const NORMALS: Vec3[] = [
  [0, 0, 1], // U
  [1, 0, 0], // R
  [0, 1, 0], // F
  [0, 0, -1], // D
  [-1, 0, 0], // L
  [0, -1, 0], // B
];

export type Axis = 'x' | 'y' | 'z';

/** 一个「基本 90° 顺时针」转动 */
interface BaseMove {
  axis: Axis;
  sign: 1 | -1; // 绕 axis 的 90° 方向（+1 = 面向该面顺时针）
  layer: (p: Vec3) => boolean; // 贴纸是否在转动层
}

// 9 个基本转动（6 面转 + 3 中层转）。顺序决定 MOVE_NAMES 的排列。
// 中层转：M 同 L 方向(x层)，E 同 D 方向(z层)，S 同 F 方向(y层)。
const BASE: BaseMove[] = [
  { axis: 'z', sign: 1, layer: (p) => p[2] === 1 }, // 0 U
  { axis: 'z', sign: -1, layer: (p) => p[2] === -1 }, // 1 D
  { axis: 'x', sign: 1, layer: (p) => p[0] === 1 }, // 2 R
  { axis: 'x', sign: -1, layer: (p) => p[0] === -1 }, // 3 L
  { axis: 'y', sign: 1, layer: (p) => p[1] === 1 }, // 4 F
  { axis: 'y', sign: -1, layer: (p) => p[1] === -1 }, // 5 B
  { axis: 'x', sign: -1, layer: (p) => p[0] === 0 }, // 6 M (同 L)
  { axis: 'z', sign: -1, layer: (p) => p[2] === 0 }, // 7 E (同 D)
  { axis: 'y', sign: 1, layer: (p) => p[1] === 0 }, // 8 S (同 F)
];

// 命名转动：9 个基本 × {1 次, 2 次, 3 次}（27 个），再追加 18 个宽转（见下方 WIDE_MOVES）。
const SUFFIXES = ['', '2', "'"] as const;
export const MOVE_NAMES: string[] = [];
for (let b = 0; b < BASE.length; b++) {
  const baseName = ['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S'][b];
  for (const s of SUFFIXES) MOVE_NAMES.push(baseName + s);
}
export const MOVE_COUNT = MOVE_NAMES.length; // 45（18 面转 + 9 中层转 + 18 宽转）

// 宽转（wide move）起始 id 与数量：追加在 27 个转动之后，id 27–44。
export const WIDE_MOVE_START = 27;
export const WIDE_MOVE_COUNT = 18;

/** 按名称查找 move id（"U"、"U'"、"U2" 等），找不到返回 -1 */
export function moveIdByName(name: string): number {
  return MOVE_NAMES.indexOf(name);
}

// ---- 生成 54 个贴纸 ----

interface Sticker {
  pos: Vec3;
  normal: Vec3;
  face: number; // 所在面（0-5）
}

const STICKERS: Sticker[] = [];
(function buildStickers() {
  for (let f = 0; f < 6; f++) {
    const n = NORMALS[f];
    const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const pos: Vec3 = [0, 0, 0];
        pos[axis] = n[axis];
        let k = 0;
        for (let ax = 0; ax < 3; ax++) {
          if (ax !== axis) {
            pos[ax] = k === 0 ? a : b;
            k++;
          }
        }
        STICKERS.push({ pos, normal: n, face: f });
      }
    }
  }
})();

/** 54 个贴纸的中心坐标（按 facelet 索引顺序），供渲染等使用 */
export const STICKER_POS: Vec3[] = STICKERS.map((s) => s.pos);

function stickerKey(pos: Vec3, normal: Vec3): string {
  return `${pos[0]},${pos[1]},${pos[2]}|${normal[0]},${normal[1]},${normal[2]}`;
}

const STICKER_INDEX = new Map<string, number>();
STICKERS.forEach((s, i) => STICKER_INDEX.set(stickerKey(s.pos, s.normal), i));

/** 按 (pos, normal) 查贴纸索引 */
export function stickerIndex(pos: Vec3, normal: Vec3): number {
  const i = STICKER_INDEX.get(stickerKey(pos, normal));
  if (i === undefined) throw new Error(`sticker not found: ${pos} ${normal}`);
  return i;
}

function rotate(v: Vec3, axis: Axis, sign: 1 | -1): Vec3 {
  const [x, y, z] = v;
  if (axis === 'z') return sign === 1 ? [-y, x, z] : [y, -x, z];
  if (axis === 'x') return sign === 1 ? [x, -z, y] : [x, z, -y];
  return sign === 1 ? [z, y, -x] : [-z, y, x];
}

/** 整体旋转置换（绕 axis 90° 转所有贴纸，中心也移动）。perm[i] = 贴纸 i 的新位置。 */
export function wholeRotationPerm(axis: Axis, sign: 1 | -1): Uint8Array {
  const perm = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    const s = STICKERS[i];
    const np = rotate(s.pos, axis, sign);
    const nn = rotate(s.normal, axis, sign);
    perm[i] = stickerIndex(np, nn);
  }
  return perm;
}

function buildPerm90(base: BaseMove): Uint8Array {
  const perm = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    const s = STICKERS[i];
    if (base.layer(s.pos)) {
      const np = rotate(s.pos, base.axis, base.sign);
      const nn = rotate(s.normal, base.axis, base.sign);
      perm[i] = stickerIndex(np, nn);
    } else {
      perm[i] = i;
    }
  }
  return perm;
}

/** 组合置换：先应用 p，再应用 q => r[i] = q[p[i]] */
function compose(p: Uint8Array, q: Uint8Array): Uint8Array {
  const r = new Uint8Array(54);
  for (let i = 0; i < 54; i++) r[i] = q[p[i]];
  return r;
}

const PERM90 = BASE.map((b) => buildPerm90(b));

/** 27 个命名的 facelet 置换表：MOVE_PERMS[m][i] = 贴纸 i 的颜色转动后去到的位置 */
export const MOVE_PERMS: Uint8Array[] = [];
for (let b = 0; b < BASE.length; b++) {
  const p1 = PERM90[b];
  const p2 = compose(p1, p1);
  const p3 = compose(p2, p1);
  MOVE_PERMS.push(p1, p2, p3);
}

// ---- 宽转（小写字母 = 双层转，连带中层做对应字母方向）----
// r=R+M'、l=L+M、u=U+E'、d=D+E、f=F+S、b=B+S'（及 2、'）。
// 用「面转 + 中层转」的 facelet 置换复合生成；id 27–44。
// 注意：中层转会移动中心，故宽转会重定向（bridge.ts 的求解会追踪中心朝向）。
const WIDE_MOVES: { name: string; face: number; slice: number }[] = [
  { name: 'r', face: 6, slice: 20 }, { name: 'r2', face: 7, slice: 19 }, { name: "r'", face: 8, slice: 18 },
  { name: 'l', face: 9, slice: 18 }, { name: 'l2', face: 10, slice: 19 }, { name: "l'", face: 11, slice: 20 },
  { name: 'u', face: 0, slice: 23 }, { name: 'u2', face: 1, slice: 22 }, { name: "u'", face: 2, slice: 21 },
  { name: 'd', face: 3, slice: 21 }, { name: 'd2', face: 4, slice: 22 }, { name: "d'", face: 5, slice: 23 },
  { name: 'f', face: 12, slice: 24 }, { name: 'f2', face: 13, slice: 25 }, { name: "f'", face: 14, slice: 26 },
  { name: 'b', face: 15, slice: 26 }, { name: 'b2', face: 16, slice: 25 }, { name: "b'", face: 17, slice: 24 },
];
for (const w of WIDE_MOVES) {
  MOVE_NAMES.push(w.name);
  MOVE_PERMS.push(compose(MOVE_PERMS[w.face], MOVE_PERMS[w.slice]));
}

/** facelet 状态：54 个贴纸颜色（0-5，与面索引一致） */
export type Facelet = Uint8Array;

/** 已还原的 facelet：每张贴纸颜色 = 所在面 */
export function solvedFacelet(): Facelet {
  const f = new Uint8Array(54);
  for (let i = 0; i < 54; i++) f[i] = STICKERS[i].face;
  return f;
}

/** 对 facelet 应用一个转动，返回新状态（原地写入 out 或新建） */
export function applyMove(facelet: Facelet, move: number, out?: Facelet): Facelet {
  const perm = MOVE_PERMS[move];
  const o = out ?? new Uint8Array(54);
  for (let i = 0; i < 54; i++) o[perm[i]] = facelet[i];
  return o;
}

/** 依次应用一串转动 */
export function applyMoves(facelet: Facelet, moves: number[]): Facelet {
  const a = new Uint8Array(54);
  const b = new Uint8Array(54);
  a.set(facelet);
  let cur: Facelet = a;
  let nxt: Facelet = b;
  for (const m of moves) {
    applyMove(cur, m, nxt);
    const t = cur;
    cur = nxt;
    nxt = t;
  }
  // 结果在 cur 中；拷贝回 a 返回
  const result = new Uint8Array(54);
  result.set(cur);
  return result;
}
