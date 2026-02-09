/**
 * BBS (Berg Balance Scale) 모션 분석 유틸리티
 * MediaPipe Pose 랜드마크를 기반으로 14개 검사 항목의 동작을 분석합니다.
 */

// MediaPipe Pose 랜드마크 인덱스
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32
};

// ============================================================
// 기본 유틸리티 함수
// ============================================================

/**
 * 두 점 사이의 거리 계산
 */
export function distance(p1, p2) {
  if (!p1 || !p2) return 0;
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 세 점으로 이루어진 각도 계산 (도 단위)
 * p1-p2-p3에서 p2가 꼭지점
 */
export function calculateAngle(p1, p2, p3) {
  if (!p1 || !p2 || !p3) return 0;

  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;

  let angle = Math.atan2(Math.abs(cross), dot);
  return angle * (180 / Math.PI);
}

/**
 * 3D 각도 계산
 */
export function calculateAngle3D(p1, p2, p3) {
  if (!p1 || !p2 || !p3) return 0;

  const v1 = {
    x: p1.x - p2.x,
    y: p1.y - p2.y,
    z: (p1.z || 0) - (p2.z || 0)
  };
  const v2 = {
    x: p3.x - p2.x,
    y: p3.y - p2.y,
    z: (p3.z || 0) - (p2.z || 0)
  };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

/**
 * 중간점 계산
 */
export function midpoint(p1, p2) {
  if (!p1 || !p2) return null;
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: ((p1.z || 0) + (p2.z || 0)) / 2
  };
}

/**
 * 랜드마크 가시성 확인
 */
export function isVisible(landmark, threshold = 0.5) {
  return landmark && (landmark.visibility || 0) >= threshold;
}

// ============================================================
// 신체 부위별 각도 계산
// ============================================================

/**
 * 무릎 각도 계산 (엉덩이-무릎-발목)
 */
export function getKneeAngle(landmarks, side = 'left') {
  const hip = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_HIP : POSE_LANDMARKS.RIGHT_HIP];
  const knee = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_KNEE : POSE_LANDMARKS.RIGHT_KNEE];
  const ankle = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_ANKLE : POSE_LANDMARKS.RIGHT_ANKLE];
  return calculateAngle(hip, knee, ankle);
}

/**
 * 엉덩이(고관절) 각도 계산 (어깨-엉덩이-무릎)
 */
export function getHipAngle(landmarks, side = 'left') {
  const shoulder = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_SHOULDER : POSE_LANDMARKS.RIGHT_SHOULDER];
  const hip = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_HIP : POSE_LANDMARKS.RIGHT_HIP];
  const knee = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_KNEE : POSE_LANDMARKS.RIGHT_KNEE];
  return calculateAngle(shoulder, hip, knee);
}

/**
 * 팔꿈치 각도 계산 (어깨-팔꿈치-손목)
 */
export function getElbowAngle(landmarks, side = 'left') {
  const shoulder = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_SHOULDER : POSE_LANDMARKS.RIGHT_SHOULDER];
  const elbow = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_ELBOW : POSE_LANDMARKS.RIGHT_ELBOW];
  const wrist = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_WRIST : POSE_LANDMARKS.RIGHT_WRIST];
  return calculateAngle(shoulder, elbow, wrist);
}

/**
 * 어깨 각도 계산 (엉덩이-어깨-팔꿈치)
 */
export function getShoulderAngle(landmarks, side = 'left') {
  const hip = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_HIP : POSE_LANDMARKS.RIGHT_HIP];
  const shoulder = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_SHOULDER : POSE_LANDMARKS.RIGHT_SHOULDER];
  const elbow = landmarks[side === 'left' ? POSE_LANDMARKS.LEFT_ELBOW : POSE_LANDMARKS.RIGHT_ELBOW];
  return calculateAngle(hip, shoulder, elbow);
}

/**
 * 몸통 기울기 계산 (수직선 대비)
 */
export function getTrunkTilt(landmarks) {
  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);

  if (!shoulderMid || !hipMid) return 0;

  // 수직선과의 각도
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;

  return Math.atan2(dx, -dy) * (180 / Math.PI);
}

