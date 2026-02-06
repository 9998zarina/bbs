// 위험도 뱃지 스타일
const riskStyles = {
  low: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  medium: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
  high: 'bg-red-500/10 border-red-500/20 text-red-400'
};

// 검사 타입 뱃지 스타일
const testTypeStyles = {
  TUG: 'bg-emerald-500/20 text-emerald-400',
  BBS: 'bg-blue-500/20 text-blue-400',
  '10M': 'bg-purple-500/20 text-purple-400'
};

// 뱃지 크기
const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-xs',
  lg: 'px-4 py-1.5 text-sm'
};

// 위험도 라벨
const riskLabels = {
  low: '낮음',
  medium: '중간',
  high: '높음'
};

function Badge({
  variant = 'risk',
  value,
  size = 'md',
  className = '',
  children
}) {
  const getStyle = () => {
    if (variant === 'risk') {
      return riskStyles[value] || riskStyles.medium;
    }
    if (variant === 'testType') {
      return testTypeStyles[value] || testTypeStyles.TUG;
    }
    return '';
  };

  const getLabel = () => {
    if (children) return children;
    if (variant === 'risk') {
      return riskLabels[value] || value;
    }
    return value;
  };

  return (
    <span
      className={`
        inline-flex items-center justify-center
        rounded-full font-medium border
        ${getStyle()}
        ${sizes[size]}
        ${className}
      `}
    >
      {getLabel()}
    </span>
  );
}

export default Badge;
