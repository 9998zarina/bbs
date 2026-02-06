// 카드 변형
const variants = {
  default: 'bg-slate-900/50 backdrop-blur-xl border border-slate-800/50',
  gradient: 'backdrop-blur-xl border border-slate-800/50',
  result: 'bg-slate-900/50 backdrop-blur-xl',
  solid: 'bg-slate-900 border border-slate-800/50'
};

// 그라데이션 옵션 (gradient 변형일 때)
const gradients = {
  emerald: 'bg-gradient-to-br from-emerald-500/10 to-teal-500/10',
  blue: 'bg-gradient-to-br from-blue-500/10 to-indigo-500/10',
  purple: 'bg-gradient-to-br from-purple-500/10 to-pink-500/10',
  none: ''
};

// 패딩 크기
const paddings = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
};

// 라운드 크기
const radiuses = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl'
};

function Card({
  variant = 'default',
  gradient = 'none',
  padding = 'md',
  rounded = '2xl',
  className = '',
  children,
  onClick,
  ...props
}) {
  const isClickable = typeof onClick === 'function';

  return (
    <div
      onClick={onClick}
      className={`
        ${variants[variant]}
        ${variant === 'gradient' ? gradients[gradient] : ''}
        ${paddings[padding]}
        ${radiuses[rounded]}
        ${isClickable ? 'cursor-pointer hover:bg-slate-800/50 transition-all' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
