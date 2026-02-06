import { PageContainer, Header } from '../../components/layout';
import { Card, Badge, Button } from '../../components/ui';
import { BBS_ITEMS } from '../../constants';
import { getRiskColorClasses } from '../../utils/riskCalculation';
import { useNavigation, PAGES } from '../../context/NavigationContext';

// 위험도 맵핑
const riskMap = {
  '낮음': 'low',
  '중간': 'medium',
  '높음': 'high',
  '정상': 'low',
  '경도 장애': 'medium',
  '기능적 제한': 'high'
};

function TestDetailPage() {
  const { pageParams, navigateTo } = useNavigation();
  const test = pageParams?.test;

  if (!test) {
    return (
      <PageContainer>
        <Header
          title="검사 상세"
          onBack={() => navigateTo(PAGES.HOME)}
        />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Card padding="lg" className="text-center">
            <p className="text-slate-400">검사 정보를 찾을 수 없습니다.</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => navigateTo(PAGES.HOME)}
            >
              홈으로 돌아가기
            </Button>
          </Card>
        </main>
      </PageContainer>
    );
  }

  const riskLevel = riskMap[test.risk] || 'medium';
  const riskColors = getRiskColorClasses(riskLevel);

  return (
    <PageContainer>
      <Header
        title={`${test.type} 검사 결과`}
        onBack={() => navigateTo(PAGES.HOME)}
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* 기본 정보 */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="testType" value={test.type} size="lg" />
              <span className="text-slate-500 text-sm">{test.date} {test.time}</span>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-slate-500 text-sm">환자</p>
                <p className="text-white font-medium">{test.patient}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm">환자 ID</p>
                <p className="text-white font-medium">{test.patientId}</p>
              </div>
            </div>

            {/* 결과 */}
            <div className="text-center py-6 bg-slate-800/30 rounded-xl mb-4">
              <p className="text-slate-400 text-sm mb-1">결과</p>
              <p className="text-4xl font-bold text-white">{test.result}</p>
            </div>

            {/* 위험도 */}
            <div className={`p-4 rounded-xl ${riskColors.bg} border ${riskColors.border}`}>
              <p className={`font-semibold ${riskColors.text}`}>
                {test.type === '10M' ? '기능 수준' : '낙상 위험도'}: {test.risk}
              </p>
            </div>
          </Card>

          {/* 상세 정보 - TUG */}
          {test.type === 'TUG' && test.details && (
            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">상세 정보</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg">
                  <span className="text-slate-400">총 소요 시간</span>
                  <span className="text-white font-medium">{test.details.totalTime}초</span>
                </div>
                {test.details.phases && (
                  <>
                    <p className="text-slate-500 text-sm mt-4 mb-2">단계별 시간</p>
                    {Object.entries(test.details.phases).map(([phase, time]) => (
                      <div key={phase} className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg">
                        <span className="text-slate-400">
                          {phase === 'sitToStand' && '앉기→서기'}
                          {phase === 'walkGo' && '걸어가기'}
                          {phase === 'turn' && '회전'}
                          {phase === 'walkBack' && '돌아오기'}
                          {phase === 'standToSit' && '서기→앉기'}
                        </span>
                        <span className="text-white font-medium">{time}초</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </Card>
          )}

          {/* 상세 정보 - BBS */}
          {test.type === 'BBS' && test.details && (
            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">상세 정보</h3>
              <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg mb-4">
                <span className="text-slate-400">총점</span>
                <span className="text-white font-medium">{test.details.totalScore} / 56점</span>
              </div>
              <p className="text-slate-500 text-sm mb-2">항목별 점수</p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {BBS_ITEMS.map((item, idx) => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg">
                    <span className="text-slate-400 text-sm">{item.id}. {item.name}</span>
                    <span className="text-white font-medium">{test.details.scores?.[idx] ?? '-'}점</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 상세 정보 - 10M */}
          {test.type === '10M' && test.details && (
            <Card padding="md">
              <h3 className="text-white font-semibold mb-4">상세 정보</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg">
                  <span className="text-slate-400">측정 거리</span>
                  <span className="text-white font-medium">{test.details.distance}m</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg">
                  <span className="text-slate-400">소요 시간</span>
                  <span className="text-white font-medium">{test.details.totalTime}초</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg">
                  <span className="text-slate-400">보행 속도</span>
                  <span className="text-white font-medium">{test.details.speed}m/s</span>
                </div>
              </div>
            </Card>
          )}

          {/* 액션 버튼 */}
          <div className="flex gap-4">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => navigateTo(PAGES.HOME)}
            >
              홈으로
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                // PDF 내보내기 기능 (향후 구현)
                alert('PDF 내보내기 기능은 준비 중입니다.');
              }}
            >
              PDF 내보내기
            </Button>
          </div>
        </div>
      </main>
    </PageContainer>
  );
}

export default TestDetailPage;
