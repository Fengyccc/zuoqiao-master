import { useCallback, useState } from 'react'
import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  solvedFacelet,
  scrambleToFacelet,
  randomScramble,
  solveBridges,
  selectBest,
  movesToString,
  parseMoves,
  faceletToNet,
  EDGE_POS_NAMES,
  drTierLabel,
  orientLabel,
  BOTTOM_PAIRS,
  type Facelet,
  type BridgeChoice,
  type BridgeSolution,
} from '../../core'
import './index.scss'

// 面索引(0-5 = U R F D L B) -> 展示颜色（标准配色）
const COLOR_MAP = ['#ffffff', '#e53935', '#43a047', '#fdd835', '#fb8c00', '#1e88e5']
const FACE_LABELS = ['U', 'R', 'F', 'D', 'L', 'B']

/** 从 facelet 取出某个面的 9 个贴纸颜色（CSS 颜色字符串） */
function faceColors(f: Facelet, face: number): string[] {
  const out: string[] = []
  for (let i = 0; i < 9; i++) out.push(COLOR_MAP[f[face * 9 + i]])
  return out
}

/** DR 棱轨迹 -> 展示文本（如 `DF → UL → UF`） */
function drTrajectoryText(traj: number[]): string {
  return traj.map((p) => EDGE_POS_NAMES[p]).join(' → ')
}

/** DR 棱信息行文本 */
function drInfoText(s: BridgeSolution): string {
  return `DR 棱：${drTrajectoryText(s.drTrajectory)}（${EDGE_POS_NAMES[s.drPos]} · ${drTierLabel(s.drTier)}）`
}

