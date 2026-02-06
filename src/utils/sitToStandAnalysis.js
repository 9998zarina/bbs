/**
 * MediaPipe Pose 기반 앉기/일어서기 자동 인식 시스템
 * BBS 항목 1번: 앉은 자세에서 일어서기
 *
 * 개선된 버전 - 정면에서도 정확한 감지
 *
 * 정면 인식 전략:
 * 1. 관절 간의 상대적 거리 및 비율 분석
 * 2. 엉덩이-무릎 Y축 좌표 비교
 * 3. 머리/어깨 높이 변화 추적 (Moving Average)
 * 4. 하체/상체 길이 비율 분석
 */

// MediaPipe Pose 랜드마크 인덱스
const LANDMARKS = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

/**
 * 세 점 사이의 각도 계산 (도 단위)
 */
function calculateAngle(pointA, pointB, pointC) {
  if (!pointA || !pointB || !pointC) return 180;

  const radians = Math.atan2(pointC.y - pointB.y, pointC.x - pointB.x) -
                  Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x);
  let angle = Math.abs(radians * 180.0 / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

/**
 * 두 점 사이의 거리 계산 (정규화된 좌표)
 */
function calculateDistance(pointA, pointB) {
  if (!pointA || !pointB) return 0;
  return Math.sqrt(Math.pow(pointA.x - pointB.x, 2) + Math.pow(pointA.y - pointB.y, 2));
}

/**
 * 랜드마크 가시성 체크
 */
function isVisible(landmark, threshold = 0.3) {
  return landmark && landmark.visibility > threshold;
}

/**
 * 여러 랜드마크의 평균 가시성
 */
function getAverageVisibility(landmarks, indices) {
  let total = 0;
  let count = 0;
  for (const idx of indices) {
    if (landmarks[idx]) {
      total += landmarks[idx].visibility || 0;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

/**
 * 자세 상태 (앉음/서있음)
 */
export const PostureState = {
  SITTING: 'sitting',
  STANDING: 'standing',
  UNKNOWN: 'unknown'
};

/**
 * 손 위치 상태
 */
export const HandPosition = {
  HANDS_UP: 'hands_up',
  HANDS_ON_KNEE: 'hands_on_knee',
  HANDS_PUSHING: 'hands_pushing',
  UNKNOWN: 'unknown'
};

/**
 * 손 사용 여부 (점수용)
 */
export const HandSupportState = {
  NO_SUPPORT: 'no_support',
  LIGHT_SUPPORT: 'light_support',
  HEAVY_SUPPORT: 'heavy_support',
  UNKNOWN: 'unknown'
};

// 상태 히스토리 (안정화용) - 더 큰 히스토리로 안정성 향상
let stateHistory = [];
const STATE_HISTORY_SIZE = 30; // 약 1초 (30fps 기준)

// 현재 확정 상태 (히스테리시스 적용)
let confirmedState = null;
let stateConfirmCount = 0;
const STATE_CONFIRM_THRESHOLD = 10; // 상태 변경에 필요한 연속 프레임 수

// 높이 히스토리 (정면 인식용 - Moving Average)
let headHeightHistory = [];
let shoulderHeightHistory = [];
const HEIGHT_HISTORY_SIZE = 30;
let initialStandingHeight = null; // 서 있을 때의 기준 높이

// 손 위치 추적 (밀기 감지용)
let wristPositionHistory = [];
const WRIST_HISTORY_SIZE = 20;
let transitionStartWristY = null; // 일어서기 시작할 때 손목 Y 위치
let transitionStartShoulderY = null; // 일어서기 시작할 때 어깨 Y 위치
let pushedDuringTransition = false; // 일어서는 동안 밀기 감지 여부

/**
 * 상태 히스토리 기반 안정화 (히스테리시스 적용)
 * - 한번 확정된 상태는 쉽게 바뀌지 않음
 * - 상태 변경에는 연속적인 프레임이 필요
 */
function getStableState(currentState, confidence) {
  stateHistory.push({ state: currentState, confidence, timestamp: Date.now() });

  if (stateHistory.length > STATE_HISTORY_SIZE) {
    stateHistory.shift();
  }

  // 최근 히스토리에서 가장 많은 상태 선택
  const stateCounts = {};
  const stateConfidences = {};

  for (const entry of stateHistory) {
    stateCounts[entry.state] = (stateCounts[entry.state] || 0) + 1;
    stateConfidences[entry.state] = (stateConfidences[entry.state] || 0) + entry.confidence;
  }

  let maxState = currentState;
  let maxCount = 0;

  for (const state in stateCounts) {
    if (stateCounts[state] > maxCount) {
      maxCount = stateCounts[state];
      maxState = state;
    }
  }

  // 히스테리시스 적용: 확정된 상태가 있으면 변경에 높은 임계값 적용
  if (confirmedState !== null) {
    // 현재 상태가 확정 상태와 같으면 유지
    if (maxState === confirmedState) {
      stateConfirmCount = 0;
      return confirmedState;
    }

    // 다른 상태로 변경하려면 80% 이상 + 연속 프레임 필요
    if (maxCount >= stateHistory.length * 0.8) {
      stateConfirmCount++;
      if (stateConfirmCount >= STATE_CONFIRM_THRESHOLD) {
        confirmedState = maxState;
        stateConfirmCount = 0;
        return confirmedState;
      }
    } else {
      stateConfirmCount = Math.max(0, stateConfirmCount - 1);
    }

    // 아직 변경 조건 미충족 - 기존 상태 유지
    return confirmedState;
  }

  // 첫 확정: 50% 이상이면 상태 확정
  if (maxCount >= stateHistory.length * 0.5) {
    confirmedState = maxState;
    return confirmedState;
  }

  return currentState;
}

/**
 * 히스토리 초기화
 */
export function resetStateHistory() {
  stateHistory = [];
  headHeightHistory = [];
  shoulderHeightHistory = [];
  initialStandingHeight = null;
  confirmedState = null;
  stateConfirmCount = 0;
  // 손 추적 초기화
  wristPositionHistory = [];
  transitionStartWristY = null;
  transitionStartShoulderY = null;
  pushedDuringTransition = false;
}

/**
 * 높이 이동 평균 계산
 */
function updateHeightHistory(noseY, shoulderY) {
  headHeightHistory.push(noseY);
  shoulderHeightHistory.push(shoulderY);

  if (headHeightHistory.length > HEIGHT_HISTORY_SIZE) {
    headHeightHistory.shift();
  }
  if (shoulderHeightHistory.length > HEIGHT_HISTORY_SIZE) {
    shoulderHeightHistory.shift();
  }
}

/**
 * 이동 평균 높이 가져오기
 */
function getAverageHeight(history) {
  if (history.length === 0) return 0;
  return history.reduce((a, b) => a + b, 0) / history.length;
}

/**
 * 앉은 자세 감지 (정면 인식 강화 버전)
 */
function detectSitting(landmarks) {
  const nose = landmarks[LANDMARKS.NOSE];
  const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER];
  const leftHip = landmarks[LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP];
  const leftKnee = landmarks[LANDMARKS.LEFT_KNEE];
  const rightKnee = landmarks[LANDMARKS.RIGHT_KNEE];
  const leftAnkle = landmarks[LANDMARKS.LEFT_ANKLE];
  const rightAnkle = landmarks[LANDMARKS.RIGHT_ANKLE];

  // 필수 랜드마크 체크
  const hipVisibility = getAverageVisibility(landmarks, [LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP]);
  const kneeVisibility = getAverageVisibility(landmarks, [LANDMARKS.LEFT_KNEE, LANDMARKS.RIGHT_KNEE]);
  const shoulderVisibility = getAverageVisibility(landmarks, [LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER]);

  if (hipVisibility < 0.3 || shoulderVisibility < 0.3) {
    return { isSitting: false, confidence: 0, details: {}, debug: '주요 랜드마크 감지 안됨' };
  }

  // 중심점 계산
  const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipCenterY = (leftHip.y + rightHip.y) / 2;
  const hipCenterX = (leftHip.x + rightHip.x) / 2;
  const kneeCenterY = kneeVisibility > 0.3 ? (leftKnee.y + rightKnee.y) / 2 : hipCenterY + 0.2;
  const kneeCenterX = kneeVisibility > 0.3 ? (leftKnee.x + rightKnee.x) / 2 : hipCenterX;
  const ankleCenterY = (leftAnkle?.y + rightAnkle?.y) / 2 || kneeCenterY + 0.2;
  const noseY = nose?.y || shoulderCenterY - 0.15;

  // 높이 히스토리 업데이트
  updateHeightHistory(noseY, shoulderCenterY);

  let confidence = 0;
  let debugInfo = [];

  // ========================================
  // 정면 인식을 위한 다중 지표 분석
  // ========================================

  // 1. 하체/상체 길이 비율 분석 (핵심 지표)
  // 서 있을 때: (골반~발목) / (골반~어깨) 비율이 큼 (보통 1.5~2.5)
  // 앉았을 때: 비율이 작아짐 (보통 0.3~1.2)
  const shoulderToHipDist = Math.abs(shoulderCenterY - hipCenterY);
  const hipToAnkleDist = Math.abs(hipCenterY - ankleCenterY);
  const bodyRatio = shoulderToHipDist > 0.05 ? hipToAnkleDist / shoulderToHipDist : 2.0;

  // 임계값 완화: 1.4 이하면 앉음 가능성 (기존 1.2)
  if (bodyRatio < 1.4) {
    // 앉았을 때 하체가 짧아 보임
    const ratioScore = Math.min(1, (1.4 - bodyRatio) / 0.9);
    confidence += ratioScore * 40; // 가중치 증가 (35 -> 40)
    debugInfo.push(`하체비율: ${bodyRatio.toFixed(2)} (앉음 +${(ratioScore * 40).toFixed(0)})`);
  } else if (bodyRatio > 1.6) {
    // 서 있을 때 하체가 길어 보임
    debugInfo.push(`하체비율: ${bodyRatio.toFixed(2)} (서있음)`);
  } else {
    debugInfo.push(`하체비율: ${bodyRatio.toFixed(2)} (중간)`);
  }

  // 2. 엉덩이-무릎 Y축 좌표 비교 (정면 핵심 지표)
  // 정면에서 앉으면 무릎이 엉덩이와 거의 같은 높이 또는 위로 올라옴
  const hipKneeYDiff = kneeCenterY - hipCenterY; // 양수: 무릎이 아래, 음수/0: 무릎이 위 또는 같은 높이

  // 임계값 완화: 0.12 이하면 앉음 가능성 (기존 0.08)
  if (hipKneeYDiff < 0.12) {
    // 무릎이 엉덩이와 비슷한 높이 또는 위 = 앉음
    const yScore = Math.min(1, (0.18 - hipKneeYDiff) / 0.18);
    confidence += yScore * 35; // 가중치 증가 (30 -> 35)
    debugInfo.push(`무릎높이차: ${(hipKneeYDiff * 100).toFixed(0)}% (앉음 +${(yScore * 35).toFixed(0)})`);
  } else {
    debugInfo.push(`무릎높이차: ${(hipKneeYDiff * 100).toFixed(0)}% (서있음)`);
  }

  // 3. 머리 높이 변화 추적 (Moving Average)
  // 초기 서 있는 높이 대비 현재 높이가 낮으면 앉음
  const avgHeadHeight = getAverageHeight(headHeightHistory);

  // 기준 높이 설정 (처음 몇 프레임의 최소값을 서있는 높이로 가정)
  if (headHeightHistory.length >= 5 && initialStandingHeight === null) {
    // 처음 5프레임 중 가장 낮은(화면 위쪽) 높이를 기준으로
    initialStandingHeight = Math.min(...headHeightHistory.slice(0, 5));
  }

  if (initialStandingHeight !== null) {
    const heightDrop = avgHeadHeight - initialStandingHeight;
    // 머리가 0.1 이상 내려왔으면 앉음 가능성
    if (heightDrop > 0.08) {
      const heightScore = Math.min(1, heightDrop / 0.2);
      confidence += heightScore * 20;
      debugInfo.push(`머리하강: ${(heightDrop * 100).toFixed(0)}% (+${(heightScore * 20).toFixed(0)})`);
    } else {
      debugInfo.push(`머리하강: ${(heightDrop * 100).toFixed(0)}%`);
    }
  }

  // 4. 무릎 각도 분석 (측면에서 더 유효하지만 보조 지표로 사용)
  let avgKneeAngle = 180;
  if (kneeVisibility > 0.3) {
    let leftKneeAngle = 180, rightKneeAngle = 180;
    if (isVisible(leftHip) && isVisible(leftKnee) && isVisible(leftAnkle)) {
      leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    }
    if (isVisible(rightHip) && isVisible(rightKnee) && isVisible(rightAnkle)) {
      rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    }
    avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // 무릎 각도가 50-140도면 앉음 가능성
    if (avgKneeAngle >= 50 && avgKneeAngle <= 140) {
      const kneeScore = 1 - Math.abs(avgKneeAngle - 95) / 55;
      confidence += kneeScore * 15;
      debugInfo.push(`무릎각도: ${avgKneeAngle.toFixed(0)}° (+${(kneeScore * 15).toFixed(0)})`);
    } else {
      debugInfo.push(`무릎각도: ${avgKneeAngle.toFixed(0)}°`);
    }
  }

  // 5. 어깨-엉덩이-무릎 정렬 분석 (정면 보조 지표)
  // 앉으면 이 세 점이 수직에 가까워짐
  const shoulderHipXDiff = Math.abs((leftShoulder.x + rightShoulder.x) / 2 - hipCenterX);
  const hipKneeXDiff = Math.abs(hipCenterX - kneeCenterX);
  const verticalAlignment = shoulderHipXDiff + hipKneeXDiff;

  if (verticalAlignment < 0.1 && bodyRatio < 1.3) {
    // 정렬이 좋고 비율이 낮으면 앉음
    confidence += 10;
    debugInfo.push(`수직정렬: ${verticalAlignment.toFixed(2)} (+10)`);
  }

  // 최종 판정 - 임계값 낮춤 (45 -> 35)
  const isSitting = confidence >= 35;

  return {
    isSitting,
    confidence: Math.min(100, confidence),
    details: {
      bodyRatio,
      hipKneeYDiff,
      avgHeadHeight,
      kneeAngle: avgKneeAngle,
      verticalAlignment
    },
    debug: debugInfo.join(' | ')
  };
}

/**
 * 서있는 자세 감지 (정면 인식 강화 버전)
 */
function detectStanding(landmarks) {
  const nose = landmarks[LANDMARKS.NOSE];
  const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER];
  const leftHip = landmarks[LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP];
  const leftKnee = landmarks[LANDMARKS.LEFT_KNEE];
  const rightKnee = landmarks[LANDMARKS.RIGHT_KNEE];
  const leftAnkle = landmarks[LANDMARKS.LEFT_ANKLE];
  const rightAnkle = landmarks[LANDMARKS.RIGHT_ANKLE];

  const hipVisibility = getAverageVisibility(landmarks, [LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP]);
  const shoulderVisibility = getAverageVisibility(landmarks, [LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER]);

  if (hipVisibility < 0.3 || shoulderVisibility < 0.3) {
    return { isStanding: false, confidence: 0, details: {}, debug: '주요 랜드마크 감지 안됨' };
  }

  // 중심점 계산
  const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipCenterY = (leftHip.y + rightHip.y) / 2;
  const kneeCenterY = (leftKnee?.y + rightKnee?.y) / 2 || hipCenterY + 0.3;
  const ankleCenterY = (leftAnkle?.y + rightAnkle?.y) / 2 || kneeCenterY + 0.3;
  const noseY = nose?.y || shoulderCenterY - 0.15;

  let confidence = 0;
  let debugInfo = [];

  // 1. 하체/상체 길이 비율 분석 - 더 엄격한 임계값
  const shoulderToHipDist = Math.abs(shoulderCenterY - hipCenterY);
  const hipToAnkleDist = Math.abs(hipCenterY - ankleCenterY);
  const bodyRatio = shoulderToHipDist > 0.05 ? hipToAnkleDist / shoulderToHipDist : 0.5;

  // 서있음 임계값 높임: 1.5 이상 (기존 1.3)
  if (bodyRatio > 1.5) {
    // 서 있을 때 하체가 길어 보임
    const ratioScore = Math.min(1, (bodyRatio - 1.3) / 1.0);
    confidence += ratioScore * 35;
    debugInfo.push(`하체비율: ${bodyRatio.toFixed(2)} (서있음 +${(ratioScore * 35).toFixed(0)})`);
  } else {
    debugInfo.push(`하체비율: ${bodyRatio.toFixed(2)}`);
  }

  // 2. 엉덩이-무릎 Y축 좌표 차이 - 더 엄격한 임계값
  const hipKneeYDiff = kneeCenterY - hipCenterY;

  // 서있음 임계값 높임: 0.15 이상 (기존 0.12)
  if (hipKneeYDiff > 0.15) {
    // 무릎이 엉덩이보다 충분히 아래 = 서있음
    const yScore = Math.min(1, (hipKneeYDiff - 0.12) / 0.15);
    confidence += yScore * 30;
    debugInfo.push(`무릎높이차: ${(hipKneeYDiff * 100).toFixed(0)}% (서있음 +${(yScore * 30).toFixed(0)})`);
  } else {
    debugInfo.push(`무릎높이차: ${(hipKneeYDiff * 100).toFixed(0)}%`);
  }

  // 3. 머리 높이 (기준 대비)
  const avgHeadHeight = getAverageHeight(headHeightHistory);

  if (initialStandingHeight !== null) {
    const heightDrop = avgHeadHeight - initialStandingHeight;
    if (heightDrop < 0.05) {
      // 머리가 거의 안 내려왔으면 서있음
      confidence += 20;
      debugInfo.push(`머리위치: 기준 유지 (+20)`);
    }
  } else if (headHeightHistory.length < 5) {
    // 아직 기준 설정 전이면 서있다고 가정
    confidence += 15;
    debugInfo.push(`초기상태: 서있음 가정 (+15)`);
  }

  // 4. 무릎 각도 분석
  let avgKneeAngle = 180;
  const kneeVisibility = getAverageVisibility(landmarks, [LANDMARKS.LEFT_KNEE, LANDMARKS.RIGHT_KNEE]);

  if (kneeVisibility > 0.3) {
    let leftKneeAngle = 180, rightKneeAngle = 180;
    if (isVisible(leftHip) && isVisible(leftKnee) && isVisible(leftAnkle)) {
      leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    }
    if (isVisible(rightHip) && isVisible(rightKnee) && isVisible(rightAnkle)) {
      rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    }
    avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // 무릎 각도가 150도 이상이면 서있음
    if (avgKneeAngle >= 150) {
      const kneeScore = Math.min(1, (avgKneeAngle - 140) / 30);
      confidence += kneeScore * 15;
      debugInfo.push(`무릎각도: ${avgKneeAngle.toFixed(0)}° (+${(kneeScore * 15).toFixed(0)})`);
    } else {
      debugInfo.push(`무릎각도: ${avgKneeAngle.toFixed(0)}°`);
    }
  }

  // 5. 전체 신체 수직 정렬
  const shoulderY = shoulderCenterY;
  const fullBodyVertical = ankleCenterY - shoulderY;

  if (fullBodyVertical > 0.5) {
    confidence += 10;
    debugInfo.push(`전신높이: ${fullBodyVertical.toFixed(2)} (+10)`);
  }

  // 서있음 임계값 높임 (50 -> 55)
  const isStanding = confidence >= 55;

  return {
    isStanding,
    confidence: Math.min(100, confidence),
    details: {
      bodyRatio,
      hipKneeYDiff,
      avgHeadHeight,
      kneeAngle: avgKneeAngle,
      fullBodyVertical
    },
    debug: debugInfo.join(' | ')
  };
}

/**
 * 손목 위치 히스토리 업데이트
 */
function updateWristHistory(wristY, shoulderY, kneeY, elbowAngle) {
  const now = Date.now();
  wristPositionHistory.push({
    wristY,
    shoulderY,
    kneeY,
    elbowAngle,
    timestamp: now
  });

  // 오래된 데이터 제거
  if (wristPositionHistory.length > WRIST_HISTORY_SIZE) {
    wristPositionHistory.shift();
  }
}

/**
 * 밀기 동작 감지 (핵심 로직)
 *
 * 밀기의 특징:
 * 1. 손목이 무릎 근처에서 아래로 눌리는 움직임
 * 2. 팔꿈치가 펴지는 움직임 (밀 때 팔이 펴짐)
 * 3. 어깨는 올라가는데 손목은 그대로이거나 덜 올라감
 *
 * 밀지 않는 경우:
 * 1. 손목이 어깨와 함께 자연스럽게 올라감
 * 2. 손목이 무릎에서 빨리 떨어짐
 */
function detectPushingMotion(landmarks, currentPosture, previousPosture, isTransitioning) {
  const leftWrist = landmarks[LANDMARKS.LEFT_WRIST];
  const rightWrist = landmarks[LANDMARKS.RIGHT_WRIST];
  const leftElbow = landmarks[LANDMARKS.LEFT_ELBOW];
  const rightElbow = landmarks[LANDMARKS.RIGHT_ELBOW];
  const leftKnee = landmarks[LANDMARKS.LEFT_KNEE];
  const rightKnee = landmarks[LANDMARKS.RIGHT_KNEE];
  const leftHip = landmarks[LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP];
  const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER];

  const kneeY = (leftKnee?.y + rightKnee?.y) / 2 || 0.7;
  const hipY = (leftHip?.y + rightHip?.y) / 2 || 0.5;
  const shoulderY = (leftShoulder?.y + rightShoulder?.y) / 2 || 0.3;
  const avgWristY = ((leftWrist?.y || 1) + (rightWrist?.y || 1)) / 2;

  // 팔꿈치 각도 계산 (어깨-팔꿈치-손목)
  let leftElbowAngle = 180, rightElbowAngle = 180;
  if (isVisible(leftShoulder) && isVisible(leftElbow) && isVisible(leftWrist)) {
    leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
  }
  if (isVisible(rightShoulder) && isVisible(rightElbow) && isVisible(rightWrist)) {
    rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
  }
  const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

  // 히스토리 업데이트
  updateWristHistory(avgWristY, shoulderY, kneeY, avgElbowAngle);

  // 손이 무릎/허벅지 근처에 있는지
  const handsNearKnee = avgWristY >= hipY - 0.08 && avgWristY <= kneeY + 0.15;

  // 일어서기 시작 시점 기록
  if (previousPosture === PostureState.SITTING && isTransitioning && transitionStartWristY === null) {
    transitionStartWristY = avgWristY;
    transitionStartShoulderY = shoulderY;
  }

  // 완전히 서면 트랜지션 정보 초기화
  if (currentPosture === PostureState.STANDING && !isTransitioning) {
    // 이미 감지된 pushing 상태는 유지 (점수 계산용)
    if (!pushedDuringTransition) {
      transitionStartWristY = null;
      transitionStartShoulderY = null;
    }
  }

  // 밀기 동작 감지 로직
  let isPushing = false;
  let pushReason = '';

  if (isTransitioning && handsNearKnee && transitionStartWristY !== null && wristPositionHistory.length >= 5) {
    // 최근 5프레임 분석
    const recentHistory = wristPositionHistory.slice(-5);
    const oldHistory = wristPositionHistory.slice(0, Math.min(5, wristPositionHistory.length));

    // 1. 어깨 움직임 대비 손목 움직임 비교
    const shoulderRise = transitionStartShoulderY - shoulderY; // 양수 = 어깨가 올라감
    const wristRise = transitionStartWristY - avgWristY; // 양수 = 손목이 올라감

    // 어깨는 많이 올라갔는데 손목은 적게 올라갔으면 = 밀고 있음
    // (정상: 손목도 어깨와 비슷하게 올라감)
    if (shoulderRise > 0.05) { // 어깨가 5% 이상 올라간 경우
      const riseRatio = wristRise / shoulderRise;
      if (riseRatio < 0.3) { // 손목이 어깨의 30% 미만으로 올라감
        isPushing = true;
        pushReason = '손목이 무릎에 고정된 채 상체만 올라감';
      }
    }

    // 2. 손목이 아래로 눌리는 움직임 감지
    const oldWristY = oldHistory.length > 0 ?
      oldHistory.reduce((sum, h) => sum + h.wristY, 0) / oldHistory.length : avgWristY;
    const recentWristY = recentHistory.reduce((sum, h) => sum + h.wristY, 0) / recentHistory.length;

    // 손목이 아래로 이동 (0.02 이상) = 누르고 있음
    if (recentWristY > oldWristY + 0.02) {
      isPushing = true;
      pushReason = '손목이 아래로 눌림 (밀기 동작)';
    }

    // 3. 팔꿈치 각도 변화 감지 (펴지면 밀기)
    const oldElbowAngle = oldHistory.length > 0 ?
      oldHistory.reduce((sum, h) => sum + h.elbowAngle, 0) / oldHistory.length : avgElbowAngle;
    const recentElbowAngle = recentHistory.reduce((sum, h) => sum + h.elbowAngle, 0) / recentHistory.length;

    // 팔꿈치가 15도 이상 펴지면서 손이 무릎 근처 = 밀기
    if (recentElbowAngle > oldElbowAngle + 15 && handsNearKnee) {
      isPushing = true;
      pushReason = '팔꿈치가 펴지며 밀기';
    }

    // 4. 손이 무릎 위에서 오래 머무름 (일어서는 동안)
    const framesOnKnee = recentHistory.filter(h => {
      const wristNearKnee = h.wristY >= hipY - 0.08 && h.wristY <= kneeY + 0.15;
      return wristNearKnee;
    }).length;

    if (framesOnKnee >= 4 && shoulderRise > 0.08) { // 5개 중 4개 이상이 무릎 근처
      isPushing = true;
      pushReason = '일어서는 동안 손이 무릎에 오래 머무름';
    }
  }

  // 밀기 감지되면 플래그 설정
  if (isPushing) {
    pushedDuringTransition = true;
  }

  return {
    isPushing,
    pushReason,
    handsNearKnee,
    wristY: avgWristY,
    shoulderY,
    elbowAngle: avgElbowAngle
  };
}

/**
 * 손 위치 감지 (일어서는 동안 손 사용 체크) - 개선된 버전
 */
function detectHandPosition(landmarks, currentPosture, previousPosture) {
  const leftWrist = landmarks[LANDMARKS.LEFT_WRIST];
  const rightWrist = landmarks[LANDMARKS.RIGHT_WRIST];
  const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER];
  const leftKnee = landmarks[LANDMARKS.LEFT_KNEE];
  const rightKnee = landmarks[LANDMARKS.RIGHT_KNEE];
  const leftHip = landmarks[LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP];

  if (!isVisible(leftWrist) && !isVisible(rightWrist)) {
    return { position: HandPosition.UNKNOWN, support: HandSupportState.UNKNOWN, message: '' };
  }

  const kneeY = (leftKnee?.y + rightKnee?.y) / 2 || 0.7;
  const hipY = (leftHip?.y + rightHip?.y) / 2 || 0.5;
  const shoulderY = (leftShoulder?.y + rightShoulder?.y) / 2 || 0.3;
  const avgWristY = ((leftWrist?.y || 1) + (rightWrist?.y || 1)) / 2;

  // 손이 무릎 근처에 있는지
  const handsNearKnee = avgWristY >= hipY - 0.08 && avgWristY <= kneeY + 0.15;

  // 일어서는 동작 중인지
  const isTransitioning = previousPosture === PostureState.SITTING &&
                          currentPosture !== PostureState.SITTING;

  // 밀기 동작 감지
  const pushResult = detectPushingMotion(landmarks, currentPosture, previousPosture, isTransitioning);

  // === 앉아 있을 때 ===
  if (currentPosture === PostureState.SITTING && !isTransitioning) {
    if (handsNearKnee) {
      return {
        position: HandPosition.HANDS_ON_KNEE,
        support: HandSupportState.NO_SUPPORT,
        message: '손 무릎 위 (대기 중)',
      };
    }
  }

  // === 일어서는 중 ===
  if (isTransitioning) {
    // 밀기 동작 감지됨
    if (pushResult.isPushing || pushedDuringTransition) {
      return {
        position: HandPosition.HANDS_PUSHING,
        support: HandSupportState.HEAVY_SUPPORT,
        message: `⚠️ 무릎 짚고 밀어서 일어남 (감점)`,
      };
    }

    // 손이 무릎 근처지만 밀지 않음
    if (handsNearKnee) {
      return {
        position: HandPosition.HANDS_ON_KNEE,
        support: HandSupportState.NO_SUPPORT,
        message: '손 무릎 위 (밀지 않음)',
      };
    }
  }

  // === 서 있을 때 ===
  if (currentPosture === PostureState.STANDING) {
    // 일어서는 동안 밀었으면 감점 유지
    if (pushedDuringTransition) {
      return {
        position: HandPosition.HANDS_PUSHING,
        support: HandSupportState.HEAVY_SUPPORT,
        message: '⚠️ 무릎 짚고 일어남 (감점)',
      };
    }

    // 손이 어깨 위에 있으면 OK
    if (avgWristY < shoulderY) {
      return {
        position: HandPosition.HANDS_UP,
        support: HandSupportState.NO_SUPPORT,
        message: '✓ 정상적으로 일어섬'
      };
    }
  }

  return {
    position: HandPosition.UNKNOWN,
    support: HandSupportState.NO_SUPPORT,
    message: ''
  };
}

