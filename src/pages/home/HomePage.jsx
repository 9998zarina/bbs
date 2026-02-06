import { PageContainer, HomeHeader } from '../../components/layout';
import { Card } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useNavigation, PAGES } from '../../context/NavigationContext';
import { useTestHistory } from '../../context/TestHistoryContext';
import { TestCard, TestHistoryList, DashboardStats } from './components';

function HomePage() {
  const { user, logout } = useAuth();
  const { navigateTo, viewTestDetail } = useNavigation();
  const { testHistory, getStats } = useTestHistory();

  const handleLogout = () => {
    logout();
    navigateTo(PAGES.LOGIN);
  };

  const stats = getStats();

  // 각 검사 타입별 마지막 검사일 계산
  const getLastTestDate = (type) => {
    const lastTest = testHistory.find(t => t.type === type);
    return lastTest ? lastTest.date : null;
  };

  return (
    <PageContainer>
      <HomeHeader
        userName={user?.name || '사용자'}
        onLogout={handleLogout}
      />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* 환영 메시지 */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              안녕하세요, {user?.name || '사용자'}님
            </h2>
            <p className="text-slate-400">오늘도 환자분들의 건강한 회복을 응원합니다.</p>
          </div>

          {/* 통계 대시보드 */}
          <DashboardStats stats={stats} />

          {/* 검사 선택 */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">검사 시작</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <TestCard
                type="TUG"
                title="TUG 검사"
                description="의자에서 일어나 3m 걸어갔다 돌아오기"
                lastTestDate={getLastTestDate('TUG')}
                onClick={() => navigateTo(PAGES.TUG)}
              />
              <TestCard
                type="BBS"
                title="BBS 검사"
                description="14개 항목의 균형 능력 평가"
                lastTestDate={getLastTestDate('BBS')}
                onClick={() => navigateTo(PAGES.BBS)}
              />
              <TestCard
                type="10M"
                title="10M 보행검사"
                description="10미터 보행 속도 측정"
                lastTestDate={getLastTestDate('10M')}
                onClick={() => navigateTo(PAGES.WALK_10M)}
              />
            </div>
          </div>

          {/* 최근 검사 기록 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">최근 검사 기록</h3>
              {testHistory.length > 5 && (
                <button className="text-emerald-400 text-sm hover:text-emerald-300 transition-colors">
                  전체 보기
                </button>
              )}
            </div>
            <Card padding="md">
              <TestHistoryList
                tests={testHistory}
                onViewTest={viewTestDetail}
                maxItems={5}
              />
            </Card>
          </div>
        </div>
      </main>
    </PageContainer>
  );
}

export default HomePage;
