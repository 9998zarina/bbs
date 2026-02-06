// 스피너 크기
const sizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-3',
  lg: 'w-12 h-12 border-4'
};

// 스피너 컬러
const colors = {
  emerald: 'border-emerald-500 border-t-transparent',
  blue: 'border-blue-500 border-t-transparent',
  purple: 'border-purple-500 border-t-transparent',
  white: 'border-white border-t-transparent'
};

function Spinner({
  size = 'md',
  color = 'emerald',
  className = ''
}) {
  return (
    <div
      className={`
        rounded-full animate-spin
        ${sizes[size]}
        ${colors[color]}
        ${className}
      `}
    />
  );
}

// 로딩 오버레이 (전체 화면)
function LoadingOverlay({
  message = '로딩 중...',
  color = 'emerald'
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-50">
      <div className="text-center">
        <Spinner size="lg" color={color} className="mx-auto mb-4" />
        <p className="text-white">{message}</p>
      </div>
    </div>
  );
}

export { Spinner as default, LoadingOverlay };
