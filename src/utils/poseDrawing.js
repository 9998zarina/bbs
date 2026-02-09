// 스켈레톤 연결 포인트 (전체 신체)
const POSE_CONNECTIONS = [
  // 얼굴
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  // 몸통
  [9, 10],
  [11, 12], // 어깨
  [11, 13], [13, 15], // 왼팔
  [12, 14], [14, 16], // 오른팔
  [11, 23], [12, 24], // 어깨-골반
  [23, 24], // 골반
  // 왼쪽 다리
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // 오른쪽 다리
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]
];

// 주요 관절 포인트 인덱스 (모든 신체 부위)
const KEY_POINTS = [
  0,  // 코
  11, 12, // 어깨
  13, 14, // 팔꿈치
  15, 16, // 손목
  23, 24, // 골반
  25, 26, // 무릎
  27, 28, // 발목
  29, 30, // 발뒤꿈치
  31, 32  // 발끝
];

// 스켈레톤 연결선 그리기
export function drawConnections(ctx, landmarks, width, height, options = {}) {
  // color 옵션도 지원 (하위 호환성)
  const { strokeStyle, color, lineWidth = 3 } = options;
  const lineColor = strokeStyle || color || '#10B981';

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;

  POSE_CONNECTIONS.forEach(([i, j]) => {
    const a = landmarks[i];
    const b = landmarks[j];
    // visibility 조건 완화 (0.3 이상이면 그리기, 또는 visibility 없으면 그리기)
    const aVisible = a && (a.visibility === undefined || a.visibility > 0.3);
    const bVisible = b && (b.visibility === undefined || b.visibility > 0.3);
    if (aVisible && bVisible) {
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
  });
}

// 관절 포인트 그리기
export function drawLandmarks(ctx, landmarks, width, height, options = {}) {
  // color 옵션도 지원 (하위 호환성)
  const {
    fillStyle,
    color,
    strokeStyle = '#fff',
    radius = 6,
    lineWidth = 2
  } = options;
  const pointColor = fillStyle || color || '#34D399';

  KEY_POINTS.forEach((i) => {
    const point = landmarks[i];
    // visibility 조건 완화 (0.3 이상이면 그리기, 또는 visibility 없으면 그리기)
    const isVisible = point && (point.visibility === undefined || point.visibility > 0.3);
    if (isVisible) {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, radius, 0, 2 * Math.PI);
      ctx.fillStyle = pointColor;
      ctx.fill();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  });
}

// 스켈레톤 전체 그리기
export function drawSkeleton(ctx, landmarks, width, height, options = {}) {
  drawConnections(ctx, landmarks, width, height, options);
  drawLandmarks(ctx, landmarks, width, height, options);
}
