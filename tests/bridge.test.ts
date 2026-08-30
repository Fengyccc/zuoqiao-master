import { describe, it, expect } from 'vitest';
import {
  solvedFacelet,
  applyMove,
  applyMoves,
  moveIdByName,
  stickerIndex,
  FACE_D,
  FACE_L,
  FACE_U,
  type Facelet,
} from '../src/core/moves';
import { faceletToCubie, EDGE_FACES, CORNER_FACES, EDGE_PERM, EDGE_ORI } from '../src/core/cube';
import { randomScramble, scrambleToFacelet } from '../src/core/scramble';
import { movesToString } from '../src/core/notation';
import {
  buildBridgeConfigs,
  connectedPairCount,
  solveBridges,
  selectBest,
  applyWholeRotation,
  orientLabel,
  LEFT_WEIGHT,
  DR_SLACK,
  EDGE_POS_NAMES,
  drTier,
  BOTTOM_PAIRS,
  type BridgeConfig,
} from '../src/core/bridge';

/** 确定性伪随机数（LCG），保证测试可复现 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** 面索引(0-5) 中心贴纸在 facelet 中的下标 = face*9 + 4（3×3 中间格） */
function centerColor(f: Facelet, face: number): number {
  return f[face * 9 + 4];
}

/** 独立核验：从 DR 棱初始 (pos, ori) 回放 moves，得到最终 (pos, ori) */
function drAfterMoves(drPos0: number, drOri0: number, moves: number[]): { pos: number; ori: number } {
  let pos = drPos0;
  let ori = drOri0;
  for (const m of moves) {
    ori ^= EDGE_ORI[m][pos];
    pos = EDGE_PERM[m][pos];
  }
  return { pos, ori };
}

/** 面法向量（与 moves.ts 一致） */
const NORMALS: [number, number, number][] = [
  [0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, -1], [-1, 0, 0], [0, -1, 0],
];
function add3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * 校验某个 config 的桥在 final 状态里已还原。
 * 判定标准是「每个 home 块的贴纸颜色 == 相邻中心颜色」，与 eo/co 朝向约定无关，
 * 从而独立于求解器内部实现（对双底四色桥的非标准中心朝向同样成立）。
 */
function expectBlockSolved(final: Facelet, config: BridgeConfig): void {
  const c = faceletToCubie(final);
  // 中心朝向 = config（底色落 D，侧色落 L）
  expect(centerColor(final, FACE_D), `${config.name} 底色不在 D 面`).toBe(config.bottom);
  expect(centerColor(final, FACE_L), `${config.name} 侧色不在 L 面`).toBe(config.side);

  // 3 棱归位到 DL/FL/BL，且贴纸与中心同色
  const edgeHome = [7, 9, 11] as const; // DL, FL, BL
  const edgeNames = ['DL', 'FL', 'BL'] as const;
  for (let i = 0; i < 3; i++) {
    const p = edgeHome[i];
    expect(c.ep[p], `${config.name} ${edgeNames[i]} 棱未归位`).toBe(config.edges[i]);
    const [f1, f2] = EDGE_FACES[p];
    const pos = add3(NORMALS[f1], NORMALS[f2]);
    expect(final[stickerIndex(pos, NORMALS[f1])], `${config.name} ${edgeNames[i]} 棱 f1 贴纸色错`).toBe(centerColor(final, f1));
    expect(final[stickerIndex(pos, NORMALS[f2])], `${config.name} ${edgeNames[i]} 棱 f2 贴纸色错`).toBe(centerColor(final, f2));
  }

  // 2 角归位到 DLF/DBL，且贴纸与中心同色
  const cornerHome = [7, 6] as const; // DLF, DBL
  const cornerNames = ['DLF', 'DBL'] as const;
  for (let i = 0; i < 2; i++) {
    const p = cornerHome[i];
    expect(c.cp[p], `${config.name} ${cornerNames[i]} 角未归位`).toBe(config.corners[i]);
    const [f1, f2, f3] = CORNER_FACES[p];
    const pos = add3(add3(NORMALS[f1], NORMALS[f2]), NORMALS[f3]);
    expect(final[stickerIndex(pos, NORMALS[f1])], `${config.name} ${cornerNames[i]} 角 f1 贴纸色错`).toBe(centerColor(final, f1));
    expect(final[stickerIndex(pos, NORMALS[f2])], `${config.name} ${cornerNames[i]} 角 f2 贴纸色错`).toBe(centerColor(final, f2));
    expect(final[stickerIndex(pos, NORMALS[f3])], `${config.name} ${cornerNames[i]} 角 f3 贴纸色错`).toBe(centerColor(final, f3));
  }
}

