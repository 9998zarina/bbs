/**
 * BBS 2번 항목: 잡지 않고 서 있기 (Standing Unsupported) 분석
 *
 * 채점 기준:
 * 4점: 2분간 안전하게 서 있을 수 있다
 * 3점: 감독하에 2분간 서 있을 수 있다
 * 2점: 지지 없이 30초간 서 있을 수 있다
 * 1점: 여러 번 시도하여 지지 없이 30초간 서 있을 수 있다
 * 0점: 도움 없이 30초간 서 있을 수 없다
 */

// 자세 상태
export const StandingState = {
  NOT_STANDING: 'not_standing',
  STANDING_STABLE: 'standing_stable',
  STANDING_UNSTABLE: 'standing_unstable',
  SEEKING_SUPPORT: 'seeking_support',
  LOST_BALANCE: 'lost_balance',
};

// 안정성 수준
export const StabilityLevel = {
  EXCELLENT: 'excellent',   // 매우 안정적
  GOOD: 'good',             // 안정적
  MODERATE: 'moderate',     // 약간 흔들림
  POOR: 'poor',             // 불안정
  CRITICAL: 'critical',     // 심각하게 불안정
};

// 상태 히스토리 (안정성 측정용)
let positionHistory = [];
const POSITION_HISTORY_SIZE = 30; // 약 1초간의 데이터 (30fps 기준)

// 스웨이 히스토리 (흔들림 정도 기록)
let swayHistory = [];
const SWAY_HISTORY_SIZE = 60; // 약 2초간의 데이터

// 지지 요청 이벤트 히스토리
let supportSeekingEvents = [];

// 지지물 사용 히스토리 (안정적 판단용)
let supportUseHistory = [];
const SUPPORT_HISTORY_SIZE = 15; // 약 0.5초

/**
 * 각도 계산 헬퍼 함수
 */
function calculateAngle(a, b, c) {
  if (!a || !b || !c) return null;

  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);

  if (angle > 180) {
    angle = 360 - angle;
  }

  return angle;
}

/**
 * 두 점 사이의 거리 계산
 */
