// 디자인 시스템 테마 토큰

// 컬러 팔레트
export const colors = {
  // 배경색
  bg: {
    primary: 'bg-slate-950',
    secondary: 'bg-slate-900',
    card: 'bg-slate-900/50',
    elevated: 'bg-slate-800/50',
    overlay: 'bg-slate-900/80'
  },

  // 브랜드 컬러 (검사별)
  brand: {
    tug: {
      gradient: 'from-emerald-500 to-teal-500',
      gradientHover: 'from-emerald-400 to-teal-400',
      primary: 'bg-emerald-500',
      text: 'text-emerald-400',
      muted: 'bg-emerald-500/20',
      border: 'border-emerald-500/50',
      shadow: 'shadow-emerald-500/25'
    },
    bbs: {
      gradient: 'from-blue-500 to-indigo-600',
      gradientHover: 'from-blue-400 to-indigo-500',
      primary: 'bg-blue-500',
      text: 'text-blue-400',
      muted: 'bg-blue-500/20',
      border: 'border-blue-500/50',
      shadow: 'shadow-blue-500/25'
    },
    walk10m: {
      gradient: 'from-purple-500 to-pink-600',
      gradientHover: 'from-purple-400 to-pink-500',
      primary: 'bg-purple-500',
      text: 'text-purple-400',
      muted: 'bg-purple-500/20',
      border: 'border-purple-500/50',
      shadow: 'shadow-purple-500/25'
    }
  },

  // 위험도 컬러
  risk: {
    low: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      textMuted: 'text-emerald-400/70'
    },
    medium: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      text: 'text-yellow-400',
      textMuted: 'text-yellow-400/70'
    },
    high: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      textMuted: 'text-red-400/70'
    }
  },

  // 텍스트 컬러
  text: {
    primary: 'text-white',
    secondary: 'text-slate-400',
    muted: 'text-slate-500',
    placeholder: 'placeholder-slate-500'
  },

  // 테두리 컬러
  border: {
    default: 'border-slate-800/50',
    light: 'border-slate-700/50',
    focus: {
      emerald: 'focus:border-emerald-500/50',
      blue: 'focus:border-blue-500/50',
      purple: 'focus:border-purple-500/50'
    }
  }
};

// 타이포그래피
export const typography = {
  // 제목
  h1: 'text-3xl font-bold tracking-tight',
  h2: 'text-2xl font-bold',
  h3: 'text-xl font-semibold',
  h4: 'text-lg font-semibold',

  // 본문
  body: 'text-base',
  bodySmall: 'text-sm',
  caption: 'text-xs',

  // 특수
  timer: 'font-mono text-2xl',
  timerLarge: 'font-mono text-5xl font-bold',

  // 라벨
  label: 'text-sm text-slate-400',
  inputLabel: 'block text-slate-400 text-sm mb-2'
};

// 스페이싱
export const spacing = {
  page: {
    wrapper: 'max-w-6xl mx-auto px-4',
    padding: 'px-4 py-8'
  },
  card: {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  },
  stack: {
    sm: 'space-y-2',
    md: 'space-y-4',
    lg: 'space-y-6'
  },
  gap: {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6'
  }
};

// 라운드
export const radius = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
  full: 'rounded-full'
};

// 그림자
export const shadows = {
  card: 'shadow-2xl',
  button: {
    emerald: 'shadow-lg shadow-emerald-500/25',
    blue: 'shadow-lg shadow-blue-500/25',
    purple: 'shadow-lg shadow-purple-500/25',
    red: 'shadow-lg shadow-red-500/30'
  }
};

// 애니메이션
export const animations = {
  spin: 'animate-spin',
  pulse: 'animate-pulse',
  bounce: 'animate-bounce'
};

// 트랜지션
export const transitions = {
  default: 'transition-all duration-200',
  fast: 'transition-all duration-150',
  slow: 'transition-all duration-300'
};

// 글래스모피즘 효과
export const glass = {
  card: 'bg-slate-900/50 backdrop-blur-xl border border-slate-800/50',
  header: 'bg-slate-900/50 backdrop-blur-xl border-b border-slate-800/50'
};

// 그라데이션 배경
export const gradients = {
  page: 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950',
  pageAccent: 'bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950'
};

// 공통 컴포넌트 스타일
export const componentStyles = {
  // 입력 필드
  input: `w-full bg-slate-800/50 border border-slate-700/50 rounded-xl py-3 px-4
          text-white placeholder-slate-500 focus:outline-none transition-all`,

  // 버튼 기본
  buttonBase: 'font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed',

  // 카드
  card: 'bg-slate-900/50 rounded-2xl border border-slate-800/50',

  // 뱃지
  badge: 'px-3 py-1 rounded-full text-xs font-medium'
};
