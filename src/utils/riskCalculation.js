// TUG 테스트 위험도 계산
export function calculateTUGRisk(seconds) {
  if (seconds < 10) {
    return { level: 'low', label: '낮음', color: 'emerald' };
  } else if (seconds < 14) {
    return { level: 'medium', label: '중간', color: 'yellow' };
  } else {
    return { level: 'high', label: '높음', color: 'red' };
  }
}

// BBS 테스트 위험도 계산
export function calculateBBSRisk(score) {
  if (score >= 41) {
    return { level: 'low', label: '낮음', color: 'emerald' };
  } else if (score >= 21) {
    return { level: 'medium', label: '중간', color: 'yellow' };
  } else {
    return { level: 'high', label: '높음', color: 'red' };
  }
}

// 10M 보행검사 위험도 계산
export function calculate10MRisk(speedMs) {
  if (speedMs >= 1.0) {
    return { level: 'low', label: '정상', color: 'emerald' };
  } else if (speedMs >= 0.8) {
    return { level: 'medium', label: '경도 장애', color: 'yellow' };
  } else {
    return { level: 'high', label: '기능적 제한', color: 'red' };
  }
}

// 위험도 컬러 클래스 반환
export function getRiskColorClasses(level) {
  const colorMap = {
    low: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      gradient: 'from-emerald-500 to-teal-500'
    },
    medium: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      text: 'text-yellow-400',
      gradient: 'from-yellow-500 to-orange-500'
    },
    high: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      gradient: 'from-red-500 to-rose-500'
    }
  };
  return colorMap[level] || colorMap.medium;
}