/**
 * 메인 분석 함수
 */
export function analyzeSitToStand(landmarks, previousAnalysis = null) {
  if (!landmarks || landmarks.length < 33) {
    return {
      state: PostureState.UNKNOWN,
      sitting: { isSitting: false, confidence: 0, details: {} },
      standing: { isStanding: false, confidence: 0, details: {} },
      handPosition: { position: HandPosition.UNKNOWN, support: HandSupportState.UNKNOWN },
      isTransitioning: false,
      debug: { error: '랜드마크 없음' }
    };
  }

  const sittingResult = detectSitting(landmarks);
  const standingResult = detectStanding(landmarks);
  const previousPosture = previousAnalysis?.state || PostureState.UNKNOWN;

  // 현재 상태 결정 - 앉음 상태에 약간의 우선권 부여 (안정성 향상)
  let currentState = PostureState.UNKNOWN;

  // 앉음 상태가 감지되면 서있음보다 10% 높은 신뢰도가 있어야 변경
  if (sittingResult.isSitting && sittingResult.confidence >= standingResult.confidence - 10) {
    currentState = PostureState.SITTING;
  } else if (standingResult.isStanding && standingResult.confidence > sittingResult.confidence + 10) {
    currentState = PostureState.STANDING;
  } else if (sittingResult.confidence > 30) {
    currentState = PostureState.SITTING;
  } else if (standingResult.confidence > 50) {
    currentState = PostureState.STANDING;
  }

  // 상태 안정화
  const stableState = getStableState(currentState, Math.max(sittingResult.confidence, standingResult.confidence));

  // 손 위치 감지
  const handResult = detectHandPosition(landmarks, stableState, previousPosture);

  // 전환 중 감지
  const isTransitioning = previousPosture === PostureState.SITTING &&
                          (stableState === PostureState.STANDING || standingResult.confidence > 30);

  return {
    state: stableState,
    sitting: sittingResult,
    standing: standingResult,
    handPosition: handResult,
    isTransitioning,
    debug: {
      sitting: sittingResult.debug,
      standing: standingResult.debug,
      stableState,
      previousState: previousPosture
    }
  };
}