describe('双底四色桥配置', () => {
  it('共有 8 种配置（白/黄 × 红/绿/蓝/橙），名称与配色一致', () => {
    const configs = buildBridgeConfigs();
    expect(configs.length).toBe(8);
    const names = configs.map((c) => c.name);
    expect(names).toContain('白底红桥');
    expect(names).toContain('白底绿桥');
    expect(names).toContain('白底蓝桥');
    expect(names).toContain('白底橙桥');
    expect(names).toContain('黄底红桥');
    expect(names).toContain('黄底绿桥');
    expect(names).toContain('黄底蓝桥');
    expect(names).toContain('黄底橙桥');
    // 目标朝向唯一且有效
    for (const c of configs) {
      expect(c.targetOrient).toBeGreaterThanOrEqual(0);
      expect(c.targetOrient).toBeLessThan(24);
    }
  });
});

describe('宽转（wide move）定义', () => {
  it('r = R + M′：中心 U→B、F→U（白中心移到 B，绿中心移到 U）', () => {
    const f = applyMove(solvedFacelet(), moveIdByName('r'));
    expect(centerColor(f, 5)).toBe(0); // B 面中心 = 白
    expect(centerColor(f, FACE_U)).toBe(2); // U 面中心 = 绿
    expect(centerColor(f, FACE_D)).toBe(5); // D 面中心 = 蓝
  });

  it('u = U + E′：中心 F→L、L→B（绿中心移到 L）', () => {
    const f = applyMove(solvedFacelet(), moveIdByName('u'));
    expect(centerColor(f, 4)).toBe(2); // L 面中心 = 绿
    expect(centerColor(f, 5)).toBe(4); // B 面中心 = 橙
  });

  it('宽转与面转的 facelet 置换复合一致（r = R 后 M′）', () => {
    const base = solvedFacelet();
    const viaWide = applyMove(base, moveIdByName('r'));
    const viaFace = applyMoves(base, [moveIdByName('R'), moveIdByName("M'")]);
    expect(Array.from(viaWide)).toEqual(Array.from(viaFace));
  });
});

