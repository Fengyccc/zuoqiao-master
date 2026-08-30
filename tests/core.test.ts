import { describe, it, expect } from 'vitest';
import {
  solvedFacelet,
  applyMove,
  applyMoves,
  MOVE_COUNT,
} from '../src/core/moves';
import {
  faceletToCubie,
  cubieToFacelet,
  solvedCubie,
} from '../src/core/cube';
import {
  faceletToFbCoord,
  cubieToFbCoord,
  solvedFbCoord,
  applyMoveToFb,
} from '../src/core/fb';
import { solveFb, buildDistanceTable } from '../src/core/fbSolver';
import { randomScramble, scrambleToFacelet } from '../src/core/scramble';
import { parseMoves, invertMoves, movesToString } from '../src/core/notation';

/** 确定性伪随机数（LCG），保证测试可复现 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('facelet <-> cubie 转换', () => {
  it('solved facelet 转 cubie 得到单位状态', () => {
    const c = faceletToCubie(solvedFacelet());
    for (let i = 0; i < 12; i++) {
      expect(c.ep[i]).toBe(i);
      expect(c.eo[i]).toBe(0);
    }
    for (let i = 0; i < 8; i++) {
      expect(c.cp[i]).toBe(i);
      expect(c.co[i]).toBe(0);
    }
  });

  it('随机打乱下 cubie -> facelet 往返一致', () => {
    const rng = makeRng(12345);
    for (let k = 0; k < 50; k++) {
      const f = scrambleToFacelet(randomScramble(rng, 20));
      const c = faceletToCubie(f);
      const f2 = cubieToFacelet(c);
      expect(Array.from(f2)).toEqual(Array.from(f));
    }
  });

  it('cubieToFacelet(solvedCubie) 等于 solvedFacelet', () => {
    expect(Array.from(cubieToFacelet(solvedCubie()))).toEqual(Array.from(solvedFacelet()));
  });
});

describe('转动定义', () => {
  it('每个转动满足阶数（90° 阶 4，180° 阶 2）', () => {
    const solved = Array.from(solvedFacelet());
    for (let m = 0; m < MOVE_COUNT; m++) {
      const order = m % 3 === 1 ? 2 : 4;
      let f = solvedFacelet();
      for (let k = 0; k < order; k++) f = applyMove(f, m);
      expect(Array.from(f), `move ${m} 阶数错误`).toEqual(solved);
    }
  });

  it('逆打乱能还原到初始状态', () => {
    const rng = makeRng(999);
    for (let k = 0; k < 20; k++) {
      const scramble = randomScramble(rng, 20);
      const f = scrambleToFacelet(scramble);
      const restored = applyMoves(f, invertMoves(scramble));
      expect(Array.from(restored)).toEqual(Array.from(solvedFacelet()));
    }
  });
});

describe('FB 坐标', () => {
  it('已还原状态对应 solvedFbCoord', () => {
    expect(faceletToFbCoord(solvedFacelet())).toBe(solvedFbCoord());
    expect(cubieToFbCoord(solvedCubie())).toBe(solvedFbCoord());
  });

  it('applyMoveToFb 与 facelet 转动一致', () => {
    const rng = makeRng(77);
    const f = scrambleToFacelet(randomScramble(rng, 20));
    const coord = faceletToFbCoord(f);
    for (let m = 0; m < 18; m++) {
      const coord2 = applyMoveToFb(coord, m);
      const f2 = applyMove(f, m);
      expect(coord2).toBe(faceletToFbCoord(f2));
    }
  });
});

describe('FB 求解器', () => {
  it('随机打乱下求解结果能还原左桥', () => {
    const rng = makeRng(42);
    const solvedCoord = solvedFbCoord();
    for (let k = 0; k < 30; k++) {
      const scramble = randomScramble(rng, 20);
      const f = scrambleToFacelet(scramble);
      const coord = faceletToFbCoord(f);
      const sol = solveFb(coord);
      const final = applyMoves(f, sol);
      expect(faceletToFbCoord(final)).toBe(solvedCoord);
    }
  }, 180000);

  it('解步数等于距离表给出的最短步数', () => {
    const d = buildDistanceTable();
    const rng = makeRng(2024);
    for (let k = 0; k < 20; k++) {
      const coord = faceletToFbCoord(scrambleToFacelet(randomScramble(rng, 20)));
      const sol = solveFb(coord);
      expect(sol.length).toBe(d[coord]);
    }
  }, 180000);

  it('FB 最优解步数在合理上限内', () => {
    const rng = makeRng(6);
    let maxLen = 0;
    for (let k = 0; k < 50; k++) {
      const coord = faceletToFbCoord(scrambleToFacelet(randomScramble(rng, 20)));
      const sol = solveFb(coord);
      if (sol.length > maxLen) maxLen = sol.length;
    }
    expect(maxLen).toBeLessThanOrEqual(12);
  }, 180000);
});

describe('记号解析', () => {
  it('parseMoves 与 movesToString 往返', () => {
    const s = "R U' F2 M E' S";
    const moves = parseMoves(s);
    expect(movesToString(moves)).toBe(s);
  });

  it('非法记号抛出异常', () => {
    expect(() => parseMoves('X1')).toThrow();
  });
});