/**
 * 어깨 회전 각도 계산 (정면 기준)
 */
export function getShoulderRotation(landmarks) {
  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];

  if (!leftShoulder || !rightShoulder) return 0;

  // z 좌표 차이로 회전 추정
  const zDiff = (leftShoulder.z || 0) - (rightShoulder.z || 0);
  const shoulderWidth = distance(leftShoulder, rightShoulder);

  if (shoulderWidth === 0) return 0;

  return Math.asin(Math.max(-1, Math.min(1, zDiff / shoulderWidth))) * (180 / Math.PI);
}

// ============================================================
// 자세 감지 함수
// ============================================================

/**
 * 앉은 자세 감지
 */
export function detectSitting(landmarks) {
  const leftKneeAngle = getKneeAngle(landmarks, 'left');
  const rightKneeAngle = getKneeAngle(landmarks, 'right');
  const leftHipAngle = getHipAngle(landmarks, 'left');
  const rightHipAngle = getHipAngle(landmarks, 'right');

  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
  const avgHipAngle = (leftHipAngle + rightHipAngle) / 2;

  // 앉음: 무릎 60-120도, 엉덩이 60-120도
  const isSitting = avgKneeAngle >= 60 && avgKneeAngle <= 130 &&
                    avgHipAngle >= 60 && avgHipAngle <= 130;

  const confidence = isSitting ?
    Math.min(1, (130 - Math.abs(avgKneeAngle - 90)) / 40 * (130 - Math.abs(avgHipAngle - 90)) / 40) : 0;

  return {
    isSitting,
    confidence,
    kneeAngle: avgKneeAngle,
    hipAngle: avgHipAngle
  };
}

/**
 * 서있는 자세 감지
 */
export function detectStanding(landmarks) {
  const leftKneeAngle = getKneeAngle(landmarks, 'left');
  const rightKneeAngle = getKneeAngle(landmarks, 'right');
  const leftHipAngle = getHipAngle(landmarks, 'left');
  const rightHipAngle = getHipAngle(landmarks, 'right');

  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
  const avgHipAngle = (leftHipAngle + rightHipAngle) / 2;

  // 서있음: 무릎 150도 이상, 엉덩이 150도 이상
  const isStanding = avgKneeAngle >= 150 && avgHipAngle >= 150;

  const confidence = isStanding ?
    Math.min(1, (avgKneeAngle - 150) / 30 * (avgHipAngle - 150) / 30) : 0;

  return {
    isStanding,
    confidence,
    kneeAngle: avgKneeAngle,
    hipAngle: avgHipAngle
  };
}

/**
 * 허리 굽힘(구부림) 감지
 */
export function detectBending(landmarks) {
  const leftHipAngle = getHipAngle(landmarks, 'left');
  const rightHipAngle = getHipAngle(landmarks, 'right');
  const avgHipAngle = (leftHipAngle + rightHipAngle) / 2;

  // 허리 굽힘: 엉덩이 각도 60-120도
  const isBending = avgHipAngle >= 30 && avgHipAngle <= 120;

  const leftKneeAngle = getKneeAngle(landmarks, 'left');
  const rightKneeAngle = getKneeAngle(landmarks, 'right');
  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

  return {
    isBending,
    hipAngle: avgHipAngle,
    kneeAngle: avgKneeAngle,
    bendingDepth: 180 - avgHipAngle
  };
}

// ============================================================
// 손/팔 관련 감지
// ============================================================

/**
 * 손 지지 감지 (의자, 무릎 등에 손을 짚는지)
 */
