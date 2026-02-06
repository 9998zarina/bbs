import { AuthProvider, useAuth } from './context/AuthContext';
import { NavigationProvider, useNavigation, PAGES } from './context/NavigationContext';
import { TestHistoryProvider } from './context/TestHistoryContext';

import { LoginPage, SignupPage } from './pages/auth';
import { HomePage } from './pages/home';
import { TUGTestPage, BBSTestPage, Walk10MTestPage } from './pages/tests';
import { TestDetailPage } from './pages/detail';

import './index.css';

// 메인 라우터 컴포넌트
function AppRouter() {
  const { currentPage } = useNavigation();
  const { isAuthenticated } = useAuth();

  // 인증되지 않은 경우 로그인 페이지로
  if (!isAuthenticated && currentPage !== PAGES.LOGIN && currentPage !== PAGES.SIGNUP) {
    return <LoginPage />;
  }

  // 페이지 라우팅
  switch (currentPage) {
    case PAGES.LOGIN:
      return <LoginPage />;
    case PAGES.SIGNUP:
      return <SignupPage />;
    case PAGES.HOME:
      return <HomePage />;
    case PAGES.TUG:
      return <TUGTestPage />;
    case PAGES.BBS:
      return <BBSTestPage />;
    case PAGES.WALK_10M:
      return <Walk10MTestPage />;
    case PAGES.TEST_DETAIL:
      return <TestDetailPage />;
    default:
      return <LoginPage />;
  }
}

// 메인 App 컴포넌트
export default function App() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <TestHistoryProvider>
          <div className="min-h-screen bg-slate-950">
            <AppRouter />
          </div>
        </TestHistoryProvider>
      </NavigationProvider>
    </AuthProvider>
  );
}
