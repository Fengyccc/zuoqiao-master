/**
 * 双底四色桥求解：8 种「底色 × 侧色」左桥，连色对优先。
 *
 * - 8 配置 = 底色 ∈ {白,黄} × 侧色 ∈ {红,绿,蓝,橙}；每种对应一个「X顶X前」整体朝向坐标。
 * - 连色对 = 该桥 5 个 piece 中「棱角已连成 2 块」的相邻对数（0–4）。
 * - 求解：先把 facelet 整体旋转到该桥的天然朝向（底色落 D、侧色落 L），
 *   再用纯面转（18 个）带权 A* 还原左桥；左手转动 L 权重更高，启发式 = fbDistanceTo（可采纳）。
 *   解法按该朝向坐标（orientLabel）给出，不再混入重定向中心的宽转。
 *
 * FB 坐标是「位置」导向的（见 fb.ts）；目标坐标（归位朝向）按整体旋转后的坐标中心颜色
 * 反推得到（白黄底为全 0，红橙底/蓝绿底因主色是 U/D 色而未必落 D 面，朝向非全 0）。
 */

import {
  FACE_U,
  FACE_R,
  FACE_F,
  FACE_B,
  FACE_D,
  FACE_L,
  WIDE_MOVE_START,
  wholeRotationPerm,
  type Facelet,
} from './moves';
import {
  EDGE_COLORS,
  CORNER_COLORS,
  EDGE_FACES,
  CORNER_FACES,
  EDGE_PERM,
  EDGE_ORI,
  edgeIdByColors,
  cornerIdByColors,
  faceletToCubie,
  type Cubie,
} from './cube';
import { faceletToFbCoordGeneric, solvedFbCoordWithOrientations, applyMoveToFb } from './fb';
import { fbDistanceTo } from './fbSolver';
import { moveCost, scoreFingertrick, type Grip } from './fingertrick';

const COLOR_NAMES = ['白', '红', '绿', '黄', '橙', '蓝'] as const;

/** DR 最佳解的带权代价放宽窗口：在「最短代价 + DR_SLACK」内寻找 DR 位置更好的解。可调。 */
export const DR_SLACK = 2;

/** DR 最佳搜索的状态预算：超过则放弃本次 tier 搜索（防止最坏情况状态爆炸）。可调。 */
const DR_MAX_STATES = 200000;

/** 棱位置 0-11 的记号名（UF UR UB UL DF DR DB DL FR FL BR BL） */
export const EDGE_POS_NAMES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'] as const;

/** DR 棱位置分级：0=DR位色相正确（最佳），1=U/F 层（易观察），2=其他（隐藏） */
export function drTier(drPos: number, drOri: number): 0 | 1 | 2 {
  if (drPos === 5 && drOri === 0) return 0;
  if (
    drPos === 0 ||
    drPos === 1 ||
    drPos === 2 ||
    drPos === 3 ||
    drPos === 4 ||
    drPos === 8 ||
    drPos === 9
  ) {
    return 1;
  }
  return 2;
}

/** DR 棱分级的中文标签（UI 用） */
export function drTierLabel(tier: number): string {
  return tier === 0 ? 'DR位·色相正确' : tier === 1 ? 'U/F层·易观察' : '隐藏';
}

// ---- 朝向（中心重定向）表示：24 个整体旋转 ----
// orient[face] = 该几何面上的颜色。ident = [0,1,2,3,4,5]（U=白0 R=红1 F=绿2 D=黄3 L=橙4 B=蓝5）。
// 生成元（face 映射 map[f]=f'：几何面 f 的内容移动到 f'）：
const GEN_MAPS: number[][] = [
  [5, 1, 0, 2, 4, 3], // x:  U→B→D→F→U
  [2, 1, 3, 5, 4, 0], // x'
  [1, 3, 2, 4, 0, 5], // y:  U→R→D→L→U
  [4, 0, 2, 1, 3, 5], // y'
  [0, 2, 4, 3, 5, 1], // z:  F→L→B→R→F
  [0, 5, 1, 3, 2, 4], // z'
];

function applyMapToOrient(orient: number[], map: number[]): number[] {
  const out = new Array<number>(6);
  for (let f = 0; f < 6; f++) out[map[f]] = orient[f];
  return out;
}

// ---- 整体旋转（重定向坐标）：把 facelet 整体旋转到某朝向 ----
// GEN 0-5 依次为 x/x'/y/y'/z/z'，对应绕轴 90° 顺/逆时针（与 GEN_MAPS 一致）
const GEN_AXIS = ['x', 'x', 'y', 'y', 'z', 'z'] as const;
const GEN_SIGN: readonly (1 | -1)[] = [1, -1, 1, -1, 1, -1];

