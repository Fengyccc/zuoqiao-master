import { describe, it, expect } from 'vitest';
import { randomScramble, scrambleToFacelet } from '../src/core/scramble';
import { applyMoves, solvedFacelet } from '../src/core/moves';
import { invertMoves } from '../src/core/notation';

/** 确定性伪随机数生成器（LCG），返回 [0,1) */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 与 scramble.ts 内的 FACE_AXIS_GROUP 一致：U/D=0, R/L=1, F/B=2
const FACE_AXIS_GROUP = [0, 0, 1, 1, 2, 2];

describe('random-move 打乱（csTimer 333ni）', () => {
  it('默认 20 步，可指定长度', () => {
    expect(randomScramble(lcg(1)).length).toBe(20);
    expect(randomScramble(lcg(1), 30).length).toBe(30);
  });

  it('仅含 18 个面转（move id ∈ [0,18)）', () => {
    const moves = randomScramble(lcg(2), 200);
    for (const m of moves) {
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(18);
    }
  });

  it('相邻两步不同面、且不同轴', () => {
    const moves = randomScramble(lcg(3), 500);
    for (let i = 1; i < moves.length; i++) {
      const prevFace = Math.floor(moves[i - 1] / 3);
      const face = Math.floor(moves[i] / 3);
      expect(face).not.toBe(prevFace);
      expect(FACE_AXIS_GROUP[face]).not.toBe(FACE_AXIS_GROUP[prevFace]);
    }
  });

  it('打乱 + 逆打乱 = 还原', () => {
    const rng = lcg(4);
    for (let k = 0; k < 20; k++) {
      const scramble = randomScramble(rng, 20);
      const scrambled = scrambleToFacelet(scramble);
      expect(Array.from(applyMoves(scrambled, invertMoves(scramble)))).toEqual(
        Array.from(solvedFacelet()),
      );
    }
  });

  it('确定性 rng 下结果可复现', () => {
    const a = randomScramble(lcg(5), 20);
    const b = randomScramble(lcg(5), 20);
    expect(a).toEqual(b);
  });
});
