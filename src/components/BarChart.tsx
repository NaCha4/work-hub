export interface Bar {
  key: string
  /** 가로축에 적을 이름 */
  label: string
  value: number
  /** 막대 색. 없으면 강조색 */
  color?: string
}

interface Props {
  bars: Bar[]
  /** 세로축 최댓값을 고정하고 싶을 때. 없으면 자료 중 가장 큰 값에 맞춘다. */
  max?: number
  height?: number
  /** 값이 0인 칸도 자리를 남길지 */
  unit?: string
}

/**
 * 막대 그래프. 차트 라이브러리를 들이지 않으려고 직접 그린다.
 * 쓰는 곳이 통계 한 화면뿐이라 축·범례 같은 일반 기능은 만들지 않는다.
 *
 * 세로 크기는 픽셀로 잡고 가로는 폭에 맞춰 늘어난다. 막대 수가 달라져도
 * 칸이 고르게 나뉘도록 flex 로 두고, 막대만 SVG 대신 div 높이로 그린다.
 * 그 편이 글자 크기·색 변수를 CSS 로 그대로 물려받아 테마가 자동으로 맞는다.
 */
export default function BarChart({ bars, max, height = 120, unit = '' }: Props) {
  const top = Math.max(max ?? 0, ...bars.map((b) => b.value), 1)

  return (
    <div className="chart" style={{ ['--chart-h' as string]: `${height}px` }}>
      {bars.map((b) => (
        <div className="chart-col" key={b.key} title={`${b.label} ${b.value}${unit}`}>
          <div className="chart-track">
            <div
              className="chart-bar"
              style={{
                height: `${(b.value / top) * 100}%`,
                ...(b.color ? { background: b.color } : {}),
              }}
            />
          </div>
          <div className="chart-val">{b.value || ''}</div>
          <div className="chart-label">{b.label}</div>
        </div>
      ))}
    </div>
  )
}
