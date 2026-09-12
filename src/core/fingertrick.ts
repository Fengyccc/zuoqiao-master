/**
 * 顺手度（fingertrick）评分层 —— 纯 TS，无依赖。
 *
 * 对已求出的左桥解法打分，用于排序与 UI 展示；不改搜索的移动集、不把起手做成搜索状态。
 *
 * 模型（Roux 左桥右手起手/换手）：
 * - 三种右手起手：
 *   up     上起手（拇指 UR）：做 R'、R'2、R'U、r'、B 顺手
 *   neutral 中立起手（拇指 RF）：做 U、u、D 层、R'F 顺手
 *   down    下起手（拇指 DR）：做 R、R2、RU、R2B 顺手
 * - 换手：追踪拇指位置；拇指在 U 面却要做 R、或在 D 面却要做 R'，都需要换手。
 *   （「拇指不能到 B 层」→ 通过提高 B 层权重体现，v1 不硬禁止。）
 * - 左手顺手 S、F'：其中 S 是中层转、当前解不输出（0–17 纯面转），故只把 F' 计入左手。
 *
 * move id（面转 0–17）：U=0 U2=1 U'=2 · D=3 D2=4 D'=5 · R=6 R2=7 R'=8 ·
 * L=9 L2=10 L'=11 · F=12 F2=13 F'=14 · B=15 B2=16 B'=17
 */

export type Grip = 'up' | 'neutral' | 'down';

/** 每种起手的中文标签（UI 用） */
export const GRIP_LABELS: Record<Grip, string> = {
  up: '上起手',
  neutral: '中立起手',
  down: '下起手',
};

/** 起手 -> 中文标签 */
export function gripLabel(g: Grip): string {
  return GRIP_LABELS[g];
}

// 面转常量
const R = 6;
const RP = 8; // R'

/**
 * 每个面转（0–17）的静态顺手权重。
 * A* 边权与评分共用；全部 ≥1 以保证启发式 fbDistanceTo 仍可采纳。
 * L(9,10,11)=3（左手）、B(15,16,17)=2（降低 B 层权重）、其余=1。
 */
export const MOVE_WEIGHT: number[] = [
  1, 1, 1, // U  U2 U'
  1, 1, 1, // D  D2 D'
  1, 1, 1, // R  R2 R'
  3, 3, 3, // L  L2 L'
  1, 1, 1, // F  F2 F'
  2, 2, 2, // B  B2 B'
];

/** 每次换手的惩罚代价（可调） */
export const REGRIP_COST = 2;

/** 左手转动：L / L2 / L'（9,10,11）或 F'（14） */
export function isLeftHandMove(move: number): boolean {
  return move === 9 || move === 10 || move === 11 || move === 14;
}

/** 单个 move 的静态顺手权重 */
export function moveCost(move: number): number {
  return MOVE_WEIGHT[move];
}

/** 一次起手/换手模拟的结果 */
export interface GripSimulation {
  cost: number; // Σ moveCost + REGRIP_COST × regrips
  regrips: number;
}

/** 以指定起手模拟整串 move，返回顺手度总分与换手次数 */
export function simulateGrip(grip: Grip, moves: number[]): GripSimulation {
  let g = grip;
  let cost = 0;
  let regrips = 0;
  for (const m of moves) {
    cost += moveCost(m);
    if (m === R) {
      // 做 R：拇指落在 U 面需要换手；之后落在 D 面（下起手）
      if (g === 'up') regrips++;
      g = 'down';
    } else if (m === RP) {
      // 做 R'：拇指落在 D 面需要换手；之后落在 U 面（上起手）
      if (g === 'down') regrips++;
      g = 'up';
    }
    // 其余（R2/U/D/F/B/L）保持当前起手
  }
  return { cost: cost + REGRIP_COST * regrips, regrips };
}

/** 顺手度评分结果 */
export interface FingertrickScore {
  grip: Grip; // 最优起手（三种里顺手度总分最小者）
  regrips: number; // 换手次数
  bMoves: number; // B 层转动次数
  leftHandMoves: number; // 左手转动次数（L + F'）
  cost: number; // 顺手度总分 = Σ moveCost + REGRIP_COST × regrips
}

/**
 * 对一串 move 做顺手度评分：分别以三种起手模拟，取总分最小者为最优起手，
 * 同时统计 B 层与左手转动次数。
 */
export function scoreFingertrick(moves: number[]): FingertrickScore {
  let bMoves = 0;
  let leftHandMoves = 0;
  for (const m of moves) {
    if (m === 15 || m === 16 || m === 17) bMoves++;
    if (isLeftHandMove(m)) leftHandMoves++;
  }

  const grips: Grip[] = ['up', 'neutral', 'down'];
  let best: GripSimulation & { grip: Grip } | null = null;
  for (const grip of grips) {
    const r = simulateGrip(grip, moves);
    if (
      best === null ||
      r.cost < best.cost ||
      (r.cost === best.cost && r.regrips < best.regrips)
    ) {
      best = { grip, cost: r.cost, regrips: r.regrips };
    }
  }

  return {
    grip: best!.grip,
    regrips: best!.regrips,
    bMoves,
    leftHandMoves,
    cost: best!.cost,
  };
}
