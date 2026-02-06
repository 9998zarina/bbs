import { createContext, useContext, useState, useCallback } from 'react';

// Navigation Context 생성
const NavigationContext = createContext(null);

// 페이지 정의
export const PAGES = {
  LOGIN: 'login',
  SIGNUP: 'signup',
  HOME: 'home',
  TUG: 'tug',
  BBS: 'bbs',
  WALK_10M: 'walk10m',
  TEST_DETAIL: 'testDetail'
};

// Navigation Provider 컴포넌트
export function NavigationProvider({ children, initialPage = PAGES.LOGIN }) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageParams, setPageParams] = useState(null);
  const [history, setHistory] = useState([initialPage]);

  // 페이지 이동
  const navigateTo = useCallback((page, params = null) => {
    setCurrentPage(page);
    setPageParams(params);
    setHistory(prev => [...prev, page]);
  }, []);

  // 뒤로가기
  const goBack = useCallback(() => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop(); // 현재 페이지 제거
      const previousPage = newHistory[newHistory.length - 1];
      setCurrentPage(previousPage);
      setHistory(newHistory);
      setPageParams(null);
    }
  }, [history]);

  // 홈으로 이동
  const goHome = useCallback(() => {
    navigateTo(PAGES.HOME);
  }, [navigateTo]);

  // 검사 상세 페이지로 이동
  const viewTestDetail = useCallback((test) => {
    navigateTo(PAGES.TEST_DETAIL, { test });
  }, [navigateTo]);

  // 특정 페이지인지 확인
  const isPage = useCallback((page) => {
    return currentPage === page;
  }, [currentPage]);

  const value = {
    currentPage,
    pageParams,
    history,
    navigateTo,
    goBack,
    goHome,
    viewTestDetail,
    isPage,
    PAGES
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

// Navigation 훅
export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

export default NavigationContext;
