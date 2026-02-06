import { useState, useRef, useEffect } from 'react';
import { PageContainer, Header } from '../../components/layout';
import { Button, Card, Alert } from '../../components/ui';
import { CameraView, TimerDisplay, RecordingIndicator, GuideMessage } from '../../components/camera';
import { PatientInfoForm } from '../../components/forms';
import { usePoseDetection } from '../../hooks';
import { calculate10MRisk, getRiskColorClasses } from '../../utils/riskCalculation';
import { useNavigation, PAGES } from '../../context/NavigationContext';
import { useTestHistory } from '../../context/TestHistoryContext';

function Walk10MTestPage() {
  const [step, setStep] = useState('setup'); // setup, ready, measuring, complete
  const [timer, setTimer] = useState(0);
  const [patientInfo, setPatientInfo] = useState({ name: '홍길동', id: 'P-DEMO-001' });
  const [results, setResults] = useState(null);
  const [distance] = useState(10); // 10미터 고정

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);

  const { navigateTo } = useNavigation();
  const { addTestResult } = useTestHistory();

  const isActive = step === 'ready' || step === 'measuring';
  const { isLoading } = usePoseDetection(videoRef, canvasRef, isActive);

  // 타이머 관리
  useEffect(() => {
    if (step === 'measuring') {
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 0.1);
      }, 100);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [step]);

  const startMeasurement = () => {
    setStep('measuring');
    setTimer(0);
  };

  const stopMeasurement = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    const totalTime = timer.toFixed(2);
    const speed = (distance / parseFloat(totalTime)).toFixed(2);
    const risk = calculate10MRisk(parseFloat(speed));

    const resultData = {
      id: Date.now(),
      type: '10M',
      patient: patientInfo.name || '미입력',
      patientId: patientInfo.id || '-',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      result: `${speed}m/s`,
      risk: risk.label,
      details: {
        totalTime,
        speed,
        distance
      }
    };

    addTestResult(resultData);
    setResults({ totalTime, speed, risk });
    setStep('complete');
  };

  const resetMeasurement = () => {
    setStep('setup');
    setTimer(0);
    setResults(null);
    setPatientInfo({ name: '홍길동', id: 'P-DEMO-001' });
  };

  return (
    <PageContainer>
      <Header
        title="10M 보행검사"
        onBack={() => navigateTo(PAGES.HOME)}
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Setup 단계 */}
        {step === 'setup' && (
          <div className="space-y-6">
            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">10미터 보행검사 안내</h3>
              <div className="text-slate-400 text-sm space-y-2">
                <p>1. 총 14미터 구간을 설정합니다 (가속 2m + 측정 10m + 감속 2m)</p>
                <p>2. 환자가 시작선에서 출발합니다</p>
                <p>3. 10미터 측정 구간의 시작점에서 타이머를 시작합니다</p>
                <p>4. 측정 구간 종료점에서 타이머를 멈춥니다</p>
              </div>

              {/* 거리 안내 다이어그램 */}
              <div className="mt-4 p-4 bg-slate-800/50 rounded-xl">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span>시작</span>
                  <span>측정 시작</span>
                  <span>측정 종료</span>
                  <span>끝</span>
                </div>
                <div className="flex h-4 rounded-full overflow-hidden">
                  <div className="w-[14%] bg-purple-500/30" />
                  <div className="w-[72%] bg-purple-500" />
                  <div className="w-[14%] bg-purple-500/30" />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                  <span>2m</span>
                  <span>10m</span>
                  <span>2m</span>
                </div>
              </div>

              <Alert type="info" className="mt-4">
                <strong>판정 기준:</strong> 1.0m/s 이상(정상), 0.8-1.0m/s(경도 장애), 0.8m/s 미만(기능적 제한)
              </Alert>
            </Card>

            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">환자 정보</h3>
              <PatientInfoForm
                patientInfo={patientInfo}
                onChange={setPatientInfo}
                accentColor="purple"
              />
            </Card>

            <Button
              variant="walk10m"
              size="lg"
              fullWidth
              onClick={() => setStep('ready')}
            >
              카메라 시작
            </Button>
          </div>
        )}

        {/* Ready 단계 */}
        {step === 'ready' && (
          <div className="space-y-6">
            <CameraView
              videoRef={videoRef}
              canvasRef={canvasRef}
              isLoading={isLoading}
              loadingColor="purple"
              overlay={
                <>
                  {/* 시작선/종료선 표시 */}
                  <div className="absolute left-0 right-0 top-[30%] border-t-2 border-dashed border-yellow-500/50" />
                  <div className="absolute left-4 top-[30%] -translate-y-full text-yellow-500 text-xs">
                    시작선 (10m)
                  </div>
                  <div className="absolute left-0 right-0 bottom-[20%] border-t-2 border-dashed border-yellow-500/50" />
                  <div className="absolute left-4 bottom-[20%] translate-y-1 text-yellow-500 text-xs">
                    종료선 (0m)
                  </div>
                </>
              }
              bottomOverlay={
                <GuideMessage message="환자가 시작선을 통과하면 GO 버튼을 누르세요" />
              }
            />

            <Button
              variant="success"
              size="xl"
              fullWidth
              onClick={startMeasurement}
              disabled={isLoading}
            >
              GO - 측정 시작
            </Button>
          </div>
        )}

        {/* Measuring 단계 */}
        {step === 'measuring' && (
          <div className="space-y-6">
            <CameraView
              videoRef={videoRef}
              canvasRef={canvasRef}
              overlay={
                <>
                  {/* 시작선 (녹색) */}
                  <div className="absolute left-0 right-0 top-[30%] border-t-4 border-emerald-500" />
                  <div className="absolute left-4 top-[30%] -translate-y-full bg-emerald-500 text-white text-xs px-2 py-1 rounded">
                    START
                  </div>
                  {/* 종료선 (빨간색) */}
                  <div className="absolute left-0 right-0 bottom-[20%] border-t-4 border-red-500" />
                  <div className="absolute left-4 bottom-[20%] translate-y-1 bg-red-500 text-white text-xs px-2 py-1 rounded">
                    FINISH
                  </div>
                </>
              }
              topLeftOverlay={<TimerDisplay time={timer} />}
              topRightOverlay={<RecordingIndicator />}
            />

            <Button
              variant="danger"
              size="xl"
              fullWidth
              onClick={stopMeasurement}
            >
              STOP - 측정 완료
            </Button>
          </div>
        )}

        {/* Complete 단계 */}
        {step === 'complete' && results && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-white">10M 보행검사 완료</h2>

            <Card padding="md" className="max-w-md mx-auto">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center">
                  <p className="text-slate-400 text-sm mb-1">소요 시간</p>
                  <p className="text-3xl font-bold text-white">{results.totalTime}초</p>
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-sm mb-1">보행 속도</p>
                  <p className="text-3xl font-bold text-white">{results.speed}m/s</p>
                </div>
              </div>

              <div className={`p-4 rounded-xl ${getRiskColorClasses(results.risk.level).bg} border ${getRiskColorClasses(results.risk.level).border}`}>
                <p className={`font-semibold ${getRiskColorClasses(results.risk.level).text}`}>
                  기능 수준: {results.risk.label}
                </p>
                <p className={`text-sm mt-1 opacity-70 ${getRiskColorClasses(results.risk.level).text}`}>
                  {results.risk.level === 'low' && '정상 보행 속도입니다.'}
                  {results.risk.level === 'medium' && '경도의 보행 장애가 있습니다.'}
                  {results.risk.level === 'high' && '기능적 보행 제한이 있습니다.'}
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
                variant="walk10m"
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

export default Walk10MTestPage;
