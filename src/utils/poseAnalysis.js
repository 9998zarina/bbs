// 각도 계산 유틸리티
export function calculateAngle(a, b, c) {
  if (!a || !b || !c) return 0;
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * 180 / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

// 자세 분석 유틸리티
export function analyzePose(landmarks) {
  if (!landmarks) return null;

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

  // 엉덩이 높이 (앉아있는지 서있는지 판단)
  const hipHeight = (leftHip.y + rightHip.y) / 2;
  const ankleHeight = (leftAnkle.y + rightAnkle.y) / 2;
  const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;

  // 상대적 높이 비율
  const hipToAnkleRatio = (ankleHeight - hipHeight) / (ankleHeight - shoulderHeight);

  // 자세 상태 판단
  let posture = 'unknown';
  if (hipToAnkleRatio < 0.4) {
    posture = 'sitting';
  } else if (hipToAnkleRatio > 0.5) {
    posture = 'standing';
  } else {
    posture = 'transitioning';
  }

  // 걸음 감지 (발목 높이 변화)
  const isWalking = Math.abs(leftAnkle.y - rightAnkle.y) > 0.05;

  return {
    leftKneeAngle,
    rightKneeAngle,
    hipHeight,
    posture,
    isWalking,
    hipToAnkleRatio
  };
}
