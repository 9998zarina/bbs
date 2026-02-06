// 검사 종류 정의
export const TEST_TYPES = {
  TUG: 'TUG',
  BBS: 'BBS',
  WALK_10M: '10M'
};

// 검사 정보
export const TEST_INFO = {
  TUG: {
    name: 'TUG 검사',
    fullName: 'Timed Up and Go Test',
    description: '의자에서 일어나 3m 걸어갔다 돌아와 앉는 시간을 측정합니다.',
    unit: '초',
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-500'
  },
  BBS: {
    name: 'BBS 검사',
    fullName: 'Berg Balance Scale',
    description: '14개 항목의 균형 능력을 평가합니다.',
    unit: '점',
    maxScore: 56,
    color: 'blue',
    gradient: 'from-blue-500 to-indigo-600'
  },
  '10M': {
    name: '10M 보행검사',
    fullName: '10-Meter Walk Test',
    description: '10미터를 걷는 시간과 속도를 측정합니다.',
    unit: 'm/s',
    color: 'purple',
    gradient: 'from-purple-500 to-pink-600'
  }
};

// 검사 아이콘 경로 (SVG)
export const TEST_ICONS = {
  TUG: 'M15 15.5V21m0-5.5L15.5 21m0 0h-1M3 11.5l4.5 4.5L12 11.5',
  BBS: 'M3 6h18M3 12h18M3 18h18',
  '10M': 'M13 10V3L4 14h7v7l9-11h-7z'
};
