/**
 * FB 求解器：BFS 反向生成「FB 坐标 -> 到目标的最短步数」距离表，随后贪心回溯求最短解。
 *
 * 移动集 = 18 个面转（move id 0-17）。中层转 M/E/S 会移动中心块、超出本核心库的 cubie 表示，
 * 暂不纳入，后续扩展时再处理。
 */

import { applyMoveToFb, solvedFbCoord, faceletToFbCoord, FB_COORD_SPACE, isHomePositions, mapToSolvedFrame } from './fb';

export const FB_MOVE_COUNT = 18;

let distanceTable: Uint8Array | null = null;
/** 以任意目标坐标为锚点的额外距离表（双底四色桥的非标准朝向用），惰性构建 */
const distanceTableCache = new Map<number, Uint8Array>();

/** 从指定坐标反向 BFS，得到「坐标 -> 到 targetCoord 的最短面转步数」表 */
function bfsFrom(targetCoord: number): Uint8Array {
  const d = new Uint8Array(FB_COORD_SPACE).fill(255);
  const queue: number[] = [];
  d[targetCoord] = 0;
  queue.push(targetCoord);
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const nd = d[cur] + 1;
    for (let m = 0; m < FB_MOVE_COUNT; m++) {
      const next = applyMoveToFb(cur, m);
      if (d[next] === 255) {
        d[next] = nd;
        queue.push(next);
      }
    }
  }
  return d;
}

/**
 * 构建「到标准已还原态」的距离表（首次调用会一次性 BFS，之后缓存复用）。
 * 返回值可直接用 `serializeDistanceTable` 持久化，避免下次重新 BFS。
 */
export function buildDistanceTable(force = false): Uint8Array {
  if (distanceTable && !force) return distanceTable;
  distanceTable = bfsFrom(solvedFbCoord());
  return distanceTable;
}

/**
 * 构建「到任意目标坐标」的距离表（惰性缓存）。用于双底四色桥的非标准朝向目标。
 * 距离表是「位置」导向的，对任意 5 个 piece 的坐标都成立。
 */
export function buildDistanceTableFrom(targetCoord: number, force = false): Uint8Array {
  if (targetCoord === solvedFbCoord()) return buildDistanceTable(force);
  const cached = distanceTableCache.get(targetCoord);
  if (cached && !force) return cached;
  const t = bfsFrom(targetCoord);
  distanceTableCache.set(targetCoord, t);
  return t;
}

/**
 * 某个 FB 坐标到「已还原」的最短面转步数（只读访问距离表）。
 * 距离表是「位置」导向的，对任意 5 个 piece 的坐标都成立，可作扩展求解器的可采纳启发式。
 */
export function fbDistance(coord: number): number {
  const d = buildDistanceTable();
  const dist = d[coord];
  if (dist === 255) throw new Error('FB 坐标不可达（可能不是物理打乱状态）');
  return dist;
}

/** 某个 FB 坐标到「指定目标坐标」的最短面转步数（可采纳启发式） */
export function fbDistanceTo(coord: number, targetCoord: number): number {
  // 桥配置的目标坐标都处于 home 位置（仅朝向不同），可复用单一「标准已还原」距离表：
  // 把 coord 的朝向平移到标准参照系（棱按位 XOR、角 mod-3 相减），直接查 solved 表，省去第二次 BFS。
  if (isHomePositions(targetCoord)) {
    const d = buildDistanceTable();
    const dist = d[mapToSolvedFrame(coord, targetCoord)];
    if (dist === 255) throw new Error('FB 坐标不可达（可能不是物理打乱状态）');
    return dist;
  }
  // 通用目标坐标（当前未使用）：惰性构建专用距离表。
  const d = buildDistanceTableFrom(targetCoord);
  const dist = d[coord];
  if (dist === 255) throw new Error('FB 坐标不可达（可能不是物理打乱状态）');
  return dist;
}

/** 求解 FB：返回 move id 序列（最短解） */
export function solveFb(coord: number): number[] {
  const d = buildDistanceTable();
  const startDist = d[coord];
  if (startDist === 255) {
    throw new Error('FB 坐标不可达（可能不是物理打乱状态）');
  }
  const solution: number[] = [];
  let cur = coord;
  while (d[cur] !== 0) {
    const target = d[cur] - 1;
    let found = false;
    for (let m = 0; m < FB_MOVE_COUNT; m++) {
      const next = applyMoveToFb(cur, m);
      if (d[next] === target) {
        solution.push(m);
        cur = next;
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error('求解失败：距离表不一致');
    }
  }
  return solution;
}

/** 从 facelet 状态直接求解 FB */
export function solveFbFromFacelet(facelet: Uint8Array): number[] {
  return solveFb(faceletToFbCoord(facelet));
}