/**
 * 점수 자동 계산
 */
export function calculateSitToStandScore(analysisHistory) {
  if (!analysisHistory || analysisHistory.length < 5) {
    return { score: 0, reason: '분석 데이터 부족' };
  }

  // 앉음 -> 서있음 전환이 있었는지
  let hadSitting = false;
  let hadStanding = false;
  let usedHands = false;
  let transitionCount = 0;
  let previousState = null;

  for (const entry of analysisHistory) {
    if (entry.state === PostureState.SITTING) {
      hadSitting = true;
    }
    if (entry.state === PostureState.STANDING) {
      hadStanding = true;
    }
    if (entry.handPosition?.support === HandSupportState.HEAVY_SUPPORT) {
      usedHands = true;
    }
    if (previousState === PostureState.SITTING && entry.state === PostureState.STANDING) {
      transitionCount++;
    }
    previousState = entry.state;
  }

  // 채점
  if (!hadSitting || !hadStanding) {
    return { score: 0, reason: '앉기/서기 동작 미완료' };
  }

  if (!usedHands && transitionCount >= 1) {
    return { score: 4, reason: '손 사용 없이 일어섬' };
  }

  if (usedHands) {
    return { score: 2, reason: '손으로 밀어서 일어섬' };
  }

  return { score: 3, reason: '약간의 어려움이 있었음' };
}

