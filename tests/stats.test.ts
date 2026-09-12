import { describe, it, expect } from 'vitest';
import { averageOf, ao5, ao12, formatTime } from '../src/core/stats';

describe('成绩统计（ao5/ao12 与时间格式化）', () => {
  it('不足数量返回 null', () => {
    expect(ao5([])).toBeNull();
    expect(ao5([1000, 2000, 3000, 4000])).toBeNull();
    expect(ao12([1000])).toBeNull();
  });

  it('ao5：去掉最好最坏取平均', () => {
    // 1..5s，去掉 1s 和 5s，剩 2/3/4 平均 = 3s
    expect(ao5([1000, 2000, 3000, 4000, 5000])).toBe(3000);
  });

  it('ao12：去掉最好最坏取平均', () => {
    const times = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000];
    // 去掉 1000 和 12000，剩 2000..11000 共 10 个，平均 = 6500
    expect(ao12(times)).toBe(6500);
  });

  it('ao5 只取最近 5 个', () => {
    // 成绩数组为「最新在前」：最近 5 个 = 前 5 个 = 5000..1000，平均 3000
    const times = [5000, 4000, 3000, 2000, 1000, 10000, 10000, 10000];
    expect(ao5(times)).toBe(3000);
  });

  it('averageOf 对任意 size 通用', () => {
    // size=3：去掉最好最坏，剩 1 个 = 中间值
    expect(averageOf([1000, 3000, 2000], 3)).toBe(2000);
  });

  it('formatTime 格式化（0.01s 精度，超 1 分钟带分）', () => {
    expect(formatTime(0)).toBe('0.00');
    expect(formatTime(12345)).toBe('12.34');
    expect(formatTime(83456)).toBe('1:23.45');
    expect(formatTime(60000)).toBe('1:00.00');
    expect(formatTime(123456)).toBe('2:03.45');
  });
});