export function detectHandSupport(landmarks) {
  const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const leftKnee = landmarks[POSE_LANDMARKS.LEFT_KNEE];
  const rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];

  // 손이 무릎이나 엉덩이 높이 근처에 있으면 지지 중으로 판단
  const leftNearKnee = leftWrist && leftKnee &&
    Math.abs(leftWrist.y - leftKnee.y) < 0.15;
  const rightNearKnee = rightWrist && rightKnee &&
    Math.abs(rightWrist.y - rightKnee.y) < 0.15;

  const leftNearHip = leftWrist && leftHip &&
    Math.abs(leftWrist.y - leftHip.y) < 0.1 &&
    Math.abs(leftWrist.x - leftHip.x) < 0.15;
  const rightNearHip = rightWrist && rightHip &&
    Math.abs(rightWrist.y - rightHip.y) < 0.1 &&
    Math.abs(rightWrist.x - rightHip.x) < 0.15;

  // 팔꿈치 각도로 팔을 뻗었는지 확인 (팔짱 낀 상태인지)
  const leftElbowAngle = getElbowAngle(landmarks, 'left');
  const rightElbowAngle = getElbowAngle(landmarks, 'right');
  const armsCrossed = leftElbowAngle < 90 && rightElbowAngle < 90;

  const isUsingHandSupport = (leftNearKnee || rightNearKnee || leftNearHip || rightNearHip) && !armsCrossed;

  return {
    isUsingHandSupport,
    leftHandSupport: leftNearKnee || leftNearHip,
    rightHandSupport: rightNearKnee || rightNearHip,
    armsCrossed
  };
}

/**
 * 팔 뻗기 감지 (항목 8)
 */
export function detectArmExtension(landmarks) {
  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const leftElbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
  const rightElbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
  const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];

  // 팔꿈치 각도 (펴진 정도)
  const leftElbowAngle = getElbowAngle(landmarks, 'left');
  const rightElbowAngle = getElbowAngle(landmarks, 'right');

  // 어깨 각도 (팔이 앞으로 올라간 정도)
  const leftShoulderAngle = getShoulderAngle(landmarks, 'left');
  const rightShoulderAngle = getShoulderAngle(landmarks, 'right');

  // 팔이 90도 전방으로 뻗어졌는지
  const leftArmExtended = leftElbowAngle > 150 && leftShoulderAngle > 70 && leftShoulderAngle < 110;
  const rightArmExtended = rightElbowAngle > 150 && rightShoulderAngle > 70 && rightShoulderAngle < 110;

  // 손목이 어깨보다 앞에 있는지 (z 좌표)
  const leftReaching = leftWrist && leftShoulder && (leftWrist.z || 0) < (leftShoulder.z || 0);
  const rightReaching = rightWrist && rightShoulder && (rightWrist.z || 0) < (rightShoulder.z || 0);

  return {
    leftArmExtended,
    rightArmExtended,
    isExtending: leftArmExtended || rightArmExtended,
    leftElbowAngle,
    rightElbowAngle,
    leftShoulderAngle,
    rightShoulderAngle,
    reachDistance: Math.max(
      leftReaching ? Math.abs((leftShoulder.z || 0) - (leftWrist.z || 0)) : 0,
      rightReaching ? Math.abs((rightShoulder.z || 0) - (rightWrist.z || 0)) : 0
    )
  };
}

// ============================================================
// 발/다리 관련 감지
// ============================================================

/**
 * 발 간격 측정 (항목 7, 13)
 */
export function measureFeetDistance(landmarks) {
  const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  const leftHeel = landmarks[POSE_LANDMARKS.LEFT_HEEL];
  const rightHeel = landmarks[POSE_LANDMARKS.RIGHT_HEEL];
  const leftFoot = landmarks[POSE_LANDMARKS.LEFT_FOOT_INDEX];
  const rightFoot = landmarks[POSE_LANDMARKS.RIGHT_FOOT_INDEX];

  const ankleDistance = distance(leftAnkle, rightAnkle);
  const heelDistance = distance(leftHeel, rightHeel);
  const footDistance = distance(leftFoot, rightFoot);

  // 발 모음 상태
  const feetTogether = ankleDistance < 0.12; // 정규화된 좌표 기준

  // 탄뎀(일렬) 자세
  const footYDiff = leftFoot && rightFoot ? Math.abs(leftFoot.y - rightFoot.y) : 0;
  const footXDiff = leftFoot && rightFoot ? Math.abs(leftFoot.x - rightFoot.x) : 0;
  const isTandem = footXDiff < 0.1 && footYDiff > 0.05;

  return {
    ankleDistance,
    heelDistance,
    footDistance,
    feetTogether,
    isTandem,
    footYDiff,
    footXDiff
  };
}

