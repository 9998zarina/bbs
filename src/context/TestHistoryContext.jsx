import { createContext, useContext, useState, useCallback } from 'react';

// Test History Context 생성
const TestHistoryContext = createContext(null);

// 초기 샘플 데이터
const initialTestHistory = [
  {
    id: 1,
    type: 'TUG',
    patient: '김OO',
    patientId: 'P-001',
    date: '2024-01-15',
    time: '14:30',
    result: '12.5초',
    risk: '중간',
    details: {
      totalTime: '12.5',
      phases: { sitToStand: '2.1', walkGo: '3.2', turn: '1.8', walkBack: '3.2', standToSit: '2.2' }
    }
  },
  {
    id: 2,
    type: 'BBS',
    patient: '이OO',
    patientId: 'P-002',
    date: '2024-01-14',
    time: '10:15',
    result: '48점',
    risk: '낮음',
    details: {
      totalScore: 48,
      scores: [4, 4, 4, 3, 4, 3, 4, 3, 3, 4, 3, 3, 3, 3]
    }
  },
  {
    id: 3,
    type: '10M',
    patient: '박OO',
    patientId: 'P-003',
    date: '2024-01-14',
    time: '09:00',
    result: '1.2m/s',
    risk: '낮음',
    details: {
      totalTime: '8.33',
      speed: '1.2',
      distance: 10
    }
  },
];

// Test History Provider 컴포넌트
export function TestHistoryProvider({ children }) {
  const [testHistory, setTestHistory] = useState(initialTestHistory);

  // 검사 결과 추가
  const addTestResult = useCallback((newTest) => {
    setTestHistory(prev => [newTest, ...prev]);
  }, []);

  // 검사 결과 삭제
  const deleteTestResult = useCallback((testId) => {
    setTestHistory(prev => prev.filter(test => test.id !== testId));
  }, []);

  // 검사 결과 수정
  const updateTestResult = useCallback((testId, updates) => {
    setTestHistory(prev =>
      prev.map(test =>
        test.id === testId ? { ...test, ...updates } : test
      )
    );
  }, []);

  // 타입별 검사 필터링
  const getTestsByType = useCallback((type) => {
    return testHistory.filter(test => test.type === type);
  }, [testHistory]);

  // 환자별 검사 필터링
  const getTestsByPatient = useCallback((patientId) => {
    return testHistory.filter(test => test.patientId === patientId);
  }, [testHistory]);

  // 검사 ID로 찾기
  const getTestById = useCallback((testId) => {
    return testHistory.find(test => test.id === testId);
  }, [testHistory]);

  // 통계 계산
  const getStats = useCallback(() => {
    const total = testHistory.length;
    const byType = {
      TUG: testHistory.filter(t => t.type === 'TUG').length,
      BBS: testHistory.filter(t => t.type === 'BBS').length,
      '10M': testHistory.filter(t => t.type === '10M').length
    };
    const byRisk = {
      low: testHistory.filter(t => t.risk === '낮음').length,
      medium: testHistory.filter(t => t.risk === '중간').length,
      high: testHistory.filter(t => t.risk === '높음').length
    };
    return { total, byType, byRisk };
  }, [testHistory]);

  const value = {
    testHistory,
    addTestResult,
    deleteTestResult,
    updateTestResult,
    getTestsByType,
    getTestsByPatient,
    getTestById,
    getStats
  };

  return (
    <TestHistoryContext.Provider value={value}>
      {children}
    </TestHistoryContext.Provider>
  );
}

// Test History 훅
export function useTestHistory() {
  const context = useContext(TestHistoryContext);
  if (!context) {
    throw new Error('useTestHistory must be used within a TestHistoryProvider');
  }
  return context;
}

export default TestHistoryContext;