/** 判断两个底色对是否相同 */
function samePair(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

function FaceView({ colors, label }: { colors: string[]; label: string }) {
  return (
    <View className='face'>
      <Text className='face-label'>{label}</Text>
      <View className='face-grid'>
        {colors.map((c, i) => (
          <View key={i} className='sticker' style={{ backgroundColor: c }} />
        ))}
      </View>
    </View>
  )
}

export default function Index() {
  const [facelet, setFacelet] = useState<Facelet>(() => solvedFacelet())
  const [scramble, setScramble] = useState('')
  const [importText, setImportText] = useState('')
  const [solution, setSolution] = useState<BridgeChoice | null>(null)
  const [error, setError] = useState('')
  const [solving, setSolving] = useState(false)
  const [bottomPair, setBottomPair] = useState<[number, number]>([0, 3])

  // 展开图重排（方向正确），渲染用
  const net = faceletToNet(facelet)

  const doScramble = useCallback(() => {
    // random-move 打乱（csTimer 333ni）：随机 20 步面转，即时生成
    const moves = randomScramble(Math.random)
    setFacelet(scrambleToFacelet(moves))
    setScramble(movesToString(moves))
    setSolution(null)
  }, [])

  const doReset = useCallback(() => {
    setFacelet(solvedFacelet())
    setScramble('')
    setSolution(null)
  }, [])

  // 复制打乱记法到剪贴板（导出）
  const doCopy = useCallback(() => {
    if (!scramble) {
      Taro.showToast({ title: '当前无打乱', icon: 'none' })
      return
    }
    Taro.setClipboardData({ data: scramble })
      .then(() => Taro.showToast({ title: '打乱已复制', icon: 'success' }))
      .catch(() => Taro.showToast({ title: '复制失败', icon: 'none' }))
  }, [scramble])

  // 从输入框导入打乱记法
  const doImport = useCallback(() => {
    const text = importText.trim()
    if (!text) {
      Taro.showToast({ title: '请输入打乱记法', icon: 'none' })
      return
    }
    try {
      const moves = parseMoves(text)
      if (moves.length === 0) throw new Error('空打乱')
      setFacelet(scrambleToFacelet(moves))
      setScramble(movesToString(moves))
      setSolution(null)
      setError('')
      setImportText('')
      Taro.showToast({ title: `已导入 ${moves.length} 步`, icon: 'success' })
    } catch (e) {
      setError('导入失败：' + (e as Error).message)
    }
  }, [importText])

  // 跳转到计时页
  const goTimer = useCallback(() => {
    Taro.navigateTo({ url: '/pages/timer/index' })
  }, [])

  // 切换底色对
  const selectBottomPair = useCallback((b: [number, number]) => {
    setBottomPair(b)
    setSolution(null)
  }, [])

  const doSolve = useCallback(() => {
    setSolving(true)
    setError('')
    // 先让 loading 状态渲染，再执行同步求解（首次会构建距离表 + 8 桥 A*，耗时较长）
    setTimeout(() => {
      try {
        const results = solveBridges(facelet, bottomPair)
        if (results.length === 0) throw new Error('无可用桥')
        setSolution(selectBest(results))
      } catch (e) {
        setSolution(null)
        setError('求解失败：' + (e as Error).message)
      } finally {
        setSolving(false)
      }
    }, 50)
  }, [facelet, bottomPair])

  return (
    <View className='page'>
      <View className='hero'>
        <Text className='title'>左桥大师</Text>
        <Text className='subtitle'>Roux 左桥（First Block）求解训练</Text>
      </View>

      <View className='net'>
        <View className='net-row'>
          <FaceView colors={faceColors(net, 0)} label='U' />
        </View>
        <View className='net-row'>
          <FaceView colors={faceColors(net, 4)} label='L' />
          <FaceView colors={faceColors(net, 2)} label='F' />
          <FaceView colors={faceColors(net, 1)} label='R' />
          <FaceView colors={faceColors(net, 5)} label='B' />
        </View>
        <View className='net-row'>
          <FaceView colors={faceColors(net, 3)} label='D' />
        </View>
      </View>

      <View className='info'>
        <Text className='info-label'>底色</Text>
        <View className='bottom-pair-options'>
          {BOTTOM_PAIRS.map((p) => (
            <Button
              key={p.name}
              className={`btn-mini${samePair(p.bottoms, bottomPair) ? ' active' : ''}`}
              onClick={() => selectBottomPair(p.bottoms)}
            >{p.name}</Button>
          ))}
        </View>
      </View>

      {scramble ? (
        <View className='info'>
          <View className='info-row'>
            <Text className='info-label'>打乱</Text>
            <Button className='btn-mini' onClick={doCopy}>复制</Button>
          </View>
          <Text className='info-text'>{scramble}</Text>
        </View>
      ) : null}

      <View className='info'>
        <Text className='info-label'>导入打乱</Text>
        <View className='import-row'>
          <Input
            className='import-input'
            value={importText}
            onInput={(e) => setImportText(e.detail.value)}
            placeholder='粘贴打乱记法，如 R U F'
          />
          <Button className='btn-mini' onClick={doImport}>导入</Button>
        </View>
      </View>

      {solution ? (
        <View className='info solution'>
          <Text className='info-label'>
            最优 · {solution.best.config.name}（{solution.best.shortest.totalMoves} 步）
          </Text>
          <Text className='info-text'>
            {solution.best.shortest.totalMoves === 0
              ? '（已还原）'
              : movesToString(solution.best.shortest.moves)}
          </Text>
          <Text className='info-sub'>
            坐标 {orientLabel(solution.best.config.targetOrient)} · 左手 {solution.best.shortest.leftHandMoves} 次 · 连色对 {solution.best.connectedPairs} 组
          </Text>
          <Text className='info-sub'>{drInfoText(solution.best.shortest)}</Text>
        </View>
      ) : null}

      {solution && solution.best.drBest !== solution.best.shortest ? (
        <View className='info solution'>
          <Text className='info-label'>
            DR 最佳 · {solution.best.config.name}（{solution.best.drBest.totalMoves} 步）
          </Text>
          <Text className='info-text'>{movesToString(solution.best.drBest.moves)}</Text>
          <Text className='info-sub'>
            坐标 {orientLabel(solution.best.config.targetOrient)} · 左手 {solution.best.drBest.leftHandMoves} 次 · {drInfoText(solution.best.drBest)}
          </Text>
        </View>
      ) : null}

      {solution?.alternative ? (
        <View className='info solution'>
          <Text className='info-label'>
            连色对备选 · {solution.alternative.config.name}（{solution.alternative.shortest.totalMoves} 步）
          </Text>
          <Text className='info-text'>{movesToString(solution.alternative.shortest.moves)}</Text>
          <Text className='info-sub'>
            坐标 {orientLabel(solution.alternative.config.targetOrient)} · 左手 {solution.alternative.shortest.leftHandMoves} 次 · 连色对 {solution.alternative.connectedPairs} 组
          </Text>
        </View>
      ) : null}

      {error ? (
        <View className='info error'>
          <Text className='info-text'>{error}</Text>
        </View>
      ) : null}

      <View className='actions'>
        <Button className='btn primary' onClick={doSolve} loading={solving} disabled={solving}>
          求解左桥
        </Button>
        <Button className='btn' onClick={doScramble}>随机打乱</Button>
        <Button className='btn ghost' onClick={doReset}>重置</Button>
        <Button className='btn ghost' onClick={goTimer}>计时练习</Button>
      </View>
    </View>
  )
}