/**
 * 피드백 메시지 생성
 */
export function getSitToStandFeedback(analysis) {
  if (!analysis) return { message: '분석 대기 중...', type: 'info' };

  const { state, sitting, standing, handPosition } = analysis;

  if (state === PostureState.SITTING) {
    if (sitting.confidence > 70) {
      return { message: '✓ 앉은 자세 확인됨', type: 'success' };
    }
    return { message: '앉은 자세 감지 중...', type: 'info' };
  }

  if (state === PostureState.STANDING) {
    if (handPosition?.support === HandSupportState.HEAVY_SUPPORT) {
      return { message: '⚠️ 손 사용 감지됨 (감점)', type: 'error' };
    }
    if (standing.confidence > 70) {
      return { message: '✓ 서있는 자세 확인됨!', type: 'success' };
    }
    return { message: '서있는 자세 감지 중...', type: 'info' };
  }

  return { message: '자세를 감지하고 있습니다...', type: 'info' };
}

/**
 * 시각화 데이터 생성
 */
export function getVisualizationData(analysis, landmarks) {
  if (!analysis || !landmarks) return null;

  const leftKnee = landmarks[LANDMARKS.LEFT_KNEE];
  const rightKnee = landmarks[LANDMARKS.RIGHT_KNEE];
  const leftHip = landmarks[LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP];

  return {
    kneeAngle: analysis.sitting?.details?.kneeAngle || analysis.standing?.details?.kneeAngle,
    hipAngle: analysis.sitting?.details?.hipAngle || analysis.standing?.details?.hipAngle,
    kneeAnglePosition: {
      x: (leftKnee?.x + rightKnee?.x) / 2 || 0.5,
      y: (leftKnee?.y + rightKnee?.y) / 2 || 0.6
    },
    hipAnglePosition: {
      x: (leftHip?.x + rightHip?.x) / 2 || 0.5,
      y: (leftHip?.y + rightHip?.y) / 2 || 0.5
    },
    stateColor: analysis.state === PostureState.SITTING ? '#EAB308' :
                analysis.state === PostureState.STANDING ? '#10B981' : '#64748B'
  };
}

