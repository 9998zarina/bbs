import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PageContainer, Header } from '../../components/layout';
import { Button, Card, Alert, ProgressBar, Badge } from '../../components/ui';
import { PatientInfoForm } from '../../components/forms';
import { drawConnections, drawLandmarks } from '../../utils/poseDrawing';
import { calculateBBSRisk, getRiskColorClasses } from '../../utils/riskCalculation';
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

/**
 * 음성 안내 함수
 */
const speak = (text, rate = 1.0) => {
  if ('speechSynthesis' in window) {
    // 이전 음성 중단
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // 한국어 음성 찾기
    const voices = window.speechSynthesis.getVoices();
    const koreanVoice = voices.find(voice => voice.lang.includes('ko'));
    if (koreanVoice) {
      utterance.voice = koreanVoice;
    }

    window.speechSynthesis.speak(utterance);
  }
};

/**
 * 캔버스에 각도 정보 그리기
 */
function drawAngleInfo(ctx, analysis, landmarks, width, height) {
  if (!analysis || !landmarks) return;

  const vizData = getVisualizationData(analysis, landmarks);
  if (!vizData) return;

  ctx.save();

  // 무릎 각도 표시
  if (vizData.kneeAngle) {
    const kx = vizData.kneeAnglePosition.x * width;
    const ky = vizData.kneeAnglePosition.y * height;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(kx - 35, ky - 25, 70, 25, 5);
    ctx.fill();

    ctx.fillStyle = '#FCD34D';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`무릎 ${Math.round(vizData.kneeAngle)}°`, kx, ky - 8);
  }

  // 엉덩이 각도 표시
  if (vizData.hipAngle) {
    const hx = vizData.hipAnglePosition.x * width;
    const hy = vizData.hipAnglePosition.y * height;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(hx - 40, hy - 25, 80, 25, 5);
    ctx.fill();

    ctx.fillStyle = '#60A5FA';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`엉덩이 ${Math.round(vizData.hipAngle)}°`, hx, hy - 8);
  }

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
}