/** 对「旧位置 → 新位置」的整体旋转置换 perm 再施加 gen g 的物理旋转 */
function composeWholePerm(perm: Int8Array, g: number): Int8Array {
  const wp = wholeRotationPerm(GEN_AXIS[g], GEN_SIGN[g]);
  const out = new Int8Array(54);
  for (let i = 0; i < 54; i++) out[i] = wp[perm[i]];
  return out;
}

const IDENTITY = [0, 1, 2, 3, 4, 5];
const ORIENTS: number[][] = [IDENTITY];
const orientIndex = new Map<string, number>([[IDENTITY.join(','), 0]]);
const identPerm = new Int8Array(54);
for (let i = 0; i < 54; i++) identPerm[i] = i;
const WHOLE_PERM: Int8Array[] = [identPerm];
for (let i = 0; i < ORIENTS.length; i++) {
  const cur = ORIENTS[i];
  for (let g = 0; g < GEN_MAPS.length; g++) {
    const map = GEN_MAPS[g];
    const next = applyMapToOrient(cur, map);
    const key = next.join(',');
    if (!orientIndex.has(key)) {
      orientIndex.set(key, ORIENTS.length);
      ORIENTS.push(next);
      WHOLE_PERM.push(composeWholePerm(WHOLE_PERM[i], g));
    }
  }
}
// GEN_APPLY[g][o] = 对朝向 o 施加生成元 g 后的朝向索引
const GEN_APPLY: number[][] = [];
for (let g = 0; g < 6; g++) {
  const row = new Array<number>(ORIENTS.length);
  for (let o = 0; o < ORIENTS.length; o++) {
    row[o] = orientIndex.get(applyMapToOrient(ORIENTS[o], GEN_MAPS[g]).join(','))!;
  }
  GEN_APPLY.push(row);
}

// ---- 颜色 -> piece 身份 ----
function edgeIdOf(a: number, b: number): number {
  return edgeIdByColors.get(a < b ? `${a},${b}` : `${b},${a}`)!;
}
function cornerIdOf(a: number, b: number, c: number): number {
  return cornerIdByColors.get([a, b, c].sort((x, y) => x - y).join(','))!;
}

// ---- 8 种桥配置 ----
export interface BridgeConfig {
  name: string;
  bottom: number;
  side: number;
  targetOrient: number;
  edges: [number, number, number]; // DL, FL, BL
  corners: [number, number]; // DLF, DBL
  drEdge: number; // 右桥 DR 棱身份（bottom + 右色）
}

/** 一对底色（对底色），侧色自动取剩余 4 色 */
export interface BottomPair {
  name: string;
  bottoms: [number, number];
}

/** 三对可选底色：白黄 / 红橙 / 蓝绿（三阶三对对面色） */
export const BOTTOM_PAIRS: BottomPair[] = [
  { name: '白黄底', bottoms: [0, 3] },
  { name: '红橙底', bottoms: [1, 4] },
  { name: '蓝绿底', bottoms: [2, 5] },
];

export function buildBridgeConfigs(bottoms: [number, number] = [0, 3]): BridgeConfig[] {
  const configs: BridgeConfig[] = [];
  const sides = [0, 1, 2, 3, 4, 5].filter((c) => c !== bottoms[0] && c !== bottoms[1]);
  for (const bottom of bottoms) {
    for (const side of sides) {
      let targetOrient = -1;
      for (let o = 0; o < ORIENTS.length; o++) {
        if (ORIENTS[o][FACE_D] === bottom && ORIENTS[o][FACE_L] === side) {
          targetOrient = o;
          break;
        }
      }
      const orient = ORIENTS[targetOrient];
      const front = orient[FACE_F];
      const back = orient[FACE_B];
      const right = orient[FACE_R];
      const edges: [number, number, number] = [
        edgeIdOf(bottom, side), // DL
        edgeIdOf(front, side), // FL
        edgeIdOf(back, side), // BL
      ];
      const corners: [number, number] = [
        cornerIdOf(bottom, side, front), // DLF
        cornerIdOf(bottom, back, side), // DBL
      ];
      configs.push({
        name: `${COLOR_NAMES[bottom]}底${COLOR_NAMES[side]}桥`,
        bottom,
        side,
        targetOrient,
        edges,
        corners,
        drEdge: edgeIdOf(bottom, right),
      });
    }
  }
  return configs;
}