/**
 * 한 발 들기 감지 (항목 14)
 */
export function detectSingleLegStance(landmarks) {
  const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  const leftKnee = landmarks[POSE_LANDMARKS.LEFT_KNEE];
  const rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

  // 발목 높이 차이
  const ankleYDiff = leftAnkle && rightAnkle ? rightAnkle.y - leftAnkle.y : 0;

  // 무릎 각도로 다리 굽힘 확인
  const leftKneeAngle = getKneeAngle(landmarks, 'left');
  const rightKneeAngle = getKneeAngle(landmarks, 'right');

  // 왼발 들기: 왼쪽 발목이 오른쪽보다 높음 (y가 작음)
  const leftFootLifted = ankleYDiff > 0.05 && leftKneeAngle < 160;
  // 오른발 들기: 오른쪽 발목이 왼쪽보다 높음
  const rightFootLifted = ankleYDiff < -0.05 && rightKneeAngle < 160;

  const isSingleLeg = leftFootLifted || rightFootLifted;
  const liftedFoot = leftFootLifted ? 'left' : rightFootLifted ? 'right' : null;

  return {
    isSingleLeg,
    liftedFoot,
    leftFootLifted,
    rightFootLifted,
    ankleYDiff: Math.abs(ankleYDiff),
    leftKneeAngle,
    rightKneeAngle
  };
}

/**
 * 발 올리기/내리기 감지 (항목 12)
 */
export function detectFootStep(landmarks, previousLandmarks) {
  const current = detectSingleLegStance(landmarks);
  const previous = previousLandmarks ? detectSingleLegStance(previousLandmarks) : null;

  // 발 상태 변화 감지
  let stepDetected = false;
  let steppingFoot = null;

  if (previous) {
    // 왼발: 바닥 → 들림
    if (!previous.leftFootLifted && current.leftFootLifted) {
      stepDetected = true;
      steppingFoot = 'left';
    }
    // 오른발: 바닥 → 들림
    if (!previous.rightFootLifted && current.rightFootLifted) {
      stepDetected = true;
      steppingFoot = 'right';
    }
  }

  return {
    ...current,
    stepDetected,
    steppingFoot
  };
}

// ============================================================
// 회전 감지
// ============================================================

/**
 * 몸 회전 감지 (항목 10, 11)
 */
export function detectBodyRotation(landmarks, initialLandmarks) {
  const currentRotation = getShoulderRotation(landmarks);
  const initialRotation = initialLandmarks ? getShoulderRotation(initialLandmarks) : 0;

  const rotationChange = currentRotation - initialRotation;

  // 어깨와 엉덩이 방향
  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

  // 어깨 벡터
  const shoulderVector = leftShoulder && rightShoulder ? {
    x: rightShoulder.x - leftShoulder.x,
    z: (rightShoulder.z || 0) - (leftShoulder.z || 0)
  } : null;

  // 엉덩이 벡터
  const hipVector = leftHip && rightHip ? {
    x: rightHip.x - leftHip.x,
    z: (rightHip.z || 0) - (leftHip.z || 0)
  } : null;

  // 몸통 회전 추정 (어깨 z 좌표 기반)
  let bodyAngle = 0;
  if (shoulderVector) {
    bodyAngle = Math.atan2(shoulderVector.z, shoulderVector.x) * (180 / Math.PI);
  }

  return {
    currentRotation,
    rotationChange,
    bodyAngle,
    isRotatingLeft: rotationChange < -15,
    isRotatingRight: rotationChange > 15
  };
}

// ============================================================
// 안정성 분석
// ============================================================

/**
 * 자세 안정성 측정
 */
