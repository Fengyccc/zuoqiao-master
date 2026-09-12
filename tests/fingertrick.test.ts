import { describe, it, expect } from 'vitest';
import { moveIdByName } from '../src/core/moves';
import {
  MOVE_WEIGHT,
  moveCost,
  isLeftHandMove,
  simulateGrip,
  scoreFingertrick,
  gripLabel,
} from '../src/core/fingertrick';

const R = moveIdByName('R');
const RP = moveIdByName("R'");
const R2 = moveIdByName('R2');
const U = moveIdByName('U');
const D = moveIdByName('D');
const L = moveIdByName('L');
const LP = moveIdByName("L'");
const F = moveIdByName('F');
const FP = moveIdByName("F'");
const B = moveIdByName('B');

describe('顺手度权重表 MOVE_WEIGHT', () => {
  it('共 18 项，L=3、B=2、其余=1', () => {
    expect(MOVE_WEIGHT.length).toBe(18);
    expect(MOVE_WEIGHT[U]).toBe(1);
    expect(MOVE_WEIGHT[D]).toBe(1);
    expect(MOVE_WEIGHT[R]).toBe(1);
    expect(MOVE_WEIGHT[RP]).toBe(1);
    expect(MOVE_WEIGHT[F]).toBe(1);
    expect(MOVE_WEIGHT[FP]).toBe(1);
    expect(MOVE_WEIGHT[L]).toBe(3);
    expect(MOVE_WEIGHT[LP]).toBe(3);
    expect(MOVE_WEIGHT[B]).toBe(2);
    expect(moveCost(L)).toBe(3);
    expect(moveCost(B)).toBe(2);
    expect(moveCost(R)).toBe(1);
  });
});

describe('isLeftHandMove（L 与 F′）', () => {
  it('L / L′ / F′ 是左手，其余不是', () => {
    expect(isLeftHandMove(L)).toBe(true);
    expect(isLeftHandMove(LP)).toBe(true);
    expect(isLeftHandMove(FP)).toBe(true);
    expect(isLeftHandMove(F)).toBe(false);
    expect(isLeftHandMove(R)).toBe(false);
    expect(isLeftHandMove(B)).toBe(false);
  });
});

describe('simulateGrip 起手/换手', () => {
  it('上起手做 R′ 不换手，做 R 换手', () => {
    expect(simulateGrip('up', [RP]).regrips).toBe(0);
    expect(simulateGrip('up', [RP]).cost).toBe(1);
    expect(simulateGrip('up', [R]).regrips).toBe(1);
    expect(simulateGrip('up', [R]).cost).toBe(1 + 2);
  });

  it('下起手做 R 不换手，做 R′ 换手', () => {
    expect(simulateGrip('down', [R]).regrips).toBe(0);
    expect(simulateGrip('down', [R]).cost).toBe(1);
    expect(simulateGrip('down', [RP]).regrips).toBe(1);
    expect(simulateGrip('down', [RP]).cost).toBe(1 + 2);
  });

  it('中立起手做 U/D 不换手', () => {
    expect(simulateGrip('neutral', [U, D]).regrips).toBe(0);
    expect(simulateGrip('neutral', [U, D]).cost).toBe(2);
  });

  it('R2 不改变起手、不触发换手', () => {
    expect(simulateGrip('up', [R2]).regrips).toBe(0);
    expect(simulateGrip('down', [R2]).regrips).toBe(0);
  });
});

describe('scoreFingertrick 三起手取最优', () => {
  it('纯 R′ 序列：上起手最顺手（0 换手）', () => {
    const s = scoreFingertrick([RP, RP]);
    expect(s.grip).toBe('up');
    expect(s.regrips).toBe(0);
    expect(s.cost).toBe(2);
  });

  it('纯 R 序列：中立/下起手不换手，最优 0 换手', () => {
    const s = scoreFingertrick([R, R]);
    expect(s.regrips).toBe(0);
    expect(s.cost).toBe(2);
  });

  it('R 后接 R′ 强制换手：最优换手次数最小', () => {
    const s = scoreFingertrick([R, RP]);
    expect(s.regrips).toBe(1);
    expect(s.cost).toBe(1 + 1 + 2);
  });

  it('统计 bMoves 与 leftHandMoves（含 F′）', () => {
    const s = scoreFingertrick([B, FP, L]);
    expect(s.bMoves).toBe(1);
    expect(s.leftHandMoves).toBe(2);
    expect(s.cost).toBe(2 + 1 + 3); // 无 R/R′，三起手皆 0 换手
  });

  it('空解：0 步、0 换手、起手默认上起手', () => {
    const s = scoreFingertrick([]);
    expect(s.regrips).toBe(0);
    expect(s.cost).toBe(0);
    expect(s.leftHandMoves).toBe(0);
  });
});

describe('gripLabel', () => {
  it('三种起手的中文标签', () => {
    expect(gripLabel('up')).toBe('上起手');
    expect(gripLabel('neutral')).toBe('中立起手');
    expect(gripLabel('down')).toBe('下起手');
  });
});
