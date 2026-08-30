import { describe, it, expect } from 'vitest';
import { movesToString, parseMoves, invertMoves } from '../src/core/notation';
import { randomScramble, scrambleToFacelet } from '../src/core/scramble';
import { applyMoves, solvedFacelet } from '../src/core/moves';

/** 确定性伪随机数（LCG），保证测试可复现 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('打乱记法解析（导入/导出）', () => {
  it('movesToString → parseMoves 往返一致（面转打乱）', () => {
    const rng = makeRng(42);
    for (let k = 0; k < 5; k++) {
      const moves = randomScramble(rng, 20);
      expect(parseMoves(movesToString(moves))).toEqual(moves);
    }
  });

  it('支持宽转（小写）与中层转（M E S）记号', () => {
    const wide = parseMoves("r u' f2");
    expect(wide.length).toBe(3);
    expect(movesToString(wide)).toBe("r u' f2");

    const slice = parseMoves("M E' S2");
    expect(slice.length).toBe(3);
    expect(movesToString(slice)).toBe("M E' S2");
  });

  it('非法记号抛错', () => {
    expect(() => parseMoves('R U X')).toThrow();
    expect(() => parseMoves('')).not.toThrow(); // 空串 -> []
    expect(parseMoves('')).toEqual([]);
  });

  it('导入打乱 → 逆打乱还原（闭环）', () => {
    const rng = makeRng(7);
    const moves = randomScramble(rng, 20);
    const imported = parseMoves(movesToString(moves));
    const f = scrambleToFacelet(imported);
    const back = applyMoves(f, invertMoves(imported));
    expect(Array.from(back)).toEqual(Array.from(solvedFacelet()));
  });
});