export function measureStability(landmarksHistory) {
  if (!landmarksHistory || landmarksHistory.length < 5) {
    return { stability: 'unknown', score: 0 };
  }

  // 최근 10프레임의 어깨/엉덩이 중심점 변화 측정
  const recentFrames = landmarksHistory.slice(-10);
  const movements = [];

  for (let i = 1; i < recentFrames.length; i++) {
    const prev = recentFrames[i - 1];
    const curr = recentFrames[i];

    const prevCenter = midpoint(
      midpoint(prev[POSE_LANDMARKS.LEFT_SHOULDER], prev[POSE_LANDMARKS.RIGHT_SHOULDER]),
      midpoint(prev[POSE_LANDMARKS.LEFT_HIP], prev[POSE_LANDMARKS.RIGHT_HIP])
    );
    const currCenter = midpoint(
      midpoint(curr[POSE_LANDMARKS.LEFT_SHOULDER], curr[POSE_LANDMARKS.RIGHT_SHOULDER]),
      midpoint(curr[POSE_LANDMARKS.LEFT_HIP], curr[POSE_LANDMARKS.RIGHT_HIP])
    );

    if (prevCenter && currCenter) {
      movements.push(distance(prevCenter, currCenter));
    }
  }

  const avgMovement = movements.length > 0 ?
    movements.reduce((a, b) => a + b, 0) / movements.length : 0;

  let stability = 'unknown';
  let score = 0;

  if (avgMovement < 0.005) {
    stability = 'excellent';
    score = 100;
  } else if (avgMovement < 0.01) {
    stability = 'good';
    score = 80;
  } else if (avgMovement < 0.02) {
    stability = 'moderate';
    score = 60;
  } else if (avgMovement < 0.04) {
    stability = 'poor';
    score = 40;
  } else {
    stability = 'unstable';
    score = 20;
  }

  return {
    stability,
    score,
    avgMovement,
    movements
  };
}

// ============================================================
// 종합 분석 함수 (항목별)
// ============================================================

/**
 * 항목 1: 앉은 자세에서 일어서기 분석
 */
export function analyzeItem1(landmarks, state) {
  const sitting = detectSitting(landmarks);
  const standing = detectStanding(landmarks);
  const handSupport = detectHandSupport(landmarks);

  return {
    sitting,
    standing,
    handSupport,
    isTransitioning: !sitting.isSitting && !standing.isStanding,
    usedHands: handSupport.isUsingHandSupport,
    currentPose: sitting.isSitting ? 'sitting' : standing.isStanding ? 'standing' : 'transitioning'
  };
}

/**
 * 항목 2: 지지 없이 서 있기 분석
 */
export function analyzeItem2(landmarks, landmarksHistory) {
  const standing = detectStanding(landmarks);
  const stability = measureStability(landmarksHistory);
  const trunkTilt = getTrunkTilt(landmarks);

  return {
    standing,
    stability,
    trunkTilt,
    isStable: standing.isStanding && stability.score >= 60,
    needsSupport: Math.abs(trunkTilt) > 15
  };
}

/**
 * 항목 3: 지지 없이 앉아 있기 분석
 */
export function analyzeItem3(landmarks, landmarksHistory) {
  const sitting = detectSitting(landmarks);
  const stability = measureStability(landmarksHistory);
  const trunkTilt = getTrunkTilt(landmarks);

  return {
    sitting,
    stability,
    trunkTilt,
    postureQuality: Math.abs(trunkTilt) < 10 ? 'good' : Math.abs(trunkTilt) < 20 ? 'moderate' : 'poor'
  };
}

/**
 * 항목 4: 선 자세에서 앉기 분석
 */
export function analyzeItem4(landmarks, state) {
  const sitting = detectSitting(landmarks);
  const standing = detectStanding(landmarks);
  const handSupport = detectHandSupport(landmarks);
  const hipAngle = (getHipAngle(landmarks, 'left') + getHipAngle(landmarks, 'right')) / 2;
  const kneeAngle = (getKneeAngle(landmarks, 'left') + getKneeAngle(landmarks, 'right')) / 2;

  // 조절된 하강인지 확인 (각도 변화가 점진적인지)
  const isControlled = state?.previousHipAngle ?
    Math.abs(hipAngle - state.previousHipAngle) < 10 : true;

  return {
    sitting,
    standing,
    handSupport,
    hipAngle,
    kneeAngle,
    isControlled,
    currentPose: sitting.isSitting ? 'sitting' : standing.isStanding ? 'standing' : 'transitioning'
  };
}