/** 把 facelet 整体旋转到朝向 orientIdx（24 朝向之一） */
export function applyWholeRotation(facelet: Facelet, orientIdx: number): Facelet {
  const perm = WHOLE_PERM[orientIdx];
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[perm[i]] = facelet[i];
  return out;
}

/** 朝向索引 -> 坐标说明（如「红顶绿前」） */
export function orientLabel(orientIdx: number): string {
  const o = ORIENTS[orientIdx];
  return `${COLOR_NAMES[o[FACE_U]]}顶${COLOR_NAMES[o[FACE_F]]}前`;
}

// ---- 连色对检测 ----
function edgeColorAtFace(c: Cubie, pE: number, g: number): number {
  const id = c.ep[pE];
  const [col0, col1] = EDGE_COLORS[id];
  const flip = c.eo[pE];
  const [f1, f2] = EDGE_FACES[pE];
  if (g === f1) return flip === 0 ? col0 : col1;
  return flip === 0 ? col1 : col0;
}

function cornerColorAtFace(c: Cubie, pC: number, g: number): number {
  const id = c.cp[pC];
  const colors = CORNER_COLORS[id];
  const k = c.co[pC];
  const faces = CORNER_FACES[pC];
  if (g === faces[0]) return colors[(0 - k + 3) % 3];
  if (g === faces[1]) return colors[(1 - k + 3) % 3];
  return colors[(2 - k + 3) % 3];
}

function isPairConnected(c: Cubie, edgeId: number, cornerId: number): boolean {
  const pE = c.ep.indexOf(edgeId);
  const pC = c.cp.indexOf(cornerId);
  if (pE < 0 || pC < 0) return false;
  const eFaces = EDGE_FACES[pE];
  const cFaces = CORNER_FACES[pC];
  // 相邻：edge 的两个面都在 corner 的三个面里（corner 在 edge 的一个端点）
  for (const ef of eFaces) {
    if (cFaces[0] !== ef && cFaces[1] !== ef && cFaces[2] !== ef) return false;
  }
  // 两个共享面贴纸颜色都要一致，才是「已连成 2 块」
  for (const g of eFaces) {
    if (edgeColorAtFace(c, pE, g) !== cornerColorAtFace(c, pC, g)) return false;
  }
  return true;
}

/** 计算某个 config 在当前 facelet 里已连好的「连色对」数量（0–4） */
export function connectedPairCount(f: Facelet, config: BridgeConfig): number {
  const c = faceletToCubie(f);
  const pairs: [number, number][] = [
    [config.edges[0], config.corners[0]], // DL + DLF
    [config.edges[0], config.corners[1]], // DL + DBL
    [config.edges[1], config.corners[0]], // FL + DLF
    [config.edges[2], config.corners[1]], // BL + DBL
  ];
  let count = 0;
  for (const [e, c2] of pairs) if (isPairConnected(c, e, c2)) count++;
  return count;
}

// ---- 配置的目标 FB 坐标（朝向随整体旋转的坐标而变） ----

/**
 * 配置 c 的「已还原」FB 坐标：5 个 piece 归位到 DL/FL/BL + DLF/DBL，
 * 且朝向与「整体旋转后的坐标朝向」匹配（即每个 piece 的贴纸与相邻中心同色）。
 * 棱朝向 eo 约定「主色在 EDGE_FACES 第一面则为 0」，角朝向 co 约定「主色所在面索引」，
 * 二者都以「几何面」为参照；整体旋转到非白黄底坐标后，正确朝向需按目标中心颜色反推，
 * 不能再用全 0（白黄底恰好为全 0）。
 */
function targetFbCoord(config: BridgeConfig): number {
  const orient = ORIENTS[config.targetOrient];
  const edgeHome = [7, 9, 11]; // DL, FL, BL
  const edgeOri: [number, number, number] = [
    orient[EDGE_FACES[edgeHome[0]][0]] === EDGE_COLORS[config.edges[0]][0] ? 0 : 1,
    orient[EDGE_FACES[edgeHome[1]][0]] === EDGE_COLORS[config.edges[1]][0] ? 0 : 1,
    orient[EDGE_FACES[edgeHome[2]][0]] === EDGE_COLORS[config.edges[2]][0] ? 0 : 1,
  ];
  const cornerHome = [7, 6]; // DLF, DBL
  const cornerOri: [number, number] = [0, 0];
  for (let i = 0; i < 2; i++) {
    const col0 = CORNER_COLORS[config.corners[i]][0];
    const faces = CORNER_FACES[cornerHome[i]];
    for (let j = 0; j < 3; j++) {
      if (orient[faces[j]] === col0) {
        cornerOri[i] = j;
        break;
      }
    }
  }
  return solvedFbCoordWithOrientations(edgeOri, cornerOri);
}

