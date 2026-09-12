import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { randomScramble, movesToString, formatTime, ao5, ao12 } from '../../core'
import './index.scss'

interface Solve {
  time: number
  scramble: string
  timestamp: number
}

type Phase = 'idle' | 'ready' | 'running' | 'stopped'

const SOLVES_KEY = 'zuoqiao.solves'

function genScramble(): string {
  return movesToString(randomScramble(Math.random))
}

export default function Timer() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [displayTime, setDisplayTime] = useState(0)
  const [lastResult, setLastResult] = useState<number | null>(null)
  const [scramble, setScramble] = useState<string>(genScramble)
  const [solves, setSolves] = useState<Solve[]>(() => {
    try {
      const v = Taro.getStorageSync(SOLVES_KEY)
      if (!Array.isArray(v)) return []
      // 过滤脏数据（旧版本/异常写入导致的字段缺失会让序号与时间渲染成乱码）
      return (v as Solve[]).filter(
        (s) =>
          s &&
          typeof s.time === 'number' &&
          Number.isFinite(s.time) &&
          typeof s.timestamp === 'number' &&
          typeof s.scramble === 'string',
      )
    } catch {
      return []
    }
  })

  const startTimeRef = useRef(0)

  // 成绩持久化
  useEffect(() => {
    Taro.setStorageSync(SOLVES_KEY, solves)
  }, [solves])

  // 计时进行中刷新显示
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => {
      setDisplayTime(Date.now() - startTimeRef.current)
    }, 33)
    return () => clearInterval(id)
  }, [phase])

  const startRunning = useCallback(() => {
    startTimeRef.current = Date.now()
    setDisplayTime(0)
    setPhase('running')
  }, [])

  const stop = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current
    setLastResult(elapsed)
    setPhase('stopped')
    setSolves((prev) => [{ time: elapsed, scramble, timestamp: Date.now() }, ...prev])
    setScramble(genScramble())
  }, [scramble])

  const onTouchStart = useCallback(() => {
    if (phase === 'idle' || phase === 'stopped') {
      setPhase('ready')
    } else if (phase === 'running') {
      stop()
    }
  }, [phase, stop])

  const onTouchEnd = useCallback(() => {
    if (phase === 'ready') {
      startRunning()
    }
  }, [phase, startRunning])

  const onTouchCancel = useCallback(() => {
    if (phase === 'ready') {
      setPhase('idle')
    }
  }, [phase])

  const clearSolves = useCallback(() => {
    Taro.showModal({
      title: '清空成绩',
      content: '确定删除全部计时成绩吗？',
      success: (res) => {
        if (res.confirm) setSolves([])
      },
    })
  }, [])

  const times = solves.map((s) => s.time)
  const ao5Val = ao5(times)
  const ao12Val = ao12(times)

  let displayText: string
  let hintText: string
  if (phase === 'running') {
    displayText = formatTime(displayTime)
    hintText = '点按停止'
  } else if (phase === 'stopped') {
    displayText = formatTime(lastResult ?? 0)
    hintText = '按住开始下一次'
  } else if (phase === 'ready') {
    displayText = '0.00'
    hintText = '松手开始计时'
  } else {
    displayText = '0.00'
    hintText = '按住开始计时'
  }

  return (
    <View className='timer-page'>
      <View className='timer-scramble'>
        <View className='timer-scramble-head'>
          <Text className='timer-scramble-label'>打乱</Text>
          <Button className='btn-mini' onClick={() => setScramble(genScramble())}>新打乱</Button>
        </View>
        <Text className='timer-scramble-text'>{scramble}</Text>
      </View>

      <View
        className={`timer-display phase-${phase}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <Text className='timer-time'>{displayText}</Text>
        <Text className='timer-hint'>{hintText}</Text>
      </View>

      <View className='timer-stats'>
        <View className='stat'>
          <Text className='stat-label'>ao5</Text>
          <Text className='stat-value'>{ao5Val != null ? formatTime(ao5Val) : '—'}</Text>
        </View>
        <View className='stat'>
          <Text className='stat-label'>ao12</Text>
          <Text className='stat-value'>{ao12Val != null ? formatTime(ao12Val) : '—'}</Text>
        </View>
        <View className='stat'>
          <Text className='stat-label'>次数</Text>
          <Text className='stat-value'>{solves.length}</Text>
        </View>
      </View>

      <View className='timer-toolbar'>
        <Button className='btn-mini' onClick={clearSolves}>清空成绩</Button>
      </View>

      <View className='solves-list'>
        {solves.length === 0 ? (
          <Text className='solves-empty'>暂无成绩</Text>
        ) : (
          solves.map((s, i) => (
            <View className='solve-item' key={`${s.timestamp}-${i}`}>
              <Text className='solve-index'>{solves.length - i}</Text>
              <Text className='solve-time'>{formatTime(s.time)}</Text>
              <Text className='solve-scramble'>{s.scramble}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  )
}