/**
 * 항목 5: 이동하기 분석
 */
export function analyzeItem5(landmarks, state) {
  const sitting = detectSitting(landmarks);
  const standing = detectStanding(landmarks);
  const handSupport = detectHandSupport(landmarks);

  // 위치 변화 감지 (이동)
  const hipMid = midpoint(
    landmarks[POSE_LANDMARKS.LEFT_HIP],
    landmarks[POSE_LANDMARKS.RIGHT_HIP]
  );

  const isMoving = state?.previousHipPosition ?
    distance(hipMid, state.previousHipPosition) > 0.05 : false;

  return {
    sitting,
    standing,
    handSupport,
    isMoving,
    hipPosition: hipMid,
    currentPhase: sitting.isSitting ? 'sitting' :
                  standing.isStanding && !isMoving ? 'standing' :
                  standing.isStanding && isMoving ? 'moving' : 'transitioning'
  };
}

/**
 * 항목 6: 눈 감고 서 있기 분석
 */
export function analyzeItem6(landmarks, landmarksHistory) {
  const standing = detectStanding(landmarks);
  const stability = measureStability(landmarksHistory);

  return {
    standing,
    stability,
    isStable: standing.isStanding && stability.score >= 50
  };
}

/**
 * 항목 7: 두 발 모아 서 있기 분석
 */
export function analyzeItem7(landmarks, landmarksHistory) {
  const standing = detectStanding(landmarks);
  const stability = measureStability(landmarksHistory);
  const feetMeasure = measureFeetDistance(landmarks);

  return {
    standing,
    stability,
    feetTogether: feetMeasure.feetTogether,
    ankleDistance: feetMeasure.ankleDistance,
    isCorrectPose: standing.isStanding && feetMeasure.feetTogether
  };
}

/**
 * 항목 8: 팔 뻗어 앞으로 내밀기 분석
 */
export function analyzeItem8(landmarks, initialLandmarks) {
  const standing = detectStanding(landmarks);
  const armExtension = detectArmExtension(landmarks);
  const feetMeasure = measureFeetDistance(landmarks);

  // 발 위치 변화 감지
  const feetMoved = initialLandmarks ?
    distance(landmarks[POSE_LANDMARKS.LEFT_ANKLE], initialLandmarks[POSE_LANDMARKS.LEFT_ANKLE]) > 0.03 ||
    distance(landmarks[POSE_LANDMARKS.RIGHT_ANKLE], initialLandmarks[POSE_LANDMARKS.RIGHT_ANKLE]) > 0.03 : false;

  return {
    standing,
    armExtension,
    feetMoved,
    isValidReach: standing.isStanding && armExtension.isExtending && !feetMoved,
    reachDistance: armExtension.reachDistance
  };
}

/**
 * 항목 9: 바닥의 물건 집기 분석
 */
export function analyzeItem9(landmarks, state) {
  const standing = detectStanding(landmarks);
  const bending = detectBending(landmarks);

  // 손 위치 (바닥 근처인지)
  const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];

  const handNearFloor = (leftWrist && leftAnkle && leftWrist.y > leftAnkle.y - 0.1) ||
                        (rightWrist && leftAnkle && rightWrist.y > leftAnkle.y - 0.1);

  return {
    standing,
    bending,
    handNearFloor,
    currentPhase: standing.isStanding ? 'standing' :
                  bending.isBending ? 'bending' : 'transitioning',
    canReachFloor: bending.bendingDepth > 60
  };
}

/**
 * 항목 10: 뒤돌아보기 분석
 */
export function analyzeItem10(landmarks, initialLandmarks) {
  const standing = detectStanding(landmarks);
  const rotation = detectBodyRotation(landmarks, initialLandmarks);
  const feetMeasure = measureFeetDistance(landmarks);

  // 발 위치 변화 감지
  const feetMoved = initialLandmarks ?
    distance(landmarks[POSE_LANDMARKS.LEFT_ANKLE], initialLandmarks[POSE_LANDMARKS.LEFT_ANKLE]) > 0.03 ||
    distance(landmarks[POSE_LANDMARKS.RIGHT_ANKLE], initialLandmarks[POSE_LANDMARKS.RIGHT_ANKLE]) > 0.03 : false;

  return {
    standing,
    rotation,
    feetMoved,
    turnedLeft: rotation.rotationChange < -30,
    turnedRight: rotation.rotationChange > 30,
    isValidTurn: standing.isStanding && !feetMoved && Math.abs(rotation.rotationChange) > 30
  };
}

