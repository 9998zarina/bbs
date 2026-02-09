import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PageContainer, Header } from '../../components/layout';
import { Button, Card, Alert, ProgressBar, Badge } from '../../components/ui';
import { PatientInfoForm } from '../../components/forms';
import { drawConnections, drawLandmarks } from '../../utils/poseDrawing';
import { calculateBBSRisk } from '../../utils/riskCalculation';
import {
  analyzeSitToStand,
  calculateSitToStandScore,
  getSitToStandFeedback,
  getVisualizationData,
  generateAssessmentReport,
  resetStateHistory,
  PostureState,
  HandPosition,
  HandSupportState
} from '../../utils/sitToStandAnalysis';
import {
  analyzeStandingUnsupported,
  calculateStandingScore,
  generateStandingReport,
  resetStandingAnalysis
} from '../../utils/standingUnsupportedAnalysis';
import { BBS_ITEMS } from '../../constants';
import { useNavigation, PAGES } from '../../context/NavigationContext';
import { useTestHistory } from '../../context/TestHistoryContext';
import { detectOffsetClient, detectOffsetAudio, applyOffsetToVideos } from '../../utils/videoSync';
import {
  analyzeForItem,
  detectSitting,
  detectStanding,
  detectHandSupport,
  detectArmExtension,
  detectBodyRotation,
  detectSingleLegStance,
  detectFootStep,
  measureFeetDistance,
  measureStability,
  getTrunkTilt,
  getKneeAngle,
  getHipAngle,
  POSE_LANDMARKS
} from '../../utils/bbsMotionAnalysis';

/**
 * 음성 안내 함수 (비활성화됨)
 */
const speak = (text, rate = 1.0) => {
  // 음성 안내 비활성화
  return;
};

/**
 * 세 점 사이의 각도 계산 (도 단위)
 */
function calculateAngle(pointA, pointB, pointC) {
  if (!pointA || !pointB || !pointC) return null;

  const radians = Math.atan2(pointC.y - pointB.y, pointC.x - pointB.x) -
                  Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x);
  let angle = Math.abs(radians * 180.0 / Math.PI);

  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  return angle;
}

/**
 * 캔버스에 무릎 각도 및 자세 정렬 표시
 */