/**
 * 평가 리포트 생성
 */
export function generateAssessmentReport(analysisHistory, scoreResult) {
  const totalFrames = analysisHistory.length;
  let sittingFrames = 0;
  let standingFrames = 0;
  let handSupportFrames = 0;
  let maxSittingConf = 0;
  let maxStandingConf = 0;

  for (const entry of analysisHistory) {
    if (entry.state === PostureState.SITTING) sittingFrames++;
    if (entry.state === PostureState.STANDING) standingFrames++;
    if (entry.handPosition?.support === HandSupportState.HEAVY_SUPPORT) handSupportFrames++;
    if (entry.sitting?.confidence > maxSittingConf) maxSittingConf = entry.sitting.confidence;
    if (entry.standing?.confidence > maxStandingConf) maxStandingConf = entry.standing.confidence;
  }

  const startTime = analysisHistory[0]?.timestamp || Date.now();
  const endTime = analysisHistory[analysisHistory.length - 1]?.timestamp || Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(1);

  return {
    testInfo: {
      totalFrames,
      duration: `${duration}초`,
      startTime: new Date(startTime).toLocaleTimeString(),
      endTime: new Date(endTime).toLocaleTimeString()
    },
    detection: {
      sittingDetected: sittingFrames > 5,
      standingDetected: standingFrames > 5,
      sittingFrames,
      standingFrames,
      sittingConfidence: Math.round(maxSittingConf),
      standingConfidence: Math.round(maxStandingConf)
    },
    movement: {
      usedHands: handSupportFrames > 3,
      handSupportFrames,
      handSupportRatio: ((handSupportFrames / totalFrames) * 100).toFixed(1) + '%'
    },
    scoring: {
      autoScore: scoreResult.score,
      reason: scoreResult.reason,
      maxPossible: 4
    }
  };
}
