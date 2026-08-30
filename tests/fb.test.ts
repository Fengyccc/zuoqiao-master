import { describe, it, expect } from 'vitest';
import { solvedFacelet, applyMoves } from '../src/core/moves';
import { faceletToCubie } from '../src/core/cube';
import { faceletToFbCoord, solvedFbCoord } from '../src/core/fb';
import { solveFbFromFacelet } from '../src/core/fbSolver';
import { randomScramble, scrambleToFacelet } from '../src/core/scramble';

/** 确定性伪随机数（LCG），保证测试可复现 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// 标准 Roux 左桥（1×2×3）的 5 个 piece 身份，硬编码在测试里，不依赖源码常量：
// 3 棱 = DL(7), FL(9), BL(11)；2 角 = DLF(7), DBL(6)。
// 其中 FL 与 BL 位于第二层（E 层），是关键——旧 bug 把它们误写成了底层的 DF/DB。
const FB_EDGE_IDS = [7, 9, 11];
const FB_CORNER_IDS = [7, 6];

describe('左桥（First Block）标准定义', () => {
  it('求解后 DL/FL/BL 三棱 + DLF/DBL 两角全部归位且朝向正确', () => {
    const rng = makeRng(4242);
    for (let k = 0; k < 30; k++) {
      const f = scrambleToFacelet(randomScramble(rng, 20));
      const sol = solveFbFromFacelet(f);
      const final = applyMoves(f, sol);
      const c = faceletToCubie(final);

      for (const id of FB_EDGE_IDS) {
        expect(c.ep[id], `棱 ${id} 未归位`).toBe(id);
        expect(c.eo[id], `棱 ${id} 朝向错`).toBe(0);
      }
      for (const id of FB_CORNER_IDS) {
        expect(c.cp[id], `角 ${id} 未归位`).toBe(id);
        expect(c.co[id], `角 ${id} 朝向错`).toBe(0);
      }
    }
  }, 180000);

  it('已还原状态求解返回空解（0 步）', () => {
    expect(solveFbFromFacelet(solvedFacelet())).toEqual([]);
  });

  it('solvedFbCoord 与标准左桥 5 piece 在还原位置的编码一致', () => {
    const c = faceletToCubie(solvedFacelet());
    expect(faceletToFbCoord(solvedFacelet())).toBe(solvedFbCoord());
    // 显式核对：还原时 FL=9 在位置 9、BL=11 在位置 11
    expect(c.ep[9]).toBe(9);
    expect(c.ep[11]).toBe(11);
  });
});
