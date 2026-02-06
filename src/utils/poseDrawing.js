// 스켈레톤 연결 포인트
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [27, 31],
  [24, 26], [26, 28], [28, 30], [28, 32]
];

// 주요 관절 포인트 인덱스
const KEY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// 스켈레톤 연결선 그리기
export function drawConnections(ctx, landmarks, width, height, options = {}) {
  const { strokeStyle = '#10B981', lineWidth = 3 } = options;

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;

  POSE_CONNECTIONS.forEach(([i, j]) => {
    const a = landmarks[i];
    const b = landmarks[j];
    if (a && b && a.visibility > 0.5 && b.visibility > 0.5) {
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
  });
}

// 관절 포인트 그리기
export function drawLandmarks(ctx, landmarks, width, height, options = {}) {
  const {
    fillStyle = '#34D399',
    strokeStyle = '#fff',
    radius = 6,
    lineWidth = 2
  } = options;

  KEY_POINTS.forEach((i) => {
    const point = landmarks[i];
    if (point && point.visibility > 0.5) {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, radius, 0, 2 * Math.PI);
      ctx.fillStyle = fillStyle;
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
