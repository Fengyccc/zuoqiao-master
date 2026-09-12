import { describe, it, expect } from 'vitest';
import { solvedFacelet } from '../src/core/moves';
import { randomScramble, scrambleToFacelet } from '../src/core/scramble';
import { solvedFbCoord, faceletToFbCoord, faceletToFbCoordGeneric, isHomePositions, mapToSolvedFrame } from '../src/core/fb';
import { fbDistanceTo, buildDistanceTable, buildDistanceTableFrom } from '../src/core/fbSolver';
import { buildBridgeConfigs, applyWholeRotation, BOTTOM_PAIRS, type BridgeConfig } from '../src/core/bridge';

/** 确定性伪随机数（LCG），保证测试可复现 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** 某个桥配置的目标坐标 = 已还原 facelet 整体旋转到该朝向后的 FB 坐标（home 位置） */
function targetCoordOf(config: BridgeConfig): number {
  return faceletToFbCoordGeneric(
    applyWholeRotation(solvedFacelet(), config.targetOrient),
    config.edges,
    config.corners,
  );
}

describe('朝向平移复用距离表（fbDistanceTo）', () => {
  it('mapToSolvedFrame 把任意 home 位置目标映射回 solvedFbCoord', () => {
    for (const pair of BOTTOM_PAIRS) {
      for (const c of buildBridgeConfigs(pair.bottoms)) {
        const t = targetCoordOf(c);
        expect(isHomePositions(t), c.name).toBe(true);
        expect(mapToSolvedFrame(t, t), c.name).toBe(solvedFbCoord());
      }
    }
  });

  it('非零朝向目标：复用 solved 表的距离与独立专用表一致', () => {
    // 收集所有「朝向不全 0」的 home 位置目标，与各自独立 BFS 的专用表比对
    const targets: number[] = [];
    const seen = new Set<number>();
    for (const pair of BOTTOM_PAIRS) {
      for (const c of buildBridgeConfigs(pair.bottoms)) {
        const t = targetCoordOf(c);
        if (t !== solvedFbCoord() && !seen.has(t)) {
          seen.add(t);
          targets.push(t);
        }
      }
    }
    expect(targets.length).toBeGreaterThan(0);

    const rng = makeRng(2024);
    const coords: number[] = [];
    for (let k = 0; k < 30; k++) {
      coords.push(faceletToFbCoord(scrambleToFacelet(randomScramble(rng, 20))));
    }

    // 每个非零朝向目标：solved 表（复用）+ 专用表（oracle）应给出一致的距离
    for (const target of targets.slice(0, 3)) {
      const oracle = buildDistanceTableFrom(target); // 独立 BFS
      buildDistanceTable(); // solved 表（仅首次真正 BFS）
      for (const coord of coords) {
        expect(fbDistanceTo(coord, target), `target=${target} coord=${coord}`).toBe(oracle[coord]);
      }
    }
  }, 180000);
});