/**
 * 항목 11: 360도 회전 분석
 */
export function analyzeItem11(landmarks, state) {
  const standing = detectStanding(landmarks);
  const rotation = detectBodyRotation(landmarks, state?.initialLandmarks);

  // 누적 회전량 추적
  const cumulativeRotation = state?.cumulativeRotation || 0;
  const newRotation = cumulativeRotation + (rotation.rotationChange - (state?.lastRotation || 0));

  return {
    standing,
    rotation,
    cumulativeRotation: newRotation,
    completedFullTurn: Math.abs(newRotation) >= 330,
    turnDirection: newRotation > 0 ? 'right' : 'left'
  };
}

/**
 * 항목 12: 발판에 발 교대로 올리기 분석
 */
export function analyzeItem12(landmarks, previousLandmarks, state) {
  const standing = detectStanding(landmarks);
  const footStep = detectFootStep(landmarks, previousLandmarks);

  // 발 교대 확인
  const lastSteppingFoot = state?.lastSteppingFoot || null;
  const isAlternating = footStep.stepDetected && footStep.steppingFoot !== lastSteppingFoot;

  return {
    standing,
    footStep,
    isAlternating,
    stepCount: state?.stepCount || 0,
    lastSteppingFoot: footStep.stepDetected ? footStep.steppingFoot : lastSteppingFoot
  };
}

/**
 * 항목 13: 일렬로 서기 (탄뎀 서기) 분석
 */
export function analyzeItem13(landmarks, landmarksHistory) {
  const standing = detectStanding(landmarks);
  const stability = measureStability(landmarksHistory);
  const feetMeasure = measureFeetDistance(landmarks);

  return {
    standing,
    stability,
    isTandem: feetMeasure.isTandem,
    footAlignment: feetMeasure.footXDiff,
    isCorrectPose: standing.isStanding && feetMeasure.isTandem
  };
}

/**
 * 항목 14: 한 발로 서기 분석
 */
export function analyzeItem14(landmarks, landmarksHistory) {
  const standing = detectStanding(landmarks);
  const singleLeg = detectSingleLegStance(landmarks);
  const stability = measureStability(landmarksHistory);

  return {
    standing,
    singleLeg,
    stability,
    isOnOneLeg: singleLeg.isSingleLeg,
    liftedFoot: singleLeg.liftedFoot,
    isStable: singleLeg.isSingleLeg && stability.score >= 40
  };
}

// ============================================================
// 통합 분석 함수
// ============================================================

/**
 * 현재 항목에 맞는 분석 실행
 */
export function analyzeForItem(itemNumber, landmarks, state = {}) {
  switch (itemNumber) {
    case 1: return analyzeItem1(landmarks, state);
    case 2: return analyzeItem2(landmarks, state.landmarksHistory);
    case 3: return analyzeItem3(landmarks, state.landmarksHistory);
    case 4: return analyzeItem4(landmarks, state);
    case 5: return analyzeItem5(landmarks, state);
    case 6: return analyzeItem6(landmarks, state.landmarksHistory);
    case 7: return analyzeItem7(landmarks, state.landmarksHistory);
    case 8: return analyzeItem8(landmarks, state.initialLandmarks);
    case 9: return analyzeItem9(landmarks, state);
    case 10: return analyzeItem10(landmarks, state.initialLandmarks);
    case 11: return analyzeItem11(landmarks, state);
    case 12: return analyzeItem12(landmarks, state.previousLandmarks, state);
    case 13: return analyzeItem13(landmarks, state.landmarksHistory);
    case 14: return analyzeItem14(landmarks, state.landmarksHistory);
    default: return null;
  }
}