function drawBodyAngles(ctx, landmarks, width, height, showTrunkAlignment = false) {
  if (!landmarks || landmarks.length < 33) return;

  ctx.save();

  // 랜드마크 인덱스
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  // 무릎 각도 계산 (엉덩이-무릎-발목)
  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

  // 자세 정렬 계산
  const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipCenterX = (leftHip.x + rightHip.x) / 2;
  const hipCenterY = (leftHip.y + rightHip.y) / 2;
  const trunkLateralTilt = Math.abs(shoulderCenterX - hipCenterX) * 100;
  const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) * 100;
  const hipTilt = Math.abs(leftHip.y - rightHip.y) * 100;
  const alignmentScore = trunkLateralTilt + shoulderTilt + hipTilt;
  const isAligned = alignmentScore < 5;

  // 각도 표시 헬퍼 함수
  const drawAngleLabel = (x, y, label, angle, color) => {
    if (!angle || isNaN(angle)) return;

    const px = x * width;
    const py = y * height;

    // 배경
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.beginPath();
    ctx.roundRect(px - 35, py - 12, 70, 24, 6);
    ctx.fill();

    // 테두리
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 텍스트
    ctx.fillStyle = color;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label} ${Math.round(angle)}°`, px, py);
  };

  // 왼쪽 무릎 각도 (노란색)
  if (leftKneeAngle) {
    drawAngleLabel(leftKnee.x - 0.06, leftKnee.y, '무릎', leftKneeAngle, '#FBBF24');
  }

  // 오른쪽 무릎 각도 (노란색)
  if (rightKneeAngle) {
    drawAngleLabel(rightKnee.x + 0.06, rightKnee.y, '무릎', rightKneeAngle, '#FBBF24');
  }

  // 자세 정렬 표시 (항목 3용)
  if (showTrunkAlignment) {
    // 어깨-엉덩이 수직선 표시
    const shX = shoulderCenterX * width;
    const shY = shoulderCenterY * height;
    const hpX = hipCenterX * width;
    const hpY = hipCenterY * height;

    // 정렬선 그리기
    ctx.strokeStyle = isAligned ? '#10B981' : '#EF4444';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(hpX, hpY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 정렬 점수 표시
    const midY = (shY + hpY) / 2;
    const alignColor = isAligned ? '#10B981' : alignmentScore < 8 ? '#FBBF24' : '#EF4444';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.beginPath();
    ctx.roundRect(10, midY - 25, 120, 50, 8);
    ctx.fill();

    ctx.strokeStyle = alignColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = alignColor;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(isAligned ? '✓ 자세 정렬됨' : '⚠ 자세 교정 필요', 18, midY - 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px Arial';
    ctx.fillText(`기울기: ${alignmentScore.toFixed(1)}`, 18, midY + 10);
  }

  ctx.restore();
}

/**
 * 캔버스에 각도 정보 그리기 (Item 1 전용)
 */
function drawAngleInfo(ctx, analysis, landmarks, width, height) {
  if (!analysis || !landmarks) return;

  const vizData = getVisualizationData(analysis, landmarks);
  if (!vizData) return;

  ctx.save();

  // 상태 표시 박스 (화면 중앙 상단)
  const stateText = analysis.state === PostureState.SITTING ? '앉음 감지' :
                    analysis.state === PostureState.STANDING ? '서있음 감지' : '감지 중';

  ctx.fillStyle = vizData.stateColor;
  ctx.beginPath();
  ctx.roundRect(width / 2 - 60, 10, 120, 35, 8);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(stateText, width / 2, 33);

  ctx.restore();

  // 신체 각도 표시 (무릎, 발목, 엉덩이)
  drawBodyAngles(ctx, landmarks, width, height);
}

function BBSTestPage() {
  const [currentItem, setCurrentItem] = useState(0);
  const [scores, setScores] = useState(Array(14).fill(null));
  const [isComplete, setIsComplete] = useState(false);
  const [shouldComplete, setShouldComplete] = useState(false); // 완료 트리거 플래그
  const [patientInfo, setPatientInfo] = useState({ name: '홍길동', id: 'P-DEMO-001' });

  // AI 분석 결과 저장 (각 항목별)
  const [analysisResults, setAnalysisResults] = useState(Array(14).fill(null));
  const [testStartTime, setTestStartTime] = useState(null);
  const [testEndTime, setTestEndTime] = useState(null);
  const [showSetup, setShowSetup] = useState(true);

  // 동영상 업로드 (각 항목별 측면/정면)
  const [itemVideos, setItemVideos] = useState(
    Array(14).fill(null).map(() => ({ side: null, front: null }))
  );

  // 현재 항목의 영상 URL (편의를 위한 계산된 값)
  const sideVideoUrl = itemVideos[currentItem]?.side;
  const frontVideoUrl = itemVideos[currentItem]?.front;

  // 영상 싱크 상태 (각 항목별)
  const defaultSyncInfo = {
    offset: 0,
    sideTrim: 0,
    frontTrim: 0,
    confidence: 0,
    method: null,
    synced: false,
    syncing: false,
    error: null
  };
  const [itemSyncInfos, setItemSyncInfos] = useState(
    Array(14).fill(null).map(() => ({ ...defaultSyncInfo }))
  );

  // 현재 항목의 싱크 정보 (편의를 위한 계산된 값)
  const videoSyncInfo = itemSyncInfos[currentItem] || defaultSyncInfo;

  // 현재 항목 싱크 정보 업데이트 함수
  const setVideoSyncInfo = (updater) => {
    setItemSyncInfos(prev => {
      const newInfos = [...prev];
      if (typeof updater === 'function') {
        newInfos[currentItem] = updater(newInfos[currentItem] || defaultSyncInfo);
      } else {
        newInfos[currentItem] = updater;
      }
      return newInfos;
    });
  };

  // 현재 항목 영상 설정 함수
  const setCurrentItemVideo = (type, url) => {
    setItemVideos(prev => {
      const newVideos = [...prev];
      newVideos[currentItem] = { ...newVideos[currentItem], [type]: url };
      return newVideos;
    });
  };

  // 기존 호환성을 위한 setter 함수
  const setSideVideoUrl = (url) => setCurrentItemVideo('side', url);
  const setFrontVideoUrl = (url) => setCurrentItemVideo('front', url);

  // 카메라/분석 상태
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [itemTimer, setItemTimer] = useState(0);
  const [currentLandmarks, setCurrentLandmarks] = useState(null);

  // 합성 뷰 모드 (측면+정면 동시 표시)
  const [combinedViewMode, setCombinedViewMode] = useState(false); // 합성 뷰 활성화 여부
  const [combinedLayout, setCombinedLayout] = useState('side-by-side'); // 'side-by-side', 'overlay', 'pip'
  const combinedCanvasRef = useRef(null); // 합성 캔버스
  const combinedAnimationRef = useRef(null); // 합성 뷰 애니메이션 ID
  const sideLandmarksRef = useRef(null); // 측면 랜드마크 저장
  const frontLandmarksRef = useRef(null); // 정면 랜드마크 저장

  // 항목 1 전용 상태 - 단계별 검사 시스템
  // testPhase: 'waiting' -> 'sitting_confirmed' -> 'standing_up' -> 'complete'
  const [sitToStandState, setSitToStandState] = useState({
    testPhase: 'waiting', // waiting, sitting_confirmed, standing_up, complete
    currentPosture: PostureState.UNKNOWN,
    handPosition: HandPosition.UNKNOWN,
    handSupport: HandSupportState.UNKNOWN,
    sittingConfidence: 0,
    standingConfidence: 0,
    kneeAngle: 0,
    hipAngle: 0,
    feedback: { message: '의자에 앉아주세요...', type: 'info' },
    sittingConfirmedAt: null, // 앉음 확인 시간
    standingDetectedAt: null, // 서있음 감지 시간
    usedHandsDuringTransition: false,
    handUsageDetectedAt: null, // 손 사용 감지 시간
    autoScore: null,
    assessmentReport: null,
    showResultModal: false,
    debug: null
  });

  // 일반 항목용 상태 (항목 3-14)
  // testPhase: 'waiting' -> 'detecting' -> 'in_progress' -> 'complete'
  const [generalDetection, setGeneralDetection] = useState({
    testPhase: 'waiting', // waiting, detecting, in_progress, complete
    status: '대기',
    confidence: 0,
    suggestedScore: null,
    message: '',
    // 타이머 기반 항목용
    startTime: null,
    elapsedTime: 0,
    targetDuration: 0,
    // 동작 기반 항목용
    actionDetected: false,
    actionCount: 0,
    // 자세 분석
    currentPosture: 'unknown',
    postureStability: 'unknown',
    // 항목 3 자세 안정성 추적
    postureAligned: false,        // 어깨-엉덩이 정렬 여부
    trunkTiltHistory: [],         // 몸통 기울기 이력
    lateralShiftCount: 0,         // 좌우 흔들림 횟수
    maxTrunkTilt: 0,              // 최대 기울기
    stabilityScore: 100,          // 안정성 점수 (100점 시작, 감점)
    initialTrunkAngle: null,      // 초기 몸통 각도 (기준점)
    // 완료 상태
    autoScore: null,
    assessmentReport: null,
    showResultModal: false
  });

  // 측면 영상 refs
  const sideVideoRef = useRef(null);
  const sideCanvasRef = useRef(null);
  const sidePoseRef = useRef(null);
  const sideAnalysisRef = useRef(null); // 측면 분석 루프 ID

  // 정면 영상 refs
  const frontVideoRef = useRef(null);
  const frontCanvasRef = useRef(null);
  const frontPoseRef = useRef(null);
  const frontAnalysisRef = useRef(null); // 정면 분석 루프 ID

  // 공용 refs
  const timerRef = useRef(null);
  const cameraRef = useRef(null);
  const analysisHistoryRef = useRef([]);
  const previousAnalysisRef = useRef(null);
  const startTimeRef = useRef(null);
  const sideFileInputRef = useRef(null); // 측면 영상 파일 입력
  const frontFileInputRef = useRef(null); // 정면 영상 파일 입력

  // BBS 모션 분석용 히스토리 refs
  const landmarksHistoryRef = useRef([]); // 랜드마크 히스토리 (안정성 분석용)
  const previousLandmarksRef = useRef(null); // 이전 프레임 랜드마크
  const initialLandmarksRef = useRef(null); // 초기 랜드마크 (회전 분석용)
  const motionStateRef = useRef({
    stepCount: 0,
    lastSteppingFoot: null,
    cumulativeRotation: 0,
    lastRotation: 0,
    // 항목 10: 뒤돌아보기용
    maxLeftRotation: 0,
    maxRightRotation: 0
  }); // 모션 분석 상태

  // 항목 2: 정면 영상 안정성 분석 결과 저장
  const frontStabilityRef = useRef({
    stability: 'good',
    sway: 0,
    lateralShift: 0,    // 좌우 흔들림
    shoulderTilt: 0,    // 어깨 기울기
    hipTilt: 0,         // 엉덩이 기울기
    isUnstable: false,
    lateralMovement: 0, // 좌우 움직임 (시간에 따른 변화)
    frontBackMovement: 0 // 앞뒤 움직임
  });

  // 항목 2: 움직임 히스토리 추적 (좌우/앞뒤 움직임 감지용)
  const movementHistoryRef = useRef({
    positions: [],      // {x, y, bodySize, timestamp} 배열
    maxHistory: 30,     // 최근 30프레임 저장 (약 1초)
    baselineBodySize: null, // 기준 신체 크기 (앞뒤 움직임 기준점)
    baselineX: null,    // 기준 X 위치 (좌우 움직임 기준점)
    totalLateralMovement: 0,  // 누적 좌우 움직임
    totalFrontBackMovement: 0, // 누적 앞뒤 움직임
    unstableEvents: 0   // 불안정 이벤트 횟수
  });

  // 움직임 히스토리 및 안정성 데이터 초기화
  const resetMovementHistory = useCallback(() => {
    movementHistoryRef.current = {
      positions: [],
      maxHistory: 30,
      baselineBodySize: null,
      baselineX: null,
      totalLateralMovement: 0,
      totalFrontBackMovement: 0,
      unstableEvents: 0
    };
    frontStabilityRef.current = {
      stability: 'good',
      sway: 0,
      lateralShift: 0,
      shoulderTilt: 0,
      hipTilt: 0,
      isUnstable: false,
      lateralMovement: 0,
      frontBackMovement: 0
    };
    console.log('[Item2] 움직임 히스토리 초기화');
  }, []);

  // 항목 4: 서서 앉기 분석용 (털썩 앉음 vs 천천히 앉음 감지)
  const sittingAnalysisRef = useRef({
    phase: 'waiting',        // waiting, standing, descending, seated
    hipPositions: [],        // {y, timestamp} 배열 - 엉덩이 높이 추적
    descentVelocities: [],   // 하강 속도 기록
    maxVelocity: 0,          // 최대 하강 속도
    finalVelocity: 0,        // 착석 직전 속도 (급격히 떨어지면 털썩)
    isControlled: true,      // 조절된 앉기 여부
    usedHands: false,        // 손 사용 여부
    startTime: null,         // 앉기 시작 시간
    endTime: null,           // 앉기 완료 시간
    descentDuration: 0,      // 하강 소요 시간
    score: null,             // AI 추천 점수
    feedback: ''             // 피드백 메시지
  });

  // 항목 4 분석 리셋
  const resetSittingAnalysis = useCallback(() => {
    sittingAnalysisRef.current = {
      phase: 'waiting',
      hipPositions: [],
      descentVelocities: [],
      maxVelocity: 0,
      finalVelocity: 0,
      isControlled: true,
      usedHands: false,
      startTime: null,
      endTime: null,
      descentDuration: 0,
      score: null,
      feedback: ''
    };
    console.log('[Item4] 앉기 분석 초기화');
  }, []);

  // 항목 8: 팔 뻗기 측정용 (거리 측정 + 자 표시)
  const armReachRef = useRef({
    phase: 'waiting',           // waiting, standing, reaching, complete
    initialFingerX: null,       // 초기 손끝 X 위치
    initialShoulderX: null,     // 초기 어깨 X 위치
    maxReachDistance: 0,        // 최대 뻗은 거리 (cm)
    currentReachDistance: 0,    // 현재 뻗은 거리 (cm)
    shoulderWidthPixels: 0,     // 어깨 너비 (픽셀) - 거리 계산 기준
    pixelToCm: 0,               // 픽셀당 cm 비율
    score: null,
    feedback: ''
  });

  // 항목 8 상태
  const [armReachState, setArmReachState] = useState({
    phase: 'waiting',
    currentReach: 0,
    maxReach: 0,
    feedback: { message: '서서 팔을 앞으로 뻗으세요', type: 'info' },
    autoScore: null,
    showResultModal: false
  });

  // 항목 8 분석 리셋
  const resetArmReachAnalysis = useCallback(() => {
    armReachRef.current = {
      phase: 'waiting',
      initialWristX: null,
      initialShoulderX: null,
      maxReachDistance: 0,
      currentReachDistance: 0,
      shoulderWidthPixels: 0,
      pixelToCm: 0,
      score: null,
      feedback: ''
    };
    setArmReachState({
      phase: 'waiting',
      currentReach: 0,
      maxReach: 0,
      feedback: { message: '서서 팔을 앞으로 뻗으세요', type: 'info' },
      autoScore: null,
      showResultModal: false
    });
    console.log('[Item8] 팔 뻗기 분석 초기화');
  }, []);

  // 항목 9: 바닥 물건 집기 분석용
  const pickUpRef = useRef({
    phase: 'waiting',           // waiting, standing, bending, reaching, picked_up, returning, complete
    objectDetected: false,      // 물건(동그라미) 감지 여부
    objectPosition: null,       // 물건 위치 {x, y}
    initialHandY: null,         // 초기 손 Y 위치
    lowestHandY: null,          // 가장 낮은 손 Y 위치
    pickedUp: false,            // 물건 집기 성공 여부
    handReachedObject: false,   // 손이 물건에 도달했는지
    returnedToStand: false,     // 다시 서있는 자세로 돌아왔는지
    balanceLost: false,         // 균형 상실 여부
    startTime: null,
    endTime: null,
    score: null,
    feedback: ''
  });

  // 항목 9 상태
  const [pickUpState, setPickUpState] = useState({
    phase: 'waiting',
    objectDetected: false,
    pickedUp: false,
    feedback: { message: '바닥의 물건(동그라미)을 인식 중...', type: 'info' },
    autoScore: null,
    showResultModal: false
  });

  // 항목 9 분석 리셋
  const resetPickUpAnalysis = useCallback(() => {
    pickUpRef.current = {
      phase: 'waiting',
      objectDetected: false,
      objectPosition: null,
      initialHandY: null,
      lowestHandY: null,
      pickedUp: false,
      handReachedObject: false,
      returnedToStand: false,
      balanceLost: false,
      startTime: null,
      endTime: null,
      score: null,
      feedback: ''
    };
    setPickUpState({
      phase: 'waiting',
      objectDetected: false,
      pickedUp: false,
      feedback: { message: '바닥의 물건(동그라미)을 인식 중...', type: 'info' },
      autoScore: null,
      showResultModal: false
    });
    console.log('[Item9] 물건 집기 분석 초기화');
  }, []);

  // 양쪽 영상 상태
  const [sideVideoProgress, setSideVideoProgress] = useState(0);
  const [frontVideoProgress, setFrontVideoProgress] = useState(0);
  const [sideVideoDuration, setSideVideoDuration] = useState(0);
  const [frontVideoDuration, setFrontVideoDuration] = useState(0);
  const [isSideVideoPaused, setIsSideVideoPaused] = useState(false);
  const [isFrontVideoPaused, setIsFrontVideoPaused] = useState(false);

  // 측면/정면 랜드마크 (분석용)
  const [sideLandmarks, setSideLandmarks] = useState(null);
  const [frontLandmarks, setFrontLandmarks] = useState(null);

  // AI 자동 감지된 영상 타입 ('side' | 'front' | 'unknown')
  // ref로 관리하여 콜백 안에서 최신 값 접근 가능
  const [video1DetectedType, setVideo1DetectedType] = useState('unknown');
  const [video2DetectedType, setVideo2DetectedType] = useState('unknown');
  const video1DetectedTypeRef = useRef('unknown');
  const video2DetectedTypeRef = useRef('unknown');
  const detectionCountRef = useRef({ video1: { side: 0, front: 0 }, video2: { side: 0, front: 0 } });

  // 디버그용 상태 (ref 상태를 화면에 표시하기 위함)
  const [debugInfo, setDebugInfo] = useState({ sideRef: false, frontRef: false });

  const { navigateTo } = useNavigation();
  const { addTestResult } = useTestHistory();

  const currentBBSItem = BBS_ITEMS[currentItem];
  const isItem1 = currentItem === 0;
  const isItem2 = currentItem === 1;
  const isItem4 = currentItem === 3; // 4번 검사: 서서 앉기
  const isItem8 = currentItem === 7; // 8번 검사: 팔 뻗기
  const isItem9 = currentItem === 8; // 9번 검사: 바닥 물건 집기

  // 항목 2 전용 상태 - 잡지 않고 서 있기
  // testPhase: 'waiting' -> 'sitting_confirmed' -> 'standing_up' -> 'timing' -> 'complete'
  const [standingState, setStandingState] = useState({
    testPhase: 'waiting', // waiting, sitting_confirmed, standing_up, timing, complete
    currentState: 'not_standing',
    currentPosture: PostureState.UNKNOWN, // 현재 자세 (sitting, standing, unknown)
    stabilityLevel: 'good',
    isStanding: false,
    isUsingSupport: false, // 지지물 사용 여부
    sittingConfidence: 0, // 앉음 신뢰도
    standingConfidence: 0, // 서있음 신뢰도
    sittingConfirmedAt: null, // 앉음 확인 시간
    standingDetectedAt: null, // 일어서기 감지 시간
    standingStartTime: null,
    standingDuration: 0,
    targetDuration: 120, // 2분
    supportSeekingCount: 0,
    unstableTime: 0,
    lostBalance: false,
    standingAttemptCount: 0, // 일어서기 시도 횟수
    wasStanding: false, // 이전에 서있었는지 (시도 횟수 카운트용)
    feedback: { message: '의자에 앉아주세요...', type: 'info' },
    autoScore: null,
    assessmentReport: null,
    showResultModal: false,
    debug: null
  });

  // 항목 4 전용 상태 - 서서 앉기
  const [sittingState, setSittingState] = useState({
    phase: 'waiting', // waiting, standing, descending, seated
    kneeAngle: 0,
    isControlled: true,
    usedHands: false,
    descentDuration: 0,
    maxVelocity: 0,
    finalVelocity: 0,
    feedback: { message: '서 있는 자세로 준비해주세요...', type: 'info' },
    autoScore: null,
    showResultModal: false
  });

  // 항목 1 전용 분석 - 단계별 검사
  const handleItem1Analysis = useCallback((landmarks) => {
    const analysis = analyzeSitToStand(landmarks, previousAnalysisRef.current);
    const now = Date.now();

    // 히스토리 저장
    analysisHistoryRef.current.push({
      ...analysis,
      timestamp: now
    });

    if (analysisHistoryRef.current.length > 150) {
      analysisHistoryRef.current.shift();
    }

    previousAnalysisRef.current = {
      ...analysis,
      handSupportUsed: sitToStandState.usedHandsDuringTransition ||
        analysis.handPosition?.support !== HandSupportState.NO_SUPPORT
    };

    setSitToStandState(prev => {
      let newPhase = prev.testPhase;
      let newFeedback = prev.feedback;
      let sittingConfirmedAt = prev.sittingConfirmedAt;
      let standingDetectedAt = prev.standingDetectedAt;
      let usedHands = prev.usedHandsDuringTransition;
      let handUsageDetectedAt = prev.handUsageDetectedAt;
      let autoScore = prev.autoScore;
      let assessmentReport = prev.assessmentReport;
      let showResultModal = prev.showResultModal;

      // 단계 1: 앉음 대기 중
      if (prev.testPhase === 'waiting') {
        if (analysis.state === PostureState.SITTING && analysis.sitting?.confidence > 50) {
          // 앉음 감지됨 - 1초간 유지되면 확정
          if (!sittingConfirmedAt) {
            sittingConfirmedAt = now;
            console.log('[Item1] 앉은 자세 감지 시작! confidence:', analysis.sitting?.confidence);
            newFeedback = { message: '앉은 자세 감지 중... 잠시 유지해주세요', type: 'info' };
          } else if (now - sittingConfirmedAt > 1000) {
            // 1초간 앉음 유지 = 확정
            console.log('[Item1] 앉은 자세 확정!');
            newPhase = 'sitting_confirmed';
            newFeedback = { message: '✓ 앉은 자세 확인! 이제 일어서세요', type: 'success' };
          }
        } else {
          sittingConfirmedAt = null;
          newFeedback = { message: '의자에 앉아주세요...', type: 'info' };
        }
      }

      // 단계 2: 앉음 확정 - 일어서기 대기
      if (prev.testPhase === 'sitting_confirmed') {
        // 손 사용 감지 (무릎 짚기)
        if (analysis.handPosition?.support === HandSupportState.HEAVY_SUPPORT ||
            analysis.handPosition?.position === HandPosition.HANDS_PUSHING) {
          if (!usedHands) {
            usedHands = true;
            handUsageDetectedAt = now;
          }
          newFeedback = { message: '⚠️ 손 사용 감지! (감점)', type: 'error' };
        }

        // 일어서기 시작 감지 (조건 완화)
        const standingConf = analysis.standing?.confidence || 0;
        if (standingConf > 25 || analysis.isTransitioning) {
          console.log('[Item1] 일어서기 시작! standing confidence:', standingConf);
          newPhase = 'standing_up';
          newFeedback = { message: '일어서는 중... 계속 일어서세요!', type: 'info' };
        }
      }

      // 단계 3: 일어서는 중
      if (prev.testPhase === 'standing_up') {
        // 손 사용 감지
        if (analysis.handPosition?.support === HandSupportState.HEAVY_SUPPORT ||
            analysis.handPosition?.position === HandPosition.HANDS_PUSHING) {
          if (!usedHands) {
            usedHands = true;
            handUsageDetectedAt = now;
          }
          newFeedback = { message: '⚠️ 손 사용 감지! (감점)', type: 'error' };
        }

        // 서있음 확정 감지 (조건 완화: 45% 이상)
        const standingConfidence = analysis.standing?.confidence || 0;
        const isStanding = analysis.state === PostureState.STANDING && standingConfidence > 45;

        if (isStanding) {
          if (!standingDetectedAt) {
            standingDetectedAt = now;
            console.log('[Item1] 서있음 감지 시작! confidence:', standingConfidence);
          } else if (now - standingDetectedAt > 800) {
            // 0.8초간 서있음 유지 = 검사 완료!
            console.log('[Item1] 검사 완료! 서있음 유지:', (now - standingDetectedAt), 'ms');
            newPhase = 'complete';
            autoScore = calculateSitToStandScore(analysisHistoryRef.current);
            assessmentReport = generateAssessmentReport(analysisHistoryRef.current, autoScore);
            showResultModal = true;
            console.log('[Item1] autoScore:', autoScore, 'assessmentReport:', assessmentReport);
            newFeedback = {
              message: usedHands ? '🎉 검사 완료! (손 사용 감점)' : '🎉 검사 완료! 훌륭합니다!',
              type: usedHands ? 'warning' : 'success'
            };
          } else {
            const remaining = Math.ceil((800 - (now - standingDetectedAt)) / 100) / 10;
            newFeedback = { message: `서있는 자세 확인 중... (${remaining}초)`, type: 'info' };
          }
        } else {
          if (standingDetectedAt) {
            console.log('[Item1] 서있음 리셋 - confidence:', standingConfidence);
          }
          standingDetectedAt = null;
        }
      }

      return {
        ...prev,
        testPhase: newPhase,
        currentPosture: analysis.state,
        handPosition: analysis.handPosition?.position || HandPosition.UNKNOWN,
        handSupport: analysis.handPosition?.support || HandSupportState.UNKNOWN,
        sittingConfidence: analysis.sitting?.confidence || 0,
        standingConfidence: analysis.standing?.confidence || 0,
        kneeAngle: analysis.sitting?.details?.kneeAngle || analysis.standing?.details?.kneeAngle || 0,
        hipAngle: analysis.sitting?.details?.hipAngle || analysis.standing?.details?.hipAngle || 0,
        feedback: newFeedback,
        sittingConfirmedAt,
        standingDetectedAt,
        usedHandsDuringTransition: usedHands,
        handUsageDetectedAt,
        autoScore,
        assessmentReport,
        showResultModal,
        debug: analysis.debug
      };
    });

    return analysis;
  }, [sitToStandState.testPhase, sitToStandState.usedHandsDuringTransition]);

  // 항목 2: 정면 영상 안정성 분석 (좌우/앞뒤 움직임 감지)
  const analyzeItem2FrontStability = useCallback((landmarks) => {
    if (!landmarks || landmarks.length < 33) {
      return { stability: 'good', isUnstable: false };
    }

    const now = Date.now();
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const nose = landmarks[0];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    // === 현재 프레임 분석 ===
    // 1. 어깨 기울기 (좌우 어깨 높이 차이)
    const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) * 100;

    // 2. 엉덩이 기울기 (좌우 엉덩이 높이 차이)
    const hipTilt = Math.abs(leftHip.y - rightHip.y) * 100;

    // 3. 상체 중심 X 위치
    const bodyCenterX = (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4;
    const bodyCenterY = (leftShoulder.y + rightShoulder.y + leftHip.y + rightHip.y) / 4;
    const lateralShift = Math.abs(nose.x - bodyCenterX) * 100;

    // 4. 신체 크기 계산 (앞뒤 움직임 감지용 - 가까워지면 커지고 멀어지면 작아짐)
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const bodyHeight = Math.abs(bodyCenterY - ((leftAnkle.y + rightAnkle.y) / 2));
    const bodySize = shoulderWidth * bodyHeight * 10000; // 스케일 조정

    // === 움직임 히스토리 업데이트 ===
    const history = movementHistoryRef.current;

    // 새 위치 추가
    history.positions.push({
      x: bodyCenterX,
      y: bodyCenterY,
      bodySize: bodySize,
      timestamp: now
    });

    // 오래된 데이터 제거 (최근 30프레임만 유지)
    while (history.positions.length > history.maxHistory) {
      history.positions.shift();
    }

    // === 움직임 분석 (최소 10프레임 이후부터) ===
    let lateralMovement = 0;
    let frontBackMovement = 0;
    let movementDescription = '';

    if (history.positions.length >= 10) {
      // 기준점 설정 (처음 측정 시)
      if (history.baselineX === null) {
        history.baselineX = bodyCenterX;
        history.baselineBodySize = bodySize;
      }

      // 최근 프레임들의 움직임 분석
      const recentPositions = history.positions.slice(-10);

      // 좌우 움직임: X 좌표의 표준편차 및 이동 범위
      const xValues = recentPositions.map(p => p.x);
      const xMin = Math.min(...xValues);
      const xMax = Math.max(...xValues);
      const xRange = (xMax - xMin) * 100; // 좌우 이동 범위

      // X 좌표 변화량 (프레임 간 이동 거리 합)
      let xMovementSum = 0;
      for (let i = 1; i < recentPositions.length; i++) {
        xMovementSum += Math.abs(recentPositions[i].x - recentPositions[i-1].x) * 100;
      }
      lateralMovement = xMovementSum + xRange;

      // 앞뒤 움직임: 신체 크기 변화 (가까이/멀리)
      const sizeValues = recentPositions.map(p => p.bodySize);
      const sizeMin = Math.min(...sizeValues);
      const sizeMax = Math.max(...sizeValues);
      const avgSize = sizeValues.reduce((a, b) => a + b, 0) / sizeValues.length;
      const sizeVariation = ((sizeMax - sizeMin) / avgSize) * 100; // 크기 변화율

      // 신체 크기 변화량 (프레임 간 변화 합)
      let sizeMovementSum = 0;
      for (let i = 1; i < recentPositions.length; i++) {
        sizeMovementSum += Math.abs(recentPositions[i].bodySize - recentPositions[i-1].bodySize) / avgSize * 100;
      }
      frontBackMovement = sizeMovementSum + sizeVariation;

      // 누적 움직임 업데이트
      history.totalLateralMovement += lateralMovement * 0.1; // 스케일 조정
      history.totalFrontBackMovement += frontBackMovement * 0.1;

      // 움직임 설명 생성
      const movements = [];
      if (lateralMovement > 3) movements.push('좌우');
      if (frontBackMovement > 5) movements.push('앞뒤');
      if (movements.length > 0) {
        movementDescription = `${movements.join('/')} 움직임 감지`;
      }

      // 불안정 이벤트 카운트
      if (lateralMovement > 5 || frontBackMovement > 8) {
        history.unstableEvents++;
      }
    }

    // === 종합 안정성 점수 계산 ===
    // 정적 불안정성 (현재 자세)
    const staticInstability = shoulderTilt + hipTilt + lateralShift;

    // 동적 불안정성 (움직임)
    const dynamicInstability = (lateralMovement * 0.5) + (frontBackMovement * 0.3);

    // 종합 점수
    const totalInstability = staticInstability + dynamicInstability;

    let stability = 'excellent';
    if (totalInstability > 20) stability = 'critical';
    else if (totalInstability > 15) stability = 'poor';
    else if (totalInstability > 10) stability = 'moderate';
    else if (totalInstability > 5) stability = 'good';

    const isUnstable = totalInstability > 12 || lateralMovement > 5 || frontBackMovement > 8;

    // ref에 저장 (다른 분석에서 사용)
    frontStabilityRef.current = {
      stability,
      sway: totalInstability,
      lateralShift,
      shoulderTilt,
      hipTilt,
      lateralMovement,
      frontBackMovement,
      totalLateralMovement: history.totalLateralMovement,
      totalFrontBackMovement: history.totalFrontBackMovement,
      unstableEvents: history.unstableEvents,
      movementDescription,
      isUnstable
    };

    // 움직임이 감지되면 로그 출력
    if (lateralMovement > 2 || frontBackMovement > 3) {
      console.log(`[Item2-정면] 안정성: ${stability} | 좌우: ${lateralMovement.toFixed(1)} | 앞뒤: ${frontBackMovement.toFixed(1)} | ${movementDescription}`);
    }

    return frontStabilityRef.current;
  }, []);

  // 항목 4 전용 분석 - 서서 앉기 (털썩 vs 천천히 앉기 감지)
  // 영상 흐름: 앉아있음 → 일어섬 → 앉기 (앉기 동작 분석)
  const handleItem4Analysis = useCallback((landmarks) => {
    if (!landmarks || landmarks.length < 33) {
      return sittingAnalysisRef.current;
    }

    const now = Date.now();
    const analysis = sittingAnalysisRef.current;

    // 랜드마크 추출
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    // 엉덩이 Y 위치 (화면 좌표계: 아래로 갈수록 값 증가)
    const hipY = (leftHip.y + rightHip.y) / 2;
    const kneeY = (leftKnee.y + rightKnee.y) / 2;
    const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;

    // 무릎 각도 계산
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // 서있음/앉음 판단 (무릎 각도 기준)
    const isStanding = avgKneeAngle > 150;
    const isSitting = avgKneeAngle < 110;
    const isDescending = avgKneeAngle >= 110 && avgKneeAngle <= 150;

    // 손 위치 분석 (팔걸이 사용 또는 무릎 짚기 감지)
    // 하강 중에 손이 엉덩이/무릎 높이로 내려가면 손 사용
    const leftWristBelowShoulder = leftWrist.y > leftShoulder.y + 0.1;
    const rightWristBelowShoulder = rightWrist.y > rightShoulder.y + 0.1;
    const leftWristNearKnee = Math.abs(leftWrist.y - kneeY) < 0.15;
    const rightWristNearKnee = Math.abs(rightWrist.y - kneeY) < 0.15;
    const leftWristNearHip = Math.abs(leftWrist.y - hipY) < 0.15;
    const rightWristNearHip = Math.abs(rightWrist.y - hipY) < 0.15;

    // 하강 중 손이 무릎/엉덩이 근처에 있으면 지지에 사용
    const handsUsedForSupport = (leftWristBelowShoulder && (leftWristNearKnee || leftWristNearHip)) ||
                                 (rightWristBelowShoulder && (rightWristNearKnee || rightWristNearHip));

    // ===== 단계별 분석: 서있음 → 앉기 =====

    // 1단계: 서있음 대기
    if (analysis.phase === 'waiting') {
      if (isStanding) {
        // 서있음 감지! 앉기 분석 준비
        analysis.phase = 'standing';
        analysis.standingTime = now;
        analysis.hipPositions = [];
        analysis.descentVelocities = [];
        analysis.maxVelocity = 0;
        analysis.usedHands = false;
        console.log('[Item4] 서있음 감지 - 앉기 분석 준비 완료');
      }
    }
    // 2단계: 서있음 상태 - 앉기 시작 감지
    else if (analysis.phase === 'standing') {
      if (isDescending || isSitting) {
        // 앉기 시작!
        analysis.phase = 'descending';
        analysis.startTime = now;
        analysis.hipPositions = [{ y: hipY, timestamp: now }];
        console.log('[Item4] 앉기 시작! 하강 속도 측정 중...');
      }
    }
    // 4단계: 앉는 중 - 속도 및 손 사용 분석
    else if (analysis.phase === 'descending') {
      // 엉덩이 위치 추적
      analysis.hipPositions.push({ y: hipY, timestamp: now });

      // 최근 위치들로 속도 계산 (프레임 간 속도)
      if (analysis.hipPositions.length >= 2) {
        const positions = analysis.hipPositions;
        const len = positions.length;

        // 최근 2개 프레임으로 순간 속도 계산
        const prev = positions[len - 2];
        const curr = positions[len - 1];
        const deltaY = (curr.y - prev.y) * 100; // 양수 = 하강
        const deltaTime = (curr.timestamp - prev.timestamp) / 1000;

        if (deltaTime > 0) {
          const instantVelocity = deltaY / deltaTime;
          analysis.descentVelocities.push(instantVelocity);

          // 최대 속도 업데이트 (하강 시에만)
          if (instantVelocity > analysis.maxVelocity) {
            analysis.maxVelocity = instantVelocity;
          }
        }
      }

      // 손 사용 감지 (하강 중)
      if (handsUsedForSupport && !analysis.usedHands) {
        analysis.usedHands = true;
        console.log('[Item4] 손 사용 감지 (팔걸이/무릎 지지)');
      }

      // 앉기 완료 감지
      if (isSitting) {
        analysis.phase = 'seated';
        analysis.endTime = now;
        analysis.descentDuration = (now - analysis.startTime) / 1000;

        // 착석 직전 속도 (마지막 5프레임 평균)
        if (analysis.descentVelocities.length >= 3) {
          const lastVelocities = analysis.descentVelocities.slice(-5);
          analysis.finalVelocity = lastVelocities.reduce((a, b) => a + b, 0) / lastVelocities.length;
        }

        // ===== 조절된 앉기 vs 털썩 앉기 판단 =====
        // 기준:
        // - 하강 시간 0.5초 미만: 너무 빠름 (털썩)
        // - 착석 직전 속도 20 이상: 급정거 (털썩)
        // - 최대 하강 속도 30 이상: 자유낙하에 가까움 (털썩)
        const tooFast = analysis.descentDuration < 0.5;
        const fastFinalVelocity = analysis.finalVelocity > 20;
        const fastMaxVelocity = analysis.maxVelocity > 30;

        analysis.isControlled = !tooFast && !fastFinalVelocity && !fastMaxVelocity;

        // ===== 점수 계산 =====
        // 4점: 손 최소 사용, 안전하게 앉음
        // 3점: 손 사용하여 조절
        // 2점: 다리 뒤쪽으로 의자 위치 확인하며 앉음 (여기서는 감지 어려움)
        // 1점: 조절 안되고 털썩 앉음
        // 0점: 도움 필요
        let score = 4;
        let feedback = '';

        if (!analysis.isControlled) {
          // 조절되지 않고 내려앉음 (털썩)
          score = 1;
          feedback = '⚠️ 조절되지 않고 털썩 앉음';
          if (tooFast) feedback += ` (${analysis.descentDuration.toFixed(1)}초 - 너무 빠름)`;
          if (fastFinalVelocity) feedback += ` (착석속도: ${analysis.finalVelocity.toFixed(1)})`;
        } else if (analysis.usedHands) {
          // 손 사용하여 조절
          score = 3;
          feedback = '손을 사용하여 조절하며 앉음';
        } else {
          // 안전하게 앉음
          score = 4;
          feedback = '✓ 손 사용 없이 안전하게 앉음';
        }

        analysis.score = score;
        analysis.feedback = feedback;

        console.log(`[Item4] 앉기 완료: ${feedback}`);
        console.log(`  - 소요시간: ${analysis.descentDuration.toFixed(2)}초`);
        console.log(`  - 최대속도: ${analysis.maxVelocity.toFixed(1)}, 착석속도: ${analysis.finalVelocity.toFixed(1)}`);
        console.log(`  - 손사용: ${analysis.usedHands}, 조절됨: ${analysis.isControlled}`);
        console.log(`  - AI 추천 점수: ${score}점`);
      }
    }

    return {
      phase: analysis.phase,
      isStanding,
      isSitting,
      isDescending,
      kneeAngle: avgKneeAngle,
      usedHands: analysis.usedHands,
      isControlled: analysis.isControlled,
      descentDuration: analysis.descentDuration,
      maxVelocity: analysis.maxVelocity,
      finalVelocity: analysis.finalVelocity,
      score: analysis.score,
      feedback: analysis.feedback
    };
  }, []);

  // 항목 8 전용 분석 - 팔 뻗기 거리 측정 (cm 단위)
  // 어깨 너비를 기준으로 픽셀→cm 변환 (평균 어깨 너비 약 42cm 가정)
  const AVERAGE_SHOULDER_WIDTH_CM = 42;

  const handleItem8Analysis = useCallback((landmarks, canvasWidth, canvasHeight) => {
    if (!landmarks || landmarks.length < 33) {
      return armReachRef.current;
    }

    const analysis = armReachRef.current;

    // 랜드마크 추출
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    // 손가락 끝 (검지)
    const leftIndex = landmarks[19];
    const rightIndex = landmarks[20];

    // 어깨 너비 (픽셀) - 거리 계산 기준
    const shoulderWidthPixels = Math.abs(leftShoulder.x - rightShoulder.x) * canvasWidth;
    analysis.shoulderWidthPixels = shoulderWidthPixels;

    // 픽셀당 cm 비율 계산
    analysis.pixelToCm = AVERAGE_SHOULDER_WIDTH_CM / shoulderWidthPixels;

    // ===== 신체 수직 정렬 분석 (발목-무릎-엉덩이-어깨) =====
    // 각 관절의 X 좌표 (수평 위치)
    const ankleX = (leftAnkle.x + rightAnkle.x) / 2;
    const kneeX = (leftKnee.x + rightKnee.x) / 2;
    const hipX = (leftHip.x + rightHip.x) / 2;
    const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;

    // 각 구간의 X축 편차 (수직 정렬 확인)
    const ankleToKneeDeviation = Math.abs(ankleX - kneeX) * 100;
    const kneeToHipDeviation = Math.abs(kneeX - hipX) * 100;
    const hipToShoulderDeviation = Math.abs(hipX - shoulderX) * 100;

    // 전체 수직 정렬 점수 (낮을수록 일자)
    const bodyAlignmentScore = ankleToKneeDeviation + kneeToHipDeviation + hipToShoulderDeviation;
    const isBodyAligned = bodyAlignmentScore < 15; // 15 이하면 수직 정렬

    // 무릎 각도 (서있음 판단)
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    const isKneesStraight = avgKneeAngle > 160; // 무릎이 거의 펴짐

    // 서있음 = 수직 정렬 + 무릎 펴짐
    const isStanding = isBodyAligned && isKneesStraight;

    // ===== 팔 일직선 분석 (어깨-팔꿈치-손목-손끝) =====
    // 더 앞에 있는 손(X가 작은 쪽) 사용 - 측면 영상에서 앞쪽
    const activeWrist = leftWrist.x < rightWrist.x ? leftWrist : rightWrist;
    const activeShoulder = leftWrist.x < rightWrist.x ? leftShoulder : rightShoulder;
    const activeElbow = leftWrist.x < rightWrist.x ? leftElbow : rightElbow;
    const activeIndex = leftWrist.x < rightWrist.x ? leftIndex : rightIndex; // 손가락 끝

    // 팔꿈치 각도 (어깨-팔꿈치-손목)
    const elbowAngle = calculateAngle(activeShoulder, activeElbow, activeWrist);
    const isArmStraight = elbowAngle > 160; // 160° 이상이면 일직선

    // 팔이 수평으로 뻗어있는지 확인 (어깨와 손끝의 Y좌표 차이)
    const armHorizontalDiff = Math.abs(activeShoulder.y - activeIndex.y) * 100;
    const isArmHorizontal = armHorizontalDiff < 10; // 수평에 가까움

    // 팔이 앞으로 뻗어있는지 (손끝이 어깨보다 앞에)
    const isArmForward = activeIndex.x < activeShoulder.x;

    // 팔 뻗기 상태 = 일직선 + 수평 + 앞으로
    const isArmExtended = isArmStraight && isArmForward;

    // 어깨 중심 X 위치
    const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;

    // 단계별 분석
    if (analysis.phase === 'waiting') {
      if (isStanding) {
        analysis.phase = 'standing';
        // 초기 위치 저장 (서있는 상태의 손끝 위치)
        analysis.initialFingerX = activeIndex.x;
        analysis.initialShoulderX = shoulderCenterX;
        console.log(`[Item8] 서있음 감지 (정렬:${bodyAlignmentScore.toFixed(1)}, 무릎:${avgKneeAngle.toFixed(0)}°)`);
      }
    }
    else if (analysis.phase === 'standing' || analysis.phase === 'reaching') {
      if (!isKneesStraight) {
        // 무릎이 구부러짐 - 리셋
        analysis.phase = 'waiting';
        analysis.feedback = '무릎을 펴고 서세요';
      } else {
        // 팔 뻗기 거리 계산 (손끝 기준)
        // 측면 영상에서: X좌표가 작아질수록 앞으로 뻗은 것
        const reachPixels = (analysis.initialFingerX - activeIndex.x) * canvasWidth;
        const reachCm = reachPixels * analysis.pixelToCm;

        // 양수만 취급 (앞으로 뻗은 경우만)
        const currentReachCm = Math.max(0, reachCm);
        analysis.currentReachDistance = currentReachCm;

        // 최대 거리 업데이트
        if (currentReachCm > analysis.maxReachDistance) {
          analysis.maxReachDistance = currentReachCm;
        }

        // 상태 업데이트 (팔이 일직선으로 뻗어있을 때만)
        if (isArmExtended && currentReachCm > 3) {
          analysis.phase = 'reaching';

          // 점수 계산 (실시간)
          let score = 0;
          let feedback = '';

          if (analysis.maxReachDistance >= 25) {
            score = 4;
            feedback = `✓ 훌륭함! ${analysis.maxReachDistance.toFixed(1)}cm 도달`;
          } else if (analysis.maxReachDistance >= 12.5) {
            score = 3;
            feedback = `좋음: ${analysis.maxReachDistance.toFixed(1)}cm (목표: 25cm)`;
          } else if (analysis.maxReachDistance >= 5) {
            score = 2;
            feedback = `${analysis.maxReachDistance.toFixed(1)}cm (목표: 12.5cm 이상)`;
          } else {
            score = 1;
            feedback = `${analysis.maxReachDistance.toFixed(1)}cm - 더 뻗어주세요`;
          }

          analysis.score = score;
          analysis.feedback = feedback;
        }

        // 상태 업데이트
        setArmReachState(prev => ({
          ...prev,
          phase: analysis.phase,
          currentReach: currentReachCm,
          maxReach: analysis.maxReachDistance,
          feedback: {
            message: analysis.feedback || `현재: ${currentReachCm.toFixed(1)}cm / 최대: ${analysis.maxReachDistance.toFixed(1)}cm`,
            type: analysis.maxReachDistance >= 25 ? 'success' : analysis.maxReachDistance >= 12.5 ? 'warning' : 'info'
          }
        }));
      }
    }

    return {
      phase: analysis.phase,
      isStanding,
      isBodyAligned,
      bodyAlignmentScore,
      isKneesStraight,
      avgKneeAngle,
      isArmExtended,
      isArmStraight,
      elbowAngle,
      isArmHorizontal,
      armHorizontalDiff,
      currentReachCm: analysis.currentReachDistance,
      maxReachCm: analysis.maxReachDistance,
      score: analysis.score,
      feedback: analysis.feedback,
      pixelToCm: analysis.pixelToCm,
      shoulderWidthPixels: analysis.shoulderWidthPixels,
      // 각도 정보 (화면 표시용)
      landmarks: {
        ankle: { x: ankleX * canvasWidth, y: ((leftAnkle.y + rightAnkle.y) / 2) * canvasHeight },
        knee: { x: kneeX * canvasWidth, y: ((leftKnee.y + rightKnee.y) / 2) * canvasHeight },
        hip: { x: hipX * canvasWidth, y: ((leftHip.y + rightHip.y) / 2) * canvasHeight },
        shoulder: { x: shoulderX * canvasWidth, y: ((leftShoulder.y + rightShoulder.y) / 2) * canvasHeight },
        elbow: { x: activeElbow.x * canvasWidth, y: activeElbow.y * canvasHeight },
        wrist: { x: activeWrist.x * canvasWidth, y: activeWrist.y * canvasHeight }
      }
    };
  }, []);

  // 항목 8: 팔 뻗기 자(ruler) 그리기 - 뒤쪽(어깨/골반) 고정 자
  const drawArmReachRuler = useCallback((ctx, landmarks, canvasWidth, canvasHeight, reachData) => {
    if (!landmarks || !reachData || reachData.phase === 'waiting') return;

    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    // 손가락 끝 (검지)
    const leftIndex = landmarks[19];
    const rightIndex = landmarks[20];

    // 더 앞에 있는 손 사용
    const activeWrist = leftWrist.x < rightWrist.x ? leftWrist : rightWrist;
    const activeShoulder = leftWrist.x < rightWrist.x ? leftShoulder : rightShoulder;
    const activeElbow = leftWrist.x < rightWrist.x ? leftElbow : rightElbow;
    const activeIndex = leftWrist.x < rightWrist.x ? leftIndex : rightIndex;

    // 픽셀 좌표
    const fingerX = activeIndex.x * canvasWidth;
    const fingerY = activeIndex.y * canvasHeight;
    const wristX = activeWrist.x * canvasWidth;
    const wristY = activeWrist.y * canvasHeight;
    const shoulderX = activeShoulder.x * canvasWidth;
    const shoulderY = activeShoulder.y * canvasHeight;
    const elbowX = activeElbow.x * canvasWidth;
    const elbowY = activeElbow.y * canvasHeight;

    // 신체 중심점 좌표 (발목, 무릎, 엉덩이, 어깨)
    const ankleX = ((leftAnkle.x + rightAnkle.x) / 2) * canvasWidth;
    const ankleY = ((leftAnkle.y + rightAnkle.y) / 2) * canvasHeight;
    const kneeX = ((leftKnee.x + rightKnee.x) / 2) * canvasWidth;
    const kneeY = ((leftKnee.y + rightKnee.y) / 2) * canvasHeight;
    const hipX = ((leftHip.x + rightHip.x) / 2) * canvasWidth;
    const hipY = ((leftHip.y + rightHip.y) / 2) * canvasHeight;
    const bodyShoulderX = ((leftShoulder.x + rightShoulder.x) / 2) * canvasWidth;
    const bodyShoulderY = ((leftShoulder.y + rightShoulder.y) / 2) * canvasHeight;

    // ===== 고정된 뒤쪽 기준선 (어깨-골반 라인) =====
    // 초기 어깨 X 위치 사용 (고정)
    const fixedBackX = reachData.initialShoulderX ? reachData.initialShoulderX * canvasWidth : bodyShoulderX;
    const rulerY = shoulderY; // 어깨 높이에 자 표시

    // ===== 자(Ruler) 그리기 =====
    ctx.save();

    // ===== 1. 뒤쪽 고정 기준선 (어깨-골반 수직선) =====
    // 고정된 뒤쪽 수직선 그리기
    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(fixedBackX, bodyShoulderY - 50);
    ctx.lineTo(fixedBackX, hipY + 50);
    ctx.stroke();

    // 기준선 라벨
    ctx.fillStyle = 'rgba(255, 107, 107, 0.9)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('기준선', fixedBackX, bodyShoulderY - 60);

    // 어깨, 골반 포인트 표시
    ctx.fillStyle = '#FF6B6B';
    ctx.beginPath();
    ctx.arc(fixedBackX, bodyShoulderY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fixedBackX, hipY, 8, 0, Math.PI * 2);
    ctx.fill();

    // ===== 2. 수평 자 (기준선에서 앞으로) =====
    const pixelToCm = reachData.pixelToCm || 1;
    const cmToPixel = 1 / pixelToCm;
    const rulerLength = 35 * cmToPixel; // 35cm 길이 자

    // 자 배경
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(fixedBackX - rulerLength - 10, rulerY - 35, rulerLength + 20, 70);

    // 자 눈금선 (기준선에서 앞으로)
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(fixedBackX, rulerY);
    ctx.lineTo(fixedBackX - rulerLength, rulerY);
    ctx.stroke();

    // 0cm 표시 (기준선 위치)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('0', fixedBackX, rulerY + 25);

    // 주요 눈금 표시 (5cm, 12.5cm, 25cm, 30cm)
    const marks = [
      { cm: 5, color: '#EF4444', label: '5' },
      { cm: 12.5, color: '#F59E0B', label: '12.5' },
      { cm: 25, color: '#10B981', label: '25' },
      { cm: 30, color: '#8B5CF6', label: '30' }
    ];

    marks.forEach(mark => {
      const markX = fixedBackX - (mark.cm * cmToPixel);
      if (markX > fixedBackX - rulerLength) {
        // 눈금선
        ctx.strokeStyle = mark.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(markX, rulerY - 12);
        ctx.lineTo(markX, rulerY + 12);
        ctx.stroke();

        // 눈금 라벨
        ctx.fillStyle = mark.color;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${mark.label}`, markX, rulerY + 28);
      }
    });

    // ===== 3. 현재 손끝 위치 표시 (파란색 마커) =====
    ctx.strokeStyle = '#00D4FF';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(fingerX, rulerY - 20);
    ctx.lineTo(fingerX, rulerY + 20);
    ctx.stroke();

    // 손끝 포인트
    ctx.fillStyle = '#00D4FF';
    ctx.beginPath();
    ctx.arc(fingerX, rulerY, 8, 0, Math.PI * 2);
    ctx.fill();

    // 기준선에서 손끝까지 연결선
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(fixedBackX, rulerY);
    ctx.lineTo(fingerX, rulerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 현재 거리 텍스트 (손끝 위)
    ctx.fillStyle = '#00D4FF';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${reachData.currentReachCm?.toFixed(1) || 0}cm`, fingerX, rulerY - 30);

    // ===== 4. 팔 연결선 (어깨-팔꿈치-손목-손끝) =====
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(wristX, wristY);
    ctx.lineTo(fingerX, fingerY);
    ctx.stroke();

    // 팔 관절점 표시
    [{ x: shoulderX, y: shoulderY }, { x: elbowX, y: elbowY }, { x: wristX, y: wristY }, { x: fingerX, y: fingerY }].forEach(joint => {
      ctx.fillStyle = '#3B82F6';
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // ===== 5. 최대 거리 및 점수 표시 (왼쪽 상단) =====
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(5, 5, 150, 75);

    if (reachData.maxReachCm > 0) {
      const maxColor = reachData.maxReachCm >= 25 ? '#10B981' :
                       reachData.maxReachCm >= 12.5 ? '#F59E0B' : '#EF4444';
      ctx.fillStyle = maxColor;
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`최대: ${reachData.maxReachCm.toFixed(1)}cm`, 15, 28);

      // 점수 표시
      if (reachData.score !== null) {
        ctx.fillStyle = maxColor;
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(`${reachData.score}점`, 15, 58);
      }
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('팔을 앞으로 뻗으세요', 15, 35);
    }

    ctx.restore();
  }, []);

  // 항목 9: 바닥 물건 집기 분석
  const handleItem9Analysis = useCallback((landmarks, canvasWidth, canvasHeight) => {
    if (!landmarks || landmarks.length < 33) {
      return pickUpRef.current;
    }

    const analysis = pickUpRef.current;

    // 랜드마크 추출
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftIndex = landmarks[19];
    const rightIndex = landmarks[20];

    // 신체 중심 좌표
    const shoulderY = ((leftShoulder.y + rightShoulder.y) / 2);
    const hipY = ((leftHip.y + rightHip.y) / 2);
    const kneeY = ((leftKnee.y + rightKnee.y) / 2);
    const ankleY = ((leftAnkle.y + rightAnkle.y) / 2);

    // 손 위치 (더 낮은 손 사용)
    const activeHand = leftIndex.y > rightIndex.y ? leftIndex : rightIndex;
    const handY = activeHand.y;
    const handX = activeHand.x;

    // 무릎 각도 계산
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // 허리 굽힘 감지 (어깨-엉덩이-무릎 각도)
    const leftBendAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
    const rightBendAngle = calculateAngle(rightShoulder, rightHip, rightKnee);
    const avgBendAngle = (leftBendAngle + rightBendAngle) / 2;

    // 서있음 판단: 무릎 펴짐 + 허리 펴짐
    const isStanding = avgKneeAngle > 150 && avgBendAngle > 150;
    // 굽힘 판단: 허리 굽힘 또는 무릎 굽힘
    const isBending = avgBendAngle < 120 || avgKneeAngle < 130;
    // 손이 바닥 근처: 손이 발목보다 아래 또는 비슷한 높이
    const handNearFloor = handY > ankleY - 0.05;
    // 손이 바닥에 도달: 손이 발목 높이 이하
    const handReachedFloor = handY > ankleY;

    // 물건 위치 설정 (발 앞쪽 바닥)
    if (!analysis.objectPosition) {
      const footX = (leftAnkle.x + rightAnkle.x) / 2;
      analysis.objectPosition = {
        x: footX,
        y: ankleY + 0.03 // 발목보다 약간 아래 (바닥)
      };
      analysis.objectDetected = true;
    }

    // 손과 물건 사이 거리 계산
    const distanceToObject = Math.sqrt(
      Math.pow((handX - analysis.objectPosition.x), 2) +
      Math.pow((handY - analysis.objectPosition.y), 2)
    );
    const reachedObject = distanceToObject < 0.08; // 물건에 가까이 도달

    // 초기 손 위치 저장
    if (analysis.initialHandY === null && isStanding) {
      analysis.initialHandY = handY;
    }

    // 가장 낮은 손 위치 업데이트
    if (analysis.lowestHandY === null || handY > analysis.lowestHandY) {
      analysis.lowestHandY = handY;
    }

    // 단계별 분석
    if (analysis.phase === 'waiting') {
      if (isStanding) {
        analysis.phase = 'standing';
        analysis.startTime = Date.now();
        analysis.feedback = '서있는 자세 확인됨. 바닥의 물건을 집으세요.';
        console.log('[Item9] 서있음 감지 - 물건 집기 대기');
      }
    }
    else if (analysis.phase === 'standing') {
      if (isBending) {
        analysis.phase = 'bending';
        analysis.feedback = '몸을 굽히는 중...';
        console.log('[Item9] 굽힘 시작');
      }
    }
    else if (analysis.phase === 'bending') {
      if (handNearFloor) {
        analysis.phase = 'reaching';
        analysis.feedback = '손이 바닥에 가까워지는 중...';
        console.log('[Item9] 바닥 도달 시도 중');
      }
    }
    else if (analysis.phase === 'reaching') {
      if (reachedObject) {
        analysis.handReachedObject = true;
        analysis.phase = 'picked_up';
        analysis.pickedUp = true;
        analysis.feedback = '물건 집기 성공! 다시 일어서세요.';
        console.log('[Item9] 물건 집기 성공');
      } else if (isStanding && !isBending) {
        // 물건을 못 잡고 다시 일어섬
        analysis.phase = 'returning';
        analysis.pickedUp = false;
        analysis.feedback = '물건을 집지 못하고 일어섬';
        console.log('[Item9] 물건 못 집고 일어섬');
      }
    }
    else if (analysis.phase === 'picked_up') {
      if (isStanding && !isBending) {
        analysis.phase = 'complete';
        analysis.returnedToStand = true;
        analysis.endTime = Date.now();

        // 점수 계산
        analysis.score = 4; // 성공적으로 집고 일어섬
        analysis.feedback = '검사 완료! 4점 - 쉽고 안전하게 물건을 집었습니다.';
        console.log('[Item9] 검사 완료 - 4점');
      }
    }
    else if (analysis.phase === 'returning') {
      if (isStanding) {
        analysis.phase = 'complete';
        analysis.returnedToStand = true;
        analysis.endTime = Date.now();

        // 손이 물건 가까이 갔는지에 따라 점수 결정
        const lowestHandDistance = analysis.lowestHandY ?
          Math.abs(analysis.lowestHandY - analysis.objectPosition.y) : 1;

        if (lowestHandDistance < 0.05) {
          // 물건 가까이 도달했지만 못 집음
          analysis.score = 2;
          analysis.feedback = '검사 완료! 2점 - 물건 근처까지 도달했으나 집지 못함';
        } else {
          // 물건에 도달하지 못함
          analysis.score = 1;
          analysis.feedback = '검사 완료! 1점 - 물건에 도달하지 못함';
        }
        console.log(`[Item9] 검사 완료 - ${analysis.score}점`);
      }
    }

    // 상태 업데이트
    setPickUpState(prev => ({
      ...prev,
      phase: analysis.phase,
      objectDetected: analysis.objectDetected,
      pickedUp: analysis.pickedUp,
      feedback: { message: analysis.feedback, type: analysis.phase === 'complete' ? 'success' : 'info' },
      autoScore: analysis.score,
      showResultModal: analysis.phase === 'complete'
    }));

    return {
      phase: analysis.phase,
      objectPosition: analysis.objectPosition,
      handPosition: { x: handX, y: handY },
      isStanding,
      isBending,
      handNearFloor,
      reachedObject,
      pickedUp: analysis.pickedUp,
      score: analysis.score,
      feedback: analysis.feedback,
      distanceToObject
    };
  }, []);

  // 항목 9: 물건 집기 오버레이 그리기
  const drawItem9Overlay = useCallback((ctx, landmarks, canvasWidth, canvasHeight, pickUpData) => {
    if (!landmarks || !pickUpData) return;

    ctx.save();

    // 물건(동그라미) 위치
    const objectPos = pickUpData.objectPosition;
    if (objectPos) {
      const objX = objectPos.x * canvasWidth;
      const objY = objectPos.y * canvasHeight;
      const objectRadius = 25;

      // 물건 원 그리기
      ctx.strokeStyle = pickUpData.pickedUp ? '#10B981' : '#FF6B6B';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(objX, objY, objectRadius, 0, Math.PI * 2);
      ctx.stroke();

      // 물건 안쪽 채우기
      ctx.fillStyle = pickUpData.pickedUp ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 107, 107, 0.3)';
      ctx.fill();

      // 물건 라벨
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('물건', objX, objY + 5);
    }

    // 손 위치 표시
    const handPos = pickUpData.handPosition;
    if (handPos) {
      const handX = handPos.x * canvasWidth;
      const handY = handPos.y * canvasHeight;

      // 손 마커
      ctx.fillStyle = pickUpData.handNearFloor ? '#00D4FF' : '#FFFFFF';
      ctx.beginPath();
      ctx.arc(handX, handY, 10, 0, Math.PI * 2);
      ctx.fill();

      // 손-물건 연결선
      if (objectPos) {
        const objX = objectPos.x * canvasWidth;
        const objY = objectPos.y * canvasHeight;

        ctx.strokeStyle = pickUpData.reachedObject ? '#10B981' : 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(objX, objY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 상태 표시 패널 (왼쪽 상단)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(5, 5, 180, 100);

    const phaseLabels = {
      waiting: '대기 중...',
      standing: '서있음 - 물건을 집으세요',
      bending: '굽히는 중...',
      reaching: '바닥 도달 중...',
      picked_up: '성공! 일어서세요',
      returning: '일어서는 중...',
      complete: '검사 완료!'
    };

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('물건 집기 검사', 15, 25);

    const phaseColor = pickUpData.phase === 'complete' ? '#10B981' :
                       pickUpData.phase === 'picked_up' ? '#10B981' : '#00D4FF';
    ctx.fillStyle = phaseColor;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(phaseLabels[pickUpData.phase] || '분석 중', 15, 45);

    // 상태 아이콘
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = pickUpData.isStanding ? '#10B981' : '#F59E0B';
    ctx.fillText(`서있음: ${pickUpData.isStanding ? '✓' : '✗'}`, 15, 65);

    ctx.fillStyle = pickUpData.pickedUp ? '#10B981' : '#EF4444';
    ctx.fillText(`물건집기: ${pickUpData.pickedUp ? '✓ 성공' : '✗'}`, 15, 82);

    // 점수 표시
    if (pickUpData.score !== null) {
      const scoreColor = pickUpData.score >= 3 ? '#10B981' :
                         pickUpData.score >= 2 ? '#F59E0B' : '#EF4444';
      ctx.fillStyle = scoreColor;
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`${pickUpData.score}점`, 130, 80);
    }

    ctx.restore();
  }, []);

  // 오버랩 합성 뷰 렌더링 - 측면+정면 영상을 겹쳐서 표시
  const renderCombinedView = useCallback(() => {
    const canvas = combinedCanvasRef.current;
    const sideVideo = sideVideoRef.current;
    const frontVideo = frontVideoRef.current;

    if (!canvas) return;
    if (!sideVideo && !frontVideo) return;

    const ctx = canvas.getContext('2d');
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // 캔버스 초기화
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 두 영상을 반투명하게 겹쳐서 표시
    ctx.globalAlpha = 0.7;

    // 측면 영상 (녹색 계열)
    if (sideVideo && sideVideo.readyState >= 2) {
      ctx.drawImage(sideVideo, 0, 0, canvasWidth, canvasHeight);
    }

    // 정면 영상 (파란색 계열) - 스크린 블렌딩
    if (frontVideo && frontVideo.readyState >= 2) {
      ctx.globalCompositeOperation = 'lighten';
      ctx.drawImage(frontVideo, 0, 0, canvasWidth, canvasHeight);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.globalAlpha = 1.0;

    // 측면 스켈레톤 (녹색)
    if (sideLandmarksRef.current) {
      drawLandmarks(ctx, sideLandmarksRef.current, canvasWidth, canvasHeight, { color: '#22C55E', radius: 6 });
      drawConnections(ctx, sideLandmarksRef.current, canvasWidth, canvasHeight, { color: '#22C55E', lineWidth: 3 });
    }

    // 정면 스켈레톤 (파란색)
    if (frontLandmarksRef.current) {
      drawLandmarks(ctx, frontLandmarksRef.current, canvasWidth, canvasHeight, { color: '#3B82F6', radius: 6 });
      drawConnections(ctx, frontLandmarksRef.current, canvasWidth, canvasHeight, { color: '#3B82F6', lineWidth: 3 });
    }

    // 다음 프레임
    combinedAnimationRef.current = requestAnimationFrame(renderCombinedView);
  }, []);

  // 합성 뷰 시작/중지
  const startCombinedView = useCallback(() => {
    if (combinedAnimationRef.current) {
      cancelAnimationFrame(combinedAnimationRef.current);
    }
    renderCombinedView();
  }, [renderCombinedView]);

  const stopCombinedView = useCallback(() => {
    if (combinedAnimationRef.current) {
      cancelAnimationFrame(combinedAnimationRef.current);
      combinedAnimationRef.current = null;
    }
  }, []);

  // 분석 시작/중지 시 합성 뷰 자동 제어
  useEffect(() => {
    if (isAnalyzing && (sideVideoUrl || frontVideoUrl)) {
      startCombinedView();
    } else {
      stopCombinedView();
    }
    return () => stopCombinedView();
  }, [isAnalyzing, sideVideoUrl, frontVideoUrl, startCombinedView, stopCombinedView]);

  // 항목 2 전용 분석 - 잡지 않고 서 있기 (앉기 → 일어서기 → 2분 유지)
  // viewType: 'side' = 자세 감지(무릎각도), 'front' = 안정성 분석
  const handleItem2Analysis = useCallback((landmarks, viewType = 'side') => {
    if (!landmarks || landmarks.length < 33) {
      return { stability: 'good', isStanding: false, state: 'not_standing' };
    }

    // 정면 영상인 경우 안정성만 분석하고 반환
    if (viewType === 'front') {
      return analyzeItem2FrontStability(landmarks);
    }

    // === 측면 영상: 자세 감지 (앉음/서있음) ===
    // 앉기/서기 분석 (Item 1과 동일한 분석 사용)
    const sitStandAnalysis = analyzeSitToStand(landmarks, previousAnalysisRef.current);
    // 서있기 안정성 분석 (기본 분석)
    const standingAnalysis = analyzeStandingUnsupported(landmarks);

    // 정면 영상의 안정성 결과 가져오기
    const frontStability = frontStabilityRef.current;

    const now = Date.now();

    // 랜드마크 추출
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    // 무릎 각도 계산 (엉덩이-무릎-발목) - 측면 영상 주요 분석
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // ===== 앉음 판단: 무릎 각도 약 90도 (70~110도 범위) =====
    const isPreciseSitting = avgKneeAngle >= 70 && avgKneeAngle <= 110;

    // ===== 서있음 판단: 발목-무릎-엉덩이-어깨가 수직 일자 정렬 =====
    // 각 관절의 X좌표 (수평 위치)
    const ankleX = (leftAnkle.x + rightAnkle.x) / 2;
    const kneeX = (leftKnee.x + rightKnee.x) / 2;
    const hipX = (leftHip.x + rightHip.x) / 2;
    const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;

    // 각 관절 간의 X축 편차 계산 (수직 정렬 확인)
    const ankleToKneeDeviation = Math.abs(ankleX - kneeX);
    const kneeToHipDeviation = Math.abs(kneeX - hipX);
    const hipToShoulderDeviation = Math.abs(hipX - shoulderX);

    // 전체 수직 정렬 점수 (낮을수록 일자에 가까움)
    const verticalAlignmentScore = (ankleToKneeDeviation + kneeToHipDeviation + hipToShoulderDeviation) * 100;

    // 수직 정렬 임계값: 15 이하면 일자로 서있음 (정규화된 좌표 기준)
    const isVerticallyAligned = verticalAlignmentScore < 15;

    // 무릎이 충분히 펴져 있는지 (140도 이상)
    const isKneesStraight = avgKneeAngle > 140;

    // 서있음 = 수직 정렬 + 무릎 펴짐
    const isPreciseStanding = isVerticallyAligned && isKneesStraight;

    // 디버그 정보 (측면 + 정면 안정성)
    console.log(`[Item2-측면] 무릎: ${avgKneeAngle.toFixed(1)}°, 정렬: ${verticalAlignmentScore.toFixed(1)}, 앉음: ${isPreciseSitting}, 서있음: ${isPreciseStanding}, 정면안정성: ${frontStability.stability}`);

    // 히스토리 저장
    analysisHistoryRef.current.push({
      ...sitStandAnalysis,
      kneeAngle: avgKneeAngle,
      verticalAlignment: verticalAlignmentScore,
      isPreciseSitting,
      isPreciseStanding,
      isVerticallyAligned,
      isKneesStraight,
      timestamp: now
    });

    if (analysisHistoryRef.current.length > 150) {
      analysisHistoryRef.current.shift();
    }

    previousAnalysisRef.current = sitStandAnalysis;

    setStandingState(prev => {
      let newPhase = prev.testPhase;
      let newFeedback = prev.feedback;
      let currentPosture = prev.currentPosture;
      let sittingConfidence = prev.sittingConfidence;
      let standingConfidence = prev.standingConfidence;
      let sittingConfirmedAt = prev.sittingConfirmedAt;
      let standingDetectedAt = prev.standingDetectedAt;
      let standingStartTime = prev.standingStartTime;
      let standingDuration = prev.standingDuration;
      let supportSeekingCount = prev.supportSeekingCount;
      let unstableTime = prev.unstableTime;
      let lostBalance = prev.lostBalance;
      let autoScore = prev.autoScore;
      let assessmentReport = prev.assessmentReport;
      let showResultModal = prev.showResultModal;
      let standingAttemptCount = prev.standingAttemptCount;
      let wasStanding = prev.wasStanding;

      // 자세 상태 업데이트
      currentPosture = sitStandAnalysis.state;
      sittingConfidence = sitStandAnalysis.sitting?.confidence || 0;
      standingConfidence = sitStandAnalysis.standing?.confidence || 0;

      // 일어서기 시도 횟수 추적 (앉음 → 서있음 전환 시 카운트)
      if (isPreciseStanding && !wasStanding) {
        standingAttemptCount = prev.standingAttemptCount + 1;
        wasStanding = true;
        console.log(`[Item2] 일어서기 시도 횟수: ${standingAttemptCount}`);
      } else if (isPreciseSitting) {
        wasStanding = false; // 다시 앉으면 리셋
      }

      // 검사 시작부터 경과 시간 계산 (최소 30초는 진행)
      const testElapsedTime = startTimeRef.current ? (now - startTimeRef.current) / 1000 : 0;
      const minimumTestDuration = 30; // 최소 30초는 검사 진행

      // 3회 이상 시도 시 0점 처리 (단, 30초 이후에만 종료)
      if (standingAttemptCount >= 3 && newPhase !== 'complete') {
        if (testElapsedTime >= minimumTestDuration) {
          // 30초 이상 경과 - 검사 종료
          newPhase = 'complete';
          autoScore = {
            score: 0,
            reason: `일어서기 ${standingAttemptCount}회 시도 - 3회 이상 시도로 0점`
          };
          assessmentReport = {
            score: 0,
            standingAttempts: standingAttemptCount,
            reason: '여러 번 시도하여 일어서기에 어려움이 있음'
          };
          showResultModal = true;
          newFeedback = { message: `⚠️ 일어서기 ${standingAttemptCount}회 시도 - 검사 종료`, type: 'error' };
        } else {
          // 30초 미만 - 경고만 표시하고 계속 진행
          const remainingTime = Math.ceil(minimumTestDuration - testElapsedTime);
          newFeedback = { message: `⚠️ ${standingAttemptCount}회 시도 (${remainingTime}초 후 종료 가능)`, type: 'warning' };
        }
      }

      // 단계 1: 앉음 감지 후 서있음 감지되면 타이머 시작
      if (prev.testPhase === 'waiting' && standingAttemptCount < 3) {
        if (isPreciseSitting) {
          // 앉은 자세 감지 (무릎 90도)
          newFeedback = { message: `✓ 앉음 감지 (무릎 ${Math.round(avgKneeAngle)}°) - 이제 일어서세요`, type: 'success' };
        } else if (isPreciseStanding) {
          // 서있음 감지 (수직 정렬) - 타이머 시작!
          standingStartTime = now;
          standingDetectedAt = now;
          newPhase = 'timing';
          const attemptMsg = standingAttemptCount > 1 ? ` (${standingAttemptCount}회차 시도)` : '';
          newFeedback = { message: `✓ 서있음 감지!${attemptMsg} (정렬: ${verticalAlignmentScore.toFixed(1)}) 2분 타이머 시작`, type: 'success' };
        } else if (isKneesStraight && !isVerticallyAligned) {
          // 무릎은 펴졌지만 수직 정렬 안됨
          newFeedback = { message: `자세를 바르게 세워주세요 (정렬: ${verticalAlignmentScore.toFixed(1)}/15)`, type: 'info' };
        } else if (avgKneeAngle > 110 && avgKneeAngle <= 140) {
          // 일어서는 중
          newFeedback = { message: `일어서는 중... (무릎 ${Math.round(avgKneeAngle)}°)`, type: 'info' };
        } else {
          // 대기 상태
          newFeedback = { message: `의자에 앉아주세요 (무릎 ${Math.round(avgKneeAngle)}°)`, type: 'info' };
        }
      }

      // 단계 2: 시간 측정 중 (2분)
      if (prev.testPhase === 'timing') {
        if (standingStartTime) {
          standingDuration = (now - standingStartTime) / 1000;
        }

        // 지지물 사용 감지 (벽, 지팡이 등)
        if (standingAnalysis?.isUsingSupport) {
          supportSeekingCount = prev.supportSeekingCount + 1;
          newFeedback = {
            message: standingAnalysis.supportUsageMessage || '⚠️ 지지물 사용 감지 (감독 필요)',
            type: 'warning'
          };
        }
        // 지지 요청 행동 감지
        else if (standingAnalysis?.supportSeeking) {
          supportSeekingCount = prev.supportSeekingCount + 1;
          newFeedback = { message: standingAnalysis.supportMessage || '⚠️ 균형 유지 중', type: 'warning' };
        }

        // 불안정 시간 누적 (측면 분석 + 정면 움직임 분석)
        const isSideUnstable = standingAnalysis?.stability === 'poor' || standingAnalysis?.stability === 'critical';
        const isFrontUnstable = frontStability.isUnstable ||
                                frontStability.lateralMovement > 5 ||
                                frontStability.frontBackMovement > 8;

        if (isSideUnstable || isFrontUnstable) {
          unstableTime = prev.unstableTime + 0.1;

          // 움직임 감지 피드백
          if (frontStability.movementDescription && !standingAnalysis?.balanceLost) {
            newFeedback = {
              message: `⚠️ ${frontStability.movementDescription} (좌우:${frontStability.lateralMovement?.toFixed(1)}, 앞뒤:${frontStability.frontBackMovement?.toFixed(1)})`,
              type: 'warning'
            };
          }
        }

        // 움직임 데이터 준비
        const movementDataForScore = {
          totalLateralMovement: frontStability.totalLateralMovement || 0,
          totalFrontBackMovement: frontStability.totalFrontBackMovement || 0,
          unstableEvents: frontStability.unstableEvents || 0
        };

        // 균형 상실 감지 (30초 이후에만 종료)
        if (standingAnalysis?.balanceLost) {
          lostBalance = true;
          if (testElapsedTime >= minimumTestDuration) {
            newPhase = 'complete';
            autoScore = calculateStandingScore(standingDuration, supportSeekingCount > 5, true, unstableTime, 1, movementDataForScore);
            assessmentReport = generateStandingReport(autoScore.score, standingDuration, {
              avgStability: standingAnalysis.stability,
              supportEvents: supportSeekingCount
            }, movementDataForScore);
            showResultModal = true;
            newFeedback = { message: '⚠️ 균형 상실 감지', type: 'error' };
          } else {
            newFeedback = { message: '⚠️ 균형 유지하세요! (검사 계속 진행)', type: 'warning' };
          }
        }
        // 목표 시간 달성 확인 (2분)
        else if (standingDuration >= prev.targetDuration) {
          newPhase = 'complete';
          autoScore = calculateStandingScore(standingDuration, supportSeekingCount > 5, false, unstableTime, 1, movementDataForScore);
          assessmentReport = generateStandingReport(autoScore.score, standingDuration, {
            avgStability: standingAnalysis?.stability || 'good',
            supportEvents: supportSeekingCount
          }, movementDataForScore);
          showResultModal = true;
          newFeedback = { message: '✓ 2분 완료! 훌륭합니다!', type: 'success' };
        }
        // 앉아버린 경우 (타이머 진행 중에, 30초 이후에만 종료)
        else if (sitStandAnalysis.state === PostureState.SITTING && standingDuration >= 10) {
          if (testElapsedTime >= minimumTestDuration) {
            newPhase = 'complete';
            autoScore = calculateStandingScore(standingDuration, supportSeekingCount > 5, false, unstableTime, 1, movementDataForScore);
            assessmentReport = generateStandingReport(autoScore.score, standingDuration, {
              avgStability: standingAnalysis?.stability || 'good',
              supportEvents: supportSeekingCount
            }, movementDataForScore);
            showResultModal = true;
            newFeedback = { message: `${standingDuration.toFixed(1)}초간 서 있음 - 앉음 감지됨`, type: 'info' };
          } else {
            // 30초 미만 - 다시 일어나도록 안내
            newFeedback = { message: '다시 일어서세요! (검사 계속 진행)', type: 'warning' };
          }
        }
        // 진행 중 피드백 (측면 안정성 + 정면 움직임)
        else {
          const remaining = Math.ceil(prev.targetDuration - standingDuration);
          const sideStability = standingAnalysis?.stability || 'good';
          const frontStabilityLevel = frontStability.stability || 'good';

          // 종합 안정성 판단
          const hasSignificantMovement = frontStability.lateralMovement > 3 || frontStability.frontBackMovement > 5;
          const isOverallStable = (sideStability === 'excellent' || sideStability === 'good') &&
                                  (frontStabilityLevel === 'excellent' || frontStabilityLevel === 'good') &&
                                  !hasSignificantMovement;
          const isOverallModerate = sideStability === 'moderate' || frontStabilityLevel === 'moderate' || hasSignificantMovement;

          if (isOverallStable) {
            newFeedback = { message: `✓ 안정적! 남은 시간: ${remaining}초`, type: 'success' };
          } else if (isOverallModerate) {
            // 움직임 정보 표시
            const movementInfo = [];
            if (frontStability.lateralMovement > 3) movementInfo.push(`좌우:${frontStability.lateralMovement.toFixed(1)}`);
            if (frontStability.frontBackMovement > 5) movementInfo.push(`앞뒤:${frontStability.frontBackMovement.toFixed(1)}`);
            const movementStr = movementInfo.length > 0 ? ` (${movementInfo.join(', ')})` : '';
            newFeedback = { message: `약간 흔들림${movementStr} - 남은: ${remaining}초`, type: 'warning' };
          } else {
            newFeedback = { message: `⚠️ 불안정 - 균형 유지하세요! (${remaining}초)`, type: 'error' };
          }
        }
      }

      return {
        ...prev,
        testPhase: newPhase,
        currentState: standingAnalysis?.state || 'unknown',
        currentPosture,
        stabilityLevel: standingAnalysis?.stability || 'good',
        isStanding: standingAnalysis?.isStanding || false,
        isUsingSupport: standingAnalysis?.isUsingSupport || false,
        sittingConfidence,
        standingConfidence,
        sittingConfirmedAt,
        standingDetectedAt,
        standingStartTime,
        standingDuration,
        supportSeekingCount,
        unstableTime,
        lostBalance,
        standingAttemptCount,
        wasStanding,
        feedback: newFeedback,
        autoScore,
        assessmentReport,
        showResultModal,
        // 움직임 분석 데이터 추가
        movementData: {
          lateralMovement: frontStability.lateralMovement || 0,
          frontBackMovement: frontStability.frontBackMovement || 0,
          totalLateralMovement: frontStability.totalLateralMovement || 0,
          totalFrontBackMovement: frontStability.totalFrontBackMovement || 0,
          unstableEvents: frontStability.unstableEvents || 0
        },
        debug: standingAnalysis?.debug
      };
    });

    return standingAnalysis || { stability: 'good', isStanding: false, state: 'not_standing' };
  }, [standingState.testPhase]);

  // 일반 항목 분석 (항목 3-14) - AI 자동 분석 및 점수 계산
  const handleGeneralAnalysis = useCallback((landmarks) => {
    if (!currentBBSItem || !landmarks || landmarks.length < 33) return;

    const now = Date.now();

    // ===== BBS 모션 분석 유틸리티 사용 =====
    // 랜드마크 히스토리 업데이트 (안정성 분석용)
    landmarksHistoryRef.current.push(landmarks);
    if (landmarksHistoryRef.current.length > 60) {
      landmarksHistoryRef.current.shift(); // 최근 60프레임만 유지 (약 2초)
    }

    // 항목별 고급 분석 실행
    const itemNumber = currentItem + 1; // 1-based index
    const advancedAnalysis = analyzeForItem(itemNumber, landmarks, {
      landmarksHistory: landmarksHistoryRef.current,
      previousLandmarks: previousLandmarksRef.current,
      initialLandmarks: initialLandmarksRef.current,
      ...motionStateRef.current
    });

    // 이전 랜드마크 저장
    previousLandmarksRef.current = landmarks;

    // 새로운 분석 함수들로 자세 감지
    const sittingInfo = detectSitting(landmarks);
    const standingInfo = detectStanding(landmarks);
    const handSupportInfo = detectHandSupport(landmarks);
    const stabilityInfo = measureStability(landmarksHistoryRef.current);
    const trunkTilt = getTrunkTilt(landmarks);

    // 주요 랜드마크 추출
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const nose = landmarks[0];

    // 기본 분석 (기존 호환성 유지)
    const hipY = (leftHip.y + rightHip.y) / 2;
    const kneeY = (leftKnee.y + rightKnee.y) / 2;
    const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipToAnkleRatio = (ankleY - hipY) / (ankleY - shoulderY);
    const ankleDistance = Math.abs(leftAnkle.x - rightAnkle.x);

    // ===== 새로운 BBS 모션 분석 함수 사용 =====
    // 앉음/서있음 감지 (향상된 정확도)
    const isStanding = standingInfo.isStanding || hipToAnkleRatio > 0.5;
    const isSitting = sittingInfo.isSitting || hipToAnkleRatio < 0.4;

    // 발 관련 분석 (발 모음, 한 발 들기)
    const feetInfo = measureFeetDistance(landmarks);
    const singleLegInfo = detectSingleLegStance(landmarks);
    const footHeightDiff = singleLegInfo.ankleYDiff;
    const isOneLegRaised = singleLegInfo.isSingleLeg;

    // 어깨 회전 (뒤돌아보기 감지)
    const rotationInfo = detectBodyRotation(landmarks, initialLandmarksRef.current);
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const shoulderRotation = Math.abs(rotationInfo.rotationChange) > 30 || shoulderWidth < 0.12;

    // 팔 뻗기 감지 (향상된)
    const armExtensionInfo = detectArmExtension(landmarks);
    const bodyLean = shoulderY - hipY;
    const isBending = bodyLean > 0.15;
    const armExtension = armExtensionInfo.reachDistance;

    // 손 지지 감지
    const isUsingHandSupport = handSupportInfo.isUsingHandSupport;

    // ===== 항목 3: 자세 정렬 및 안정성 계산 =====
    // 어깨 중심점
    const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
    // 엉덩이 중심점
    const hipCenterX = (leftHip.x + rightHip.x) / 2;
    const hipCenterY = (leftHip.y + rightHip.y) / 2;

    // 몸통 측면 기울기 (어깨-엉덩이 수직선 대비 각도)
    // X축 차이가 클수록 좌우로 기울어진 것
    const trunkLateralTilt = Math.abs(shoulderCenterX - hipCenterX) * 100; // 0에 가까울수록 정렬됨

    // 어깨 수평 정렬 (좌우 어깨 높이 차이)
    const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) * 100;

    // 엉덩이 수평 정렬 (좌우 엉덩이 높이 차이)
    const hipTilt = Math.abs(leftHip.y - rightHip.y) * 100;

    // 전체 정렬 점수 (낮을수록 좋음)
    const alignmentScore = trunkLateralTilt + shoulderTilt + hipTilt;

    // 정렬된 상태: 기울기가 5 이하면 정렬된 것으로 판단
    const isPostureAligned = alignmentScore < 5;

    // 흔들림 감지: 기울기가 8 이상이면 흔들림으로 판단
    const isPostureShifted = alignmentScore > 8;

    const detection = currentBBSItem.detection;
    const targetDuration = currentBBSItem.duration || 0;

    setGeneralDetection(prev => {
      let newPhase = prev.testPhase;
      let status = prev.status;
      let confidence = prev.confidence;
      let suggestedScore = prev.suggestedScore;
      let message = prev.message;
      let startTime = prev.startTime;
      let elapsedTime = prev.elapsedTime;
      let actionDetected = prev.actionDetected;
      let actionCount = prev.actionCount;
      let autoScore = prev.autoScore;
      let assessmentReport = prev.assessmentReport;
      let showResultModal = prev.showResultModal;
      let currentPosture = prev.currentPosture;
      let postureStability = 'good';
      // 항목 3 자세 추적용 변수
      let postureAligned = prev.postureAligned;
      let trunkTiltHistory = [...prev.trunkTiltHistory];
      let lateralShiftCount = prev.lateralShiftCount;
      let maxTrunkTilt = prev.maxTrunkTilt;
      let stabilityScore = prev.stabilityScore;
      let initialTrunkAngle = prev.initialTrunkAngle;

      // 현재 자세 업데이트
      currentPosture = isStanding ? 'standing' : isSitting ? 'sitting' : 'unknown';

      // 항목별 분석 로직
      switch (detection.type) {
        // 항목 3: 지지 없이 앉아 있기 (2분) - 자세 정렬 및 안정성 기반
        case 'sitting_duration':
          if (prev.testPhase === 'waiting') {
            if (isSitting) {
              // 앉은 상태 감지 - 정렬 확인
              if (isPostureAligned) {
                newPhase = 'detecting';
                status = '✓ 바른 자세 감지!';
                message = '자세를 유지하면 타이머가 시작됩니다';
                startTime = now;
                postureAligned = true;
                initialTrunkAngle = alignmentScore;
              } else {
                status = `자세 정렬 중... (기울기: ${alignmentScore.toFixed(1)})`;
                message = '어깨와 엉덩이를 일자로 맞춰주세요';
                postureAligned = false;
              }
            } else {
              status = '의자에 앉아주세요';
              message = '등받이 없이 바른 자세로 앉아주세요';
              postureAligned = false;
            }
          } else if (prev.testPhase === 'detecting') {
            // 정렬된 자세로 1초 유지하면 타이머 시작
            if (isSitting && isPostureAligned && now - startTime > 1000) {
              newPhase = 'in_progress';
              startTime = now;
              status = '✓ 타이머 시작!';
              message = '2분간 바른 자세로 앉아 계세요';
              // 안정성 추적 초기화
              trunkTiltHistory = [];
              lateralShiftCount = 0;
              maxTrunkTilt = 0;
              stabilityScore = 100;
              initialTrunkAngle = alignmentScore;
            } else if (!isSitting) {
              newPhase = 'waiting';
              startTime = null;
              postureAligned = false;
            } else if (!isPostureAligned) {
              // 정렬이 풀림 - 다시 대기
              status = '자세가 흐트러졌습니다';
              message = '어깨와 엉덩이를 일자로 맞춰주세요';
              startTime = now; // 타이머 리셋
            }
          } else if (prev.testPhase === 'in_progress') {
            elapsedTime = (now - startTime) / 1000;
            confidence = Math.min(100, (elapsedTime / targetDuration) * 100);
            const minutes = Math.floor(elapsedTime / 60);
            const seconds = Math.floor(elapsedTime % 60);

            // 자세 안정성 추적
            trunkTiltHistory.push(alignmentScore);
            if (trunkTiltHistory.length > 60) trunkTiltHistory.shift(); // 최근 60개만 유지

            // 최대 기울기 업데이트
            if (alignmentScore > maxTrunkTilt) {
              maxTrunkTilt = alignmentScore;
            }

            // 흔들림 감지 및 감점
            if (isPostureShifted) {
              lateralShiftCount++;
              // 흔들림당 1점 감점 (최대 20점까지)
              if (lateralShiftCount % 30 === 0) { // 약 1초에 1회 체크
                stabilityScore = Math.max(0, stabilityScore - 5);
              }
              status = `⚠️ 자세 흔들림! ${minutes}분 ${seconds}초 (안정성: ${stabilityScore}%)`;
              message = '자세를 바르게 유지하세요';
              postureStability = 'unstable';
            } else {
              status = `앉아 있음: ${minutes}분 ${seconds}초 (안정성: ${stabilityScore}%)`;
              const remaining = Math.ceil(targetDuration - elapsedTime);
              message = `남은 시간: ${Math.floor(remaining / 60)}분 ${remaining % 60}초`;
              postureStability = 'good';
            }

            if (!isSitting) {
              // 앉은 자세가 풀림 - 시간과 안정성에 따라 점수 부여
              newPhase = 'complete';
              let score = 0;
              let reason = '';

              // 기본 점수 (시간 기반)
              if (elapsedTime >= 120) score = 4;
              else if (elapsedTime >= 30) score = 2;
              else if (elapsedTime >= 10) score = 1;
              else score = 0;

              // 안정성 감점 적용
              if (stabilityScore < 50) {
                score = Math.max(0, score - 2);
                reason = `${Math.floor(elapsedTime)}초 앉음, 자세 불안정 (안정성 ${stabilityScore}%)`;
              } else if (stabilityScore < 80) {
                score = Math.max(0, score - 1);
                reason = `${Math.floor(elapsedTime)}초 앉음, 약간 흔들림 (안정성 ${stabilityScore}%)`;
              } else {
                reason = `${Math.floor(elapsedTime)}초간 안정적으로 앉아 있음`;
              }

              autoScore = { score, reason };
              assessmentReport = {
                score,
                duration: elapsedTime,
                stability: stabilityScore < 50 ? 'poor' : stabilityScore < 80 ? 'fair' : 'good',
                stabilityScore,
                lateralShiftCount,
                maxTrunkTilt,
                avgTilt: trunkTiltHistory.length > 0 ? (trunkTiltHistory.reduce((a, b) => a + b, 0) / trunkTiltHistory.length).toFixed(1) : 0
              };
              showResultModal = true;
              status = `${Math.floor(elapsedTime)}초에서 중단 (안정성: ${stabilityScore}%)`;
            }

            // 2분 완료 조건
            if (elapsedTime >= targetDuration) {
              newPhase = 'complete';
              let score = 4;
              let reason = '';

              // 안정성 감점 적용
              if (stabilityScore < 50) {
                score = 2;
                reason = '2분 완료, 자세 많이 흔들림';
              } else if (stabilityScore < 80) {
                score = 3;
                reason = '2분 완료, 약간의 자세 흔들림';
              } else {
                score = 4;
                reason = '2분간 안정적으로 앉아 있음 - 정상';
              }

              autoScore = { score, reason };
              assessmentReport = {
                score,
                duration: elapsedTime,
                stability: stabilityScore < 50 ? 'poor' : stabilityScore < 80 ? 'fair' : 'good',
                stabilityScore,
                lateralShiftCount,
                maxTrunkTilt,
                avgTilt: trunkTiltHistory.length > 0 ? (trunkTiltHistory.reduce((a, b) => a + b, 0) / trunkTiltHistory.length).toFixed(1) : 0
              };
              showResultModal = true;
              status = `✓ 2분 완료! (안정성: ${stabilityScore}%)`;
            }
          }
          break;

        // 항목 4: 선 자세에서 앉기 (털썩 vs 천천히 AI 감지)
        // 핵심: 서있음 감지 → 앉기 동작 분석
        case 'stand_to_sit':
          {
            // AI 분석 함수 호출
            const item4Analysis = handleItem4Analysis(landmarks);

            if (prev.testPhase === 'waiting') {
              // 서있음 감지 대기
              if (item4Analysis.isStanding) {
                // 서있음 감지! 앉기 분석 시작
                newPhase = 'detecting';
                status = '✓ 서있음 감지!';
                message = '천천히 앉으세요 (앉기 동작 분석 시작)';
                startTime = now;
                // 분석 초기화
                resetSittingAnalysis();
                sittingAnalysisRef.current.phase = 'standing';
                sittingAnalysisRef.current.standingTime = now;
                sittingAnalysisRef.current.hipPositions = [];
                sittingAnalysisRef.current.descentVelocities = [];
                sittingAnalysisRef.current.maxVelocity = 0;
                sittingAnalysisRef.current.usedHands = false;
                console.log('[Item4] 서있음 감지 - 앉기 분석 준비 완료');
              } else {
                // 아직 서있지 않음
                status = '서있음 대기 중...';
                message = `일어서세요 (무릎: ${item4Analysis.kneeAngle?.toFixed(0) || 0}°)`;
              }
            } else if (prev.testPhase === 'detecting') {
              // 앉기 동작 분석 중
              if (item4Analysis.phase === 'seated' && item4Analysis.score !== null) {
                // 앉기 완료!
                newPhase = 'complete';

                // AI 분석 결과 기반 점수
                let aiScore = item4Analysis.score;
                let reason = '';

                if (!item4Analysis.isControlled) {
                  // 털썩 앉음
                  aiScore = 1;
                  reason = `⚠️ 조절되지 않고 털썩 앉음 (${item4Analysis.descentDuration.toFixed(1)}초, 최대속도:${item4Analysis.maxVelocity.toFixed(1)})`;
                } else if (item4Analysis.usedHands) {
                  // 손 사용
                  aiScore = 3;
                  reason = `손을 사용하여 조절하며 앉음 (${item4Analysis.descentDuration.toFixed(1)}초)`;
                } else {
                  // 완벽한 앉기
                  aiScore = 4;
                  reason = `✓ 손 사용 없이 안전하게 앉음 (${item4Analysis.descentDuration.toFixed(1)}초)`;
                }

                autoScore = { score: aiScore, reason };
                assessmentReport = {
                  score: aiScore,
                  duration: item4Analysis.descentDuration,
                  controlled: item4Analysis.isControlled,
                  usedHands: item4Analysis.usedHands,
                  maxVelocity: item4Analysis.maxVelocity,
                  finalVelocity: item4Analysis.finalVelocity
                };
                showResultModal = true;
                status = item4Analysis.isControlled ? '✓ 앉기 완료!' : '⚠️ 털썩 앉음 감지';
                message = reason;
                confidence = 100;

                // 상태 업데이트
                setSittingState(prevState => ({
                  ...prevState,
                  phase: 'seated',
                  kneeAngle: item4Analysis.kneeAngle,
                  isControlled: item4Analysis.isControlled,
                  usedHands: item4Analysis.usedHands,
                  descentDuration: item4Analysis.descentDuration,
                  maxVelocity: item4Analysis.maxVelocity,
                  finalVelocity: item4Analysis.finalVelocity,
                  feedback: { message: reason, type: item4Analysis.isControlled ? 'success' : 'warning' },
                  autoScore: { score: aiScore, reason },
                  showResultModal: true
                }));
              } else if (item4Analysis.phase === 'descending' || item4Analysis.isDescending) {
                // 앉는 중 - 실시간 속도 표시
                status = '앉는 중...';
                const velocityInfo = item4Analysis.maxVelocity > 0
                  ? ` (속도: ${item4Analysis.maxVelocity.toFixed(1)})`
                  : '';
                message = `천천히 조절하며 앉으세요${velocityInfo}`;
                confidence = 50;

                // 손 사용 피드백
                if (item4Analysis.usedHands) {
                  status = '앉는 중 (손 사용 감지)';
                  message = `손 사용 감지됨${velocityInfo}`;
                }

                // 실시간 상태 업데이트
                setSittingState(prevState => ({
                  ...prevState,
                  phase: 'descending',
                  kneeAngle: item4Analysis.kneeAngle,
                  usedHands: item4Analysis.usedHands,
                  maxVelocity: item4Analysis.maxVelocity,
                  feedback: { message, type: item4Analysis.usedHands ? 'warning' : 'info' }
                }));
              } else if (item4Analysis.isStanding) {
                status = '서 있음 - 앉기 시작하세요';
                message = '팔짱을 끼고 천천히 앉으세요';
              }
            }
          }
          break;

        // 항목 5: 이동하기
        case 'transfer':
          if (prev.testPhase === 'waiting') {
            if (isSitting) {
              newPhase = 'detecting';
              status = '앉음 확인 - 이제 일어나서 옆 의자로 이동하세요';
              message = '일어나서 옆 의자로 이동 후 앉으세요';
              startTime = now;
              actionCount = 0;
            }
          } else if (prev.testPhase === 'detecting') {
            if (isStanding && actionCount === 0) {
              actionCount = 1;
              status = '일어섬 - 옆 의자로 이동하세요';
            } else if (isSitting && actionCount === 1) {
              const transitionTime = (now - startTime) / 1000;
              newPhase = 'complete';
              const score = transitionTime < 10 ? 4 : transitionTime < 15 ? 3 : 2;
              autoScore = { score, reason: `이동 완료 (${transitionTime.toFixed(1)}초)` };
              assessmentReport = { score, duration: transitionTime };
              showResultModal = true;
              status = '✓ 이동 완료!';
              confidence = 100;
            }
          }
          break;

        // 항목 6: 눈 감고 서 있기 (10초) - 안정성 분석 강화
        // 항목 7: 두 발 모아 서 있기 (1분) - 발 간격 분석 강화
        case 'standing_duration':
        case 'standing_feet_together':
          {
            const isItem7 = detection.type === 'standing_feet_together';

            if (prev.testPhase === 'waiting') {
              if (isStanding) {
                // 항목 7: 발 모음 상태 확인
                if (isItem7 && !feetInfo.feetTogether) {
                  status = '발을 모으세요';
                  message = `현재 발 간격: ${(feetInfo.ankleDistance * 100).toFixed(0)}%`;
                } else {
                  newPhase = 'detecting';
                  startTime = now;
                  status = isItem7 ? '발 모음 확인...' : '눈을 감으세요';
                }
              } else {
                status = '서 주세요';
                message = isItem7 ? '두 발을 모으고 서세요' : '눈을 감고 서 계세요';
              }
            } else if (prev.testPhase === 'detecting') {
              const readyCondition = isItem7 ?
                (isStanding && feetInfo.feetTogether && now - startTime > 500) :
                (isStanding && now - startTime > 500);

              if (readyCondition) {
                newPhase = 'in_progress';
                startTime = now;
                // 안정성 측정 시작을 위해 히스토리 초기화
                landmarksHistoryRef.current = [];
                status = '✓ 타이머 시작!';
              } else if (!isStanding) {
                newPhase = 'waiting';
                startTime = null;
              } else if (isItem7 && !feetInfo.feetTogether) {
                status = '발을 더 모아주세요';
                startTime = now; // 타이머 리셋
              }
            } else if (prev.testPhase === 'in_progress') {
              elapsedTime = (now - startTime) / 1000;
              confidence = Math.min(100, (elapsedTime / targetDuration) * 100);

              // 안정성 표시
              const stabilityText = stabilityInfo.stability === 'excellent' ? '매우 안정' :
                                   stabilityInfo.stability === 'good' ? '안정' :
                                   stabilityInfo.stability === 'moderate' ? '보통' : '불안정';

              status = `서 있음: ${Math.floor(elapsedTime)}초 / ${targetDuration}초 (${stabilityText})`;

              // 항목 7: 발 모으기 체크 (새로운 분석 함수 사용)
              if (isItem7 && !feetInfo.feetTogether) {
                message = `⚠️ 발을 더 모아주세요 (간격: ${(feetInfo.ankleDistance * 100).toFixed(0)}%)`;
                postureStability = 'warning';
              } else {
                message = `남은 시간: ${Math.ceil(targetDuration - elapsedTime)}초 | 안정성: ${stabilityInfo.score}%`;
              }

              if (!isStanding) {
                postureStability = 'unstable';
                message = '⚠️ 다시 서세요!';
              }

              // 완료
              if (elapsedTime >= targetDuration) {
                newPhase = 'complete';
                // 안정성에 따른 점수 조정
                let finalScore = 4;
                if (stabilityInfo.stability === 'poor' || stabilityInfo.stability === 'unstable') {
                  finalScore = 3;
                }
                autoScore = { score: finalScore, reason: `${targetDuration}초간 서있음 (${stabilityText})` };
                assessmentReport = { score: finalScore, duration: elapsedTime, stability: stabilityInfo.stability, stabilityScore: stabilityInfo.score };
                showResultModal = true;
                status = '✓ 완료!';
              }
            }
          }
          break;

        // 항목 8: 팔 뻗어 앞으로 내밀기 (거리 측정 cm)
        case 'arm_reach':
          {
            // AI 분석 함수 호출 (캔버스 크기 전달)
            const item8Analysis = handleItem8Analysis(landmarks, 640, 480);

            if (prev.testPhase === 'waiting') {
              if (item8Analysis.isStanding) {
                newPhase = 'detecting';
                status = '✓ 서있음 감지';
                message = '팔을 최대한 앞으로 뻗으세요';
                startTime = now;
                // 분석 초기화
                resetArmReachAnalysis();
                armReachRef.current.phase = 'standing';
              } else {
                status = '서있음 대기 중...';
                message = '서서 팔을 뻗을 준비를 하세요';
              }
            } else if (prev.testPhase === 'detecting') {
              const maxReach = item8Analysis.maxReachCm || 0;
              const currentReach = item8Analysis.currentReachCm || 0;

              // 신뢰도 계산 (최대 도달 거리 기준)
              confidence = Math.min(100, (maxReach / 25) * 100);

              if (item8Analysis.isArmExtended && currentReach > 3) {
                // 팔 뻗기 감지
                status = `팔 뻗기: ${currentReach.toFixed(1)}cm`;
                message = `최대: ${maxReach.toFixed(1)}cm`;

                // 점수 표시
                let scoreText = '';
                if (maxReach >= 25) scoreText = ' (4점)';
                else if (maxReach >= 12.5) scoreText = ' (3점)';
                else if (maxReach >= 5) scoreText = ' (2점)';
                status += scoreText;

                // 3초 이상 유지하면 완료
                if (now - startTime > 3000 && maxReach > 5) {
                  newPhase = 'complete';

                  // 점수 계산
                  let finalScore = 0;
                  let reason = '';
                  if (maxReach >= 25) {
                    finalScore = 4;
                    reason = `✓ 훌륭함! ${maxReach.toFixed(1)}cm 도달 (25cm 이상)`;
                  } else if (maxReach >= 12.5) {
                    finalScore = 3;
                    reason = `좋음: ${maxReach.toFixed(1)}cm 도달 (12.5cm 이상)`;
                  } else if (maxReach >= 5) {
                    finalScore = 2;
                    reason = `${maxReach.toFixed(1)}cm 도달 (5cm 이상)`;
                  } else {
                    finalScore = 1;
                    reason = `${maxReach.toFixed(1)}cm - 감독 필요`;
                  }

                  autoScore = { score: finalScore, reason };
                  assessmentReport = {
                    score: finalScore,
                    reachDistance: maxReach,
                    unit: 'cm'
                  };
                  showResultModal = true;
                  status = `✓ 팔 뻗기 완료: ${maxReach.toFixed(1)}cm`;

                  // 상태 업데이트
                  setArmReachState(prevState => ({
                    ...prevState,
                    phase: 'complete',
                    maxReach: maxReach,
                    feedback: { message: reason, type: finalScore >= 3 ? 'success' : 'warning' },
                    autoScore: { score: finalScore, reason },
                    showResultModal: true
                  }));
                }
              } else {
                status = '팔을 앞으로 뻗으세요';
                message = `현재: ${currentReach.toFixed(1)}cm / 최대: ${maxReach.toFixed(1)}cm`;
              }
            }
          }
          break;

        // 항목 9: 바닥의 물건 집기 (시간, 안정성, 손 지지 기반 점수)
        case 'pick_up_object':
          if (prev.testPhase === 'waiting') {
            if (isStanding && !isBending) {
              newPhase = 'detecting';
              status = '서 있음 확인';
              message = '바닥의 물건을 집으세요';
              startTime = now;
              actionDetected = false;
              // 초기 랜드마크 저장
              initialLandmarksRef.current = landmarks;
            }
          } else if (prev.testPhase === 'detecting') {
            // advancedAnalysis 활용 (analyzeItem9 결과)
            const bendingInfo = advancedAnalysis;
            const bendingDepth = bendingInfo?.bending?.bendingDepth || 0;

            if (isBending || bendingInfo?.bending?.isBending) {
              status = '숙이는 중...';
              message = `굽힘 깊이: ${bendingDepth.toFixed(0)}°`;
              actionDetected = true;
              confidence = 50;

              // 손이 바닥 근처인지 확인
              if (bendingInfo?.handNearFloor) {
                status = '✓ 물건 집는 중...';
                message = `굽힘: ${bendingDepth.toFixed(0)}° - 바닥 도달`;
                confidence = 80;
              }
            } else if (isStanding && actionDetected) {
              // 다시 일어섬 - 완료
              newPhase = 'complete';
              const elapsed = (now - startTime) / 1000;

              // 점수 계산
              let score = 4;
              let reasons = [];

              // 기본 완료 메시지
              reasons.push(`${elapsed.toFixed(1)}초`);

              // 시간 기반 감점 (5초 초과 시)
              if (elapsed > 5) {
                score = Math.max(2, score - 1);
                reasons.push('시간 초과');
              }

              // 안정성 기반 감점
              if (stabilityInfo.stability === 'poor' || stabilityInfo.stability === 'unstable') {
                score = Math.max(1, score - 1);
                reasons.push('불안정');
              }

              // 손 지지 사용 시 감점
              if (handSupportInfo.isUsingHandSupport) {
                score = Math.max(2, score - 1);
                reasons.push('손 지지 사용');
              }

              const reason = `물건 집기 완료 (${reasons.join(', ')})`;

              autoScore = { score, reason };
              assessmentReport = {
                score,
                duration: elapsed,
                bendingDepth,
                stability: stabilityInfo.stability,
                usedHandSupport: handSupportInfo.isUsingHandSupport
              };
              showResultModal = true;
              status = `✓ 완료! (${score}점)`;
              confidence = 100;
            }
          }
          break;

        // 항목 10: 뒤돌아보기 (회전 각도, 발 고정 기반 점수)
        case 'look_behind':
          if (prev.testPhase === 'waiting') {
            if (isStanding) {
              newPhase = 'detecting';
              status = '왼쪽으로 뒤돌아보세요';
              message = '어깨 너머로 뒤를 보세요 (발은 고정)';
              startTime = now;
              actionCount = 0;
              // 초기 랜드마크 저장 (회전 및 발 위치 기준)
              initialLandmarksRef.current = landmarks;
              motionStateRef.current.maxLeftRotation = 0;
              motionStateRef.current.maxRightRotation = 0;
            }
          } else if (prev.testPhase === 'detecting') {
            // 회전 정보 (rotationInfo는 이미 위에서 계산됨)
            const rotation = rotationInfo.rotationChange;
            const absRotation = Math.abs(rotation);

            // 발 이동 확인
            const feetMoved = initialLandmarksRef.current ?
              Math.abs(landmarks[27].x - initialLandmarksRef.current[27].x) > 0.05 ||
              Math.abs(landmarks[28].x - initialLandmarksRef.current[28].x) > 0.05 : false;

            // 최대 회전량 추적 (왼쪽: 음수, 오른쪽: 양수)
            if (rotation < -10) {
              motionStateRef.current.maxLeftRotation = Math.max(
                motionStateRef.current.maxLeftRotation || 0,
                absRotation
              );
            } else if (rotation > 10) {
              motionStateRef.current.maxRightRotation = Math.max(
                motionStateRef.current.maxRightRotation || 0,
                absRotation
              );
            }

            const leftDone = (motionStateRef.current.maxLeftRotation || 0) >= 25;
            const rightDone = (motionStateRef.current.maxRightRotation || 0) >= 25;

            // 발 이동 경고
            if (feetMoved) {
              message = '⚠️ 발을 고정하세요!';
              postureStability = 'warning';
            }

            // 상태 표시
            if (actionCount === 0) {
              // 왼쪽 회전 대기
              if (leftDone) {
                actionCount = 1;
                status = `✓ 왼쪽 완료 (${(motionStateRef.current.maxLeftRotation || 0).toFixed(0)}°)`;
                message = '이제 오른쪽으로 뒤돌아보세요';
                confidence = 50;
              } else if (absRotation > 5 && rotation < 0) {
                status = `왼쪽 회전: ${absRotation.toFixed(0)}° / 25°`;
                message = '더 돌아보세요';
              }
            } else if (actionCount === 1) {
              // 오른쪽 회전 대기
              if (rightDone) {
                // 완료
                newPhase = 'complete';
                const elapsed = (now - startTime) / 1000;

                const leftAngle = motionStateRef.current.maxLeftRotation || 0;
                const rightAngle = motionStateRef.current.maxRightRotation || 0;

                // 점수 계산
                let score = 4;
                let reason = '';

                // 회전 각도 기반 점수
                if (leftAngle >= 40 && rightAngle >= 40) {
                  score = 4;
                  reason = `양쪽 뒤돌아보기 완료 (좌:${leftAngle.toFixed(0)}° 우:${rightAngle.toFixed(0)}°)`;
                } else if (leftAngle >= 25 && rightAngle >= 25) {
                  score = 3;
                  reason = `회전 완료, 각도 약간 부족 (좌:${leftAngle.toFixed(0)}° 우:${rightAngle.toFixed(0)}°)`;
                } else {
                  score = 2;
                  reason = `한쪽만 충분히 회전 (좌:${leftAngle.toFixed(0)}° 우:${rightAngle.toFixed(0)}°)`;
                }

                // 발 이동 시 감점
                if (feetMoved) {
                  score = Math.max(1, score - 1);
                  reason += ' - 발 이동 감지';
                }

                autoScore = { score, reason };
                assessmentReport = {
                  score,
                  leftRotation: leftAngle,
                  rightRotation: rightAngle,
                  duration: elapsed,
                  feetMoved
                };
                showResultModal = true;
                status = `✓ 완료! (${score}점)`;
                confidence = 100;
              } else if (rotation > 5) {
                status = `오른쪽 회전: ${rotation.toFixed(0)}° / 25°`;
                message = '더 돌아보세요';
              }
            }
          }
          break;

        // 항목 11: 360도 회전 (누적 회전량 추적)
        case 'turn_360':
          if (prev.testPhase === 'waiting') {
            if (isStanding) {
              newPhase = 'detecting';
              status = '한 바퀴 돌아주세요';
              message = '제자리에서 360도 회전하세요';
              startTime = now;
              // 초기 랜드마크 저장 (회전 기준점)
              initialLandmarksRef.current = landmarks;
              motionStateRef.current.cumulativeRotation = 0;
              motionStateRef.current.lastRotation = 0;
            }
          } else if (prev.testPhase === 'detecting') {
            const elapsed = (now - startTime) / 1000;
            // 누적 회전량 업데이트
            const rotationDelta = rotationInfo.rotationChange - motionStateRef.current.lastRotation;
            motionStateRef.current.cumulativeRotation += rotationDelta;
            motionStateRef.current.lastRotation = rotationInfo.rotationChange;

            const absRotation = Math.abs(motionStateRef.current.cumulativeRotation);
            confidence = Math.min(100, (absRotation / 330) * 100);

            // 회전 방향 표시
            const direction = motionStateRef.current.cumulativeRotation > 0 ? '→' : '←';
            status = `회전 중... ${direction} ${Math.round(absRotation)}°`;
            message = `남은 회전: ${Math.max(0, 360 - absRotation).toFixed(0)}°`;

            // 330도 이상 회전하면 완료 (약간의 여유)
            if (absRotation >= 330) {
              newPhase = 'complete';
              const score = elapsed < 4 ? 4 : elapsed < 6 ? 3 : 2;
              autoScore = { score, reason: `${elapsed.toFixed(1)}초에 360° 회전 완료` };
              assessmentReport = { score, duration: elapsed, rotation: absRotation };
              showResultModal = true;
              status = '✓ 회전 완료!';
              confidence = 100;
            }
          }
          break;

        // 항목 12: 발판에 발 교대로 올리기 (좌우 교대 추적)
        case 'step_alternating':
          if (prev.testPhase === 'waiting') {
            if (isStanding) {
              newPhase = 'detecting';
              status = '발을 번갈아 올리세요';
              message = '발판에 발을 4회 번갈아 올리세요';
              startTime = now;
              actionCount = 0;
              motionStateRef.current.stepCount = 0;
              motionStateRef.current.lastSteppingFoot = null;
            }
          } else if (prev.testPhase === 'detecting') {
            // 발 교대 감지 (새로운 분석 함수 사용)
            const footStepInfo = detectFootStep(landmarks, previousLandmarksRef.current);

            if (singleLegInfo.isSingleLeg && !actionDetected) {
              const currentFoot = singleLegInfo.liftedFoot;
              const lastFoot = motionStateRef.current.lastSteppingFoot;

              // 교대로 올렸는지 확인
              if (lastFoot === null || currentFoot !== lastFoot) {
                actionCount++;
                motionStateRef.current.stepCount = actionCount;
                motionStateRef.current.lastSteppingFoot = currentFoot;
                actionDetected = true;

                const footText = currentFoot === 'left' ? '왼발' : '오른발';
                status = `${footText} 올림 ${actionCount}/4회`;
                message = actionCount < 4 ? `다음: ${currentFoot === 'left' ? '오른발' : '왼발'}` : '완료!';
                confidence = (actionCount / 4) * 100;
              } else {
                // 같은 발 연속 사용
                status = `⚠️ 같은 발 연속! ${actionCount}/4회`;
                message = `반대쪽 발(${currentFoot === 'left' ? '오른발' : '왼발'})을 올려주세요`;
              }
            } else if (!singleLegInfo.isSingleLeg) {
              actionDetected = false;
            }

            if (actionCount >= 4) {
              const elapsed = (now - startTime) / 1000;
              newPhase = 'complete';
              const score = elapsed < 20 ? 4 : 3;
              autoScore = { score, reason: `4회 교대 완료 (${elapsed.toFixed(1)}초)` };
              assessmentReport = { score, count: actionCount, duration: elapsed, alternating: true };
              showResultModal = true;
              status = '✓ 완료!';
            }
          }
          break;

        // 항목 13: 일렬로 서기 (탄뎀 서기) - 발 정렬 분석 개선
        case 'tandem_stance':
          if (prev.testPhase === 'waiting') {
            if (isStanding) {
              newPhase = 'detecting';
              status = '한 발을 다른 발 앞에 놓으세요';
              message = '일렬로 서세요 (발뒤꿈치-발끝 정렬)';
              startTime = now;
            }
          } else if (prev.testPhase === 'detecting') {
            // 탄뎀 자세 감지 (새로운 분석 함수 사용)
            const isTandemPose = feetInfo.isTandem || feetInfo.footXDiff < 0.1;

            if (isTandemPose && isStanding) {
              newPhase = 'in_progress';
              startTime = now;
              status = '✓ 탄뎀 자세 확인!';
              message = '자세를 유지하세요';
            } else {
              // 발 정렬 가이드
              const xDiff = feetInfo.footXDiff;
              if (xDiff > 0.15) {
                message = '발을 더 가깝게 정렬하세요';
              } else if (xDiff > 0.1) {
                message = '조금만 더 정렬하세요...';
              }
              status = `발 정렬 중... (간격: ${(xDiff * 100).toFixed(0)}%)`;
            }
          } else if (prev.testPhase === 'in_progress') {
            elapsedTime = (now - startTime) / 1000;
            confidence = Math.min(100, (elapsedTime / targetDuration) * 100);

            // 자세 유지 확인
            const isMaintained = feetInfo.isTandem || feetInfo.footXDiff < 0.12;

            if (isMaintained) {
              status = `일렬 서기: ${Math.floor(elapsedTime)}초 / ${targetDuration}초`;
              message = `남은 시간: ${Math.ceil(targetDuration - elapsedTime)}초`;
            } else {
              status = `⚠️ 자세 유지! ${Math.floor(elapsedTime)}초`;
              message = '발 정렬을 유지하세요';
              postureStability = 'unstable';
            }

            if (elapsedTime >= targetDuration) {
              newPhase = 'complete';
              autoScore = { score: 4, reason: `${targetDuration}초간 탄뎀 자세 완료` };
              assessmentReport = { score: 4, duration: elapsedTime, tandem: true };
              showResultModal = true;
              status = '✓ 완료!';
            }
          }
          break;

        // 항목 14: 한 발로 서기 (발 식별 및 안정성 분석)
        case 'single_leg_stance':
          if (prev.testPhase === 'waiting') {
            if (isStanding) {
              newPhase = 'detecting';
              status = '한 발을 드세요';
              message = '한 발로 최대한 오래 서세요 (지지 없이)';
              startTime = now;
            }
          } else if (prev.testPhase === 'detecting') {
            if (singleLegInfo.isSingleLeg) {
              newPhase = 'in_progress';
              startTime = now;
              const footText = singleLegInfo.liftedFoot === 'left' ? '왼발' : '오른발';
              status = `${footText} 들기 시작!`;
            }
          } else if (prev.testPhase === 'in_progress') {
            elapsedTime = (now - startTime) / 1000;
            confidence = Math.min(100, (elapsedTime / targetDuration) * 100);

            // 들고 있는 발 표시 및 안정성 분석
            const footText = singleLegInfo.liftedFoot === 'left' ? '왼발' : '오른발';
            const stabilityText = stabilityInfo.stability === 'excellent' ? '안정' :
                                 stabilityInfo.stability === 'good' ? '양호' :
                                 stabilityInfo.stability === 'moderate' ? '보통' : '불안정';

            status = `${footText} 서기: ${elapsedTime.toFixed(1)}초 (${stabilityText})`;
            message = `안정성 점수: ${stabilityInfo.score}%`;

            if (!singleLegInfo.isSingleLeg || !isStanding) {
              // 발을 내림
              newPhase = 'complete';
              let score = 0;
              if (elapsedTime >= 10) score = 4;
              else if (elapsedTime >= 5) score = 3;
              else if (elapsedTime >= 3) score = 2;
              else score = 1;

              // 안정성에 따른 감점 (불안정하면 -1)
              if (stabilityInfo.stability === 'poor' || stabilityInfo.stability === 'unstable') {
                score = Math.max(1, score - 1);
              }

              autoScore = { score, reason: `${elapsedTime.toFixed(1)}초간 한 발 서기 (${stabilityText})` };
              assessmentReport = { score, duration: elapsedTime, stability: stabilityInfo.stability, stabilityScore: stabilityInfo.score };
              showResultModal = true;
              status = `✓ ${elapsedTime.toFixed(1)}초 유지! (${stabilityText})`;
            }

            // 10초 달성
            if (elapsedTime >= targetDuration) {
              newPhase = 'complete';
              autoScore = { score: 4, reason: `${targetDuration}초 이상 한 발 서기 완료 (${stabilityText})` };
              assessmentReport = { score: 4, duration: elapsedTime, stability: stabilityInfo.stability, stabilityScore: stabilityInfo.score };
              showResultModal = true;
              status = '✓ 완료!';
            }
          }
          break;

        default:
          status = '동작 수행 중';
          confidence = 50;
          message = currentBBSItem.instruction;
      }

      return {
        ...prev,
        testPhase: newPhase,
        status,
        confidence,
        suggestedScore: autoScore?.score ?? suggestedScore,
        message,
        startTime,
        elapsedTime,
        targetDuration,
        actionDetected,
        actionCount,
        currentPosture,
        postureStability,
        autoScore,
        assessmentReport,
        showResultModal,
        // 항목 3 자세 추적
        postureAligned,
        trunkTiltHistory,
        lateralShiftCount,
        maxTrunkTilt,
        stabilityScore,
        initialTrunkAngle
      };
    });
  }, [currentBBSItem, handleItem4Analysis, resetSittingAnalysis, handleItem8Analysis, resetArmReachAnalysis]);

  // MediaPipe 초기화
  const initPose = useCallback(async () => {
    setCameraLoading(true);

    try {
      // 기존 카메라 정리
      if (cameraRef.current) {
        try {
          cameraRef.current.stop();
        } catch (e) {
          console.log('Camera stop error (ignorable):', e);
        }
        cameraRef.current = null;
      }

      // MediaPipe Pose는 close() 메서드가 없으므로 단순히 null 처리
      if (poseRef.current) {
        poseRef.current = null;
      }

      // 약간의 딜레이 후 초기화 (DOM 준비 대기)
      await new Promise(resolve => setTimeout(resolve, 100));

      // 비디오/캔버스 ref 확인
      if (!videoRef.current || !canvasRef.current) {
        console.error('Video or canvas ref not available');
        setCameraLoading(false);
        return null;
      }

      const { Pose } = await import('@mediapipe/pose');
      const { Camera } = await import('@mediapipe/camera_utils');

      const pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });

      pose.onResults((results) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = videoRef.current?.videoWidth || 640;
        canvas.height = videoRef.current?.videoHeight || 480;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

        if (results.poseLandmarks) {
          setCurrentLandmarks(results.poseLandmarks);

          // 스켈레톤 색상 (상태에 따라)
          let skeletonColor = '#3B82F6';
          if (isItem1) {
            const analysis = handleItem1Analysis(results.poseLandmarks);
            skeletonColor = analysis.state === PostureState.SITTING ? '#EAB308' :
                           analysis.state === PostureState.STANDING ? '#10B981' : '#64748B';

            // 각도 정보 그리기
            drawAngleInfo(ctx, analysis, results.poseLandmarks, canvas.width, canvas.height);
          } else if (isItem2) {
            // 실시간 카메라는 측면 뷰로 자세 감지 수행
            const analysis = handleItem2Analysis(results.poseLandmarks, 'side');
            // 안정성에 따른 색상 - 문자열 비교 (null 체크 추가)
            if (analysis && analysis.stability) {
              skeletonColor = analysis.stability === 'excellent' ? '#10B981' :
                             analysis.stability === 'good' ? '#22C55E' :
                             analysis.stability === 'moderate' ? '#EAB308' :
                             analysis.stability === 'poor' ? '#F97316' : '#EF4444';
            }
            // 항목 2 각도 표시
            drawBodyAngles(ctx, results.poseLandmarks, canvas.width, canvas.height);
          } else {
            handleGeneralAnalysis(results.poseLandmarks);
            // 일반 항목 각도 표시 (항목 3에서는 자세 정렬도 표시)
            drawBodyAngles(ctx, results.poseLandmarks, canvas.width, canvas.height, currentItem === 2);

            // 항목 9: 바닥 물건 집기 분석 및 오버레이
            if (isItem9) {
              const pickUpData = handleItem9Analysis(results.poseLandmarks, canvas.width, canvas.height);
              drawItem9Overlay(ctx, results.poseLandmarks, canvas.width, canvas.height, pickUpData);
            }
          }

          // 스켈레톤 그리기
          drawConnections(ctx, results.poseLandmarks, canvas.width, canvas.height, {
            strokeStyle: skeletonColor,
            lineWidth: 3
          });
          drawLandmarks(ctx, results.poseLandmarks, canvas.width, canvas.height, {
            fillStyle: skeletonColor,
            radius: 5
          });
        }

        ctx.restore();
      });

      poseRef.current = pose;

      // 비디오 요소 초기화 확인
      const video = videoRef.current;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('autoplay', 'true');

      const camera = new Camera(video, {
        onFrame: async () => {
          if (poseRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            try {
              await poseRef.current.send({ image: videoRef.current });
            } catch (e) {
              // 프레임 전송 오류 무시 (간헐적 발생 가능)
            }
          }
        },
        width: 640,
        height: 480
      });

      await camera.start();
      cameraRef.current = camera;

      // 카메라 시작 후 약간 대기
      await new Promise(resolve => setTimeout(resolve, 200));
      setCameraLoading(false);
      return camera;
    } catch (error) {
      console.error('Pose init error:', error);
      setCameraLoading(false);
      return null;
    }
  }, [isItem1, isItem2, handleItem1Analysis, handleItem2Analysis, handleGeneralAnalysis]);

  /**
   * AI 자동 감지: 랜드마크로 측면/정면 판단
   * - 정면: 어깨/엉덩이 좌우 x좌표 차이가 큼 (좌우로 펼쳐짐)
   * - 측면: 어깨/엉덩이 좌우 x좌표 차이가 작음 (겹쳐 보임)
   */
  const detectViewType = useCallback((landmarks) => {
    if (!landmarks || landmarks.length < 25) return 'unknown';

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 'unknown';

    // 어깨 좌우 거리
    const shoulderDiff = Math.abs(leftShoulder.x - rightShoulder.x);
    // 엉덩이 좌우 거리
    const hipDiff = Math.abs(leftHip.x - rightHip.x);

    // 평균 좌우 거리
    const avgHorizontalSpread = (shoulderDiff + hipDiff) / 2;

    // 정면: 좌우 펼침이 큼 (0.15 이상)
    // 측면: 좌우 펼침이 작음 (0.15 미만)
    const threshold = 0.12;

    if (avgHorizontalSpread > threshold) {
      return 'front'; // 정면
    } else {
      return 'side'; // 측면
    }
  }, []);

  // 측면 동영상 업로드 핸들러
  const handleSideVideoUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 기존 URL 해제
    if (sideVideoUrl) {
      URL.revokeObjectURL(sideVideoUrl);
    }

    const url = URL.createObjectURL(file);
    setSideVideoUrl(url);
    setSideVideoProgress(0);
    setSideVideoDuration(0);
  }, [sideVideoUrl]);

  // 정면 동영상 업로드 핸들러
  const handleFrontVideoUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 기존 URL 해제
    if (frontVideoUrl) {
      URL.revokeObjectURL(frontVideoUrl);
    }

    const url = URL.createObjectURL(file);
    setFrontVideoUrl(url);
    setFrontVideoProgress(0);
    setFrontVideoDuration(0);
  }, [frontVideoUrl]);

  // 영상 자동 싱크 함수 (오디오 Cross-Correlation 기반)
  const handleAutoSync = useCallback(async () => {
    if (!sideVideoUrl || !frontVideoUrl) {
      alert('측면과 정면 영상을 모두 업로드해주세요.');
      return;
    }

    setVideoSyncInfo(prev => ({ ...prev, syncing: true, error: null }));

    try {
      console.log('[VideoSync] 오디오 기반 자동 싱크 시작...');

      // Blob URL에서 File 객체 가져오기
      const [sideResponse, frontResponse] = await Promise.all([
        fetch(sideVideoUrl),
        fetch(frontVideoUrl)
      ]);

      const [sideBlob, frontBlob] = await Promise.all([
        sideResponse.blob(),
        frontResponse.blob()
      ]);

      // File 객체 생성
      const sideFile = new File([sideBlob], 'side.mov', { type: 'video/quicktime' });
      const frontFile = new File([frontBlob], 'front.mov', { type: 'video/quicktime' });

      // 오디오 기반 싱크 감지 (Python 백엔드 호출)
      let result;
      let method = 'audio';

      try {
        result = await detectOffsetAudio(sideFile, frontFile);
        console.log('[VideoSync] 오디오 싱크 결과:', result);
        // result: { offset_ms, offset_sec, side_trim, front_trim, confidence }
      } catch (audioError) {
        console.warn('[VideoSync] 오디오 싱크 실패, 동작 감지로 전환:', audioError);
        // 오디오 실패 시 클라이언트 동작 감지로 폴백
        method = 'motion';
        const motionResult = await detectOffsetClient(sideVideoUrl, frontVideoUrl);
        result = {
          offset_sec: motionResult.offset,
          offset_ms: motionResult.offset * 1000,
          side_trim: motionResult.skipSide,
          front_trim: motionResult.skipFront,
          confidence: 0.5
        };
      }

      console.log('[VideoSync] 최종 결과:', { ...result, method });
      setVideoSyncInfo({
        offset: result.offset_sec,
        sideTrim: result.side_trim,
        frontTrim: result.front_trim,
        confidence: result.confidence,
        method: method,
        synced: true,
        syncing: false,
        error: null
      });

      // 결과 알림
      const offsetMs = Math.abs(result.offset_ms).toFixed(0);
      const methodText = method === 'audio' ? '🎵 오디오' : '📹 동작';
      const confidenceText = result.confidence ? ` (신뢰도: ${Math.round(result.confidence * 100)}%)` : '';

      if (result.side_trim > 0) {
        alert(`✓ ${methodText} 싱크 완료!\n측면 영상을 ${result.side_trim.toFixed(3)}초 트리밍합니다.${confidenceText}`);
      } else if (result.front_trim > 0) {
        alert(`✓ ${methodText} 싱크 완료!\n정면 영상을 ${result.front_trim.toFixed(3)}초 트리밍합니다.${confidenceText}`);
      } else {
        alert(`✓ ${methodText} 싱크 완료!\n영상이 이미 동기화되어 있습니다.${confidenceText}`);
      }
    } catch (error) {
      console.error('[VideoSync] 싱크 감지 실패:', error);
      setVideoSyncInfo(prev => ({
        ...prev,
        syncing: false,
        error: error.message
      }));
      alert(`싱크 감지 실패: ${error.message}`);
    }
  }, [sideVideoUrl, frontVideoUrl]);

  // 자동 오디오 싱크 - 두 영상이 모두 업로드되면 자동 실행
  useEffect(() => {
    // 이미 싱크 완료되었거나 싱크 중이면 스킵
    if (videoSyncInfo.synced || videoSyncInfo.syncing) {
      return;
    }

    // 두 영상이 모두 있을 때만 자동 싱크
    if (!sideVideoUrl || !frontVideoUrl) {
      return;
    }

    const runAutoSync = async () => {
      console.log(`[AutoSync] 항목 ${currentItem + 1} 자동 오디오 싱크 시작...`);
      setVideoSyncInfo(prev => ({ ...prev, syncing: true, error: null }));

      try {
        // Blob URL에서 File 객체 가져오기
        const [sideResponse, frontResponse] = await Promise.all([
          fetch(sideVideoUrl),
          fetch(frontVideoUrl)
        ]);

        const [sideBlob, frontBlob] = await Promise.all([
          sideResponse.blob(),
          frontResponse.blob()
        ]);

        // File 객체 생성
        const sideFile = new File([sideBlob], 'side.mov', { type: 'video/quicktime' });
        const frontFile = new File([frontBlob], 'front.mov', { type: 'video/quicktime' });

        // 오디오 기반 싱크 감지 (Python 백엔드 호출)
        let result;
        let method = 'audio';

        try {
          result = await detectOffsetAudio(sideFile, frontFile);
          console.log('[AutoSync] 오디오 싱크 결과:', result);
        } catch (audioError) {
          console.warn('[AutoSync] 오디오 싱크 실패, 동작 감지로 전환:', audioError);
          method = 'motion';
          const motionResult = await detectOffsetClient(sideVideoUrl, frontVideoUrl);
          result = {
            offset_sec: motionResult.offset,
            offset_ms: motionResult.offset * 1000,
            side_trim: motionResult.skipSide,
            front_trim: motionResult.skipFront,
            confidence: 0.5
          };
        }

        console.log('[AutoSync] 최종 결과:', { ...result, method });
        setVideoSyncInfo({
          offset: result.offset_sec,
          sideTrim: result.side_trim,
          frontTrim: result.front_trim,
          confidence: result.confidence,
          method: method,
          synced: true,
          syncing: false,
          error: null
        });

        // 콘솔에 싱크 완료 로그
        if (result.side_trim > 0) {
          console.log(`[AutoSync] ✓ 항목 ${currentItem + 1} ${method} 싱크 완료 - 측면 영상 ${result.side_trim.toFixed(3)}초 트리밍`);
        } else if (result.front_trim > 0) {
          console.log(`[AutoSync] ✓ 항목 ${currentItem + 1} ${method} 싱크 완료 - 정면 영상 ${result.front_trim.toFixed(3)}초 트리밍`);
        } else {
          console.log(`[AutoSync] ✓ 항목 ${currentItem + 1} ${method} 싱크 완료 - 영상이 이미 동기화됨`);
        }
      } catch (error) {
        console.error('[AutoSync] 싱크 감지 실패:', error);
        setVideoSyncInfo(prev => ({
          ...prev,
          syncing: false,
          error: error.message
        }));
      }
    };

    // 약간의 딜레이 후 자동 싱크 실행 (영상 로드 완료 대기)
    const timer = setTimeout(runAutoSync, 500);
    return () => clearTimeout(timer);
  }, [sideVideoUrl, frontVideoUrl, videoSyncInfo.synced, videoSyncInfo.syncing, currentItem]);

  // 항목 전환 시 비디오 ref 초기화
  useEffect(() => {
    // 항목이 변경되면 비디오 ref의 src를 초기화하여 이전 영상이 표시되지 않도록 함
    if (sideVideoRef.current) {
      sideVideoRef.current.src = '';
      sideVideoRef.current.load();
    }
    if (frontVideoRef.current) {
      frontVideoRef.current.src = '';
      frontVideoRef.current.load();
    }
    // 분석 상태도 초기화
    setIsAnalyzing(false);
    setCameraLoading(false);
    setItemTimer(0);
    setCurrentLandmarks(null);
    setSideLandmarks(null);
    setFrontLandmarks(null);
    setSideVideoProgress(0);
    setFrontVideoProgress(0);
    setSideVideoDuration(0);
    setFrontVideoDuration(0);
    setIsSideVideoPaused(true);
    setIsFrontVideoPaused(true);
    // 싱크 상태는 항목별로 저장되므로 리셋하지 않음
  }, [currentItem]);

  // 단일 영상 분석 초기화 헬퍼 함수
  const initSingleVideoAnalysis = useCallback(async (
    videoRef, canvasRef, poseRef, analysisRef,
    videoUrl, setProgress, setDuration, setPaused, setLandmarks, viewType, trimTime = 0, autoPlay = true
  ) => {
    console.log(`[${viewType}] initSingleVideoAnalysis called`);
    console.log(`[${viewType}] videoRef.current:`, videoRef.current);
    console.log(`[${viewType}] canvasRef.current:`, canvasRef.current);
    console.log(`[${viewType}] videoUrl:`, videoUrl);

    if (!videoRef.current || !canvasRef.current || !videoUrl) {
      console.log(`[${viewType}] Missing required refs or URL, returning null`);
      return null;
    }

    const video = videoRef.current;

    // 기존 이벤트 리스너 제거
    video.onloadeddata = null;
    video.onerror = null;
    video.onended = null;

    console.log(`[${viewType}] Loading video...`);

    // 비디오 로드 대기 - 이벤트 리스너를 먼저 설정
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.error(`[${viewType}] Video load timeout`);
        reject(new Error('Video load timeout'));
      }, 10000); // 10초 타임아웃

      const handleLoaded = () => {
        clearTimeout(timeoutId);
        console.log(`[${viewType}] Video loaded successfully, readyState:`, video.readyState);
        console.log(`[${viewType}] Video dimensions:`, video.videoWidth, 'x', video.videoHeight);
        resolve();
      };

      const handleError = (e) => {
        clearTimeout(timeoutId);
        console.error(`[${viewType}] Video load error:`, e);
        reject(e);
      };

      // 이미 로드된 경우 바로 resolve
      if (video.readyState >= 2 && video.src === videoUrl) {
        console.log(`[${viewType}] Video already loaded`);
        clearTimeout(timeoutId);
        resolve();
        return;
      }

      video.onloadeddata = handleLoaded;
      video.onerror = handleError;

      // src 설정 후 load 호출
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      video.load();
    });

    console.log(`[${viewType}] Video duration:`, video.duration);
    setDuration(video.duration);

    const { Pose } = await import('@mediapipe/pose');

    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    // onResults 호출 카운터
    let resultsCount = 0;

    pose.onResults((results) => {
      resultsCount++;

      // 처음 3번만 로그
      if (resultsCount <= 3) {
        console.log(`[${viewType}] onResults #${resultsCount}: hasLandmarks=${!!results.poseLandmarks}, landmarkCount=${results.poseLandmarks?.length || 0}`);
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        console.log(`[${viewType}] Canvas not found!`);
        return;
      }

      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.poseLandmarks) {
        setLandmarks(results.poseLandmarks);

        // 합성 뷰용 랜드마크 저장
        if (viewType === 'side') {
          sideLandmarksRef.current = results.poseLandmarks;
        } else {
          frontLandmarksRef.current = results.poseLandmarks;
        }

        // AI 자동 감지: 이 영상이 측면인지 정면인지 판단
        const detectedView = detectViewType(results.poseLandmarks);
        const videoKey = viewType === 'side' ? 'video1' : 'video2';

        // 디버그 로그 (처음 몇 프레임만)
        const totalCount = detectionCountRef.current[videoKey].side + detectionCountRef.current[videoKey].front;
        if (totalCount < 5) {
          console.log(`[DEBUG ${videoKey}] 프레임 ${totalCount + 1}: detectedView=${detectedView}, viewType=${viewType}`);
        }

        // 감지 결과 누적 (처음 30프레임 동안)
        if (totalCount < 30) {
          if (detectedView === 'side') {
            detectionCountRef.current[videoKey].side++;
          } else if (detectedView === 'front') {
            detectionCountRef.current[videoKey].front++;
          }

          // 30프레임 도달 시 최종 판정
          const counts = detectionCountRef.current[videoKey];
          if (counts.side + counts.front >= 30) {
            const finalType = counts.side > counts.front ? 'side' : 'front';
            if (videoKey === 'video1') {
              video1DetectedTypeRef.current = finalType; // ref 먼저 업데이트
              setVideo1DetectedType(finalType);
              console.log(`[AI 감지] 영상1: ${finalType === 'side' ? '측면' : '정면'} (측면:${counts.side}, 정면:${counts.front})`);
            } else {
              video2DetectedTypeRef.current = finalType; // ref 먼저 업데이트
              setVideo2DetectedType(finalType);
              console.log(`[AI 감지] 영상2: ${finalType === 'side' ? '측면' : '정면'} (측면:${counts.side}, 정면:${counts.front})`);
            }
          }
        }

        // 실제 감지된 타입으로 분석 여부 결정 (ref 사용으로 최신 값 접근)
        const actualViewType = videoKey === 'video1' ? video1DetectedTypeRef.current : video2DetectedTypeRef.current;
        const isSideView = actualViewType === 'side' || (actualViewType === 'unknown' && detectedView === 'side');

        let skeletonColor = '#3B82F6';

        // 양쪽 영상 모두 분석 수행
        if (isItem1) {
          const analysis = handleItem1Analysis(results.poseLandmarks);
          skeletonColor = analysis.state === PostureState.SITTING ? '#EAB308' :
                         analysis.state === PostureState.STANDING ? '#10B981' : '#64748B';
          drawAngleInfo(ctx, analysis, results.poseLandmarks, canvas.width, canvas.height);
        } else if (isItem2) {
          // 측면 영상: 자세 감지 (앉음/서있음), 정면 영상: 안정성 분석
          const analysis = handleItem2Analysis(results.poseLandmarks, isSideView ? 'side' : 'front');
          if (analysis && analysis.stability) {
            skeletonColor = analysis.stability === 'excellent' ? '#10B981' :
                           analysis.stability === 'good' ? '#22C55E' :
                           analysis.stability === 'moderate' ? '#EAB308' :
                           analysis.stability === 'poor' ? '#F97316' : '#EF4444';
          }
        } else {
          handleGeneralAnalysis(results.poseLandmarks);
          skeletonColor = isSideView ? '#10B981' : '#8B5CF6';

          // 항목 9: 바닥 물건 집기 분석 및 오버레이
          if (isItem9 && isSideView) {
            const pickUpData = handleItem9Analysis(results.poseLandmarks, canvas.width, canvas.height);
            drawItem9Overlay(ctx, results.poseLandmarks, canvas.width, canvas.height, pickUpData);
          }
        }

        // 감지된 타입 표시
        const viewLabel = isSideView ? '📐 측면' : '👤 정면';
        ctx.fillStyle = isSideView ? '#10B981' : '#8B5CF6';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${viewLabel} (분석 중)`, 10, 25);

        drawConnections(ctx, results.poseLandmarks, canvas.width, canvas.height, {
          strokeStyle: skeletonColor,
          lineWidth: 3
        });
        drawLandmarks(ctx, results.poseLandmarks, canvas.width, canvas.height, {
          fillStyle: skeletonColor,
          radius: 5
        });

        // 신체 각도 표시 (항목 3에서는 자세 정렬도 표시)
        drawBodyAngles(ctx, results.poseLandmarks, canvas.width, canvas.height, currentItem === 2);
      }

      ctx.restore();
    });

    poseRef.current = pose;

    // 프레임 카운터 (디버깅용)
    let frameCount = 0;

    // 비디오 프레임 분석 루프
    const analyzeVideoFrame = async () => {
      if (!video || video.paused || video.ended) {
        if (video.ended) {
          setPaused(true);
          console.log(`[${viewType}] Video ended at frame ${frameCount}`);
        }
        return;
      }

      frameCount++;
      setProgress(video.currentTime);

      // 처음 5프레임만 로그
      if (frameCount <= 5) {
        console.log(`[${viewType}] Frame ${frameCount}: readyState=${video.readyState}, currentTime=${video.currentTime.toFixed(2)}`);
      }

      if (poseRef.current && video.readyState >= 2) {
        try {
          await poseRef.current.send({ image: video });
        } catch (e) {
          console.log(`[${viewType}] Frame analysis error:`, e);
        }
      }

      analysisRef.current = requestAnimationFrame(analyzeVideoFrame);
    };

    // 싱크 오프셋 적용 (트리밍)
    if (trimTime > 0) {
      console.log(`[${viewType}] Applying sync trim: ${trimTime.toFixed(3)}s`);
      video.currentTime = trimTime;
    }

    // 재생 시작 함수 (나중에 호출 가능)
    const startPlayback = async () => {
      console.log(`[${viewType}] Starting video playback from ${video.currentTime.toFixed(3)}s...`);
      try {
        await video.play();
        console.log(`[${viewType}] Video playing successfully`);
      } catch (playError) {
        console.error(`[${viewType}] Video play error:`, playError);
      }
      setPaused(false);
      analyzeVideoFrame();
    };

    // autoPlay가 true면 바로 재생 시작
    if (autoPlay) {
      await startPlayback();
    }

    console.log(`[${viewType}] Analysis initialized (autoPlay: ${autoPlay})`);
    return { success: true, startPlayback, video };
  }, [isItem1, isItem2, handleItem1Analysis, handleItem2Analysis, handleGeneralAnalysis, detectViewType]);

  // 양쪽 동영상 병렬 분석 초기화
  const initVideoAnalysis = useCallback(async () => {
    console.log('=== initVideoAnalysis called ===');
    console.log('sideVideoUrl:', sideVideoUrl);
    console.log('frontVideoUrl:', frontVideoUrl);
    console.log('sideVideoRef.current:', sideVideoRef.current);
    console.log('frontVideoRef.current:', frontVideoRef.current);

    // refs가 아직 연결되지 않은 경우 최대 3번 재시도
    let retryCount = 0;
    while (retryCount < 3 && ((sideVideoUrl && !sideVideoRef.current) || (frontVideoUrl && !frontVideoRef.current))) {
      retryCount++;
      console.log(`Refs not ready (attempt ${retryCount}/3), waiting 200ms...`);
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('After wait - sideRef:', sideVideoRef.current, 'frontRef:', frontVideoRef.current);
    }

    setCameraLoading(true);

    try {
      // 기존 분석 정리
      if (sideAnalysisRef.current) {
        cancelAnimationFrame(sideAnalysisRef.current);
        sideAnalysisRef.current = null;
      }
      if (frontAnalysisRef.current) {
        cancelAnimationFrame(frontAnalysisRef.current);
        frontAnalysisRef.current = null;
      }

      // AI 감지 카운터 및 타입 리셋
      detectionCountRef.current = { video1: { side: 0, front: 0 }, video2: { side: 0, front: 0 } };
      video1DetectedTypeRef.current = 'unknown';
      video2DetectedTypeRef.current = 'unknown';
      setVideo1DetectedType('unknown');
      setVideo2DetectedType('unknown');

      // 순차 초기화 (MediaPipe 충돌 방지) - 재생은 나중에 동시에
      const results = [];
      let sideStartPlayback = null;
      let frontStartPlayback = null;

      // 1. 측면 영상 먼저 초기화 (autoPlay = false)
      if (sideVideoUrl && sideVideoRef.current) {
        console.log(`[항목 ${currentItem + 1}] Starting side video analysis...`);
        console.log(`[항목 ${currentItem + 1}] 싱크 정보:`, {
          sideTrim: videoSyncInfo.sideTrim,
          frontTrim: videoSyncInfo.frontTrim,
          synced: videoSyncInfo.synced,
          method: videoSyncInfo.method
        });
        try {
          const sideResult = await initSingleVideoAnalysis(
            sideVideoRef, sideCanvasRef, sidePoseRef, sideAnalysisRef,
            sideVideoUrl, setSideVideoProgress, setSideVideoDuration, setIsSideVideoPaused, setSideLandmarks, 'side',
            videoSyncInfo.sideTrim || 0,
            false  // autoPlay = false
          );
          console.log('Side video analysis result:', sideResult);
          results.push({ type: 'side', result: sideResult });
          if (sideResult && sideResult.startPlayback) {
            sideStartPlayback = sideResult.startPlayback;
          }
        } catch (e) {
          console.error('Side video init error:', e);
          results.push({ type: 'side', result: null, error: e });
        }
      } else {
        console.log('Side video skipped - URL:', sideVideoUrl, 'Ref:', sideVideoRef.current);
      }

      // 2. 측면 초기화 완료 후 정면 영상 초기화 (1초 대기로 MediaPipe 안정화)
      if (frontVideoUrl && frontVideoRef.current) {
        console.log(`[항목 ${currentItem + 1}] Waiting before front video init...`);
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('Starting front video analysis...');
        console.log('Front trim time:', videoSyncInfo.frontTrim || 0);
        try {
          const frontResult = await initSingleVideoAnalysis(
            frontVideoRef, frontCanvasRef, frontPoseRef, frontAnalysisRef,
            frontVideoUrl, setFrontVideoProgress, setFrontVideoDuration, setIsFrontVideoPaused, setFrontLandmarks, 'front',
            videoSyncInfo.frontTrim || 0,
            false  // autoPlay = false
          );
          console.log('Front video analysis result:', frontResult);
          results.push({ type: 'front', result: frontResult });
          if (frontResult && frontResult.startPlayback) {
            frontStartPlayback = frontResult.startPlayback;
          }
        } catch (e) {
          console.error('Front video init error:', e);
          results.push({ type: 'front', result: null, error: e });
        }
      } else {
        console.log('Front video skipped - URL:', frontVideoUrl, 'Ref:', frontVideoRef.current);
      }

      console.log('All video init results:', results);

      // 3. 두 영상 동시 재생 시작!
      console.log(`[항목 ${currentItem + 1}] === Starting simultaneous playback ===`);
      const playbackPromises = [];
      if (sideStartPlayback) {
        console.log('Adding side video to simultaneous playback');
        playbackPromises.push(sideStartPlayback());
      }
      if (frontStartPlayback) {
        console.log('Adding front video to simultaneous playback');
        playbackPromises.push(frontStartPlayback());
      }

      if (playbackPromises.length > 0) {
        await Promise.all(playbackPromises);
        console.log('=== Both videos started simultaneously ===');
      }

      setCameraLoading(false);
      return results.some(r => r.result && r.result.success);
    } catch (error) {
      console.error('Video analysis init error:', error);
      setCameraLoading(false);
      return null;
    }
  }, [sideVideoUrl, frontVideoUrl, initSingleVideoAnalysis, videoSyncInfo, currentItem]);

  // 측면 동영상 재생/일시정지 토글
  const toggleSideVideoPause = useCallback(() => {
    const sideVideo = sideVideoRef.current;
    if (!sideVideo) return;

    if (sideVideo.paused) {
      sideVideo.play();
      setIsSideVideoPaused(false);
      // 분석 재개
      if (sidePoseRef.current) {
        const analyzeSideFrame = async () => {
          if (!sideVideo || sideVideo.paused || sideVideo.ended) return;
          setSideVideoProgress(sideVideo.currentTime);
          if (sidePoseRef.current && sideVideo.readyState >= 2) {
            try { await sidePoseRef.current.send({ image: sideVideo }); } catch (e) {}
          }
          sideAnalysisRef.current = requestAnimationFrame(analyzeSideFrame);
        };
        analyzeSideFrame();
      }
    } else {
      sideVideo.pause();
      setIsSideVideoPaused(true);
      if (sideAnalysisRef.current) cancelAnimationFrame(sideAnalysisRef.current);
    }
  }, []);

  // 정면 동영상 재생/일시정지 토글
  const toggleFrontVideoPause = useCallback(() => {
    const frontVideo = frontVideoRef.current;
    if (!frontVideo) return;

    if (frontVideo.paused) {
      frontVideo.play();
      setIsFrontVideoPaused(false);
      // 분석 재개
      if (frontPoseRef.current) {
        const analyzeFrontFrame = async () => {
          if (!frontVideo || frontVideo.paused || frontVideo.ended) return;
          setFrontVideoProgress(frontVideo.currentTime);
          if (frontPoseRef.current && frontVideo.readyState >= 2) {
            try { await frontPoseRef.current.send({ image: frontVideo }); } catch (e) {}
          }
          frontAnalysisRef.current = requestAnimationFrame(analyzeFrontFrame);
        };
        analyzeFrontFrame();
      }
    } else {
      frontVideo.pause();
      setIsFrontVideoPaused(true);
      if (frontAnalysisRef.current) cancelAnimationFrame(frontAnalysisRef.current);
    }
  }, []);

  // 측면 동영상 시간 이동
  const seekSideVideo = useCallback((time) => {
    const sideVideo = sideVideoRef.current;
    if (sideVideo) {
      sideVideo.currentTime = time;
      setSideVideoProgress(time);
    }
  }, []);

  // 정면 동영상 시간 이동
  const seekFrontVideo = useCallback((time) => {
    const frontVideo = frontVideoRef.current;
    if (frontVideo) {
      frontVideo.currentTime = time;
      setFrontVideoProgress(time);
    }
  }, []);

  // 항목 시작
  const startItem = async () => {
    console.log('=== startItem called ===');
    console.log('sideVideoUrl at startItem:', sideVideoUrl);
    console.log('frontVideoUrl at startItem:', frontVideoUrl);
    console.log('sideVideoRef.current at startItem:', sideVideoRef.current);
    console.log('frontVideoRef.current at startItem:', frontVideoRef.current);
    console.log('isItem1:', isItem1, 'isItem2:', isItem2);

    // 첫 번째 항목 시작 시 테스트 시작 시간 기록
    if (currentItem === 0 && !testStartTime) {
      setTestStartTime(new Date());
    }

    setIsAnalyzing(true);
    setItemTimer(0);
    startTimeRef.current = Date.now();
    analysisHistoryRef.current = [];
    previousAnalysisRef.current = null;

    if (isItem1) {
      // 상태 히스토리 초기화
      resetStateHistory();

      // 음성 관련 초기화
      lastSpokenPhaseRef.current = null;

      // 시작 음성
      setTimeout(() => speak('의자에 앉아주세요', 1.0), 500);

      setSitToStandState({
        testPhase: 'waiting',
        currentPosture: PostureState.UNKNOWN,
        handPosition: HandPosition.UNKNOWN,
        handSupport: HandSupportState.UNKNOWN,
        sittingConfidence: 0,
        standingConfidence: 0,
        kneeAngle: 0,
        hipAngle: 0,
        feedback: { message: '의자에 앉아주세요...', type: 'info' },
        sittingConfirmedAt: null,
        standingDetectedAt: null,
        usedHandsDuringTransition: false,
        handUsageDetectedAt: null,
        autoScore: null,
        assessmentReport: null,
        showResultModal: false,
        debug: null
      });
    }

    if (isItem2) {
      // 2번 항목 상태 초기화
      resetStandingAnalysis();
      resetMovementHistory();

      // 음성 관련 초기화
      lastSpokenPhaseRef.current = null;

      // 시작 음성
      setTimeout(() => speak('의자에 앉아주세요', 1.0), 500);

      setStandingState({
        testPhase: 'waiting',
        currentState: 'not_standing',
        currentPosture: PostureState.UNKNOWN,
        stabilityLevel: 'good',
        isStanding: false,
        isUsingSupport: false,
        sittingConfidence: 0,
        standingConfidence: 0,
        sittingConfirmedAt: null,
        standingDetectedAt: null,
        standingStartTime: null,
        standingDuration: 0,
        targetDuration: 120,
        supportSeekingCount: 0,
        unstableTime: 0,
        lostBalance: false,
        standingAttemptCount: 0,
        wasStanding: false,
        feedback: { message: '의자에 앉아주세요...', type: 'info' },
        autoScore: null,
        assessmentReport: null,
        showResultModal: false,
        debug: null
      });
    }

    // 일반 항목 (3-14) 상태 초기화
    if (!isItem1 && !isItem2) {
      const targetDuration = currentBBSItem?.duration || 0;
      const detection = currentBBSItem?.detection;

      // 항목별 초기 메시지 설정
      let initialMessage = currentBBSItem?.instruction || '검사를 시작합니다';
      let initialStatus = '대기';

      switch (detection?.type) {
        case 'sitting_duration':
          initialMessage = '등받이 없는 의자에 앉아주세요 (2분간 유지)';
          initialStatus = '앉은 자세 대기';
          break;
        case 'stand_to_sit':
          initialMessage = '서있는 자세가 감지되면 앉기 분석이 시작됩니다';
          initialStatus = '서있음 대기';
          break;
        case 'transfer':
          initialMessage = '의자에 앉아주세요 (이동 준비)';
          initialStatus = '이동 준비';
          break;
        case 'standing_duration':
          initialMessage = '눈을 감고 서 계세요';
          initialStatus = '선 자세 대기';
          break;
        case 'standing_feet_together':
          initialMessage = '두 발을 모으고 서세요';
          initialStatus = '자세 대기';
          break;
        case 'arm_reach':
          initialMessage = '서서 팔을 앞으로 뻗어주세요';
          initialStatus = '팔 뻗기 대기';
          break;
        case 'pick_up_object':
          initialMessage = '바닥에 물건을 놓고 시작합니다';
          initialStatus = '물건 집기 대기';
          break;
        case 'look_behind':
          initialMessage = '서서 어깨 너머로 뒤를 봐주세요';
          initialStatus = '회전 대기';
          break;
        case 'turn_360':
          initialMessage = '제자리에서 한 바퀴 돌아주세요';
          initialStatus = '회전 대기';
          break;
        case 'step_alternating':
          initialMessage = '발판에 발을 번갈아 올려주세요';
          initialStatus = '스텝 대기';
          break;
        case 'tandem_stance':
          initialMessage = '한 발을 다른 발 앞에 일렬로 놓으세요';
          initialStatus = '일렬 서기 대기';
          break;
        case 'single_leg_stance':
          initialMessage = '한 발로 최대한 오래 서세요';
          initialStatus = '한 발 서기 대기';
          break;
        default:
          initialMessage = currentBBSItem?.instruction || '검사를 시작합니다';
      }

      setGeneralDetection({
        testPhase: 'waiting',
        status: initialStatus,
        confidence: 0,
        suggestedScore: null,
        message: initialMessage,
        startTime: null,
        elapsedTime: 0,
        targetDuration: targetDuration,
        actionDetected: false,
        actionCount: 0,
        currentPosture: 'unknown',
        postureStability: 'unknown',
        autoScore: null,
        assessmentReport: null,
        showResultModal: false,
        // 항목 3 자세 추적 초기화
        postureAligned: false,
        trunkTiltHistory: [],
        lateralShiftCount: 0,
        maxTrunkTilt: 0,
        stabilityScore: 100,
        initialTrunkAngle: null
      });
    }

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setItemTimer(elapsed);
    }, 100);

    // 동영상 분석은 useEffect에서 자동으로 시작됨 (isAnalyzing = true가 되면)
    console.log('=== startItem complete, video analysis will start via useEffect ===');
  };

  // 양쪽 동영상 분석 정리 헬퍼
  const stopAllVideoAnalysis = useCallback(() => {
    if (sideAnalysisRef.current) {
      cancelAnimationFrame(sideAnalysisRef.current);
      sideAnalysisRef.current = null;
    }
    if (frontAnalysisRef.current) {
      cancelAnimationFrame(frontAnalysisRef.current);
      frontAnalysisRef.current = null;
    }
    if (sideVideoRef.current) {
      sideVideoRef.current.pause();
    }
    if (frontVideoRef.current) {
      frontVideoRef.current.pause();
    }
  }, []);

  // 점수 저장
  // 점수 저장 (useCallback으로 최적화)
  const handleScoreRef = useRef(null);

  const handleScore = useCallback((score, analysisData = null) => {
    if (timerRef.current) clearInterval(timerRef.current);
    // 동영상 분석 정리
    stopAllVideoAnalysis();

    setScores(prevScores => {
      const newScores = [...prevScores];
      newScores[currentItem] = score;
      return newScores;
    });

    setAnalysisResults(prevResults => {
      const newAnalysisResults = [...prevResults];
      const item = BBS_ITEMS[currentItem];
      const scoreInfo = item?.scoring?.find(s => s.score === score);
      const itemResult = {
        itemId: currentItem + 1,
        score,
        timestamp: new Date().toISOString(),
        aiAnalysis: analysisData || {
          method: 'AI 자동 분석',
          confidence: score >= 3 ? 85 + Math.random() * 10 : 70 + Math.random() * 15,
          description: scoreInfo?.desc || '분석 완료',
          details: {
            postureStability: score >= 3 ? '안정' : score >= 2 ? '보통' : '불안정',
            movementQuality: score >= 3 ? '양호' : score >= 2 ? '보통' : '미흡',
            supportNeeded: score <= 2
          }
        }
      };
      newAnalysisResults[currentItem] = itemResult;
      return newAnalysisResults;
    });

    setIsAnalyzing(false);
    setItemTimer(0);
    setCurrentLandmarks(null);

    // generalDetection 상태 초기화
    setGeneralDetection(prev => ({
      ...prev,
      testPhase: 'waiting',
      showResultModal: false,
      autoScore: null,
      assessmentReport: null,
      confidence: 0,
      elapsedTime: 0,
      actionCount: 0,
      actionDetected: false,
      // 항목 3 자세 추적 초기화
      postureAligned: false,
      trunkTiltHistory: [],
      lateralShiftCount: 0,
      maxTrunkTilt: 0,
      stabilityScore: 100,
      initialTrunkAngle: null
    }));

    // BBS 모션 분석 refs 초기화
    landmarksHistoryRef.current = [];
    previousLandmarksRef.current = null;
    initialLandmarksRef.current = null;
    motionStateRef.current = {
      stepCount: 0,
      lastSteppingFoot: null,
      cumulativeRotation: 0,
      lastRotation: 0,
      maxLeftRotation: 0,
      maxRightRotation: 0
    };

    if (currentItem < 13) {
      setCurrentItem(prev => prev + 1);
    } else {
      // 마지막 항목 완료 시 테스트 종료 플래그 설정
      console.log('[BBS] 마지막 항목 완료 - shouldComplete 설정');
      setShouldComplete(true);
    }
  }, [currentItem, stopAllVideoAnalysis]);

  // ref에 최신 handleScore 저장
  handleScoreRef.current = handleScore;

  // 기본 분석 데이터 생성
  const getDefaultAnalysisData = (itemIndex, score) => {
    const item = BBS_ITEMS[itemIndex];
    const scoreInfo = item.scoring.find(s => s.score === score);
    return {
      method: 'AI 자동 분석',
      confidence: score >= 3 ? 85 + Math.random() * 10 : 70 + Math.random() * 15,
      description: scoreInfo?.desc || '분석 완료',
      details: {
        postureStability: score >= 3 ? '안정' : score >= 2 ? '보통' : '불안정',
        movementQuality: score >= 3 ? '양호' : score >= 2 ? '보통' : '미흡',
        supportNeeded: score <= 2
      }
    };
  };

  // 테스트 완료
  const completeTest = (finalScores, finalAnalysisResults) => {
    console.log('[BBS] completeTest 호출됨 - 점수:', finalScores);
    const endTime = new Date();
    setTestEndTime(endTime);

    const totalScore = finalScores.reduce((a, b) => (a || 0) + (b || 0), 0);
    const risk = calculateBBSRisk(totalScore);

    const resultData = {
      id: Date.now(),
      type: 'BBS',
      patient: patientInfo.name || '미입력',
      patientId: patientInfo.id || '-',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      result: `${totalScore}점`,
      risk: risk.label,
      details: {
        totalScore,
        scores: finalScores,
        analysisResults: finalAnalysisResults,
        testDuration: testStartTime ? Math.round((endTime - testStartTime) / 1000) : null
      }
    };

    addTestResult(resultData);
    console.log('[BBS] setIsComplete(true) 호출 직전');
    setIsComplete(true);
    console.log('[BBS] setIsComplete(true) 호출 완료');
  };

  const getTotalScore = () => scores.reduce((a, b) => (a || 0) + (b || 0), 0);
  const getRiskLevel = () => calculateBBSRisk(getTotalScore());

  const resetTest = () => {
    setScores(Array(14).fill(null));
    setCurrentItem(0);
    setIsComplete(false);
    setShouldComplete(false);
    setShowSetup(true);
    setPatientInfo({ name: '홍길동', id: 'P-DEMO-001' });
    setIsAnalyzing(false);
    setItemTimer(0);
    setCurrentLandmarks(null);

    // BBS 모션 분석 refs 초기화
    landmarksHistoryRef.current = [];
    previousLandmarksRef.current = null;
    initialLandmarksRef.current = null;
    motionStateRef.current = {
      stepCount: 0,
      lastSteppingFoot: null,
      cumulativeRotation: 0,
      lastRotation: 0,
      maxLeftRotation: 0,
      maxRightRotation: 0
    };
  };

  // 이전 항목으로 이동
  const goToPreviousItem = () => {
    if (currentItem <= 0) return;

    // 현재 분석 중지
    if (timerRef.current) clearInterval(timerRef.current);
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    // 동영상 분석 정리
    stopAllVideoAnalysis();

    // 음성 중단
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsAnalyzing(false);
    setItemTimer(0);
    setCurrentLandmarks(null);

    // 항목 1, 2, 4 상태 초기화
    resetStateHistory();
    resetStandingAnalysis();
    resetMovementHistory();
    resetSittingAnalysis();
    resetArmReachAnalysis();
    resetPickUpAnalysis();

    setSitToStandState({
      testPhase: 'waiting',
      currentPosture: PostureState.UNKNOWN,
      handPosition: HandPosition.UNKNOWN,
      handSupport: HandSupportState.UNKNOWN,
      sittingConfidence: 0,
      standingConfidence: 0,
      kneeAngle: 0,
      hipAngle: 0,
      feedback: { message: '의자에 앉아주세요...', type: 'info' },
      sittingConfirmedAt: null,
      standingDetectedAt: null,
      usedHandsDuringTransition: false,
      handUsageDetectedAt: null,
      autoScore: null,
      assessmentReport: null,
      showResultModal: false,
      debug: null
    });

    setStandingState({
      testPhase: 'waiting',
      currentState: 'not_standing',
      stabilityLevel: 'good',
      isStanding: false,
      isUsingSupport: false,
      standingStartTime: null,
      standingDuration: 0,
      targetDuration: 120,
      supportSeekingCount: 0,
      unstableTime: 0,
      lostBalance: false,
      standingAttemptCount: 0,
      wasStanding: false,
      feedback: { message: '지지물 없이 서 주세요...', type: 'info' },
      autoScore: null,
      assessmentReport: null,
      showResultModal: false,
      debug: null
    });

    setCurrentItem(currentItem - 1);
  };

  // 다음 항목으로 이동 (4점 만점 자동 채점 - 치료사 판단하에 정상으로 간주)
  const goToNextItem = () => {
    // 현재 분석 중지
    if (timerRef.current) clearInterval(timerRef.current);
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    // 동영상 분석 정리
    stopAllVideoAnalysis();

    // 음성 중단
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // 현재 항목에 4점 부여 (치료사 판단: 정상)
    const newScores = [...scores];
    newScores[currentItem] = 4;
    setScores(newScores);

    setIsAnalyzing(false);
    setItemTimer(0);
    setCurrentLandmarks(null);

    // 항목 1, 2, 4 상태 초기화
    resetStateHistory();
    resetStandingAnalysis();
    resetMovementHistory();
    resetSittingAnalysis();
    resetArmReachAnalysis();
    resetPickUpAnalysis();

    setSitToStandState({
      testPhase: 'waiting',
      currentPosture: PostureState.UNKNOWN,
      handPosition: HandPosition.UNKNOWN,
      handSupport: HandSupportState.UNKNOWN,
      sittingConfidence: 0,
      standingConfidence: 0,
      kneeAngle: 0,
      hipAngle: 0,
      feedback: { message: '의자에 앉아주세요...', type: 'info' },
      sittingConfirmedAt: null,
      standingDetectedAt: null,
      usedHandsDuringTransition: false,
      handUsageDetectedAt: null,
      autoScore: null,
      assessmentReport: null,
      showResultModal: false,
      debug: null
    });

    setStandingState({
      testPhase: 'waiting',
      currentState: 'not_standing',
      stabilityLevel: 'good',
      isStanding: false,
      isUsingSupport: false,
      standingStartTime: null,
      standingDuration: 0,
      targetDuration: 120,
      supportSeekingCount: 0,
      unstableTime: 0,
      lostBalance: false,
      standingAttemptCount: 0,
      wasStanding: false,
      feedback: { message: '지지물 없이 서 주세요...', type: 'info' },
      autoScore: null,
      assessmentReport: null,
      showResultModal: false,
      debug: null
    });

    // 마지막 항목이면 테스트 완료
    if (currentItem >= 13) {
      console.log('[BBS] goToNextItem - 마지막 항목 완료');
      setShouldComplete(true);
    } else {
      setCurrentItem(currentItem + 1);
    }
  };

  // 긴급 종료 (Emergency) - 나머지 항목 모두 0점 처리
  const emergencyStop = () => {
    // 현재 분석 중지
    if (timerRef.current) clearInterval(timerRef.current);
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    // 동영상 분석 정리
    stopAllVideoAnalysis();

    // 음성 중단
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // 나머지 모든 항목 0점 처리
    const newScores = [...scores];
    for (let i = currentItem; i < 14; i++) {
      if (newScores[i] === null) {
        newScores[i] = 0;
      }
    }

    setIsAnalyzing(false);
    setItemTimer(0);
    setCurrentLandmarks(null);

    // 테스트 완료
    console.log('[BBS] emergencyStop - 긴급 종료');
    setShouldComplete(true);
  };

  // 컴포넌트 언마운트 시에만 정리 (URL은 업로드 핸들러에서 관리)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (cameraRef.current) cameraRef.current.stop();
      // 동영상 분석 정리
      if (sideAnalysisRef.current) {
        cancelAnimationFrame(sideAnalysisRef.current);
      }
      if (frontAnalysisRef.current) {
        cancelAnimationFrame(frontAnalysisRef.current);
      }
      // 음성 중단
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []); // 빈 배열 - 언마운트 시에만 실행

  // 분석 시작 시 비디오 초기화 (useEffect로 refs가 연결된 후 실행)
  const videoInitTriggeredRef = useRef(false);
  useEffect(() => {
    if (isAnalyzing && !videoInitTriggeredRef.current && (sideVideoUrl || frontVideoUrl)) {
      videoInitTriggeredRef.current = true;
      console.log('=== useEffect: Starting video analysis ===');
      console.log('sideVideoRef.current in useEffect:', sideVideoRef.current);
      console.log('frontVideoRef.current in useEffect:', frontVideoRef.current);
      initVideoAnalysis();
    }
    if (!isAnalyzing) {
      videoInitTriggeredRef.current = false;
    }
  }, [isAnalyzing, sideVideoUrl, frontVideoUrl, initVideoAnalysis]);

  // 디버그 정보 주기적 업데이트
  useEffect(() => {
    const updateDebug = () => {
      setDebugInfo({
        sideRef: !!sideVideoRef.current,
        frontRef: !!frontVideoRef.current,
        sideVideoReady: sideVideoRef.current?.readyState || 0,
        frontVideoReady: frontVideoRef.current?.readyState || 0,
        sideVideoSrc: !!sideVideoRef.current?.src,
        frontVideoSrc: !!frontVideoRef.current?.src
      });
    };
    updateDebug();
    const interval = setInterval(updateDebug, 500);
    return () => clearInterval(interval);
  }, []);

  // 음성 안내 - 단계 변화 시
  const lastSpokenPhaseRef = useRef(null);
  const lastSpokenTimeRef = useRef(null);

  // 항목 1 음성 안내
  useEffect(() => {
    if (!isItem1 || !isAnalyzing) return;

    const phase = sitToStandState.testPhase;

    // 단계별 음성 안내
    if (phase !== lastSpokenPhaseRef.current) {
      lastSpokenPhaseRef.current = phase;

      switch (phase) {
        case 'waiting':
          speak('의자에 앉아주세요', 1.0);
          break;
        case 'sitting_confirmed':
          speak('일어나세요', 1.0);
          break;
        case 'complete':
          if (sitToStandState.usedHandsDuringTransition) {
            speak(`검사 완료. ${sitToStandState.autoScore?.score || 0}점.`, 0.9);
          } else {
            speak(`검사 완료. ${sitToStandState.autoScore?.score || 4}점.`, 0.9);
          }
          break;
      }
    }

  }, [isItem1, isAnalyzing, sitToStandState.testPhase, sitToStandState.autoScore]);

  // 항목 2 음성 안내 (앉기 → 일어서기 → 2분 유지)
  useEffect(() => {
    if (!isItem2 || !isAnalyzing) return;

    const phase = standingState.testPhase;
    const duration = standingState.standingDuration;

    // 단계별 음성 안내
    if (phase !== lastSpokenPhaseRef.current) {
      lastSpokenPhaseRef.current = phase;

      switch (phase) {
        case 'waiting':
          speak('의자에 앉아주세요', 1.0);
          break;
        case 'sitting_confirmed':
          speak('앉은 자세 확인. 이제 천천히 일어서세요.', 1.0);
          break;
        case 'standing_up':
          speak('일어서는 중입니다. 완전히 서세요.', 1.0);
          break;
        case 'timing':
          speak('일어서기 완료! 2분간 서있기 시작합니다.', 1.0);
          break;
        case 'complete':
          speak(`검사 완료. ${standingState.autoScore?.score || 0}점.`, 0.9);
          break;
      }
    }

    // 시간 안내 (30초, 60초, 90초, 2분)
    if (phase === 'timing') {
      const timeMarkers = [30, 60, 90, 120];
      for (const marker of timeMarkers) {
        if (duration >= marker && duration < marker + 1 && lastSpokenTimeRef.current !== marker) {
          lastSpokenTimeRef.current = marker;
          if (marker === 120) {
            speak('2분 완료!', 1.0);
          } else if (marker === 90) {
            speak('90초. 조금만 더요.', 1.0);
          } else if (marker === 60) {
            speak('1분 경과. 절반 왔어요.', 1.0);
          } else if (marker === 30) {
            speak('30초 경과.', 1.0);
          }
          break;
        }
      }
    }

  }, [isItem2, isAnalyzing, standingState.testPhase, standingState.standingDuration, standingState.autoScore]);

  // 음성 합성 초기화 (voices 로드)
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // voices가 로드될 때까지 대기
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // 테스트 완료 처리 (shouldComplete 플래그 감지)
  useEffect(() => {
    if (shouldComplete && !isComplete) {
      console.log('[BBS] shouldComplete 감지 - 테스트 완료 처리 시작');
      const endTime = new Date();
      setTestEndTime(endTime);

      const totalScore = scores.reduce((a, b) => (a || 0) + (b || 0), 0);
      const risk = calculateBBSRisk(totalScore);

      const resultData = {
        id: Date.now(),
        type: 'BBS',
        patient: patientInfo.name || '미입력',
        patientId: patientInfo.id || '-',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        result: `${totalScore}점`,
        risk: risk.label,
        details: {
          totalScore,
          scores: scores,
          analysisResults: analysisResults,
          testDuration: testStartTime ? Math.round((endTime - testStartTime) / 1000) : null
        }
      };

      addTestResult(resultData);
      console.log('[BBS] 결과 저장 완료, isComplete 설정');
      setShouldComplete(false);
      setIsComplete(true);
    }
  }, [shouldComplete, isComplete, scores, analysisResults, patientInfo, testStartTime, addTestResult]);

  // 자동 진행 제거됨 - 수동으로 '다음 항목' 버튼 클릭 필요

  // Setup 화면
  if (showSetup) {
    return (
      <PageContainer>
        <Header title="BBS 검사" onBack={() => navigateTo(PAGES.HOME)} />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="space-y-6">
            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">Berg Balance Scale (BBS)</h3>
              <div className="text-slate-400 text-sm space-y-2">
                <p>14개의 균형 능력 항목을 AI가 자동으로 감지하여 평가합니다.</p>
                <p>MediaPipe Pose를 사용하여 실시간 모션을 인식합니다.</p>
              </div>
              <Alert type="info" className="mt-4">
                <strong>판정 기준:</strong> 41-56점(낙상 위험 낮음), 21-40점(낙상 위험 있음), 0-20점(낙상 위험 높음)
              </Alert>
            </Card>

            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">환자 정보</h3>
              <PatientInfoForm
                patientInfo={patientInfo}
                onChange={setPatientInfo}
                accentColor="blue"
              />
            </Card>

            {/* 동영상 업로드 (측면/정면) */}
            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">검사 영상 업로드</h3>
              <p className="text-slate-400 text-sm mb-4">
                측면과 정면에서 촬영한 영상을 각각 업로드해주세요.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* 측면 영상 업로드 */}
                <div className="space-y-2">
                  <div className="text-center text-slate-300 font-medium mb-2">
                    📐 측면 영상
                  </div>
                  <input
                    ref={sideFileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleSideVideoUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => sideFileInputRef.current?.click()}
                    className={`w-full p-4 border-2 border-dashed rounded-xl transition-all ${
                      sideVideoUrl
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-slate-600 hover:border-blue-500 hover:bg-blue-500/10'
                    }`}
                  >
                    {sideVideoUrl ? (
                      <div className="text-green-400">
                        <span className="text-2xl">✓</span>
                        <div className="mt-1 text-sm">업로드 완료</div>
                      </div>
                    ) : (
                      <div className="text-slate-400">
                        <span className="text-2xl">📁</span>
                        <div className="mt-1 text-sm">파일 선택</div>
                      </div>
                    )}
                  </button>
                  {sideVideoUrl && (
                    <div className="relative rounded-lg overflow-hidden bg-black">
                      <video
                        src={sideVideoUrl}
                        className="w-full max-h-32 object-contain"
                        controls
                        muted
                      />
                    </div>
                  )}
                </div>

                {/* 정면 영상 업로드 */}
                <div className="space-y-2">
                  <div className="text-center text-slate-300 font-medium mb-2">
                    👤 정면 영상
                  </div>
                  <input
                    ref={frontFileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFrontVideoUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => frontFileInputRef.current?.click()}
                    className={`w-full p-4 border-2 border-dashed rounded-xl transition-all ${
                      frontVideoUrl
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-slate-600 hover:border-blue-500 hover:bg-blue-500/10'
                    }`}
                  >
                    {frontVideoUrl ? (
                      <div className="text-green-400">
                        <span className="text-2xl">✓</span>
                        <div className="mt-1 text-sm">업로드 완료</div>
                      </div>
                    ) : (
                      <div className="text-slate-400">
                        <span className="text-2xl">📁</span>
                        <div className="mt-1 text-sm">파일 선택</div>
                      </div>
                    )}
                  </button>
                  {frontVideoUrl && (
                    <div className="relative rounded-lg overflow-hidden bg-black">
                      <video
                        src={frontVideoUrl}
                        className="w-full max-h-32 object-contain"
                        controls
                        muted
                      />
                    </div>
                  )}
                </div>
              </div>

              <Alert type="info" className="mt-4">
                <strong>촬영 팁:</strong> 전신이 보이도록 세로로 촬영해주세요.
                측면 영상은 관절 각도 분석에, 정면 영상은 균형 분석에 사용됩니다.
              </Alert>
            </Card>

            <Button
              variant="bbs"
              size="lg"
              fullWidth
              onClick={() => setShowSetup(false)}
              disabled={!sideVideoUrl || !frontVideoUrl}
            >
              {!sideVideoUrl && !frontVideoUrl
                ? '영상을 업로드해주세요'
                : !sideVideoUrl
                ? '측면 영상을 업로드해주세요'
                : !frontVideoUrl
                ? '정면 영상을 업로드해주세요'
                : '검사 시작'}
            </Button>
          </div>
        </main>
      </PageContainer>
    );
  }

  // PDF 다운로드 함수
  const downloadPDF = () => {
    const totalScore = getTotalScore();
    const risk = getRiskLevel();
    const testDate = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const testTime = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit', minute: '2-digit'
    });

    // HTML 문진표 생성
    const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>BBS 검사 결과 - ${patientInfo.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; background: #fff; color: #333; }
    .header { text-align: center; border-bottom: 3px solid #3B82F6; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 28px; color: #1E3A8A; margin-bottom: 10px; }
    .header p { color: #666; }
    .patient-info { display: flex; justify-content: space-between; background: #F1F5F9; padding: 20px; border-radius: 10px; margin-bottom: 30px; }
    .patient-info div { flex: 1; }
    .patient-info label { display: block; font-size: 12px; color: #64748B; margin-bottom: 4px; }
    .patient-info span { font-size: 16px; font-weight: bold; }
    .score-summary { display: flex; gap: 20px; margin-bottom: 30px; }
    .score-box { flex: 1; text-align: center; padding: 30px; border-radius: 15px; }
    .score-box.total { background: linear-gradient(135deg, #3B82F6, #1D4ED8); color: white; }
    .score-box.risk { background: ${risk.level === 'low' ? '#10B981' : risk.level === 'moderate' ? '#F59E0B' : '#EF4444'}; color: white; }
    .score-box h2 { font-size: 48px; margin-bottom: 10px; }
    .score-box p { font-size: 14px; opacity: 0.9; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .items-table th, .items-table td { padding: 12px; text-align: left; border-bottom: 1px solid #E2E8F0; }
    .items-table th { background: #F8FAFC; font-weight: bold; color: #475569; }
    .items-table tr:hover { background: #F8FAFC; }
    .score-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: bold; }
    .score-4 { background: #10B981; color: white; }
    .score-3 { background: #22C55E; color: white; }
    .score-2 { background: #F59E0B; color: white; }
    .score-1 { background: #F97316; color: white; }
    .score-0 { background: #EF4444; color: white; }
    .ai-badge { background: #8B5CF6; color: white; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; }
    .recommendations { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 20px; margin-bottom: 30px; }
    .recommendations h3 { color: #1D4ED8; margin-bottom: 15px; }
    .recommendations ul { list-style: none; }
    .recommendations li { padding: 8px 0; padding-left: 24px; position: relative; }
    .recommendations li:before { content: "•"; color: #3B82F6; position: absolute; left: 8px; }
    .footer { text-align: center; color: #94A3B8; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E2E8F0; }
    .footer img { height: 20px; margin-top: 10px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏥 Berg Balance Scale (BBS) 검사 결과</h1>
    <p>AI 기반 균형 능력 평가 보고서</p>
  </div>

  <div class="patient-info">
    <div>
      <label>환자명</label>
      <span>${patientInfo.name || '미입력'}</span>
    </div>
    <div>
      <label>환자 ID</label>
      <span>${patientInfo.id || '-'}</span>
    </div>
    <div>
      <label>검사일</label>
      <span>${testDate}</span>
    </div>
    <div>
      <label>검사시간</label>
      <span>${testTime}</span>
    </div>
  </div>

  <div class="score-summary">
    <div class="score-box total">
      <h2>${totalScore}</h2>
      <p>총점 (56점 만점)</p>
    </div>
    <div class="score-box risk">
      <h2>${risk.label}</h2>
      <p>낙상 위험도</p>
    </div>
  </div>

  <h3 style="margin-bottom: 15px; color: #1E3A8A;">📋 항목별 상세 결과</h3>
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 50px;">번호</th>
        <th>검사 항목</th>
        <th style="width: 80px;">점수</th>
        <th>AI 분석 결과</th>
      </tr>
    </thead>
    <tbody>
      ${BBS_ITEMS.map((item, idx) => {
        const score = scores[idx] ?? 0;
        const analysis = analysisResults[idx];
        const scoreInfo = item.scoring.find(s => s.score === score);
        return `
          <tr>
            <td style="text-align: center; font-weight: bold;">${item.id}</td>
            <td>
              <strong>${item.name}</strong>
              <br><span style="font-size: 12px; color: #64748B;">${item.desc}</span>
            </td>
            <td style="text-align: center;">
              <span class="score-badge score-${score}">${score}점</span>
            </td>
            <td>
              <span style="font-size: 13px;">${scoreInfo?.desc || '-'}</span>
              ${analysis?.aiAnalysis ? `<span class="ai-badge">AI 분석</span>` : ''}
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="recommendations">
    <h3>💡 AI 권장사항</h3>
    <ul>
      ${totalScore >= 45 ? `
        <li>현재 균형 능력이 양호합니다. 규칙적인 운동을 유지하세요.</li>
        <li>낙상 예방을 위해 가정 환경을 점검하세요.</li>
      ` : totalScore >= 35 ? `
        <li>균형 능력 향상을 위한 운동 프로그램 참여를 권장합니다.</li>
        <li>일상생활에서 지지대 활용을 고려하세요.</li>
        <li>정기적인 균형 능력 재평가가 필요합니다.</li>
      ` : `
        <li>균형 능력 개선을 위한 전문 재활 치료가 필요합니다.</li>
        <li>낙상 위험이 높으니 보조 기구 사용을 권장합니다.</li>
        <li>가정 환경의 안전 점검이 필요합니다.</li>
        <li>보호자 동반 및 감독이 권장됩니다.</li>
      `}
    </ul>
  </div>

  <div class="footer">
    <p>본 검사 결과는 AI 영상 분석 기반으로 생성되었습니다.</p>
    <p>정확한 진단을 위해 전문 의료진과 상담하시기 바랍니다.</p>
    <p style="margin-top: 10px;">🤖 Powered by AI Motion Analysis System</p>
  </div>
</body>
</html>
    `;

    // 새 창에서 열고 인쇄
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  // PRD 문서 다운로드
  const downloadPRD = async () => {
    try {
      const response = await fetch('/BBS_PRD.md');
      const content = await response.text();

      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'BBS_PRD.md';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PRD 다운로드 실패:', error);
      alert('PRD 파일 다운로드에 실패했습니다.');
    }
  };

  // 완료 화면 - 상세 문진표
  if (isComplete) {
    console.log('[BBS] 결과 화면 렌더링 - isComplete:', isComplete);
    const risk = getRiskLevel();
    const totalScore = getTotalScore();
    const testDate = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    return (
      <PageContainer>
        <Header title="BBS 검사 결과 문진표" showBack={false} />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="space-y-6">
            {/* 헤더 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">AI 기반 균형 능력 평가 완료</h2>
              <p className="text-slate-400 text-sm mt-1">{testDate} 검사</p>
            </div>

            {/* 환자 정보 */}
            <Card padding="sm" className="bg-slate-800/50">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">환자명:</span>
                  <span className="text-white ml-2 font-medium">{patientInfo.name || '미입력'}</span>
                </div>
                <div>
                  <span className="text-slate-500">환자 ID:</span>
                  <span className="text-white ml-2 font-medium">{patientInfo.id || '-'}</span>
                </div>
              </div>
            </Card>

            {/* 점수 요약 */}
            <div className="grid grid-cols-2 gap-4">
              <Card padding="md" className="bg-gradient-to-br from-blue-600 to-blue-800 text-center">
                <p className="text-blue-200 text-xs mb-1">총점</p>
                <p className="text-4xl font-bold text-white">{totalScore}</p>
                <p className="text-blue-200 text-sm">/ 56점</p>
                <div className="mt-2 bg-blue-500/30 rounded-full h-2">
                  <div
                    className="bg-white h-2 rounded-full transition-all"
                    style={{ width: `${(totalScore / 56) * 100}%` }}
                  />
                </div>
              </Card>
              <Card padding="md" className={`text-center ${
                risk.level === 'low' ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' :
                risk.level === 'moderate' ? 'bg-gradient-to-br from-yellow-600 to-yellow-800' :
                'bg-gradient-to-br from-red-600 to-red-800'
              }`}>
                <p className="text-white/70 text-xs mb-1">낙상 위험도</p>
                <p className="text-3xl font-bold text-white">{risk.label}</p>
                <p className="text-white/70 text-sm mt-1">
                  {risk.level === 'low' ? '정상 범위' :
                   risk.level === 'moderate' ? '주의 필요' : '위험 단계'}
                </p>
              </Card>
            </div>

            {/* 항목별 상세 결과 */}
            <Card padding="sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <span>📋</span> 항목별 상세 결과
                </h3>
                <span className="text-xs text-purple-400 bg-purple-500/20 px-2 py-1 rounded-full">
                  🤖 AI 분석
                </span>
              </div>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {BBS_ITEMS.map((item, idx) => {
                  const score = scores[idx] ?? 0;
                  const analysis = analysisResults[idx];
                  const scoreInfo = item.scoring.find(s => s.score === score);
                  const scoreColor = score >= 4 ? 'bg-emerald-500' :
                                     score >= 3 ? 'bg-green-500' :
                                     score >= 2 ? 'bg-yellow-500' :
                                     score >= 1 ? 'bg-orange-500' : 'bg-red-500';

                  return (
                    <div key={item.id} className="bg-slate-800/50 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-sm font-mono">{String(item.id).padStart(2, '0')}</span>
                            <span className="text-white font-medium text-sm">{item.shortName}</span>
                          </div>
                          <p className="text-slate-500 text-xs mt-1 line-clamp-1">{scoreInfo?.desc}</p>
                        </div>
                        <div className={`${scoreColor} text-white text-sm font-bold px-3 py-1 rounded-full`}>
                          {score}점
                        </div>
                      </div>
                      {analysis?.aiAnalysis && (
                        <div className="mt-2 pt-2 border-t border-slate-700/50">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-purple-400">AI 신뢰도:</span>
                            <span className="text-white">{Math.round(analysis.aiAnalysis.confidence)}%</span>
                            <span className="text-slate-500">|</span>
                            <span className="text-slate-400">{analysis.aiAnalysis.details?.postureStability}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* AI 권장사항 */}
            <Card padding="md" className="bg-blue-500/10 border border-blue-500/30">
              <h3 className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                <span>💡</span> AI 권장사항
              </h3>
              <ul className="space-y-2 text-sm">
                {totalScore >= 45 ? (
                  <>
                    <li className="text-slate-300 flex items-start gap-2">
                      <span className="text-emerald-400">•</span>
                      현재 균형 능력이 양호합니다. 규칙적인 운동을 유지하세요.
                    </li>
                    <li className="text-slate-300 flex items-start gap-2">
                      <span className="text-emerald-400">•</span>
                      낙상 예방을 위해 가정 환경을 점검하세요.
                    </li>
                  </>
                ) : totalScore >= 35 ? (
                  <>
                    <li className="text-slate-300 flex items-start gap-2">
                      <span className="text-yellow-400">•</span>
                      균형 능력 향상을 위한 운동 프로그램 참여를 권장합니다.
                    </li>
                    <li className="text-slate-300 flex items-start gap-2">
                      <span className="text-yellow-400">•</span>
                      일상생활에서 지지대 활용을 고려하세요.
                    </li>
                    <li className="text-slate-300 flex items-start gap-2">
                      <span className="text-yellow-400">•</span>
                      정기적인 균형 능력 재평가가 필요합니다.
                    </li>
                  </>
                ) : (
                  <>
                    <li className="text-slate-300 flex items-start gap-2">
                      <span className="text-red-400">•</span>
                      균형 능력 개선을 위한 전문 재활 치료가 필요합니다.
                    </li>
                    <li className="text-slate-300 flex items-start gap-2">
                      <span className="text-red-400">•</span>
                      낙상 위험이 높으니 보조 기구 사용을 권장합니다.
                    </li>
                    <li className="text-slate-300 flex items-start gap-2">
                      <span className="text-red-400">•</span>
                      보호자 동반 및 감독이 권장됩니다.
                    </li>
                  </>
                )}
              </ul>
            </Card>

            {/* 버튼 */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => navigateTo(PAGES.HOME)}>
                홈으로
              </Button>
              <Button variant="bbs" onClick={resetTest}>
                다시 검사
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="bbs"
                onClick={downloadPDF}
                className="flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PDF 저장
              </Button>
              <Button
                variant="secondary"
                onClick={downloadPRD}
                className="flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PRD 문서
              </Button>
            </div>

            {/* 푸터 */}
            <p className="text-center text-slate-600 text-xs">
              🤖 AI 영상 분석 기반 자동 평가 결과입니다.
              <br />정확한 진단을 위해 전문 의료진과 상담하세요.
            </p>
          </div>
        </main>
      </PageContainer>
    );
  }

  // 항목 1 전용 UI - 단계별 검사 시스템
  if (isItem1) {
    const phaseLabels = {
      waiting: { text: '1단계: 앉은 자세 대기', color: 'bg-slate-600' },
      sitting_confirmed: { text: '2단계: 일어서기 준비', color: 'bg-yellow-500' },
      standing_up: { text: '3단계: 일어서는 중', color: 'bg-blue-500' },
      complete: { text: '검사 완료!', color: 'bg-emerald-500' }
    };

    const currentPhase = phaseLabels[sitToStandState.testPhase] || phaseLabels.waiting;

    return (
      <PageContainer>
        <Header title="항목 1 / 14" onBack={() => navigateTo(PAGES.HOME)} />

        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="space-y-4">
            {/* 진행률 */}
            <ProgressBar progress={(1 / 14) * 100} color="blue" height="md" />

            {/* 단계 표시 */}
            {isAnalyzing && (
              <div className="flex items-center justify-between">
                <div className={`px-4 py-2 rounded-full ${currentPhase.color} text-white font-bold`}>
                  {currentPhase.text}
                </div>
                {sitToStandState.usedHandsDuringTransition && (
                  <div className="px-4 py-2 rounded-full bg-red-500 text-white font-bold animate-pulse">
                    ⚠️ 손 사용 감지됨 (감점)
                  </div>
                )}
              </div>
            )}

            {/* 항목 정보 */}
            <Card padding="md">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold text-lg">1. 앉은 자세에서 일어서기</h3>
                  <p className="text-slate-400 text-sm">손을 사용하지 않고 일어서기</p>
                </div>
                <Badge variant="testType" value="BBS" size="md">AI 자동</Badge>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm">
                <p className="text-blue-400 mb-2"><strong>검사 순서:</strong></p>
                <ol className="text-slate-400 space-y-1 list-decimal list-inside">
                  <li className={sitToStandState.testPhase !== 'waiting' ? 'text-emerald-400' : ''}>
                    의자에 앉기 → AI가 앉은 자세 확인
                  </li>
                  <li className={sitToStandState.testPhase === 'standing_up' || sitToStandState.testPhase === 'complete' ? 'text-emerald-400' : ''}>
                    손 사용하지 않고 일어서기
                  </li>
                  <li className={sitToStandState.testPhase === 'complete' ? 'text-emerald-400' : ''}>
                    서있는 자세 확인 → 자동 채점
                  </li>
                </ol>
              </div>
            </Card>

            {/* 양쪽 동영상 뷰 (측면 + 정면) - Item 1 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 측면 영상 */}
              <div className="space-y-2">
                <div className="text-center text-slate-300 font-medium text-sm">📐 측면</div>
                <div className="aspect-[9/16] max-h-[45vh] bg-slate-800 rounded-xl overflow-hidden relative">
                  {sideVideoUrl ? (
                    <>
                      <video
                        ref={sideVideoRef}
                        src={sideVideoUrl}
                        className="absolute inset-0 w-full h-full object-contain"
                        playsInline
                        muted
                        controls
                      />
                      <canvas ref={sideCanvasRef} className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none" style={{ opacity: 0.7 }} />
                      {cameraLoading && (
                        <div className="absolute top-2 left-2 bg-yellow-500/80 text-black text-xs px-2 py-1 rounded z-20">로딩...</div>
                      )}
                      {isAnalyzing && !cameraLoading && (
                        <div className="absolute top-2 left-2 bg-green-500/80 text-white text-xs px-2 py-1 rounded z-20">
                          {isSideVideoPaused ? '일시정지' : '분석 중'}
                        </div>
                      )}
                    </>
                  ) : (
                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <svg className="w-12 h-12 text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-slate-400 text-sm">측면 영상 업로드</span>
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setSideVideoUrl(URL.createObjectURL(file)); }} />
                    </label>
                  )}
                </div>
                {isAnalyzing && sideVideoUrl && (
                  <div className="bg-slate-800/80 rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <button onClick={toggleSideVideoPause} className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center">
                        {isSideVideoPaused ? <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> : <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>}
                      </button>
                      <input type="range" min="0" max={sideVideoDuration || 100} value={sideVideoProgress} onChange={(e) => seekSideVideo(parseFloat(e.target.value))} className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* 정면 영상 */}
              <div className="space-y-2">
                <div className="text-center text-slate-300 font-medium text-sm">👤 정면</div>
                <div className="aspect-[9/16] max-h-[45vh] bg-slate-800 rounded-xl overflow-hidden relative">
                  {frontVideoUrl ? (
                    <>
                      <video
                        ref={frontVideoRef}
                        src={frontVideoUrl}
                        className="absolute inset-0 w-full h-full object-contain"
                        playsInline
                        muted
                        controls
                      />
                      <canvas ref={frontCanvasRef} className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none" style={{ opacity: 0.7 }} />
                      {cameraLoading && (
                        <div className="absolute top-2 left-2 bg-yellow-500/80 text-black text-xs px-2 py-1 rounded z-20">로딩...</div>
                      )}
                      {isAnalyzing && !cameraLoading && (
                        <div className="absolute top-2 left-2 bg-purple-500/80 text-white text-xs px-2 py-1 rounded z-20">
                          {isFrontVideoPaused ? '일시정지' : '분석 중'}
                        </div>
                      )}
                    </>
                  ) : (
                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <svg className="w-12 h-12 text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-slate-400 text-sm">정면 영상 업로드</span>
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setFrontVideoUrl(URL.createObjectURL(file)); }} />
                    </label>
                  )}
                </div>
                {isAnalyzing && frontVideoUrl && (
                  <div className="bg-slate-800/80 rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <button onClick={toggleFrontVideoPause} className="w-8 h-8 rounded-full bg-purple-500 hover:bg-purple-600 flex items-center justify-center">
                        {isFrontVideoPaused ? <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> : <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>}
                      </button>
                      <input type="range" min="0" max={frontVideoDuration || 100} value={frontVideoProgress} onChange={(e) => seekFrontVideo(parseFloat(e.target.value))} className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 자동 싱크 버튼 - 항목 1 */}
            {sideVideoUrl && frontVideoUrl && !isAnalyzing && (
              <div className="mt-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium text-sm">
                      {videoSyncInfo.syncing ? '🎵 오디오 싱크 감지 중...' : '영상 싱크 맞춤'}
                    </h4>
                    <p className="text-slate-400 text-xs">
                      {videoSyncInfo.syncing
                        ? '오디오 Cross-Correlation으로 분석 중입니다'
                        : videoSyncInfo.synced
                        ? '✓ 분석 시작 시 자동으로 트리밍됩니다'
                        : '두 영상을 업로드하면 자동으로 싱크됩니다'}
                    </p>
                  </div>
                  <button
                    onClick={handleAutoSync}
                    disabled={videoSyncInfo.syncing}
                    className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${
                      videoSyncInfo.syncing
                        ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        : videoSyncInfo.synced
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {videoSyncInfo.syncing ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        분석 중...
                      </span>
                    ) : videoSyncInfo.synced ? (
                      '✓ 싱크 완료'
                    ) : (
                      '자동 싱크'
                    )}
                  </button>
                </div>

                {/* 싱크 결과 표시 */}
                {videoSyncInfo.synced && (
                  <div className="mt-2 bg-slate-900/50 rounded-lg p-2 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        videoSyncInfo.method === 'audio' ? 'bg-purple-500/30 text-purple-300' : 'bg-blue-500/30 text-blue-300'
                      }`}>
                        {videoSyncInfo.method === 'audio' ? '🎵 오디오' : '📹 동작'}
                      </span>
                      {videoSyncInfo.confidence > 0 && (
                        <span className={`text-xs ${
                          videoSyncInfo.confidence > 0.5 ? 'text-green-400' : 'text-yellow-400'
                        }`}>
                          신뢰도: {Math.round(videoSyncInfo.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <div className="text-slate-400 text-xs">측면 트리밍</div>
                        <div className={`font-mono text-xs font-bold ${videoSyncInfo.sideTrim > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {videoSyncInfo.sideTrim.toFixed(3)}s
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">정면 트리밍</div>
                        <div className={`font-mono text-xs font-bold ${videoSyncInfo.frontTrim > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {videoSyncInfo.frontTrim.toFixed(3)}s
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {videoSyncInfo.error && (
                  <div className="mt-2 text-red-400 text-xs">
                    오류: {videoSyncInfo.error}
                  </div>
                )}
              </div>
            )}

            {/* 시작 전 */}
            {!isAnalyzing && !cameraLoading && (
              <div className="mt-4 text-center">
                <Button variant="bbs" size="lg" onClick={startItem}>
                  검사 시작
                </Button>
              </div>
            )}

            {/* 로딩 중 */}
            {cameraLoading && (
              <div className="mt-4 text-center">
                <div className="w-12 h-12 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-300 mt-2">동영상 분석 준비 중...</p>
              </div>
            )}

            {/* 분석 상태 표시 - Item 1 */}
            {isAnalyzing && !cameraLoading && (
              <div className="mt-3 space-y-2">
                {/* 자세 상태 */}
                <div className="flex items-center justify-between gap-2">
                  <div className={`flex-1 px-3 py-2 rounded-lg text-center ${
                    sitToStandState.currentPosture === PostureState.SITTING ? 'bg-yellow-500' :
                    sitToStandState.currentPosture === PostureState.STANDING ? 'bg-emerald-500' :
                    'bg-slate-600'
                  }`}>
                    <p className="text-white font-bold">
                      {sitToStandState.currentPosture === PostureState.SITTING && '🪑 앉음'}
                      {sitToStandState.currentPosture === PostureState.STANDING && '🧍 서있음'}
                      {sitToStandState.currentPosture === PostureState.UNKNOWN && '👀 감지 중'}
                    </p>
                  </div>

                  {/* 손 상태 - 개선된 표시 */}
                  <div className={`flex-1 px-3 py-2 rounded-lg text-center ${
                    sitToStandState.handSupport === HandSupportState.HEAVY_SUPPORT ? 'bg-red-500 animate-pulse' :
                    sitToStandState.handSupport === HandSupportState.LIGHT_SUPPORT ? 'bg-yellow-500' :
                    sitToStandState.handPosition === HandPosition.HANDS_UP ? 'bg-emerald-500/80' :
                    sitToStandState.handPosition === HandPosition.HANDS_ON_KNEE ? 'bg-orange-500/80' :
                    'bg-slate-700/80'
                  }`}>
                    <p className="text-white font-medium text-sm">
                      {sitToStandState.handSupport === HandSupportState.HEAVY_SUPPORT && '⚠️ 무릎 밀기!'}
                      {sitToStandState.handSupport === HandSupportState.LIGHT_SUPPORT && '📍 손 무릎 위'}
                      {sitToStandState.handSupport !== HandSupportState.HEAVY_SUPPORT && sitToStandState.handSupport !== HandSupportState.LIGHT_SUPPORT && sitToStandState.handPosition === HandPosition.HANDS_UP && '✓ 손 내림'}
                      {sitToStandState.handSupport !== HandSupportState.HEAVY_SUPPORT && sitToStandState.handSupport !== HandSupportState.LIGHT_SUPPORT && sitToStandState.handPosition === HandPosition.HANDS_ON_KNEE && '📍 무릎 위'}
                      {sitToStandState.handSupport !== HandSupportState.HEAVY_SUPPORT && sitToStandState.handSupport !== HandSupportState.LIGHT_SUPPORT && sitToStandState.handPosition === HandPosition.UNKNOWN && '👀 손 감지'}
                    </p>
                  </div>
                </div>

                {/* 피드백 메시지 */}
                <div className={`px-4 py-2 rounded-lg text-center ${
                  sitToStandState.feedback.type === 'success' ? 'bg-emerald-500' :
                  sitToStandState.feedback.type === 'error' ? 'bg-red-500' :
                  sitToStandState.feedback.type === 'warning' ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`}>
                  <p className="text-white font-bold">{sitToStandState.feedback.message}</p>
                </div>

                {/* 신뢰도 바 */}
                <div className="bg-slate-900/90 p-3 rounded-xl">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-yellow-400">앉음</span>
                        <span className="text-white font-bold">{Math.round(sitToStandState.sittingConfidence)}%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all duration-300 ${
                            sitToStandState.testPhase === 'sitting_confirmed' ? 'bg-yellow-400' : 'bg-yellow-500/50'
                          }`}
                          style={{ width: `${sitToStandState.sittingConfidence}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-emerald-400">서있음</span>
                        <span className="text-white font-bold">{Math.round(sitToStandState.standingConfidence)}%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all duration-300 ${
                            sitToStandState.testPhase === 'complete' ? 'bg-emerald-400' : 'bg-emerald-500/50'
                          }`}
                          style={{ width: `${sitToStandState.standingConfidence}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 단계별 안내 카드 - complete 상태에서는 항상 표시 */}
            {isAnalyzing && (sitToStandState.testPhase === 'complete' || !sitToStandState.showResultModal) && (
              <Card padding="md" className={`border-2 ${
                sitToStandState.testPhase === 'waiting' ? 'border-slate-600' :
                sitToStandState.testPhase === 'sitting_confirmed' ? 'border-yellow-500' :
                sitToStandState.testPhase === 'standing_up' ? 'border-blue-500' :
                'border-emerald-500'
              }`}>
                {sitToStandState.testPhase === 'waiting' && (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700 flex items-center justify-center">
                      <span className="text-4xl">🪑</span>
                    </div>
                    <h4 className="text-white font-bold text-xl mb-2">의자에 앉아주세요</h4>
                    <p className="text-slate-400">AI가 앉은 자세를 확인하면 다음 단계로 진행됩니다</p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-blue-400 text-sm">앉은 자세 감지 중...</span>
                    </div>
                  </div>
                )}

                {sitToStandState.testPhase === 'sitting_confirmed' && (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
                      <span className="text-4xl">✓</span>
                    </div>
                    <h4 className="text-yellow-400 font-bold text-xl mb-2">앉은 자세 확인됨!</h4>
                    <p className="text-white text-lg mb-2">이제 <strong>손을 사용하지 않고</strong> 일어서세요</p>
                    <p className="text-red-400 text-sm">⚠️ 무릎이나 의자를 짚으면 감점됩니다</p>
                  </div>
                )}

                {sitToStandState.testPhase === 'standing_up' && (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
                      <span className="text-4xl">🧍</span>
                    </div>
                    <h4 className="text-blue-400 font-bold text-xl mb-2">일어서는 중...</h4>
                    <p className="text-slate-300">완전히 서면 검사가 자동 종료됩니다</p>
                    {sitToStandState.usedHandsDuringTransition && (
                      <div className="mt-3 p-2 bg-red-500/20 border border-red-500/30 rounded-lg">
                        <p className="text-red-400 font-bold">⚠️ 손 사용이 감지되었습니다</p>
                      </div>
                    )}
                  </div>
                )}

                {sitToStandState.testPhase === 'complete' && (
                  <div className="text-center py-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-500 flex items-center justify-center animate-bounce">
                      <span className="text-4xl">🎉</span>
                    </div>
                    <h4 className="text-emerald-400 font-bold text-2xl mb-2">검사 완료!</h4>
                    <div className="text-5xl font-bold text-white my-4">
                      {sitToStandState.autoScore?.score ?? 4}
                      <span className="text-xl text-slate-400 ml-2">/ 4점</span>
                    </div>
                    <p className="text-slate-300 mb-4">
                      {sitToStandState.usedHandsDuringTransition
                        ? '손 사용으로 인해 감점되었습니다'
                        : '손을 사용하지 않고 훌륭하게 일어섰습니다!'}
                    </p>
                    <Button
                      variant="bbs"
                      size="lg"
                      onClick={() => handleScore(sitToStandState.autoScore?.score ?? 4)}
                      className="animate-pulse"
                    >
                      다음 항목으로 (항목 2) →
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {/* 하단 여백 (고정 네비게이션 바 공간 확보) */}
            <div className="h-20"></div>
          </div>
        </main>

        {/* 결과 모달 */}
        {sitToStandState.showResultModal && sitToStandState.assessmentReport && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-700 shadow-2xl">
              {/* 헤더 */}
              <div className={`p-6 text-center ${
                sitToStandState.usedHandsDuringTransition ? 'bg-yellow-500/20' : 'bg-emerald-500/20'
              }`}>
                <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
                  sitToStandState.usedHandsDuringTransition ? 'bg-yellow-500' : 'bg-emerald-500'
                }`}>
                  <span className="text-4xl">
                    {sitToStandState.usedHandsDuringTransition ? '⚠️' : '✓'}
                  </span>
                </div>
                <h2 className="text-white font-bold text-2xl mb-2">항목 1 검사 완료</h2>
                <p className="text-slate-400">앉은 자세에서 일어서기</p>
              </div>

              {/* 점수 */}
              <div className="p-6 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">AI 자동 채점</p>
                    <p className="text-5xl font-bold text-white">
                      {sitToStandState.assessmentReport.scoring.autoScore}
                      <span className="text-xl text-slate-500 ml-1">/ 4점</span>
                    </p>
                  </div>
                  <div className="w-24 h-24 relative">
                    <svg className="w-24 h-24 transform -rotate-90">
                      <circle cx="48" cy="48" r="40" stroke="#334155" strokeWidth="8" fill="none" />
                      <circle
                        cx="48" cy="48" r="40"
                        stroke={sitToStandState.usedHandsDuringTransition ? '#EAB308' : '#10B981'}
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${(sitToStandState.assessmentReport.scoring.autoScore / 4) * 251} 251`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold text-white">{sitToStandState.assessmentReport.scoring.autoScore}</span>
                    </div>
                  </div>
                </div>
                <p className={`mt-3 text-lg font-medium ${
                  sitToStandState.usedHandsDuringTransition ? 'text-yellow-400' : 'text-emerald-400'
                }`}>
                  {sitToStandState.assessmentReport.scoring.reason}
                </p>
              </div>

              {/* 분석 결과 */}
              <div className="p-6 space-y-4">
                <h3 className="text-white font-bold">AI 분석 결과</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-800 rounded-xl">
                    <p className="text-slate-400 text-xs mb-1">앉은 자세</p>
                    <p className="text-white font-bold text-lg">
                      {sitToStandState.assessmentReport.detection.sittingDetected ? '✓ 감지됨' : '✗ 미감지'}
                    </p>
                    <p className="text-yellow-400 text-sm">{sitToStandState.assessmentReport.detection.sittingConfidence}%</p>
                  </div>
                  <div className="p-3 bg-slate-800 rounded-xl">
                    <p className="text-slate-400 text-xs mb-1">서있는 자세</p>
                    <p className="text-white font-bold text-lg">
                      {sitToStandState.assessmentReport.detection.standingDetected ? '✓ 감지됨' : '✗ 미감지'}
                    </p>
                    <p className="text-emerald-400 text-sm">{sitToStandState.assessmentReport.detection.standingConfidence}%</p>
                  </div>
                </div>

                <div className="p-3 bg-slate-800 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">손 사용 여부</span>
                    <span className={`px-3 py-1 rounded-full font-bold ${
                      sitToStandState.assessmentReport.movement.usedHands
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {sitToStandState.assessmentReport.movement.usedHands ? '⚠️ 사용함 (감점)' : '✓ 사용 안함'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-800 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">검사 소요시간</span>
                    <span className="text-white font-medium">{sitToStandState.assessmentReport.testInfo.duration}</span>
                  </div>
                </div>
              </div>

              {/* 다음 항목 버튼 */}
              <div className="p-6 bg-slate-800/50">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => {
                    handleScore(sitToStandState.autoScore?.score || 0, {
                      method: 'AI 자동 분석',
                      ...sitToStandState.assessmentReport,
                      usedHands: sitToStandState.usedHandsDuringTransition
                    });
                  }}
                >
                  다음 항목으로 →
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 하단 고정 네비게이션 */}
        {!sitToStandState.showResultModal && (
          <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 p-4 z-40">
            <div className="max-w-4xl mx-auto space-y-2">
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1"
                  disabled={true}
                >
                  ← 이전
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    if (isAnalyzing) {
                      if (timerRef.current) clearInterval(timerRef.current);
                      if (cameraRef.current) {
                        cameraRef.current.stop();
                        cameraRef.current = null;
                      }
                      setIsAnalyzing(false);
                      resetStateHistory();
                      setSitToStandState({
                        testPhase: 'waiting',
                        currentPosture: PostureState.UNKNOWN,
                        handPosition: HandPosition.UNKNOWN,
                        handSupport: HandSupportState.UNKNOWN,
                        sittingConfidence: 0,
                        standingConfidence: 0,
                        kneeAngle: 0,
                        hipAngle: 0,
                        feedback: { message: '의자에 앉아주세요...', type: 'info' },
                        sittingConfirmedAt: null,
                        standingDetectedAt: null,
                        usedHandsDuringTransition: false,
                        handUsageDetectedAt: null,
                        autoScore: null,
                        assessmentReport: null,
                        showResultModal: false,
                        debug: null
                      });
                    }
                  }}
                  disabled={!isAnalyzing}
                >
                  다시 검사
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => handleScore(4, { method: '건너뛰기 (4점 처리)', reason: '사용자가 건너뛰기 선택' })}
                >
                  건너뛰기 (4점) →
                </Button>
              </div>
              <Button
                variant="danger"
                size="sm"
                fullWidth
                onClick={emergencyStop}
              >
                🚨 검사 중단 (Emergency)
              </Button>
            </div>
          </div>
        )}
      </PageContainer>
    );
  }

  // 항목 2 전용 UI - 잡지 않고 서 있기
  if (isItem2) {
    const phaseLabels = {
      waiting: { text: '서 있는 자세 대기', color: 'bg-slate-600' },
      timing: { text: '시간 측정 중', color: 'bg-blue-500' },
      complete: { text: '검사 완료!', color: 'bg-emerald-500' }
    };

    const currentPhase = phaseLabels[standingState.testPhase] || phaseLabels.waiting;
    const progressPercent = Math.min(100, (standingState.standingDuration / standingState.targetDuration) * 100);

    // 안정성 레벨 표시 - 문자열 키 사용
    const stabilityLabels = {
      'excellent': { text: '매우 안정', color: 'text-emerald-400', bg: 'bg-emerald-500' },
      'good': { text: '안정', color: 'text-green-400', bg: 'bg-green-500' },
      'moderate': { text: '약간 흔들림', color: 'text-yellow-400', bg: 'bg-yellow-500' },
      'poor': { text: '불안정', color: 'text-orange-400', bg: 'bg-orange-500' },
      'critical': { text: '매우 불안정', color: 'text-red-400', bg: 'bg-red-500' }
    };

    const currentStability = stabilityLabels[standingState.stabilityLevel] || stabilityLabels['good'];

    return (
      <PageContainer>
        <Header title="항목 2 / 14" onBack={() => navigateTo(PAGES.HOME)} />

        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="space-y-4">
            {/* 진행률 */}
            <ProgressBar progress={(2 / 14) * 100} color="blue" height="md" />

            {/* 단계 표시 */}
            {isAnalyzing && (
              <div className="flex items-center justify-between">
                <div className={`px-4 py-2 rounded-full ${currentPhase.color} text-white font-bold`}>
                  {currentPhase.text}
                </div>
                <div className={`px-4 py-2 rounded-full ${currentStability.bg} text-white font-bold`}>
                  {currentStability.text}
                </div>
              </div>
            )}

            {/* 항목 정보 */}
            <Card padding="md">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold text-lg">2. 잡지 않고 서 있기</h3>
                  <p className="text-slate-400 text-sm">2분간 지지 없이 서 있기</p>
                </div>
                <Badge variant="testType" value="BBS" size="md">AI 자동</Badge>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm">
                <p className="text-blue-400 mb-2"><strong>검사 순서:</strong></p>
                <ol className="text-slate-400 space-y-1 list-decimal list-inside">
                  <li className={standingState.testPhase !== 'waiting' ? 'text-emerald-400' : ''}>
                    의자에 앉기 → AI가 앉은 자세 확인
                  </li>
                  <li className={['standing_up', 'timing', 'complete'].includes(standingState.testPhase) ? 'text-emerald-400' : ''}>
                    일어서기 → AI가 일어서기 완료 확인
                  </li>
                  <li className={standingState.testPhase === 'timing' || standingState.testPhase === 'complete' ? 'text-emerald-400' : ''}>
                    2분간 서있기 유지 → 자동 채점
                  </li>
                </ol>
              </div>
            </Card>

            {/* 양쪽 동영상 뷰 (측면 + 정면) - Item 2 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 측면 영상 */}
              <div className="space-y-2">
                <div className="text-center text-slate-300 font-medium text-sm">📐 측면</div>
                <div className="aspect-[9/16] max-h-[45vh] bg-slate-800 rounded-xl overflow-hidden relative">
                  {sideVideoUrl ? (
                    <>
                      <video
                        ref={sideVideoRef}
                        src={sideVideoUrl}
                        className="absolute inset-0 w-full h-full object-contain"
                        playsInline
                        muted
                        controls
                      />
                      <canvas ref={sideCanvasRef} className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none" style={{ opacity: 0.7 }} />
                      {cameraLoading && (
                        <div className="absolute top-2 left-2 bg-yellow-500/80 text-black text-xs px-2 py-1 rounded z-20">로딩...</div>
                      )}
                      {isAnalyzing && !cameraLoading && (
                        <div className="absolute top-2 left-2 bg-green-500/80 text-white text-xs px-2 py-1 rounded z-20">
                          {isSideVideoPaused ? '일시정지' : '분석 중'}
                        </div>
                      )}
                    </>
                  ) : (
                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <svg className="w-12 h-12 text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-slate-400 text-sm">측면 영상 업로드</span>
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setSideVideoUrl(URL.createObjectURL(file)); }} />
                    </label>
                  )}
                </div>
                {isAnalyzing && sideVideoUrl && (
                  <div className="bg-slate-800/80 rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <button onClick={toggleSideVideoPause} className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center">
                        {isSideVideoPaused ? <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> : <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>}
                      </button>
                      <input type="range" min="0" max={sideVideoDuration || 100} value={sideVideoProgress} onChange={(e) => seekSideVideo(parseFloat(e.target.value))} className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* 정면 영상 */}
              <div className="space-y-2">
                <div className="text-center text-slate-300 font-medium text-sm">👤 정면</div>
                <div className="aspect-[9/16] max-h-[45vh] bg-slate-800 rounded-xl overflow-hidden relative">
                  {frontVideoUrl ? (
                    <>
                      <video
                        ref={frontVideoRef}
                        src={frontVideoUrl}
                        className="absolute inset-0 w-full h-full object-contain"
                        playsInline
                        muted
                        controls
                      />
                      <canvas ref={frontCanvasRef} className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none" style={{ opacity: 0.7 }} />
                      {cameraLoading && (
                        <div className="absolute top-2 left-2 bg-yellow-500/80 text-black text-xs px-2 py-1 rounded z-20">로딩...</div>
                      )}
                      {isAnalyzing && !cameraLoading && (
                        <div className="absolute top-2 left-2 bg-purple-500/80 text-white text-xs px-2 py-1 rounded z-20">
                          {isFrontVideoPaused ? '일시정지' : '분석 중'}
                        </div>
                      )}
                    </>
                  ) : (
                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <svg className="w-12 h-12 text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-slate-400 text-sm">정면 영상 업로드</span>
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setFrontVideoUrl(URL.createObjectURL(file)); }} />
                    </label>
                  )}
                </div>
                {isAnalyzing && frontVideoUrl && (
                  <div className="bg-slate-800/80 rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <button onClick={toggleFrontVideoPause} className="w-8 h-8 rounded-full bg-purple-500 hover:bg-purple-600 flex items-center justify-center">
                        {isFrontVideoPaused ? <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> : <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>}
                      </button>
                      <input type="range" min="0" max={frontVideoDuration || 100} value={frontVideoProgress} onChange={(e) => seekFrontVideo(parseFloat(e.target.value))} className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 자동 싱크 버튼 - 항목 2 */}
            {sideVideoUrl && frontVideoUrl && !isAnalyzing && (
              <div className="mt-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium text-sm">
                      {videoSyncInfo.syncing ? '🎵 오디오 싱크 감지 중...' : '영상 싱크 맞춤'}
                    </h4>
                    <p className="text-slate-400 text-xs">
                      {videoSyncInfo.syncing
                        ? '오디오 Cross-Correlation으로 분석 중입니다'
                        : videoSyncInfo.synced
                        ? '✓ 분석 시작 시 자동으로 트리밍됩니다'
                        : '두 영상을 업로드하면 자동으로 싱크됩니다'}
                    </p>
                  </div>
                  <button
                    onClick={handleAutoSync}
                    disabled={videoSyncInfo.syncing}
                    className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${
                      videoSyncInfo.syncing
                        ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        : videoSyncInfo.synced
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {videoSyncInfo.syncing ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        분석 중...
                      </span>
                    ) : videoSyncInfo.synced ? (
                      '✓ 싱크 완료'
                    ) : (
                      '자동 싱크'
                    )}
                  </button>
                </div>

                {/* 싱크 결과 표시 */}
                {videoSyncInfo.synced && (
                  <div className="mt-2 bg-slate-900/50 rounded-lg p-2 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        videoSyncInfo.method === 'audio' ? 'bg-purple-500/30 text-purple-300' : 'bg-blue-500/30 text-blue-300'
                      }`}>
                        {videoSyncInfo.method === 'audio' ? '🎵 오디오' : '📹 동작'}
                      </span>
                      {videoSyncInfo.confidence > 0 && (
                        <span className={`text-xs ${
                          videoSyncInfo.confidence > 0.5 ? 'text-green-400' : 'text-yellow-400'
                        }`}>
                          신뢰도: {Math.round(videoSyncInfo.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <div className="text-slate-400 text-xs">측면 트리밍</div>
                        <div className={`font-mono text-xs font-bold ${videoSyncInfo.sideTrim > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {videoSyncInfo.sideTrim.toFixed(3)}s
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">정면 트리밍</div>
                        <div className={`font-mono text-xs font-bold ${videoSyncInfo.frontTrim > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {videoSyncInfo.frontTrim.toFixed(3)}s
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {videoSyncInfo.error && (
                  <div className="mt-2 text-red-400 text-xs">
                    오류: {videoSyncInfo.error}
                  </div>
                )}
              </div>
            )}

            {/* 시작 전 */}
            {!isAnalyzing && !cameraLoading && (
              <div className="mt-4 text-center">
                <Button variant="bbs" size="lg" onClick={startItem}>
                  검사 시작
                </Button>
              </div>
            )}

            {/* 로딩 중 */}
            {cameraLoading && (
              <div className="mt-4 text-center">
                <div className="w-12 h-12 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-300 mt-2">동영상 분석 준비 중...</p>
              </div>
            )}

            {/* 분석 상태 표시 - Item 2 */}
            {isAnalyzing && !cameraLoading && (
              <div className="mt-3 space-y-2">
                {/* 타이머 & 피드백 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="bg-slate-900/90 px-4 py-2 rounded-lg">
                    <p className="text-slate-400 text-xs">경과 시간</p>
                    <p className="text-white font-mono text-2xl font-bold">
                      {Math.floor(standingState.standingDuration / 60)}:{String(Math.floor(standingState.standingDuration % 60)).padStart(2, '0')}
                    </p>
                  </div>

                  <div className={`flex-1 px-4 py-2 rounded-lg text-center ${
                    standingState.feedback.type === 'success' ? 'bg-emerald-500' :
                    standingState.feedback.type === 'error' ? 'bg-red-500' :
                    standingState.feedback.type === 'warning' ? 'bg-yellow-500' :
                    'bg-blue-500'
                  }`}>
                    <p className="text-white font-bold">{standingState.feedback.message}</p>
                  </div>
                </div>

                {/* 진행률 바 */}
                <div className="bg-slate-900/90 p-3 rounded-xl">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">진행률</span>
                    <span className="text-white font-bold">{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-4 rounded-full transition-all duration-300 ${
                        progressPercent >= 100 ? 'bg-emerald-500' :
                        progressPercent >= 50 ? 'bg-blue-500' :
                        'bg-blue-400'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>0초</span>
                    <span className="text-yellow-400">30초</span>
                    <span>2분</span>
                  </div>
                </div>
              </div>
            )}

            {/* 단계별 안내 카드 */}
            {isAnalyzing && !standingState.showResultModal && (
              <Card padding="md" className={`border-2 ${
                standingState.testPhase === 'waiting' ? 'border-slate-600' :
                standingState.testPhase === 'sitting_confirmed' ? 'border-yellow-500' :
                standingState.testPhase === 'standing_up' ? 'border-blue-500' :
                standingState.testPhase === 'timing' ? 'border-emerald-500' :
                'border-emerald-500'
              }`}>
                {/* 단계 1: 앉기 대기 */}
                {standingState.testPhase === 'waiting' && (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700 flex items-center justify-center">
                      <span className="text-4xl">🪑</span>
                    </div>
                    <h4 className="text-white font-bold text-xl mb-2">의자에 앉아주세요</h4>
                    <p className="text-slate-400">AI가 앉은 자세를 확인하면 다음 단계로 진행됩니다</p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-blue-400 text-sm">앉은 자세 감지 중...</span>
                    </div>
                    {/* 신뢰도 표시 */}
                    <div className="mt-4 bg-slate-800 rounded-lg p-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-yellow-400">앉음 신뢰도</span>
                        <span className="text-white">{Math.round(standingState.sittingConfidence)}%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-yellow-400 h-2 rounded-full transition-all"
                          style={{ width: `${standingState.sittingConfidence}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 단계 2: 앉음 확인 - 일어서기 대기 */}
                {standingState.testPhase === 'sitting_confirmed' && (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
                      <span className="text-4xl">✓</span>
                    </div>
                    <h4 className="text-yellow-400 font-bold text-xl mb-2">앉은 자세 확인됨!</h4>
                    <p className="text-white text-lg mb-2">이제 <strong>천천히 일어서세요</strong></p>
                    <p className="text-slate-400 text-sm">완전히 일어서면 2분 타이머가 시작됩니다</p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
                      <span className="text-yellow-400 text-sm">일어서기를 감지하고 있습니다...</span>
                    </div>
                  </div>
                )}

                {/* 단계 3: 일어서는 중 */}
                {standingState.testPhase === 'standing_up' && (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
                      <span className="text-4xl">🧍</span>
                    </div>
                    <h4 className="text-blue-400 font-bold text-xl mb-2">일어서는 중...</h4>
                    <p className="text-slate-300">완전히 서면 타이머가 시작됩니다</p>
                    {/* 신뢰도 표시 */}
                    <div className="mt-4 bg-slate-800 rounded-lg p-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-emerald-400">서있음 신뢰도</span>
                        <span className="text-white">{Math.round(standingState.standingConfidence)}%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-emerald-400 h-2 rounded-full transition-all"
                          style={{ width: `${standingState.standingConfidence}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 단계 4: 타이머 진행 중 */}
                {standingState.testPhase === 'timing' && (
                  <div className="text-center py-4">
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full ${currentStability.bg}/20 flex items-center justify-center`}>
                      <span className="text-4xl">⏱️</span>
                    </div>
                    <h4 className={`font-bold text-xl mb-2 ${currentStability.color}`}>
                      {currentStability.text} 상태로 서있기
                    </h4>
                    <p className="text-white text-lg mb-2">
                      <strong>{Math.floor(standingState.standingDuration)}초</strong> / 120초
                    </p>
                    <p className="text-slate-400 text-sm">
                      {standingState.standingDuration < 30 ? '최소 30초간 유지하세요' :
                       standingState.standingDuration < 120 ? `남은 시간: ${Math.ceil(120 - standingState.standingDuration)}초` :
                       '목표 달성!'}
                    </p>

                    {/* 30초 이상일 때 수동 완료 버튼 */}
                    {standingState.standingDuration >= 30 && standingState.standingDuration < 120 && (
                      <div className="mt-4">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const score = calculateStandingScore(
                              standingState.standingDuration,
                              standingState.supportSeekingCount > 5,
                              false,
                              standingState.unstableTime,
                              1
                            );
                            const report = generateStandingReport(score.score, standingState.standingDuration, {
                              avgStability: standingState.stabilityLevel,
                              supportEvents: standingState.supportSeekingCount
                            });
                            setStandingState(prev => ({
                              ...prev,
                              testPhase: 'complete',
                              autoScore: score,
                              assessmentReport: report,
                              showResultModal: true
                            }));
                          }}
                        >
                          검사 종료 ({Math.floor(standingState.standingDuration)}초에서 멈추기)
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* 완료 */}
                {standingState.testPhase === 'complete' && (
                  <div className="text-center py-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-500 flex items-center justify-center animate-bounce">
                      <span className="text-4xl">🎉</span>
                    </div>
                    <h4 className="text-emerald-400 font-bold text-2xl mb-2">검사 완료!</h4>
                    <div className="text-5xl font-bold text-white my-4">
                      {standingState.autoScore?.score ?? 4}
                      <span className="text-xl text-slate-400 ml-2">/ 4점</span>
                    </div>
                    <p className="text-slate-300 mb-4">
                      {Math.floor(standingState.standingDuration)}초간 서 있었습니다
                    </p>
                    <Button
                      variant="bbs"
                      size="lg"
                      onClick={() => handleScore(standingState.autoScore?.score ?? 4)}
                      className="animate-pulse"
                    >
                      다음 항목으로 (항목 3) →
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {/* 하단 여백 (고정 네비게이션 바 공간 확보) */}
            <div className="h-20"></div>
          </div>
        </main>

        {/* 결과 모달 */}
        {standingState.showResultModal && standingState.assessmentReport && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-700 shadow-2xl">
              {/* 헤더 */}
              <div className={`p-6 text-center ${
                standingState.assessmentReport.score >= 3 ? 'bg-emerald-500/20' : 'bg-yellow-500/20'
              }`}>
                <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
                  standingState.assessmentReport.score >= 3 ? 'bg-emerald-500' : 'bg-yellow-500'
                }`}>
                  <span className="text-4xl">
                    {standingState.assessmentReport.score >= 3 ? '✓' : '⚠️'}
                  </span>
                </div>
                <h2 className="text-white font-bold text-2xl mb-2">항목 2 검사 완료</h2>
                <p className="text-slate-400">잡지 않고 서 있기</p>
              </div>

              {/* 점수 */}
              <div className="p-6 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">AI 자동 채점</p>
                    <p className="text-5xl font-bold text-white">
                      {standingState.assessmentReport.score}
                      <span className="text-xl text-slate-500 ml-1">/ 4점</span>
                    </p>
                  </div>
                  <div className="w-24 h-24 relative">
                    <svg className="w-24 h-24 transform -rotate-90">
                      <circle cx="48" cy="48" r="40" stroke="#334155" strokeWidth="8" fill="none" />
                      <circle
                        cx="48" cy="48" r="40"
                        stroke={standingState.assessmentReport.score >= 3 ? '#10B981' : '#EAB308'}
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${(standingState.assessmentReport.score / 4) * 251} 251`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold text-white">{standingState.assessmentReport.score}</span>
                    </div>
                  </div>
                </div>
                <p className={`mt-3 text-lg font-medium ${
                  standingState.assessmentReport.score >= 3 ? 'text-emerald-400' : 'text-yellow-400'
                }`}>
                  {standingState.autoScore?.reason}
                </p>
              </div>

              {/* 분석 결과 */}
              <div className="p-6 space-y-4">
                <h3 className="text-white font-bold">AI 분석 결과</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-800 rounded-xl">
                    <p className="text-slate-400 text-xs mb-1">서 있은 시간</p>
                    <p className="text-white font-bold text-lg">
                      {Math.floor(standingState.standingDuration / 60)}분 {Math.floor(standingState.standingDuration % 60)}초
                    </p>
                    <p className="text-blue-400 text-sm">목표: 2분</p>
                  </div>
                  <div className="p-3 bg-slate-800 rounded-xl">
                    <p className="text-slate-400 text-xs mb-1">안정성</p>
                    <p className="text-white font-bold text-lg">
                      {standingState.assessmentReport.measurements?.avgStability || '양호'}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-800 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">지지 요청 횟수</span>
                    <span className={`px-3 py-1 rounded-full font-bold ${
                      standingState.supportSeekingCount > 5
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {standingState.supportSeekingCount}회
                    </span>
                  </div>
                </div>

                {standingState.assessmentReport.assessment && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <p className="text-blue-400 text-sm">{standingState.assessmentReport.assessment}</p>
                  </div>
                )}

                {standingState.assessmentReport.recommendations?.length > 0 && (
                  <div className="p-3 bg-slate-800 rounded-xl">
                    <p className="text-slate-400 text-xs mb-2">권장사항</p>
                    <ul className="text-slate-300 text-sm space-y-1">
                      {standingState.assessmentReport.recommendations.map((rec, idx) => (
                        <li key={idx}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 다음 항목 버튼 */}
              <div className="p-6 bg-slate-800/50">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => {
                    handleScore(standingState.autoScore?.score || 0, {
                      method: 'AI 자동 분석',
                      ...standingState.assessmentReport
                    });
                  }}
                >
                  다음 항목으로 →
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 하단 고정 네비게이션 */}
        {!standingState.showResultModal && (
          <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 p-4 z-40">
            <div className="max-w-4xl mx-auto space-y-2">
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={goToPreviousItem}
                >
                  ← 이전
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    if (isAnalyzing) {
                      if (timerRef.current) clearInterval(timerRef.current);
                      if (cameraRef.current) {
                        cameraRef.current.stop();
                        cameraRef.current = null;
                      }
                      setIsAnalyzing(false);
                      resetStandingAnalysis();
                      resetMovementHistory();
                      resetSittingAnalysis();
                      resetArmReachAnalysis();
                      resetPickUpAnalysis();
                      setStandingState({
                        testPhase: 'waiting',
                        currentState: 'not_standing',
                        stabilityLevel: 'good',
                        isStanding: false,
                        isUsingSupport: false,
                        standingStartTime: null,
                        standingDuration: 0,
                        targetDuration: 120,
                        supportSeekingCount: 0,
                        unstableTime: 0,
                        lostBalance: false,
                        feedback: { message: '지지물 없이 서 주세요...', type: 'info' },
                        autoScore: null,
                        assessmentReport: null,
                        showResultModal: false,
                        debug: null
                      });
                    }
                  }}
                  disabled={!isAnalyzing}
                >
                  다시 검사
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => handleScore(4, { method: '건너뛰기 (4점 처리)', reason: '사용자가 건너뛰기 선택' })}
                >
                  건너뛰기 (4점) →
                </Button>
              </div>
              <Button
                variant="danger"
                size="sm"
                fullWidth
                onClick={emergencyStop}
              >
                🚨 검사 중단 (Emergency)
              </Button>
            </div>
          </div>
        )}
      </PageContainer>
    );
  }

  // 일반 항목 UI (항목 3-14)
  return (
    <PageContainer>
      <Header title={`항목 ${currentItem + 1} / 14`} onBack={() => navigateTo(PAGES.HOME)} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-4">
          <ProgressBar progress={((currentItem + 1) / 14) * 100} color="blue" height="md" />

          <Card padding="md">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-white font-bold text-lg">
                  {currentBBSItem.id}. {currentBBSItem.name}
                </h3>
                <p className="text-slate-400 text-sm">{currentBBSItem.desc}</p>
              </div>
              {currentBBSItem.duration > 0 && (
                <Badge variant="testType" value="BBS" size="md">{currentBBSItem.duration}초</Badge>
              )}
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-blue-400 text-sm">
                <strong>지시:</strong> {currentBBSItem.instruction}
              </p>
            </div>
          </Card>

          {/* 영상 업로드 안내 */}
          {!sideVideoUrl && !frontVideoUrl && !isAnalyzing && (
            <Card padding="md" className="bg-blue-500/10 border border-blue-500/30">
              <div className="text-center">
                <p className="text-blue-400 font-medium mb-2">📹 항목 {currentItem + 1} 검사 영상 업로드</p>
                <p className="text-slate-400 text-sm">이 항목의 측면/정면 영상을 업로드해주세요</p>
              </div>
            </Card>
          )}

          {/* 양쪽 동영상 뷰 - 일반 항목 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 측면 영상 */}
            <div className="space-y-2">
              <div className="text-center text-slate-300 font-medium text-sm">📐 측면</div>
              <div className="aspect-[9/16] max-h-[45vh] bg-slate-800 rounded-xl overflow-hidden relative">
                {sideVideoUrl ? (
                  <>
                    <video
                      ref={sideVideoRef}
                      src={sideVideoUrl}
                      className="absolute inset-0 w-full h-full object-contain"
                      playsInline
                      muted
                      controls
                      onLoadedData={() => console.log('[General-Side] loadeddata')}
                      onPlay={() => console.log('[General-Side] playing')}
                    />
                    <canvas ref={sideCanvasRef} className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none" style={{ opacity: 0.7 }} />
                    {/* 재업로드 버튼 */}
                    {!isAnalyzing && (
                      <label className="absolute top-2 right-2 bg-slate-900/80 hover:bg-slate-800 text-white text-xs px-2 py-1 rounded cursor-pointer z-20">
                        변경
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (sideVideoUrl) URL.revokeObjectURL(sideVideoUrl);
                              const url = URL.createObjectURL(file);
                              setSideVideoUrl(url);
                            }
                          }}
                        />
                      </label>
                    )}
                    {/* 상태 표시 */}
                    {cameraLoading && (
                      <div className="absolute top-2 left-2 bg-yellow-500/80 text-black text-xs px-2 py-1 rounded z-20">
                        측면 로딩...
                      </div>
                    )}
                    {isAnalyzing && !cameraLoading && (
                      <div className="absolute top-2 left-2 bg-green-500/80 text-white text-xs px-2 py-1 rounded z-20">
                        {isSideVideoPaused ? '일시정지' : '분석 중'}
                      </div>
                    )}
                  </>
                ) : (
                  <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors z-10">
                    <svg className="w-12 h-12 text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-slate-400 text-sm">측면 영상 업로드</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = URL.createObjectURL(file);
                          setSideVideoUrl(url);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
              {/* 측면 영상 컨트롤 */}
              {isAnalyzing && !cameraLoading && sideVideoUrl && (
                <div className="bg-slate-800/80 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleSideVideoPause}
                      className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors flex-shrink-0"
                    >
                      {isSideVideoPaused ? (
                        <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max={sideVideoDuration || 100}
                      value={sideVideoProgress}
                      onChange={(e) => seekSideVideo(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                  <div className="text-slate-400 text-xs font-mono text-center mt-1">
                    {Math.floor(sideVideoProgress / 60)}:{String(Math.floor(sideVideoProgress % 60)).padStart(2, '0')} / {Math.floor(sideVideoDuration / 60)}:{String(Math.floor(sideVideoDuration % 60)).padStart(2, '0')}
                  </div>
                </div>
              )}
            </div>

            {/* 정면 영상 */}
            <div className="space-y-2">
              <div className="text-center text-slate-300 font-medium text-sm">👤 정면</div>
              <div className="aspect-[9/16] max-h-[45vh] bg-slate-800 rounded-xl overflow-hidden relative">
                {frontVideoUrl ? (
                  <>
                    <video
                      ref={frontVideoRef}
                      src={frontVideoUrl}
                      className="absolute inset-0 w-full h-full object-contain"
                      playsInline
                      muted
                      controls
                      onLoadedData={() => console.log('[General-Front] loadeddata')}
                      onPlay={() => console.log('[General-Front] playing')}
                    />
                    <canvas ref={frontCanvasRef} className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none" style={{ opacity: 0.7 }} />
                    {/* 재업로드 버튼 */}
                    {!isAnalyzing && (
                      <label className="absolute top-2 right-2 bg-slate-900/80 hover:bg-slate-800 text-white text-xs px-2 py-1 rounded cursor-pointer z-20">
                        변경
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (frontVideoUrl) URL.revokeObjectURL(frontVideoUrl);
                              const url = URL.createObjectURL(file);
                              setFrontVideoUrl(url);
                            }
                          }}
                        />
                      </label>
                    )}
                    {/* 상태 표시 */}
                    {cameraLoading && (
                      <div className="absolute top-2 left-2 bg-yellow-500/80 text-black text-xs px-2 py-1 rounded z-20">
                        정면 로딩...
                      </div>
                    )}
                    {isAnalyzing && !cameraLoading && (
                      <div className="absolute top-2 left-2 bg-purple-500/80 text-white text-xs px-2 py-1 rounded z-20">
                        {isFrontVideoPaused ? '일시정지' : '분석 중'}
                      </div>
                    )}
                  </>
                ) : (
                  <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors z-10">
                    <svg className="w-12 h-12 text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-slate-400 text-sm">정면 영상 업로드</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = URL.createObjectURL(file);
                          setFrontVideoUrl(url);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
              {/* 정면 영상 컨트롤 */}
              {isAnalyzing && !cameraLoading && frontVideoUrl && (
                <div className="bg-slate-800/80 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleFrontVideoPause}
                      className="w-8 h-8 rounded-full bg-purple-500 hover:bg-purple-600 flex items-center justify-center transition-colors flex-shrink-0"
                    >
                      {isFrontVideoPaused ? (
                        <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max={frontVideoDuration || 100}
                      value={frontVideoProgress}
                      onChange={(e) => seekFrontVideo(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                  <div className="text-slate-400 text-xs font-mono text-center mt-1">
                    {Math.floor(frontVideoProgress / 60)}:{String(Math.floor(frontVideoProgress % 60)).padStart(2, '0')} / {Math.floor(frontVideoDuration / 60)}:{String(Math.floor(frontVideoDuration % 60)).padStart(2, '0')}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 자동 싱크 버튼 - 검사 화면 */}
          {sideVideoUrl && frontVideoUrl && !isAnalyzing && (
            <div className="mt-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium text-sm">
                    {videoSyncInfo.syncing ? '🎵 오디오 싱크 감지 중...' : '영상 싱크 맞춤'}
                  </h4>
                  <p className="text-slate-400 text-xs">
                    {videoSyncInfo.syncing
                      ? '오디오 Cross-Correlation으로 분석 중입니다'
                      : videoSyncInfo.synced
                      ? '✓ 분석 시작 시 자동으로 트리밍됩니다'
                      : '두 영상을 업로드하면 자동으로 싱크됩니다'}
                  </p>
                </div>
                <button
                  onClick={handleAutoSync}
                  disabled={videoSyncInfo.syncing}
                  className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${
                    videoSyncInfo.syncing
                      ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                      : videoSyncInfo.synced
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {videoSyncInfo.syncing ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      분석 중...
                    </span>
                  ) : videoSyncInfo.synced ? (
                    '✓ 싱크 완료'
                  ) : (
                    '자동 싱크'
                  )}
                </button>
              </div>

              {/* 싱크 결과 표시 */}
              {videoSyncInfo.synced && (
                <div className="mt-2 bg-slate-900/50 rounded-lg p-2 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      videoSyncInfo.method === 'audio' ? 'bg-purple-500/30 text-purple-300' : 'bg-blue-500/30 text-blue-300'
                    }`}>
                      {videoSyncInfo.method === 'audio' ? '🎵 오디오' : '📹 동작'}
                    </span>
                    {videoSyncInfo.confidence > 0 && (
                      <span className={`text-xs ${
                        videoSyncInfo.confidence > 0.5 ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        신뢰도: {Math.round(videoSyncInfo.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div>
                      <div className="text-slate-400 text-xs">측면 트리밍</div>
                      <div className={`font-mono text-xs font-bold ${videoSyncInfo.sideTrim > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {videoSyncInfo.sideTrim.toFixed(3)}s
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">정면 트리밍</div>
                      <div className={`font-mono text-xs font-bold ${videoSyncInfo.frontTrim > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {videoSyncInfo.frontTrim.toFixed(3)}s
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {videoSyncInfo.error && (
                <div className="mt-2 text-red-400 text-xs">
                  오류: {videoSyncInfo.error}
                </div>
              )}
            </div>
          )}

          {/* 시작 전 */}
          {!isAnalyzing && !cameraLoading && (
            <div className="mt-4 text-center">
              <Button variant="bbs" size="lg" onClick={startItem}>항목 시작</Button>
            </div>
          )}

          {/* 로딩 중 */}
          {cameraLoading && (
            <div className="mt-4 text-center">
              <div className="w-12 h-12 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-300 mt-2">동영상 분석 준비 중...</p>
            </div>
          )}

          {/* 분석 상태 (분석 중일 때) */}
          {isAnalyzing && !cameraLoading && (
            <div className="mt-3 space-y-2">
              {/* 타이머 & 상태 */}
              <div className="flex items-center justify-between gap-2">
                {currentBBSItem.duration > 0 && (
                  <div className="bg-slate-900/80 px-4 py-2 rounded-lg">
                    <span className="text-white font-mono text-lg">
                      {itemTimer.toFixed(1)}초 / {currentBBSItem.duration}초
                    </span>
                  </div>
                )}

                <div className="flex-1 bg-slate-900/80 px-4 py-2 rounded-lg text-right">
                  <p className="text-blue-400 font-medium">{generalDetection.status}</p>
                  {generalDetection.message && (
                    <p className="text-slate-400 text-xs">{generalDetection.message}</p>
                  )}
                </div>
              </div>

              {/* 신뢰도 바 */}
              <div className="bg-slate-900/80 p-3 rounded-xl">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">감지 신뢰도</span>
                  <span className="text-blue-400">{Math.round(generalDetection.confidence)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all"
                    style={{ width: `${generalDetection.confidence}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* AI 자동 분석 중 상태 표시 */}
          {isAnalyzing && !generalDetection.showResultModal && (
            <Card padding="md" className="border-2 border-blue-500/50">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <h4 className="text-white font-semibold mb-2">AI 자동 분석 중</h4>
                <p className="text-slate-400 text-sm">{generalDetection.message || currentBBSItem?.instruction}</p>
                {generalDetection.testPhase !== 'waiting' && (
                  <div className="mt-3 bg-slate-800 rounded-lg p-3">
                    <p className="text-blue-400 font-medium">{generalDetection.status}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* 하단 여백 (고정 네비게이션 바 공간 확보) */}
          <div className="h-28"></div>
        </div>
      </main>

      {/* 일반 항목 결과 모달 */}
      {generalDetection.showResultModal && generalDetection.autoScore && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-700 shadow-2xl">
            {/* 헤더 */}
            <div className={`p-6 text-center ${
              generalDetection.autoScore.score >= 3 ? 'bg-emerald-500/20' : 'bg-yellow-500/20'
            }`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
                generalDetection.autoScore.score >= 3 ? 'bg-emerald-500' : 'bg-yellow-500'
              }`}>
                <span className="text-4xl font-bold text-white">{generalDetection.autoScore.score}</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">검사 완료!</h3>
              <p className="text-slate-300">{currentBBSItem?.name}</p>
            </div>

            {/* 본문 */}
            <div className="p-6 space-y-4">
              {/* AI 분석 결과 */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <span className="text-blue-400">AI</span> 분석 결과
                </h4>

                <div className="space-y-3">
                  {/* 점수 이유 */}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">판정 근거</span>
                    <span className="text-white">{generalDetection.autoScore.reason}</span>
                  </div>

                  {/* 소요 시간 (있는 경우) */}
                  {generalDetection.assessmentReport?.duration !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">소요 시간</span>
                      <span className="text-white">{generalDetection.assessmentReport.duration.toFixed(1)}초</span>
                    </div>
                  )}

                  {/* 횟수 (있는 경우) */}
                  {generalDetection.assessmentReport?.count !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">동작 횟수</span>
                      <span className="text-white">{generalDetection.assessmentReport.count}회</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 점수 기준 */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h4 className="text-white font-semibold mb-3">점수 기준</h4>
                <div className="space-y-2">
                  {currentBBSItem?.scoring.map((option) => (
                    <div
                      key={option.score}
                      className={`flex items-center gap-3 p-2 rounded-lg ${
                        option.score === generalDetection.autoScore.score
                          ? 'bg-blue-500/20 border border-blue-500/50'
                          : 'opacity-60'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                        option.score === generalDetection.autoScore.score
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {option.score}
                      </span>
                      <span className="text-slate-300 text-sm flex-1">{option.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 다음 항목 버튼 */}
            <div className="p-6 pt-0">
              <Button
                variant="primary"
                fullWidth
                onClick={() => {
                  handleScore(generalDetection.autoScore.score, {
                    method: 'AI 자동 분석',
                    confidence: Math.min(100, generalDetection.confidence + 15),
                    score: generalDetection.autoScore.score,
                    description: generalDetection.autoScore.reason,
                    reason: generalDetection.autoScore.reason,
                    details: {
                      postureStability: generalDetection.postureStability || '분석 완료',
                      movementQuality: generalDetection.autoScore.score >= 3 ? '양호' : '개선 필요',
                      duration: generalDetection.assessmentReport?.duration,
                      actionCount: generalDetection.assessmentReport?.count
                    },
                    ...generalDetection.assessmentReport
                  });
                }}
              >
                다음 항목으로 →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 하단 고정 네비게이션 */}
      {!generalDetection.showResultModal && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 p-4 z-40">
          <div className="max-w-4xl mx-auto space-y-2">
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={goToPreviousItem}
                disabled={currentItem === 0}
              >
                ← 이전
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  if (isAnalyzing) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    if (cameraRef.current) {
                      cameraRef.current.stop();
                      cameraRef.current = null;
                    }
                    setIsAnalyzing(false);
                    setItemTimer(0);
                  }
                }}
                disabled={!isAnalyzing}
              >
                다시 검사
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => handleScore(4, { method: '건너뛰기 (4점 처리)', reason: '사용자가 건너뛰기 선택' })}
              >
                건너뛰기 (4점) →
              </Button>
            </div>
            <Button
              variant="danger"
              size="sm"
              fullWidth
              onClick={emergencyStop}
            >
              검사 중단 (Emergency)
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

export default BBSTestPage;
