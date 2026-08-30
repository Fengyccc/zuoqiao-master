import { describe, it, expect } from 'vitest';
import { solvedFacelet, applyMove, moveIdByName } from '../src/core/moves';
import { faceletToNet } from '../src/core/net';

describe('2D 展开图布局', () => {
  it('还原态每面纯色', () => {
    const net = faceletToNet(solvedFacelet());
    for (let face = 0; face < 6; face++) {
      for (let k = 0; k < 9; k++) {
        expect(net[face * 9 + k]).toBe(face);
      }
    }
  });

  it('U 转动：四个侧面顶行正确旋转（F←R, R←B, B←L, L←F）', () => {
    const f = applyMove(solvedFacelet(), moveIdByName('U'));
    const net = faceletToNet(f);
    // F 面顶行(row0) 接收 R 面颜色 = 红(1)
    expect([net[18], net[19], net[20]]).toEqual([1, 1, 1]);
    // R 面顶行 = 蓝(5)
    expect([net[9], net[10], net[11]]).toEqual([5, 5, 5]);
    // B 面顶行 = 橙(4)
    expect([net[45], net[46], net[47]]).toEqual([4, 4, 4]);
    // L 面顶行 = 绿(2)
    expect([net[36], net[37], net[38]]).toEqual([2, 2, 2]);
    // U 面本身不变（全白）
    expect([net[0], net[4], net[8]]).toEqual([0, 0, 0]);
  });

  it('F 转动：相邻面边缘正确旋转（U←L, R←U, D←R, L←D）', () => {
    const f = applyMove(solvedFacelet(), moveIdByName('F'));
    const net = faceletToNet(f);
    // U 面底行(row2) = 橙(4)
    expect([net[6], net[7], net[8]]).toEqual([4, 4, 4]);
    // R 面左列(col0) = 白(0)
    expect([net[9], net[12], net[15]]).toEqual([0, 0, 0]);
    // D 面顶行(row0) = 红(1)
    expect([net[27], net[28], net[29]]).toEqual([1, 1, 1]);
    // L 面右列(col2) = 黄(3)
    expect([net[38], net[41], net[44]]).toEqual([3, 3, 3]);
  });
});