// ---- 宽转的朝向生成元 ----
// 宽转 id 27–44 顺序：r r2 r' l l2 l' u u2 u' d d2 d' f f2 f' b b2 b'。
// gen 索引 0=x 1=x' 2=y 3=y' 4=z 5=z'；double 表示 '2'（施加两次）。
const WIDE_ORIENT: { gen: number; double: boolean }[] = [
  { gen: 0, double: false }, { gen: 0, double: true }, { gen: 1, double: false }, // r r2 r'
  { gen: 1, double: false }, { gen: 0, double: true }, { gen: 0, double: false }, // l l2 l'
  { gen: 4, double: false }, { gen: 4, double: true }, { gen: 5, double: false }, // u u2 u'
  { gen: 5, double: false }, { gen: 4, double: true }, { gen: 4, double: false }, // d d2 d'
  { gen: 2, double: false }, { gen: 2, double: true }, { gen: 3, double: false }, // f f2 f'
  { gen: 3, double: false }, { gen: 2, double: true }, { gen: 2, double: false }, // b b2 b'
];

// ---- 带权 A*（二叉最小堆） ----
interface HeapNode {
  f: number;
  g: number;
  key: number;
  coord: number;
  orient: number;
  drPos: number;
  drOri: number;
}

class MinHeap {
  private a: HeapNode[] = [];
  get size(): number {
    return this.a.length;
  }
  push(n: HeapNode): void {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): HeapNode | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// 求解前已把 facelet 整体旋转到桥的天然朝向，故只需纯面转（18 个），无需宽转重定向中心。
// （宽转分支与 orient 追踪代码仍保留但不会执行：move 恒 < 18。）
const MOVE_TOTAL = 18;

// ---- 联合状态打包：key = (((fbCoord*24 + orient)*12 + drPos)*2 + drOri) ----
function keyOf(coord: number, orient: number, drPos: number, drOri: number): number {
  return ((coord * 24 + orient) * 12 + drPos) * 2 + drOri;
}

interface GoalRecord {
  cost: number;
  drPos: number;
  drOri: number;
  moves: number[];
}

function reconstructMoves(
  parent: Map<number, { key: number; move: number }>,
  startKey: number,
  goalKey: number,
): number[] {
  const moves: number[] = [];
  let k = goalKey;
  while (k !== startKey) {
    const p = parent.get(k)!;
    moves.push(p.move);
    k = p.key;
  }
  moves.reverse();
  return moves;
}

/** 对 DR 棱从初始 (drPos0, drOri0) 回放 moves，得到最终 (pos, ori) 与逐步轨迹 */
function replayDr(
  moves: number[],
  drPos0: number,
  drOri0: number,
): { pos: number; ori: number; trajectory: number[] } {
  let pos = drPos0;
  let ori = drOri0;
  const trajectory = [pos];
  for (const m of moves) {
    ori ^= EDGE_ORI[m][pos];
    pos = EDGE_PERM[m][pos];
    trajectory.push(pos);
  }
  return { pos, ori, trajectory };
}

function toSolution(
  moves: number[],
  cost: number,
  dr: { pos: number; ori: number; trajectory: number[] },
): BridgeSolution {
  const ft = scoreFingertrick(moves);
  return {
    moves,
    totalMoves: moves.length,
    leftHandMoves: ft.leftHandMoves,
    cost,
    regripCount: ft.regrips,
    initialGrip: ft.grip,
    fingertrickCost: ft.cost,
    drPos: dr.pos,
    drOri: dr.ori,
    drTier: drTier(dr.pos, dr.ori),
    drTrajectory: dr.trajectory,
  };
}

// ---- 带权 A*（无 DR，求最短解） ----
function solveConfig(
  startCoord: number,
  targetCoord: number,
  targetOrient: number,
  startOrient: number,
): { moves: number[]; cost: number } | null {
  const targetKey = targetCoord * 24 + targetOrient;
  const startKey = startCoord * 24 + startOrient;
  // 已处于目标态时直接返回，避免构建距离表（未打乱时点「求解左桥」卡死的根因）。
  if (startKey === targetKey) return { moves: [], cost: 0 };
  const h = (coord: number): number => fbDistanceTo(coord, targetCoord);

  const gBest = new Map<number, number>();
  const parent = new Map<number, { key: number; move: number }>();
  gBest.set(startKey, 0);

  const heap = new MinHeap();
  heap.push({ f: h(startCoord), g: 0, key: startKey, coord: startCoord, orient: startOrient, drPos: 0, drOri: 0 });

  while (heap.size > 0) {
    const node = heap.pop()!;
    if (node.key === targetKey) {
      const moves = reconstructMoves(parent, startKey, node.key);
      return { moves, cost: node.g };
    }
    if ((gBest.get(node.key) ?? Infinity) < node.g) continue;

    for (let m = 0; m < MOVE_TOTAL; m++) {
      const move = m < 18 ? m : WIDE_MOVE_START + (m - 18);
      const newCoord = applyMoveToFb(node.coord, move);
      let newOrient = node.orient;
      if (move >= WIDE_MOVE_START) {
        const info = WIDE_ORIENT[move - WIDE_MOVE_START];
        newOrient = GEN_APPLY[info.gen][node.orient];
        if (info.double) newOrient = GEN_APPLY[info.gen][newOrient];
      }
      const newG = node.g + moveCost(move);
      const newKey = newCoord * 24 + newOrient;
      if ((gBest.get(newKey) ?? Infinity) <= newG) continue;
      gBest.set(newKey, newG);
      parent.set(newKey, { key: node.key, move });
      heap.push({ f: newG + h(newCoord), g: newG, key: newKey, coord: newCoord, orient: newOrient, drPos: 0, drOri: 0 });
    }
  }
  return null;
}

// ---- 带权 A*（联合 DR，受限 tier 目标，cap 上限；用于「DR 最佳」） ----
function aStarDr(
  startCoord: number,
  targetCoord: number,
  targetOrient: number,
  startOrient: number,
  drPos0: number,
  drOri0: number,
  goalTier: 0 | 1,
  cap: number,
): GoalRecord | null {
  if (startCoord === targetCoord && startOrient === targetOrient && drTier(drPos0, drOri0) === goalTier) {
    return { cost: 0, drPos: drPos0, drOri: drOri0, moves: [] };
  }
  const h = (coord: number): number => fbDistanceTo(coord, targetCoord);
  const startKey = keyOf(startCoord, startOrient, drPos0, drOri0);

  const gBest = new Map<number, number>();
  const parent = new Map<number, { key: number; move: number }>();
  gBest.set(startKey, 0);

  const heap = new MinHeap();
  heap.push({ f: h(startCoord), g: 0, key: startKey, coord: startCoord, orient: startOrient, drPos: drPos0, drOri: drOri0 });

  while (heap.size > 0) {
    const node = heap.pop()!;
    // f 是可采纳下界：一旦超过 cap，后续不可能有代价 ≤ cap 的 goal。
    if (node.f > cap) return null;
    if (
      node.coord === targetCoord &&
      node.orient === targetOrient &&
      drTier(node.drPos, node.drOri) === goalTier
    ) {
      const moves = reconstructMoves(parent, startKey, node.key);
      return { cost: node.g, drPos: node.drPos, drOri: node.drOri, moves };
    }
    if ((gBest.get(node.key) ?? Infinity) < node.g) continue;

    for (let m = 0; m < MOVE_TOTAL; m++) {
      const move = m < 18 ? m : WIDE_MOVE_START + (m - 18);
      const newCoord = applyMoveToFb(node.coord, move);
      let newOrient = node.orient;
      if (move >= WIDE_MOVE_START) {
        const info = WIDE_ORIENT[move - WIDE_MOVE_START];
        newOrient = GEN_APPLY[info.gen][node.orient];
        if (info.double) newOrient = GEN_APPLY[info.gen][newOrient];
      }
      const newDrPos = EDGE_PERM[move][node.drPos];
      const newDrOri = node.drOri ^ EDGE_ORI[move][node.drPos];
      const newG = node.g + moveCost(move);
      if (newG > cap) continue; // 超出上限，剪枝
      const newKey = keyOf(newCoord, newOrient, newDrPos, newDrOri);
      if ((gBest.get(newKey) ?? Infinity) <= newG) continue;
      gBest.set(newKey, newG);
      if (gBest.size > DR_MAX_STATES) return null; // 状态预算：放弃本次 tier 搜索
      parent.set(newKey, { key: node.key, move });
      heap.push({
        f: newG + h(newCoord),
        g: newG,
        key: newKey,
        coord: newCoord,
        orient: newOrient,
        drPos: newDrPos,
        drOri: newDrOri,
      });
    }
  }
  return null;
}

function solveConfigWithDr(
  startCoord: number,
  targetCoord: number,
  targetOrient: number,
  startOrient: number,
  drPos0: number,
  drOri0: number,
): { shortest: BridgeSolution; drBest: BridgeSolution } | null {
  // 最短解：不带 DR 的快搜（不让 DR 维度膨胀状态空间）
  const fast = solveConfig(startCoord, targetCoord, targetOrient, startOrient);
  if (!fast) return null;
  const dr0 = replayDr(fast.moves, drPos0, drOri0);
  const shortest = toSolution(fast.moves, fast.cost, dr0);
  const t0 = drTier(dr0.pos, dr0.ori);

  // DR 最佳：逐 tier（0 优于 1）在「最短代价 + DR_SLACK」内找 DR 位置更好的解
  let drBest = shortest;
  if (t0 > 0) {
    const cap = fast.cost + DR_SLACK;
    for (let tier = 0; tier < t0; tier++) {
      const rec = aStarDr(startCoord, targetCoord, targetOrient, startOrient, drPos0, drOri0, tier as 0 | 1, cap);
      if (rec) {
        drBest = toSolution(rec.moves, rec.cost, replayDr(rec.moves, drPos0, drOri0));
        break;
      }
    }
  }
  return { shortest, drBest };
}

// ---- 求解入口与选择 ----
/** 一条左桥解法及其 DR 棱结果 */
export interface BridgeSolution {
  moves: number[]; // move id（纯面转 0–17）
  totalMoves: number;
  leftHandMoves: number; // 左手转动次数（L + F'）
  cost: number;
  regripCount: number; // 换手次数（最优起手下）
  initialGrip: Grip; // 最优起手（up/neutral/down）
  fingertrickCost: number; // 顺手度总分 = Σ moveCost + REGRIP_COST × 换手次数
  drPos: number; // 做完左桥后 DR 棱所在位置（0-11）
  drOri: number; // DR 棱色相（0=好，1=坏）
  drTier: number; // 位置分级 0/1/2
  drTrajectory: number[]; // DR 棱位置轨迹（初始 + 每步后）
}

export interface BridgeResult {
  config: BridgeConfig;
  connectedPairs: number;
  shortest: BridgeSolution; // 最短左桥
  drBest: BridgeSolution; // DR 最佳左桥（可 === shortest）
}

export function solveBridges(facelet: Facelet, bottoms: [number, number] = [0, 3]): BridgeResult[] {
  const configs = buildBridgeConfigs(bottoms);
  const results: BridgeResult[] = [];
  for (const config of configs) {
    // 整体旋转到该桥的天然朝向（bottom 在 D、side 在 L），求解坐标即 config 的「X顶X前」
    const rotated = applyWholeRotation(facelet, config.targetOrient);
    const startCoord = faceletToFbCoordGeneric(rotated, config.edges, config.corners);
    const targetCoord = targetFbCoord(config);
    const rc = faceletToCubie(rotated);
    const drPos0 = rc.ep.indexOf(config.drEdge);
    const drOri0 = rc.eo[drPos0];
    // startOrient = targetOrient：facelet 已在该朝向，求解无需再重定向中心
    const solved = solveConfigWithDr(startCoord, targetCoord, config.targetOrient, config.targetOrient, drPos0, drOri0);
    const connectedPairs = connectedPairCount(facelet, config);
    if (!solved) continue;
    results.push({ config, connectedPairs, shortest: solved.shortest, drBest: solved.drBest });
  }
  // 排序：带权代价（B 层权重高 + 左手多）升序 → 步数少 → 换手少 → 连色对多者优先
  results.sort(
    (a, b) =>
      a.shortest.cost - b.shortest.cost ||
      a.shortest.totalMoves - b.shortest.totalMoves ||
      a.shortest.regripCount - b.shortest.regripCount ||
      b.connectedPairs - a.connectedPairs,
  );
  return results;
}

export interface BridgeChoice {
  best: BridgeResult;
  alternative: BridgeResult | null;
}

/** 最优 + 连色对备选：若最优已用连色对则不另设备选 */
export function selectBest(results: BridgeResult[]): BridgeChoice {
  const best = results[0];
  let alternative: BridgeResult | null = null;
  if (best.connectedPairs === 0) {
    alternative = results.find((r) => r.connectedPairs >= 1) ?? null;
  }
  return { best, alternative };
}
