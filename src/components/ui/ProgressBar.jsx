// 프로그레스바 컬러
const colors = {
  emerald: 'from-emerald-500 to-teal-500',
  blue: 'from-blue-500 to-indigo-500',
  purple: 'from-purple-500 to-pink-500',
  red: 'from-red-500 to-rose-500'
};

// 프로그레스바 높이
const heights = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3'
};

function ProgressBar({
  progress = 0,
  color = 'emerald',
  height = 'md',
  showLabel = false,
  className = ''
}) {
  // 0-100 사이로 제한
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between text-sm text-slate-400 mb-1">
          <span>진행률</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className={`w-full bg-slate-800 rounded-full ${heights[height]}`}>
        <div
          className={`
            bg-gradient-to-r ${colors[color]}
            ${heights[height]} rounded-full transition-all duration-300
          `}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;
