import { Badge } from '../../../components/ui';

// 위험도 맵핑
const riskMap = {
  '낮음': 'low',
  '중간': 'medium',
  '높음': 'high'
};

function TestHistoryItem({ test, onClick }) {
  return (
    <button
      onClick={() => onClick(test)}
      className="w-full p-4 bg-slate-800/30 hover:bg-slate-800/50 rounded-xl flex items-center justify-between transition-all group"
    >
      <div className="flex items-center gap-4">
        <Badge variant="testType" value={test.type} size="md" />
        <div className="text-left">
          <p className="text-white font-medium">{test.patient}</p>
          <p className="text-slate-500 text-sm">{test.date} {test.time}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-white font-semibold">{test.result}</p>
          <Badge variant="risk" value={riskMap[test.risk]} size="sm" />
        </div>
        <svg
          className="w-5 h-5 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-1 transition-all"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

function TestHistoryList({
  tests,
  onViewTest,
  emptyMessage = '검사 기록이 없습니다',
  maxItems
}) {
  const displayTests = maxItems ? tests.slice(0, maxItems) : tests;

  if (tests.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p className="text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayTests.map((test) => (
        <TestHistoryItem
          key={test.id}
          test={test}
          onClick={onViewTest}
        />
      ))}
    </div>
  );
}

export default TestHistoryList;
