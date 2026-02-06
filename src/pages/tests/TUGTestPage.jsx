import { useState, useRef, useEffect, useCallback } from 'react';
import { PageContainer, Header } from '../../components/layout';
import { Button, Card, Alert, ProgressBar } from '../../components/ui';
import { PatientInfoForm } from '../../components/forms';
import { drawConnections, drawLandmarks } from '../../utils/poseDrawing';
import { analyzePose } from '../../utils/poseAnalysis';
import { calculateTUGRisk, getRiskColorClasses } from '../../utils/riskCalculation';
import { useNavigation, PAGES } from '../../context/NavigationContext';
import { useTestHistory } from '../../context/TestHistoryContext';

function TUGTestPage() {
  const [step, setStep] = useState('setup'); // setup, ready, measuring, complete
  const [timer, setTimer] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('대기');
  const [patientInfo, setPatientInfo] = useState({ name: '홍길동', id: 'P-DEMO-001' });
  const [results, setResults] = useState(null);

  // 영상 관련 상태
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);
  const poseRef = useRef(null);
  const animationRef = useRef(null);

  const { navigateTo } = useNavigation();
  const { addTestResult } = useTestHistory();

  // 파일 선택 핸들러
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
    }
  };

  // 영상 메타데이터 로드
  const handleVideoLoaded = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
      // 캔버스 크기 설정
      if (canvasRef.current) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
      }
    }
  };

  // MediaPipe 초기화
  const initPose = useCallback(async () => {
    try {
      const { Pose } = await import('@mediapipe/pose');

      const pose = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      pose.onResults((results) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

        if (results.poseLandmarks) {
          drawConnections(ctx, results.poseLandmarks, canvas.width, canvas.height);
          drawLandmarks(ctx, results.poseLandmarks, canvas.width, canvas.height);

          // 포즈 분석
          const analysis = analyzePose(results.poseLandmarks);
          if (analysis) {
            if (analysis.posture === 'sitting') {
              setCurrentPhase('앉은 상태');
            } else if (analysis.posture === 'standing') {
              setCurrentPhase(analysis.isWalking ? '보행 중' : '서 있음');
            } else {
              setCurrentPhase('이동 중');
            }
          }
        }

        ctx.restore();
      });

      poseRef.current = pose;
      return pose;
    } catch (error) {
      console.error('Pose init error:', error);
      return null;
    }
  }, []);

  // 영상 분석 시작
  const startAnalysis = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsAnalyzing(true);
    setStep('measuring');
    setTimer(0);
    setCurrentPhase('분석 시작');

    // MediaPipe 초기화
    const pose = await initPose();
    if (!pose) {
      alert('포즈 감지 초기화에 실패했습니다.');
      setIsAnalyzing(false);
      return;
    }

    // 영상 처음으로
    videoRef.current.currentTime = 0;
    videoRef.current.play();

    // 타이머 시작
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setTimer(elapsed);
    }, 100);

    // 프레임 분석 루프
    const analyzeFrame = async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        return;
      }

      try {
        await pose.send({ image: videoRef.current });
      } catch (e) {
        console.error('Frame analysis error:', e);
      }

      // 진행률 업데이트
      const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setAnalysisProgress(progress);
      setCurrentTime(videoRef.current.currentTime);

      animationRef.current = requestAnimationFrame(analyzeFrame);
    };

    analyzeFrame();
  };

  // 영상 종료 핸들러
  const handleVideoEnded = () => {
    if (step === 'measuring') {
      stopMeasurement();
    }
  };

  // 측정 중단
  const stopMeasurement = () => {
    // 타이머 중지
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // 애니메이션 프레임 중지
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // 영상 일시정지
    if (videoRef.current) {
      videoRef.current.pause();
    }

    setIsAnalyzing(false);

    const totalTime = timer.toFixed(1);
    const risk = calculateTUGRisk(parseFloat(totalTime));

    const resultData = {
      id: Date.now(),
      type: 'TUG',
      patient: patientInfo.name || '미입력',
      patientId: patientInfo.id || '-',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      result: `${totalTime}초`,
      risk: risk.label,
      details: {
        totalTime,
        videoFile: videoFile?.name || '없음',
        phases: { sitToStand: '-', walkGo: '-', turn: '-', walkBack: '-', standToSit: '-' }
      }
    };

    addTestResult(resultData);
    setResults({ totalTime, risk });
    setStep('complete');
  };

  // 재설정
  const resetMeasurement = () => {
    setStep('setup');
    setTimer(0);
    setCurrentPhase('대기');
    setResults(null);
    setPatientInfo({ name: '홍길동', id: 'P-DEMO-001' });
    setVideoFile(null);
    setVideoUrl(null);
    setAnalysisProgress(0);
    setCurrentTime(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  return (
    <PageContainer>
      <Header
        title="TUG 검사"
        onBack={() => navigateTo(PAGES.HOME)}
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Setup 단계 */}
        {step === 'setup' && (
          <div className="space-y-6">
            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">TUG 검사 안내</h3>
              <div className="text-slate-400 text-sm space-y-2">
                <p>1. 환자가 팔걸이가 있는 의자에 앉습니다</p>
                <p>2. "시작" 신호와 함께 일어납니다</p>
                <p>3. 3미터 전방의 표시까지 걸어갑니다</p>
                <p>4. 돌아서 다시 의자로 돌아와 앉습니다</p>
              </div>

              <Alert type="info" className="mt-4">
                <strong>판정 기준:</strong> 10초 이내(정상), 10-14초(경미한 이동성 문제), 14초 이상(낙상 위험 높음)
              </Alert>
            </Card>

            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">환자 정보</h3>
              <PatientInfoForm
                patientInfo={patientInfo}
                onChange={setPatientInfo}
                accentColor="emerald"
              />
            </Card>

            {/* 영상 업로드 */}
            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">검사 영상 업로드</h3>

              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {!videoFile ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-8 border-2 border-dashed border-slate-700 rounded-xl hover:border-emerald-500/50 hover:bg-slate-800/30 transition-all group"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-emerald-500/20 transition-colors">
                      <svg className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-slate-400 mb-1">클릭하여 영상 파일을 선택하세요</p>
                    <p className="text-slate-500 text-sm">MP4, MOV, AVI 등 지원</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-4">
                  {/* 영상 미리보기 */}
                  <div className="aspect-video bg-slate-800 rounded-xl overflow-hidden relative">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full h-full object-contain"
                      onLoadedMetadata={handleVideoLoaded}
                      onEnded={handleVideoEnded}
                      controls
                    />
                  </div>

                  {/* 파일 정보 */}
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{videoFile.name}</p>
                        <p className="text-slate-500 text-xs">
                          {(videoFile.size / 1024 / 1024).toFixed(2)} MB
                          {videoDuration > 0 && ` • ${Math.floor(videoDuration)}초`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setVideoFile(null);
                        setVideoUrl(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </Card>

            <Button
              variant="tug"
              size="lg"
              fullWidth
              onClick={() => setStep('ready')}
              disabled={!videoFile}
            >
              {videoFile ? '분석 준비' : '영상을 먼저 선택하세요'}
            </Button>
          </div>
        )}

        {/* Ready 단계 */}
        {step === 'ready' && (
          <div className="space-y-6">
            <Card padding="md">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-semibold">분석 준비 완료</h3>
                  <p className="text-slate-400 text-sm">{videoFile?.name}</p>
                </div>
              </div>

              <div className="aspect-video bg-slate-800 rounded-xl overflow-hidden relative">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  onLoadedMetadata={handleVideoLoaded}
                  onEnded={handleVideoEnded}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={{ display: 'none' }}
                />
              </div>

              <Alert type="warning" className="mt-4">
                "분석 시작" 버튼을 누르면 영상이 재생되면서 AI가 자세를 분석합니다.
                영상이 끝나면 자동으로 측정이 완료됩니다.
              </Alert>
            </Card>

            <div className="flex gap-4">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setStep('setup')}
              >
                이전
              </Button>
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                onClick={startAnalysis}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              >
                분석 시작
              </Button>
            </div>
          </div>
        )}

        {/* Measuring 단계 */}
        {step === 'measuring' && (
          <div className="space-y-6">
            <div className="aspect-video bg-slate-800 rounded-2xl overflow-hidden relative">
              <video
                ref={videoRef}
                src={videoUrl}
                className="absolute inset-0 w-full h-full object-contain"
                onEnded={handleVideoEnded}
                muted
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-contain"
              />

              {/* 타이머 */}
              <div className="absolute top-4 left-4 bg-slate-900/80 px-4 py-2 rounded-full">
                <span className="text-white font-mono text-2xl">{timer.toFixed(1)}초</span>
              </div>

              {/* 분석 중 표시 */}
              <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-500/20 px-3 py-1 rounded-full">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-sm">분석 중</span>
              </div>

              {/* 현재 단계 */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500/20 border border-emerald-500/30 px-4 py-2 rounded-full">
                <span className="text-emerald-400 font-medium">{currentPhase}</span>
              </div>
            </div>

            {/* 진행률 */}
            <ProgressBar
              progress={analysisProgress}
              color="emerald"
              height="md"
              showLabel
            />

            <Button
              variant="bbs"
              size="xl"
              fullWidth
              onClick={stopMeasurement}
            >
              STOP - 분석 완료
            </Button>
          </div>
        )}

        {/* Complete 단계 */}
        {step === 'complete' && results && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-white">TUG 검사 완료</h2>

            <Card padding="md" className="max-w-md mx-auto">
              <div className="text-center mb-6">
                <p className="text-slate-400 text-sm mb-1">총 소요 시간</p>
                <p className="text-5xl font-bold text-white">
                  {results.totalTime}<span className="text-xl text-slate-400 ml-1">초</span>
                </p>
              </div>

              <div className={`p-4 rounded-xl ${getRiskColorClasses(results.risk.level).bg} border ${getRiskColorClasses(results.risk.level).border}`}>
                <p className={`font-semibold ${getRiskColorClasses(results.risk.level).text}`}>
                  낙상 위험도: {results.risk.label}
                </p>
                <p className={`text-sm mt-1 opacity-70 ${getRiskColorClasses(results.risk.level).text}`}>
                  {results.risk.level === 'low' && '정상 범위입니다.'}
                  {results.risk.level === 'medium' && '경미한 이동성 문제가 있습니다.'}
                  {results.risk.level === 'high' && '낙상 위험이 높습니다. 주의가 필요합니다.'}
                </p>
              </div>
            </Card>

            <div className="flex gap-4 justify-center">
              <Button
                variant="secondary"
                onClick={() => navigateTo(PAGES.HOME)}
              >
                홈으로
              </Button>
              <Button
                variant="tug"
                onClick={resetMeasurement}
              >
                다시 측정
              </Button>
            </div>
          </div>
        )}
      </main>
    </PageContainer>
  );
}

export default TUGTestPage;
