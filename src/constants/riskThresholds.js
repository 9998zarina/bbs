// TUG 테스트 위험도 기준
export const TUG_THRESHOLDS = {
  LOW: 10,      // < 10초: 낮은 위험
  MEDIUM: 14,   // 10-14초: 중간 위험
  // >= 14초: 높은 위험
};

// BBS 테스트 위험도 기준
export const BBS_THRESHOLDS = {
  LOW: 41,      // >= 41점: 낮은 위험
  MEDIUM: 21,   // 21-40점: 중간 위험
  // < 21점: 높은 위험
};

// 10M 보행검사 위험도 기준 (m/s)
export const WALK_10M_THRESHOLDS = {
  NORMAL: 1.0,      // >= 1.0 m/s: 정상
  MILD: 0.8,        // 0.8-1.0 m/s: 경도 장애
  // < 0.8 m/s: 기능적 제한
};

// 위험도 레벨 정의
export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

// 위험도 라벨 (한국어)
export const RISK_LABELS = {
  low: '낮음',
  medium: '중간',
  high: '높음'
};
