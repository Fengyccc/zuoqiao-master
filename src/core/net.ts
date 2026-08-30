/**
 * 2D 展开图（net）布局。
 *
 * 把 facelet（54 贴纸，按面分块、面内按坐标双循环存储）重排为「标准展开图」顺序，
 * 页面只要按每面 row-major 渲染即为方向正确的展开图：
 *
 *        U
 *   L  F  R  B
 *        D
 *
 * 关键：facelet 面内顺序由 3D 坐标生成（a,b 双循环），其「行/列」并非展开图的视觉方向。
 * 本模块用贴纸坐标 pos 推导每个面在展开图中的正确 (row, col)，保证相邻面公共边颜色对齐。
 */

import { FACE_U, FACE_D, FACE_F, FACE_B, FACE_R, FACE_L, STICKER_POS, type Facelet, type Vec3 } from './moves';

/**
 * 贴纸坐标 pos -> 该面展开图上的 (row, col)（row/col ∈ {0,1,2}，row 向下、col 向右）。
 * 各面从「外侧看向该面」的视角约定（白顶绿前）：
 *   U 从上方看、F 从前方看、R 从右方看、L 从左方看、B 从后方看、D 从下方看。
 */
function posToNet(face: number, pos: Vec3): [number, number] {
  const [x, y, z] = pos;
  switch (face) {
    case FACE_U: return [y + 1, x + 1]; // 上边=B(-y)，下边=F(+y)，左=L，右=R
    case FACE_D: return [1 - y, x + 1]; // 上边=F(+y)，下边=B(-y)，左=L，右=R
    case FACE_F: return [1 - z, x + 1]; // 上=U(+z)，下=D(-z)，左=L，右=R
    case FACE_B: return [1 - z, 1 - x]; // 上=U，下=D，左=R(+x)，右=L(-x)
    case FACE_R: return [1 - z, 1 - y]; // 上=U，下=D，左=F(+y)，右=B(-y)
    case FACE_L: return [1 - z, y + 1]; // 上=U，下=D，左=B(-y)，右=F(+y)
    default: throw new Error(`unknown face: ${face}`);
  }
}

/** 重排 facelet 为展开图顺序。返回 54 数组，每面 9 贴纸按 row-major 排列。 */
export function faceletToNet(f: Facelet): Facelet {
  const net = new Uint8Array(54);
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 9; k++) {
      const idx = face * 9 + k;
      const pos = STICKER_POS[idx];
      const [row, col] = posToNet(face, pos);
      net[face * 9 + row * 3 + col] = f[idx];
    }
  }
  return net;
}
