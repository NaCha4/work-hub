interface Props {
  type?: 'date' | 'time'
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}

/**
 * 칸 아무 데나 눌러도 달력(시간이면 시계)이 열린다.
 * 브라우저 기본 동작은 오른쪽 끝 작은 아이콘을 정확히 눌러야만 열려서,
 * 결국 날짜를 손으로 치게 된다. 날짜 입력은 전부 이걸 쓴다.
 */
export default function DateInput({ type = 'date', value, onChange, autoFocus }: Props) {
  return (
    <input
      type={type}
      className="input"
      value={value}
      autoFocus={autoFocus}
      onClick={(e) => e.currentTarget.showPicker?.()}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