function calculateDistance(p1, p2) {
  if (!p1 || !p2) return 0;
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * 서 있는 자세인지 확인
 */
function detectStandingPosture(landmarks) {
  if (!landmarks || landmarks.length < 33) {
    return { isStanding: false, confidence: 0 };
  }

  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  // 무릎 각도 계산
  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

  // 엉덩이 각도 계산
  const leftHipAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
  const rightHipAngle = calculateAngle(rightShoulder, rightHip, rightKnee);

  if (!leftKneeAngle || !rightKneeAngle) {
    return { isStanding: false, confidence: 0 };
  }

  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
  const avgHipAngle = leftHipAngle && rightHipAngle
    ? (leftHipAngle + rightHipAngle) / 2
    : 180;

  // 서 있는 자세 판단 (무릎 140° 이상, 엉덩이 160° 이상)
  const isStanding = avgKneeAngle >= 140 && avgHipAngle >= 150;

  // 신뢰도 계산
  let confidence = 0;
  if (avgKneeAngle >= 160 && avgHipAngle >= 170) {
    confidence = 1.0;
  } else if (avgKneeAngle >= 150 && avgHipAngle >= 160) {
    confidence = 0.85;
  } else if (avgKneeAngle >= 140 && avgHipAngle >= 150) {
    confidence = 0.7;
  } else if (avgKneeAngle >= 130) {
    confidence = 0.4;
  }

  return {
    isStanding,
    confidence,
    kneeAngle: avgKneeAngle,
    hipAngle: avgHipAngle,
  };
}

/**
 * 신체 흔들림(스웨이) 측정
 */
function measureBodySway(landmarks) {
  if (!landmarks || landmarks.length < 33) {
    return { sway: 0, level: StabilityLevel.GOOD };
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const nose = landmarks[0];

  // 상체 중심점 계산
  const centerX = (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4;
  const centerY = (leftShoulder.y + rightShoulder.y + leftHip.y + rightHip.y) / 4;

  // 히스토리에 추가
  positionHistory.push({ x: centerX, y: centerY, timestamp: Date.now() });
  if (positionHistory.length > POSITION_HISTORY_SIZE) {
    positionHistory.shift();
  }

  // 스웨이 계산 (히스토리가 충분하면)
  if (positionHistory.length >= 10) {
    const recentPositions = positionHistory.slice(-10);

    // X축, Y축 이동량 계산
    let totalMovement = 0;
    for (let i = 1; i < recentPositions.length; i++) {
      const dx = Math.abs(recentPositions[i].x - recentPositions[i-1].x);
      const dy = Math.abs(recentPositions[i].y - recentPositions[i-1].y);
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }

    const avgSway = totalMovement / recentPositions.length;

    // 스웨이 히스토리 기록
    swayHistory.push(avgSway);
    if (swayHistory.length > SWAY_HISTORY_SIZE) {
      swayHistory.shift();
    }

    // 안정성 수준 결정
    let level = StabilityLevel.EXCELLENT;
    if (avgSway > 0.05) level = StabilityLevel.CRITICAL;
    else if (avgSway > 0.03) level = StabilityLevel.POOR;
    else if (avgSway > 0.02) level = StabilityLevel.MODERATE;
    else if (avgSway > 0.01) level = StabilityLevel.GOOD;

    return { sway: avgSway, level };
  }

  return { sway: 0, level: StabilityLevel.GOOD };
}

/**
 * 지지물 사용 감지 (벽, 지팡이, 의자 등을 잡고 있는지)
 * - 손이 몸 바깥쪽으로 많이 뻗어있는 경우
 * - 한 손이 다른 손보다 현저히 낮은 경우 (지팡이 사용)
 * - 손이 화면 가장자리에 있는 경우 (벽 잡기)
 */
function detectSupportUsage(landmarks) {
  if (!landmarks || landmarks.length < 33) {
    return { isUsing: false, type: null, message: '' };
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  // 어깨 너비 계산 (기준점)
  const shoulderWidth = calculateDistance(leftShoulder, rightShoulder);
  const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
  const hipCenterY = (leftHip.y + rightHip.y) / 2;

  let isUsing = false;
  let supportType = null;
  let message = '';

  // 1. 손이 화면 가장자리에 있는지 확인 (벽 잡기)
  // 정규화된 좌표에서 0.1 이하 또는 0.9 이상이면 가장자리
  const leftHandAtEdge = leftWrist.x < 0.12 || leftWrist.x > 0.88;
  const rightHandAtEdge = rightWrist.x < 0.12 || rightWrist.x > 0.88;

  if (leftHandAtEdge || rightHandAtEdge) {
    isUsing = true;
    supportType = 'wall';
    message = '⚠️ 벽/지지물 사용 중';
  }

  // 2. 팔이 몸 옆으로 많이 뻗어있는 경우 (지지대 잡기)
  const leftArmExtension = calculateDistance(leftWrist, leftShoulder) / shoulderWidth;
  const rightArmExtension = calculateDistance(rightWrist, rightShoulder) / shoulderWidth;

  // 팔이 어깨 너비의 1.8배 이상 뻗어있으면 지지물 사용으로 간주
  if (leftArmExtension > 1.8 || rightArmExtension > 1.8) {
    isUsing = true;
    supportType = 'rail';
    message = '⚠️ 지지대 사용 중';
  }

  // 3. 한 손이 다른 손보다 현저히 낮은 경우 (지팡이 사용)
  const wristHeightDiff = Math.abs(leftWrist.y - rightWrist.y);
  const oneHandVeryLow = leftWrist.y > hipCenterY + 0.1 || rightWrist.y > hipCenterY + 0.1;

  if (wristHeightDiff > 0.25 && oneHandVeryLow) {
    isUsing = true;
    supportType = 'cane';
    message = '⚠️ 지팡이/보조기구 사용 중';
  }

  // 4. 손이 어깨보다 옆으로 많이 벗어난 경우 (무언가를 잡고 있음)
  const leftHandFarOut = leftWrist.x < leftShoulder.x - shoulderWidth * 0.8;
  const rightHandFarOut = rightWrist.x > rightShoulder.x + shoulderWidth * 0.8;

  if (leftHandFarOut || rightHandFarOut) {
    isUsing = true;
    supportType = supportType || 'support';
    message = message || '⚠️ 지지물 사용 중';
  }

  // 히스토리에 추가하여 안정적 판단
  supportUseHistory.push(isUsing);
  if (supportUseHistory.length > SUPPORT_HISTORY_SIZE) {
    supportUseHistory.shift();
  }

  // 최근 히스토리에서 50% 이상 지지 사용이면 지지 중으로 판단
  const supportCount = supportUseHistory.filter(v => v).length;
  const stableIsUsing = supportCount >= supportUseHistory.length * 0.5;

  return {
    isUsing: stableIsUsing,
    type: stableIsUsing ? supportType : null,
    message: stableIsUsing ? message : '',
    debug: {
      leftArmExtension: leftArmExtension.toFixed(2),
      rightArmExtension: rightArmExtension.toFixed(2),
      leftHandAtEdge,
      rightHandAtEdge,
      supportCount,
    }
  };
}

/**
 * 지지 요청 행동 감지 (팔 뻗기, 잡으려고 함)
 */
function detectSupportSeeking(landmarks) {
  if (!landmarks || landmarks.length < 33) {
    return { seeking: false, type: null };
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  // 어깨 너비 계산 (기준점)
  const shoulderWidth = calculateDistance(leftShoulder, rightShoulder);

  // 팔이 옆으로 많이 뻗어있는지 확인
  const leftArmExtension = calculateDistance(leftWrist, leftShoulder) / shoulderWidth;
  const rightArmExtension = calculateDistance(rightWrist, rightShoulder) / shoulderWidth;

  // 팔이 몸 옆으로 뻗어있는 경우 (균형 잡으려고 함)
  const leftArmOut = leftWrist.x < leftShoulder.x - shoulderWidth * 0.5;
  const rightArmOut = rightWrist.x > rightShoulder.x + shoulderWidth * 0.5;

  // 손이 앞으로 뻗어있는 경우 (무언가 잡으려고 함)
  const leftHandForward = leftWrist.y < leftShoulder.y - 0.1;
  const rightHandForward = rightWrist.y < rightShoulder.y - 0.1;

  // 팔 뻗음 정도가 큰 경우
  const armsExtended = leftArmExtension > 1.5 || rightArmExtension > 1.5;
  const armsOut = leftArmOut || rightArmOut;
  const handsForward = leftHandForward && rightHandForward;

  if (armsExtended || armsOut || handsForward) {
    const event = {
      timestamp: Date.now(),
      type: handsForward ? 'reaching' : 'balancing',
    };
    supportSeekingEvents.push(event);

    // 최근 5초 이벤트만 유지
    const fiveSecondsAgo = Date.now() - 5000;
    supportSeekingEvents = supportSeekingEvents.filter(e => e.timestamp > fiveSecondsAgo);

    return {
      seeking: true,
      type: handsForward ? 'reaching' : 'balancing',
      message: handsForward ? '⚠️ 지지물을 찾는 중' : '⚠️ 균형 유지 중',
    };
  }

  return { seeking: false, type: null };
}

/**
 * 균형 상실 감지
 */
function detectBalanceLoss(landmarks, standingData) {
  if (!landmarks || !standingData) {
    return { lost: false };
  }

  // 서 있지 않은 경우 균형 상실로 판단
  if (!standingData.isStanding && standingData.confidence < 0.3) {
    return {
      lost: true,
      message: '⚠️ 균형 상실 - 서 있는 자세 유지 실패',
    };
  }

  // 급격한 자세 변화 감지
  if (positionHistory.length >= 5) {
    const recentPositions = positionHistory.slice(-5);
    const firstPos = recentPositions[0];
    const lastPos = recentPositions[recentPositions.length - 1];

    const rapidChange = Math.abs(lastPos.y - firstPos.y) > 0.1;

    if (rapidChange) {
      return {
        lost: true,
        message: '⚠️ 급격한 자세 변화 감지',
      };
    }
  }

  return { lost: false };
}

/**
 * 분석 상태 초기화
 */
export function resetStandingAnalysis() {
  positionHistory = [];
  swayHistory = [];
  supportSeekingEvents = [];
  supportUseHistory = [];
}

/**
 * 메인 분석 함수
 */
export function analyzeStandingUnsupported(landmarks) {
  if (!landmarks || landmarks.length < 33) {
    return {
      state: StandingState.NOT_STANDING,
      isStanding: false,
      isStandingUnsupported: false, // 지지 없이 서 있는지
      isUsingSupport: false,
      stability: StabilityLevel.GOOD,
      supportSeeking: false,
      balanceLost: false,
      confidence: 0,
      debug: { error: '랜드마크 데이터 없음' },
    };
  }

  // 1. 서 있는 자세 감지
  const standingData = detectStandingPosture(landmarks);

  // 2. 지지물 사용 감지 (벽, 지팡이 등)
  const supportUsageData = detectSupportUsage(landmarks);

  // 3. 신체 흔들림 측정
  const swayData = measureBodySway(landmarks);

  // 4. 지지 요청 행동 감지
  const supportData = detectSupportSeeking(landmarks);

  // 5. 균형 상실 감지
  const balanceData = detectBalanceLoss(landmarks, standingData);

  // 지지 없이 서 있는지 확인 (타이머 시작 조건)
  const isStandingUnsupported = standingData.isStanding && !supportUsageData.isUsing;

  // 최종 상태 결정
  let state = StandingState.NOT_STANDING;

  if (balanceData.lost) {
    state = StandingState.LOST_BALANCE;
  } else if (supportUsageData.isUsing) {
    state = StandingState.SEEKING_SUPPORT; // 지지물 사용 중
  } else if (supportData.seeking) {
    state = StandingState.SEEKING_SUPPORT;
  } else if (standingData.isStanding) {
    if (swayData.level === StabilityLevel.EXCELLENT || swayData.level === StabilityLevel.GOOD) {
      state = StandingState.STANDING_STABLE;
    } else {
      state = StandingState.STANDING_UNSTABLE;
    }
  }

  return {
    state,
    isStanding: standingData.isStanding,
    isStandingUnsupported, // ★ 핵심: 지지 없이 서 있는지
    isUsingSupport: supportUsageData.isUsing,
    supportUsageType: supportUsageData.type,
    supportUsageMessage: supportUsageData.message,
    stability: swayData.level,
    sway: swayData.sway,
    supportSeeking: supportData.seeking,
    supportType: supportData.type,
    supportMessage: supportData.message,
    balanceLost: balanceData.lost,
    balanceMessage: balanceData.message,
    confidence: standingData.confidence,
    debug: {
      kneeAngle: standingData.kneeAngle?.toFixed(1),
      hipAngle: standingData.hipAngle?.toFixed(1),
      sway: (swayData.sway * 100).toFixed(2),
      supportEvents: supportSeekingEvents.length,
      supportUsage: supportUsageData.debug,
    },
  };
}

/**
 * 점수 자동 계산
 * @param {number} standingDuration - 서 있은 시간 (초)
 * @param {boolean} neededSupport - 지지가 필요했는지
 * @param {boolean} lostBalance - 균형을 잃었는지
 * @param {number} unstableTime - 불안정했던 시간 (초)
 * @param {number} attemptCount - 시도 횟수
 */
export function calculateStandingScore(standingDuration, neededSupport, lostBalance, unstableTime, attemptCount = 1, movementData = null) {
  // 움직임 데이터 분석 (있는 경우)
  let hasExcessiveMovement = false;
  let movementDetails = '';
  if (movementData) {
    const lateralMovement = movementData.totalLateralMovement || 0;
    const frontBackMovement = movementData.totalFrontBackMovement || 0;
    const unstableEvents = movementData.unstableEvents || 0;

    // 과도한 움직임 판단 (좌우 또는 앞뒤 움직임이 많은 경우)
    hasExcessiveMovement = lateralMovement > 50 || frontBackMovement > 30 || unstableEvents > 10;
    if (hasExcessiveMovement) {
      movementDetails = `좌우:${lateralMovement.toFixed(1)}, 앞뒤:${frontBackMovement.toFixed(1)}, 불안정이벤트:${unstableEvents}`;
    }
  }

  // 균형을 잃었거나 30초를 버티지 못한 경우
  if (lostBalance || standingDuration < 30) {
    return {
      score: 0,
      reason: '도움 없이 30초간 서 있을 수 없음',
      details: `서 있은 시간: ${standingDuration.toFixed(1)}초`,
    };
  }

  // 30초는 버텼지만 여러 번 시도한 경우
  if (standingDuration >= 30 && standingDuration < 120 && attemptCount > 1) {
    return {
      score: 1,
      reason: '여러 번 시도하여 지지 없이 30초간 서 있을 수 있음',
      details: `시도 횟수: ${attemptCount}, 서 있은 시간: ${standingDuration.toFixed(1)}초`,
    };
  }

  // 30초만 버틴 경우
  if (standingDuration >= 30 && standingDuration < 120) {
    return {
      score: 2,
      reason: '지지 없이 30초간 서 있을 수 있음',
      details: `서 있은 시간: ${standingDuration.toFixed(1)}초`,
    };
  }

  // 2분(120초) 버텼지만 지지가 필요했거나 많이 흔들린 경우 (감독 필요)
  // 움직임 데이터도 고려 (좌우/앞뒤 움직임이 과도한 경우)
  if (standingDuration >= 120 && (neededSupport || unstableTime > 20 || hasExcessiveMovement)) {
    let detailReason = '';
    if (neededSupport) {
      detailReason = '지지물을 찾으려는 행동 감지';
    } else if (hasExcessiveMovement) {
      detailReason = `과도한 움직임 감지 (${movementDetails})`;
    } else {
      detailReason = `불안정 시간: ${unstableTime.toFixed(1)}초`;
    }
    return {
      score: 3,
      reason: '감독하에 2분간 서 있을 수 있음',
      details: detailReason,
    };
  }

  // 2분간 안전하게 서 있은 경우
  if (standingDuration >= 120) {
    return {
      score: 4,
      reason: '2분간 안전하게 서 있을 수 있음',
      details: '매우 안정적인 자세 유지',
    };
  }

  return {
    score: 0,
    reason: '평가 불가',
    details: '',
  };
}

/**
 * 평가 보고서 생성
 */
export function generateStandingReport(score, standingDuration, stabilityData, movementData = null) {
  const report = {
    itemNumber: 2,
    itemName: '잡지 않고 서 있기',
    score,
    maxScore: 4,
    testDuration: standingDuration,
    targetDuration: 120, // 2분
    assessment: '',
    recommendations: [],
    measurements: {
      standingTime: standingDuration.toFixed(1),
      avgStability: stabilityData.avgStability || 'N/A',
      supportSeekingEvents: stabilityData.supportEvents || 0,
      // 움직임 데이터 추가
      lateralMovement: movementData?.totalLateralMovement?.toFixed(1) || 'N/A',
      frontBackMovement: movementData?.totalFrontBackMovement?.toFixed(1) || 'N/A',
      unstableEvents: movementData?.unstableEvents || 0,
    },
  };

  // 평가 및 권장사항
  switch (score) {
    case 4:
      report.assessment = '균형 능력이 우수합니다. 2분간 안정적으로 서 있을 수 있습니다.';
      break;
    case 3:
      report.assessment = '균형 능력이 양호하나 약간의 불안정성이 관찰됩니다.';
      report.recommendations.push('정적 균형 훈련 권장');
      break;
    case 2:
      report.assessment = '30초간 서 있을 수 있으나 장시간 유지에 어려움이 있습니다.';
      report.recommendations.push('점진적 균형 훈련 필요');
      report.recommendations.push('지지물 근처에서 운동 권장');
      break;
    case 1:
      report.assessment = '균형 유지에 어려움이 있어 여러 번의 시도가 필요합니다.';
      report.recommendations.push('집중적인 균형 재활 프로그램 필요');
      report.recommendations.push('일상생활에서 낙상 주의');
      break;
    case 0:
      report.assessment = '독립적으로 서 있기 어렵습니다. 지속적인 지지가 필요합니다.';
      report.recommendations.push('전문 재활 치료 필요');
      report.recommendations.push('보조기구 사용 고려');
      report.recommendations.push('낙상 예방 환경 조성');
      break;
  }

  return report;
}