describe('连色对检测', () => {
  it('还原态：任意 config 的 4 组棱角对全部相连', () => {
    const f = solvedFacelet();
    for (const c of buildBridgeConfigs()) {
      expect(connectedPairCount(f, c), c.name).toBe(4);
    }
  });

  it('打乱态：连色对数量落在 [0,4] 区间', () => {
    const f = scrambleToFacelet(randomScramble(makeRng(7), 20));
    for (const c of buildBridgeConfigs()) {
      const n = connectedPairCount(f, c);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
});

describe('多桥求解（带权 A*）', () => {
  it('8 配置 × 随机打乱：解出来后桥归位且中心朝向正确', () => {
    const rng = makeRng(424242);
    const configs = buildBridgeConfigs();
    for (let k = 0; k < 8; k++) {
      const f = scrambleToFacelet(randomScramble(rng, 20));
      const results = solveBridges(f);
      expect(results.length).toBe(8);
      for (const r of results) {
        const final = applyMoves(applyWholeRotation(f, r.config.targetOrient), r.shortest.moves);
        expectBlockSolved(final, r.config);
        // 代价 = 右手(1) + 左手(LEFT_WEIGHT) 的加权和
        expect(r.shortest.cost).toBe(
          r.shortest.totalMoves - r.shortest.leftHandMoves + LEFT_WEIGHT * r.shortest.leftHandMoves,
        );
      }
    }
  }, 180000);

  it('已还原状态：任意桥都是 0 步（整体旋转后桥块已在归位位置）', () => {
    const results = solveBridges(solvedFacelet());
    for (const r of results) {
      expect(r.shortest.totalMoves, r.config.name).toBe(0);
    }
    const choice = selectBest(results);
    expect(choice.best.shortest.totalMoves).toBe(0);
  });

  it('selectBest 返回最优 + 连色对备选（若最优无连色对）', () => {
    const rng = makeRng(99);
    for (let k = 0; k < 4; k++) {
      const f = scrambleToFacelet(randomScramble(rng, 20));
      const choice = selectBest(solveBridges(f));
      expect(choice.best).toBeTruthy();
      if (choice.best.connectedPairs === 0) {
        // 备选（若存在）必须有连色对
        if (choice.alternative) {
          expect(choice.alternative.connectedPairs).toBeGreaterThanOrEqual(1);
          expect(choice.alternative).not.toBe(choice.best);
        }
      } else {
        // 最优已带连色对，则不另设备选
        expect(choice.alternative).toBeNull();
      }
    }
  });

  it('解法记法可正常格式化，且最优解坐标以「X顶X前」标注', () => {
    const rng = makeRng(5);
    const f = scrambleToFacelet(randomScramble(rng, 20));
    const choice = selectBest(solveBridges(f));
    const s = movesToString(choice.best.shortest.moves);
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
    // 坐标说明形如「白顶绿前」等（顶/前各一个颜色名）
    const label = orientLabel(choice.best.config.targetOrient);
    expect(label).toMatch(/^.{1,2}顶.{1,2}前$/);
  });
});

describe('右桥 DR 棱跟踪', () => {
  it('已还原态：最优解（0 步）DR 棱在 DR 位、色相正确（tier 0）', () => {
    const choice = selectBest(solveBridges(solvedFacelet()));
    expect(choice.best.shortest.totalMoves).toBe(0);
    expect(choice.best.shortest.drPos).toBe(5);
    expect(choice.best.shortest.drOri).toBe(0);
    expect(choice.best.shortest.drTier).toBe(0);
    expect(choice.best.shortest.drTrajectory).toEqual([5]);
  });

  it('随机打乱：DR 棱最终状态与独立重放一致，轨迹正确，drBest 不差于最短', () => {
    const rng = makeRng(20240830);
    for (let k = 0; k < 8; k++) {
      const f = scrambleToFacelet(randomScramble(rng, 20));
      for (const r of solveBridges(f)) {
        const rotated = applyWholeRotation(f, r.config.targetOrient);
        const c = faceletToCubie(rotated);
        const drPos0 = c.ep.indexOf(r.config.drEdge);
        const drOri0 = c.eo[drPos0];
        // 最短解的 DR 最终 (pos, ori) 与独立重放一致（核验追踪正确）
        const end = drAfterMoves(drPos0, drOri0, r.shortest.moves);
        expect(r.shortest.drPos).toBe(end.pos);
        expect(r.shortest.drOri).toBe(end.ori);
        expect(r.shortest.drTier).toBe(drTier(r.shortest.drPos, r.shortest.drOri));
        // 轨迹：长度 = moves+1，首 = 初始位置，尾 = 最终位置
        expect(r.shortest.drTrajectory.length).toBe(r.shortest.moves.length + 1);
        expect(r.shortest.drTrajectory[0]).toBe(drPos0);
        expect(r.shortest.drTrajectory[r.shortest.moves.length]).toBe(r.shortest.drPos);
        // drBest：桥同样归位；tier 不差于最短；代价不超过 slack
        expectBlockSolved(applyMoves(rotated, r.drBest.moves), r.config);
        expect(r.drBest.drTier).toBeLessThanOrEqual(r.shortest.drTier);
        expect(r.drBest.cost).toBeLessThanOrEqual(r.shortest.cost + DR_SLACK);
        expect(r.drBest.drTier).toBe(drTier(r.drBest.drPos, r.drBest.drOri));
      }
    }
  }, 180000);

  it('记号名表与位置一致（12 个棱位置）', () => {
    expect(EDGE_POS_NAMES.length).toBe(12);
    expect(EDGE_POS_NAMES[0]).toBe('UF');
    expect(EDGE_POS_NAMES[5]).toBe('DR');
    expect(EDGE_POS_NAMES[11]).toBe('BL');
  });
});

describe('底色对选择（白黄/红橙/蓝绿）', () => {
  it('三对底色各生成 8 种配置，bottom 属于该对、side 不属于该对', () => {
    for (const pair of BOTTOM_PAIRS) {
      const configs = buildBridgeConfigs(pair.bottoms);
      expect(configs.length).toBe(8);
      for (const c of configs) {
        expect(pair.bottoms).toContain(c.bottom);
        expect(pair.bottoms).not.toContain(c.side);
      }
    }
  });

  it('红橙底：4 红 + 4 橙，侧色为白黄绿蓝', () => {
    const configs = buildBridgeConfigs([1, 4]);
    const bottoms = configs.map((c) => c.bottom);
    expect(bottoms.filter((b) => b === 1).length).toBe(4);
    expect(bottoms.filter((b) => b === 4).length).toBe(4);
    expect(new Set(configs.map((c) => c.side))).toEqual(new Set([0, 3, 2, 5]));
  });

  it('随机打乱：三对底色求解后桥均归位', () => {
    const rng = makeRng(2024);
    for (const pair of BOTTOM_PAIRS) {
      const f = scrambleToFacelet(randomScramble(rng, 20));
      const results = solveBridges(f, pair.bottoms);
      expect(results.length).toBe(8);
      for (const r of results) {
        expectBlockSolved(applyMoves(applyWholeRotation(f, r.config.targetOrient), r.shortest.moves), r.config);
      }
    }
  }, 180000);
});