function BBSTestPage() {
  const [currentItem, setCurrentItem] = useState(0);
  const [scores, setScores] = useState(Array(14).fill(null));
  const [isComplete, setIsComplete] = useState(false);
  const [patientInfo, setPatientInfo] = useState({ name: '홍길동', id: 'P-DEMO-001' });
  const [showSetup, setShowSetup] = useState(true);

  // 카메라/분석 상태
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [itemTimer, setItemTimer] = useState(0);
  const [currentLandmarks, setCurrentLandmarks] = useState(null);

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

  // 일반 항목용 상태
  const [generalDetection, setGeneralDetection] = useState({
    status: '대기',
    confidence: 0,
    suggestedScore: null,
    message: ''
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const analysisHistoryRef = useRef([]);
  const previousAnalysisRef = useRef(null);
  const startTimeRef = useRef(null);

  const { navigateTo } = useNavigation();
  const { addTestResult } = useTestHistory();

  const currentBBSItem = BBS_ITEMS[currentItem];
  const isItem1 = currentItem === 0;
  const isItem2 = currentItem === 1;

  // 항목 2 전용 상태 - 잡지 않고 서 있기
  // testPhase: 'waiting' -> 'timing' -> 'complete'
  const [standingState, setStandingState] = useState({
    testPhase: 'waiting', // waiting, timing, complete
    currentState: 'not_standing',
    stabilityLevel: 'good',
    isStanding: false,
    isUsingSupport: false, // 지지물 사용 여부
    standingStartTime: null,
    standingDuration: 0,
    targetDuration: 120, // 2분
    supportSeekingCount: 0,
    unstableTime: 0,
    lostBalance: false,
    feedback: { message: '서 있는 자세를 취해주세요...', type: 'info' },
    autoScore: null,
    assessmentReport: null,
    showResultModal: false,
    debug: null
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
            newFeedback = { message: '앉은 자세 감지 중... 잠시 유지해주세요', type: 'info' };
          } else if (now - sittingConfirmedAt > 1500) {
            // 1.5초간 앉음 유지 = 확정
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

        // 일어서기 시작 감지
        if (analysis.standing?.confidence > 30 || analysis.isTransitioning) {
          newPhase = 'standing_up';
          newFeedback = { message: '일어서는 중...', type: 'info' };
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

        // 서있음 확정 감지
        if (analysis.state === PostureState.STANDING && analysis.standing?.confidence > 55) {
          if (!standingDetectedAt) {
            standingDetectedAt = now;
          } else if (now - standingDetectedAt > 1000) {
            // 1초간 서있음 유지 = 검사 완료!
            newPhase = 'complete';
            autoScore = calculateSitToStandScore(analysisHistoryRef.current);
            assessmentReport = generateAssessmentReport(analysisHistoryRef.current, autoScore);
            showResultModal = true;
            newFeedback = {
              message: usedHands ? '검사 완료 (손 사용으로 감점)' : '✓ 검사 완료! 훌륭합니다!',
              type: usedHands ? 'warning' : 'success'
            };
          } else {
            newFeedback = { message: '서있는 자세 확인 중...', type: 'info' };
          }
        } else {
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

  // 항목 2 전용 분석 - 잡지 않고 서 있기
  const handleItem2Analysis = useCallback((landmarks) => {
    if (!landmarks || landmarks.length < 33) {
      return { stability: 'good', isStanding: false, state: 'not_standing' };
    }

    const analysis = analyzeStandingUnsupported(landmarks);
    if (!analysis) {
      return { stability: 'good', isStanding: false, state: 'not_standing' };
    }

    const now = Date.now();

    setStandingState(prev => {
      let newPhase = prev.testPhase;
      let newFeedback = prev.feedback;
      let standingStartTime = prev.standingStartTime;
      let standingDuration = prev.standingDuration;
      let supportSeekingCount = prev.supportSeekingCount;
      let unstableTime = prev.unstableTime;
      let lostBalance = prev.lostBalance;
      let autoScore = prev.autoScore;
      let assessmentReport = prev.assessmentReport;
      let showResultModal = prev.showResultModal;

      // 단계 1: 서있기 대기 중
      if (prev.testPhase === 'waiting') {
        // 지지물 사용 중이면 타이머 시작하지 않음
        if (analysis.isUsingSupport) {
          newFeedback = {
            message: analysis.supportUsageMessage || '⚠️ 지지물을 놓아주세요',
            type: 'warning'
          };
        }
        // 지지 없이 서 있을 때만 타이머 시작
        else if (analysis.isStandingUnsupported && analysis.confidence > 0.6) {
          // 지지 없이 서있음 감지 - 타이머 시작
          if (!standingStartTime) {
            standingStartTime = now;
            newPhase = 'timing';
            newFeedback = { message: '✓ 지지 없이 서있음 확인! 유지해주세요', type: 'success' };
          }
        } else if (analysis.isStanding && !analysis.isStandingUnsupported) {
          // 서 있지만 지지물 사용 중
          newFeedback = { message: '⚠️ 지지물을 놓고 서 주세요', type: 'warning' };
        } else {
          newFeedback = { message: '서 있는 자세를 취해주세요...', type: 'info' };
        }
      }

      // 단계 2: 시간 측정 중
      if (prev.testPhase === 'timing') {
        if (standingStartTime) {
          standingDuration = (now - standingStartTime) / 1000;
        }

        // 지지물 사용 감지 (벽, 지팡이 등)
        if (analysis.isUsingSupport) {
          supportSeekingCount = prev.supportSeekingCount + 1;
          newFeedback = {
            message: analysis.supportUsageMessage || '⚠️ 지지물 사용 감지 (감독 필요)',
            type: 'warning'
          };
        }
        // 지지 요청 행동 감지
        else if (analysis.supportSeeking) {
          supportSeekingCount = prev.supportSeekingCount + 1;
          newFeedback = { message: analysis.supportMessage || '⚠️ 균형 유지 중', type: 'warning' };
        }

        // 불안정 시간 누적
        if (analysis.stability === 'poor' || analysis.stability === 'critical') {
          unstableTime = prev.unstableTime + 0.1; // 약 100ms마다 호출되므로
        }

        // 균형 상실 감지
        if (analysis.balanceLost) {
          lostBalance = true;
          // 균형 상실 시 즉시 완료
          newPhase = 'complete';
          autoScore = calculateStandingScore(standingDuration, supportSeekingCount > 5, true, unstableTime, 1);
          assessmentReport = generateStandingReport(autoScore.score, standingDuration, {
            avgStability: analysis.stability,
            supportEvents: supportSeekingCount
          });
          showResultModal = true;
          newFeedback = { message: '⚠️ 균형 상실 감지', type: 'error' };
        }
        // 목표 시간 달성 확인
        else if (standingDuration >= prev.targetDuration) {
          newPhase = 'complete';
          autoScore = calculateStandingScore(standingDuration, supportSeekingCount > 5, false, unstableTime, 1);
          assessmentReport = generateStandingReport(autoScore.score, standingDuration, {
            avgStability: analysis.stability,
            supportEvents: supportSeekingCount
          });
          showResultModal = true;
          newFeedback = { message: '✓ 2분 완료! 훌륭합니다!', type: 'success' };
        }
        // 30초 이상 버틴 경우 - 수동 완료 버튼 표시
        else if (standingDuration >= 30 && !analysis.isStanding) {
          // 서있지 않게 된 경우 (앉거나 넘어짐)
          newPhase = 'complete';
          autoScore = calculateStandingScore(standingDuration, supportSeekingCount > 5, false, unstableTime, 1);
          assessmentReport = generateStandingReport(autoScore.score, standingDuration, {
            avgStability: analysis.stability,
            supportEvents: supportSeekingCount
          });
          showResultModal = true;
          newFeedback = { message: `${standingDuration.toFixed(1)}초간 서 있음`, type: 'info' };
        }
        // 진행 중 피드백
        else {
          const remaining = Math.ceil(prev.targetDuration - standingDuration);
          if (analysis.stability === 'excellent' || analysis.stability === 'good') {
            newFeedback = { message: `안정적! 남은 시간: ${remaining}초`, type: 'success' };
          } else if (analysis.stability === 'moderate') {
            newFeedback = { message: `약간 흔들림 - 남은 시간: ${remaining}초`, type: 'warning' };
          } else {
            newFeedback = { message: `⚠️ 불안정 - 균형 유지하세요!`, type: 'error' };
          }
        }
      }

      return {
        ...prev,
        testPhase: newPhase,
        currentState: analysis.state,
        stabilityLevel: analysis.stability,
        isStanding: analysis.isStanding,
        isUsingSupport: analysis.isUsingSupport, // 지지물 사용 여부
        standingStartTime,
        standingDuration,
        supportSeekingCount,
        unstableTime,
        lostBalance,
        feedback: newFeedback,
        autoScore,
        assessmentReport,
        showResultModal,
        debug: analysis.debug
      };
    });

    return analysis;
  }, [standingState.testPhase]);

  // 일반 항목 분석
  const handleGeneralAnalysis = useCallback((landmarks) => {
    if (!currentBBSItem) return;

    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    const hipY = (leftHip.y + rightHip.y) / 2;
    const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipToAnkleRatio = (ankleY - hipY) / (ankleY - shoulderY);
    const isStanding = hipToAnkleRatio > 0.5;
    const isSitting = hipToAnkleRatio < 0.4;
    const ankleDistance = Math.abs(leftAnkle.x - rightAnkle.x);

    const detection = currentBBSItem.detection;
    let status = '감지 중';
    let confidence = 0;
    let suggestedScore = null;
    let message = '';

    switch (detection.type) {
      case 'standing_duration':
      case 'standing_feet_together':
        if (isStanding) {
          const elapsed = itemTimer;
          const required = currentBBSItem.duration || 120;
          confidence = Math.min(100, (elapsed / required) * 100);
          status = `서 있음 (${Math.floor(elapsed)}초)`;
          message = `${required}초 유지하세요`;

          if (detection.type === 'standing_feet_together' && ankleDistance > 0.15) {
            message = '발을 더 모아주세요';
            confidence = Math.max(0, confidence - 20);
          }

          if (elapsed >= required) {
            suggestedScore = 4;
            status = '완료!';
          } else if (elapsed >= required * 0.5) {
            suggestedScore = 3;
          }
        } else {
          status = '서 주세요';
          confidence = 0;
        }
        break;

      case 'sitting_duration':
        if (isSitting) {
          const elapsed = itemTimer;
          const required = currentBBSItem.duration || 120;
          confidence = Math.min(100, (elapsed / required) * 100);
          status = `앉아 있음 (${Math.floor(elapsed)}초)`;
          message = `${required}초 유지하세요`;

          if (elapsed >= required) {
            suggestedScore = 4;
            status = '완료!';
          }
        } else {
          status = '앉아 주세요';
          confidence = 0;
        }
        break;

      case 'stand_to_sit':
        if (isStanding) {
          status = '서 있음 감지';
          message = '앉으세요';
          confidence = 30;
        } else if (isSitting) {
          status = '앉음 감지!';
          message = '잘 하셨습니다!';
          confidence = 100;
          suggestedScore = 4;
        }
        break;

      default:
        status = '동작 수행 중';
        confidence = 50;
        message = currentBBSItem.instruction;
    }

    setGeneralDetection({ status, confidence, suggestedScore, message });
  }, [currentBBSItem, itemTimer]);

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
            const analysis = handleItem2Analysis(results.poseLandmarks);
            // 안정성에 따른 색상 - 문자열 비교 (null 체크 추가)
            if (analysis && analysis.stability) {
              skeletonColor = analysis.stability === 'excellent' ? '#10B981' :
                             analysis.stability === 'good' ? '#22C55E' :
                             analysis.stability === 'moderate' ? '#EAB308' :
                             analysis.stability === 'poor' ? '#F97316' : '#EF4444';
            }
          } else {
            handleGeneralAnalysis(results.poseLandmarks);
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

  // 항목 시작
  const startItem = async () => {
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

      // 음성 관련 초기화
      lastSpokenPhaseRef.current = null;

      // 시작 음성
      setTimeout(() => speak('벽이나 지팡이를 잡지 않고 서 계세요', 1.0), 500);

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

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setItemTimer(elapsed);
    }, 100);

    await initPose();
  };

  // 점수 저장
  const handleScore = (score) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }

    const newScores = [...scores];
    newScores[currentItem] = score;
    setScores(newScores);
    setIsAnalyzing(false);
    setItemTimer(0);
    setCurrentLandmarks(null);

    if (currentItem < 13) {
      setCurrentItem(currentItem + 1);
    } else {
      completeTest(newScores);
    }
  };

  // 테스트 완료
  const completeTest = (finalScores) => {
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
      details: { totalScore, scores: finalScores }
    };

    addTestResult(resultData);
    setIsComplete(true);
  };

  const getTotalScore = () => scores.reduce((a, b) => (a || 0) + (b || 0), 0);
  const getRiskLevel = () => calculateBBSRisk(getTotalScore());

  const resetTest = () => {
    setScores(Array(14).fill(null));
    setCurrentItem(0);
    setIsComplete(false);
    setShowSetup(true);
    setPatientInfo({ name: '홍길동', id: 'P-DEMO-001' });
    setIsAnalyzing(false);
    setItemTimer(0);
    setCurrentLandmarks(null);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (cameraRef.current) cameraRef.current.stop();
      // 음성 중단
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
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

  // 항목 2 음성 안내
  useEffect(() => {
    if (!isItem2 || !isAnalyzing) return;

    const phase = standingState.testPhase;
    const duration = standingState.standingDuration;

    // 단계별 음성 안내
    if (phase !== lastSpokenPhaseRef.current) {
      lastSpokenPhaseRef.current = phase;

      switch (phase) {
        case 'waiting':
          speak('지지물 없이 서 계세요', 1.0);
          break;
        case 'timing':
          speak('좋습니다. 지지 없이 자세를 유지하세요.', 1.0);
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

            <Button variant="bbs" size="lg" fullWidth onClick={() => setShowSetup(false)}>
              검사 시작
            </Button>
          </div>
        </main>
      </PageContainer>
    );
  }

  // 완료 화면
  if (isComplete) {
    const risk = getRiskLevel();
    const riskColors = getRiskColorClasses(risk.level);

    return (
      <PageContainer>
        <Header title="BBS 검사 결과" showBack={false} />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-white">검사 완료</h2>

            <Card padding="md" className="max-w-md mx-auto">
              <div className="text-center mb-6">
                <p className="text-slate-400 text-sm mb-1">총점</p>
                <p className="text-5xl font-bold text-white">
                  {getTotalScore()}<span className="text-xl text-slate-400 ml-1">/ 56점</span>
                </p>
              </div>

              <div className={`p-4 rounded-xl ${riskColors.bg} border ${riskColors.border}`}>
                <p className={`font-semibold ${riskColors.text}`}>낙상 위험도: {risk.label}</p>
              </div>

              <div className="mt-6 space-y-2 max-h-60 overflow-y-auto">
                {BBS_ITEMS.map((item, idx) => (
                  <div key={item.id} className="flex justify-between items-center p-2 bg-slate-800/50 rounded-lg">
                    <span className="text-slate-400 text-sm">{item.id}. {item.shortName}</span>
                    <span className="text-white font-medium">{scores[idx]}점</span>
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex gap-4 justify-center">
              <Button variant="secondary" onClick={() => navigateTo(PAGES.HOME)}>홈으로</Button>
              <Button variant="bbs" onClick={resetTest}>다시 검사</Button>
            </div>
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

            {/* 카메라 뷰 */}
            <div className="aspect-video bg-slate-800 rounded-2xl overflow-hidden relative">
              <video ref={videoRef} className="hidden" playsInline />
              <canvas ref={canvasRef} className="w-full h-full object-cover" />

              {/* 카메라 시작 전 */}
              {!isAnalyzing && !cameraLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <div className="text-center space-y-4">
                    <div className="w-24 h-24 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
                      <svg className="w-12 h-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-slate-300">전신이 보이도록 카메라를 배치해주세요</p>
                    <Button variant="bbs" size="lg" onClick={startItem}>
                      검사 시작
                    </Button>
                  </div>
                </div>
              )}

              {/* 카메라 로딩 중 */}
              {cameraLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-300">카메라 초기화 중...</p>
                  </div>
                </div>
              )}

              {/* 분석 중 오버레이 */}
              {isAnalyzing && !cameraLoading && (
                <>
                  {/* 상단 좌측: 자세 상태 */}
                  <div className="absolute top-4 left-4 space-y-2">
                    <div className={`px-4 py-2 rounded-xl backdrop-blur-sm shadow-lg ${
                      sitToStandState.currentPosture === PostureState.SITTING ? 'bg-yellow-500' :
                      sitToStandState.currentPosture === PostureState.STANDING ? 'bg-emerald-500' :
                      'bg-slate-600'
                    }`}>
                      <p className="text-white font-bold text-xl">
                        {sitToStandState.currentPosture === PostureState.SITTING && '🪑 앉음'}
                        {sitToStandState.currentPosture === PostureState.STANDING && '🧍 서있음'}
                        {sitToStandState.currentPosture === PostureState.UNKNOWN && '👀 감지 중'}
                      </p>
                    </div>

                    {/* 손 상태 */}
                    <div className={`px-3 py-2 rounded-lg backdrop-blur-sm ${
                      sitToStandState.handSupport === HandSupportState.HEAVY_SUPPORT ? 'bg-red-500 animate-pulse' :
                      sitToStandState.handPosition === HandPosition.HANDS_UP ? 'bg-emerald-500/80' :
                      'bg-slate-700/80'
                    }`}>
                      <p className="text-white font-medium text-sm">
                        {sitToStandState.handSupport === HandSupportState.HEAVY_SUPPORT && '⚠️ 손 사용! (감점)'}
                        {sitToStandState.handSupport !== HandSupportState.HEAVY_SUPPORT && sitToStandState.handPosition === HandPosition.HANDS_UP && '✓ 손 OK'}
                        {sitToStandState.handSupport !== HandSupportState.HEAVY_SUPPORT && sitToStandState.handPosition === HandPosition.HANDS_ON_KNEE && '손 무릎 위'}
                        {sitToStandState.handSupport !== HandSupportState.HEAVY_SUPPORT && sitToStandState.handPosition === HandPosition.UNKNOWN && '손 감지 중'}
                      </p>
                    </div>
                  </div>

                  {/* 상단 우측: 피드백 메시지 */}
                  <div className={`absolute top-4 right-4 px-4 py-3 rounded-xl backdrop-blur-sm shadow-lg max-w-[250px] ${
                    sitToStandState.feedback.type === 'success' ? 'bg-emerald-500' :
                    sitToStandState.feedback.type === 'error' ? 'bg-red-500' :
                    sitToStandState.feedback.type === 'warning' ? 'bg-yellow-500' :
                    'bg-blue-500'
                  }`}>
                    <p className="text-white font-bold text-lg">{sitToStandState.feedback.message}</p>
                  </div>

                  {/* 하단: 신뢰도 바 */}
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="bg-slate-900/90 backdrop-blur-sm p-4 rounded-xl">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-yellow-400">앉음</span>
                            <span className="text-white font-bold">{Math.round(sitToStandState.sittingConfidence)}%</span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-4">
                            <div
                              className={`h-4 rounded-full transition-all duration-300 ${
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
                          <div className="w-full bg-slate-700 rounded-full h-4">
                            <div
                              className={`h-4 rounded-full transition-all duration-300 ${
                                sitToStandState.testPhase === 'complete' ? 'bg-emerald-400' : 'bg-emerald-500/50'
                              }`}
                              style={{ width: `${sitToStandState.standingConfidence}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 단계별 안내 카드 */}
            {isAnalyzing && !sitToStandState.showResultModal && (
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
              </Card>
            )}
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

              {/* 버튼 */}
              <div className="p-6 bg-slate-800/50">
                <Button
                  variant="bbs"
                  size="lg"
                  fullWidth
                  onClick={() => handleScore(sitToStandState.assessmentReport.scoring.autoScore)}
                >
                  다음 항목으로 (항목 2) →
                </Button>
              </div>
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
                    서 있는 자세 취하기 → AI가 자세 확인
                  </li>
                  <li className={standingState.testPhase === 'complete' ? 'text-emerald-400' : ''}>
                    2분간 자세 유지 → 자동 채점
                  </li>
                </ol>
              </div>
            </Card>

            {/* 카메라 뷰 */}
            <div className="aspect-video bg-slate-800 rounded-2xl overflow-hidden relative">
              <video ref={videoRef} className="hidden" playsInline />
              <canvas ref={canvasRef} className="w-full h-full object-cover" />

              {/* 카메라 시작 전 */}
              {!isAnalyzing && !cameraLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <div className="text-center space-y-4">
                    <div className="w-24 h-24 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
                      <svg className="w-12 h-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-slate-300">전신이 보이도록 카메라를 배치해주세요</p>
                    <Button variant="bbs" size="lg" onClick={startItem}>
                      검사 시작
                    </Button>
                  </div>
                </div>
              )}

              {/* 카메라 로딩 중 */}
              {cameraLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-300">카메라 초기화 중...</p>
                  </div>
                </div>
              )}

              {/* 분석 중 오버레이 */}
              {isAnalyzing && !cameraLoading && (
                <>
                  {/* 상단 좌측: 타이머 */}
                  <div className="absolute top-4 left-4">
                    <div className="bg-slate-900/90 backdrop-blur-sm px-6 py-4 rounded-xl shadow-lg">
                      <p className="text-slate-400 text-sm mb-1">경과 시간</p>
                      <p className="text-white font-mono text-4xl font-bold">
                        {Math.floor(standingState.standingDuration / 60)}:{String(Math.floor(standingState.standingDuration % 60)).padStart(2, '0')}
                      </p>
                      <p className="text-slate-500 text-xs mt-1">목표: 2:00</p>
                    </div>
                  </div>

                  {/* 상단 우측: 피드백 메시지 */}
                  <div className={`absolute top-4 right-4 px-4 py-3 rounded-xl backdrop-blur-sm shadow-lg max-w-[250px] ${
                    standingState.feedback.type === 'success' ? 'bg-emerald-500' :
                    standingState.feedback.type === 'error' ? 'bg-red-500' :
                    standingState.feedback.type === 'warning' ? 'bg-yellow-500' :
                    'bg-blue-500'
                  }`}>
                    <p className="text-white font-bold text-lg">{standingState.feedback.message}</p>
                  </div>

                  {/* 하단: 진행률 바 */}
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="bg-slate-900/90 backdrop-blur-sm p-4 rounded-xl">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">진행률</span>
                        <span className="text-white font-bold">{Math.round(progressPercent)}%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-6 overflow-hidden">
                        <div
                          className={`h-6 rounded-full transition-all duration-300 flex items-center justify-end pr-2 ${
                            progressPercent >= 100 ? 'bg-emerald-500' :
                            progressPercent >= 50 ? 'bg-blue-500' :
                            'bg-blue-400'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        >
                          {progressPercent >= 15 && (
                            <span className="text-white text-xs font-bold">
                              {Math.floor(standingState.standingDuration)}초
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>0초</span>
                        <span className="text-yellow-400">30초 (최소)</span>
                        <span>2분</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 단계별 안내 카드 */}
            {isAnalyzing && !standingState.showResultModal && (
              <Card padding="md" className={`border-2 ${
                standingState.testPhase === 'waiting' ? 'border-slate-600' :
                standingState.testPhase === 'timing' ? 'border-blue-500' :
                'border-emerald-500'
              }`}>
                {standingState.testPhase === 'waiting' && (
                  <div className="text-center py-4">
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                      standingState.isUsingSupport ? 'bg-yellow-500/20' : 'bg-slate-700'
                    }`}>
                      <span className="text-4xl">{standingState.isUsingSupport ? '🚫' : '🧍'}</span>
                    </div>
                    {standingState.isUsingSupport ? (
                      <>
                        <h4 className="text-yellow-400 font-bold text-xl mb-2">⚠️ 지지물 사용 감지</h4>
                        <p className="text-slate-300">벽, 지팡이, 의자 등의 지지물을 놓아주세요</p>
                        <p className="text-yellow-400/80 text-sm mt-2">지지 없이 서면 타이머가 시작됩니다</p>
                      </>
                    ) : (
                      <>
                        <h4 className="text-white font-bold text-xl mb-2">지지물 없이 서 주세요</h4>
                        <p className="text-slate-400">벽이나 지팡이를 잡지 않고 서면 타이머가 시작됩니다</p>
                      </>
                    )}
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <div className={`w-3 h-3 rounded-full animate-pulse ${
                        standingState.isUsingSupport ? 'bg-yellow-500' : 'bg-blue-500'
                      }`} />
                      <span className={`text-sm ${
                        standingState.isUsingSupport ? 'text-yellow-400' : 'text-blue-400'
                      }`}>
                        {standingState.isUsingSupport ? '지지물 감지됨 - 놓아주세요' : '지지 없이 서 있는 자세 감지 중...'}
                      </span>
                    </div>
                  </div>
                )}

                {standingState.testPhase === 'timing' && (
                  <div className="text-center py-4">
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full ${currentStability.bg}/20 flex items-center justify-center`}>
                      <span className="text-4xl">⏱️</span>
                    </div>
                    <h4 className={`font-bold text-xl mb-2 ${currentStability.color}`}>
                      {currentStability.text} 상태
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
              </Card>
            )}
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

              {/* 버튼 */}
              <div className="p-6 bg-slate-800/50">
                <Button
                  variant="bbs"
                  size="lg"
                  fullWidth
                  onClick={() => handleScore(standingState.assessmentReport.score)}
                >
                  다음 항목으로 (항목 3) →
                </Button>
              </div>
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

          <div className="aspect-video bg-slate-800 rounded-2xl overflow-hidden relative">
            <video ref={videoRef} className="hidden" playsInline />
            <canvas ref={canvasRef} className="w-full h-full object-cover" />

            {!isAnalyzing && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                <Button variant="bbs" size="lg" onClick={startItem}>항목 시작</Button>
              </div>
            )}

            {isAnalyzing && (
              <>
                {currentBBSItem.duration > 0 && (
                  <div className="absolute top-4 left-4 bg-slate-900/80 px-4 py-2 rounded-full">
                    <span className="text-white font-mono text-xl">
                      {itemTimer.toFixed(1)}초 / {currentBBSItem.duration}초
                    </span>
                  </div>
                )}

                <div className="absolute top-4 right-4 bg-slate-900/80 px-4 py-2 rounded-xl text-right">
                  <p className="text-blue-400 font-medium">{generalDetection.status}</p>
                  {generalDetection.message && (
                    <p className="text-slate-400 text-xs">{generalDetection.message}</p>
                  )}
                </div>

                <div className="absolute bottom-4 left-4 right-4">
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
              </>
            )}
          </div>

          <Card padding="md">
            <h4 className="text-white font-semibold mb-3">점수 선택</h4>

            {generalDetection.suggestedScore !== null && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-emerald-400 text-sm">
                  <strong>AI 추천 점수:</strong> {generalDetection.suggestedScore}점
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 text-emerald-400"
                    onClick={() => handleScore(generalDetection.suggestedScore)}
                  >
                    적용
                  </Button>
                </p>
              </div>
            )}

            <div className="space-y-2">
              {currentBBSItem.scoring.map((option) => (
                <button
                  key={option.score}
                  onClick={() => handleScore(option.score)}
                  className={`w-full p-3 border rounded-xl text-left transition-all flex items-center gap-3
                    ${generalDetection.suggestedScore === option.score
                      ? 'bg-blue-500/20 border-blue-500/50'
                      : 'bg-slate-800/50 border-slate-700/50 hover:bg-blue-500/10 hover:border-blue-500/30'
                    }`}
                >
                  <span className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 font-bold">
                    {option.score}
                  </span>
                  <span className="text-slate-300 text-sm flex-1">{option.desc}</span>
                </button>
              ))}
            </div>
          </Card>

          <div className="flex gap-4">
            {currentItem > 0 && (
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  if (timerRef.current) clearInterval(timerRef.current);
                  if (cameraRef.current) {
                    cameraRef.current.stop();
                    cameraRef.current = null;
                  }
                  setIsAnalyzing(false);
                  setCurrentItem(currentItem - 1);
                }}
              >
                이전 항목
              </Button>
            )}
          </div>
        </div>
      </main>
    </PageContainer>
  );
}

export default BBSTestPage;
