import { useState } from 'react';
import { PageContainer, DecorativeBackground } from '../../components/layout';
import { Button, Input, Alert, Card } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useNavigation, PAGES } from '../../context/NavigationContext';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const { login, isLoading, error, clearError } = useAuth();
  const { navigateTo } = useNavigation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    const result = await login(email, password);
    if (result.success) {
      navigateTo(PAGES.HOME);
    }
  };

  // 데모 로그인
  const handleDemoLogin = async () => {
    clearError();
    const result = await login('demo@hospital.com', 'demo1234');
    if (result.success) {
      navigateTo(PAGES.HOME);
    }
  };

  return (
    <PageContainer gradient="emerald" className="flex items-center justify-center p-4">
      <DecorativeBackground />

      <div className="relative w-full max-w-md z-10">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl mb-4 shadow-lg shadow-emerald-500/25">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            PT <span className="text-emerald-400">Assessment</span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            AI 기반 물리치료 평가 시스템
          </p>
        </div>

        {/* 로그인 카드 */}
        <Card padding="lg" rounded="3xl" className="shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">로그인</h2>

          {error && (
            <Alert
              type="error"
              message={error}
              dismissible
              onDismiss={clearError}
              className="mb-4"
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="이메일"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@hospital.com"
              accentColor="emerald"
            />

            <Input
              label="비밀번호"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              accentColor="emerald"
            />

            {/* 로그인 유지 */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500/20"
              />
              <label htmlFor="rememberMe" className="text-slate-400 text-sm">
                로그인 유지
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isLoading}
            >
              로그인
            </Button>
          </form>

          {/* 데모 로그인 버튼 */}
          <div className="mt-4 pt-4 border-t border-slate-800/50">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              fullWidth
              onClick={handleDemoLogin}
              isLoading={isLoading}
              leftIcon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            >
              데모 체험하기
            </Button>
            <p className="text-center text-slate-500 text-xs mt-2">
              로그인 없이 바로 테스트해 보세요
            </p>
          </div>

          <p className="text-center text-slate-400 text-sm mt-6">
            계정이 없으신가요?{' '}
            <button
              onClick={() => navigateTo(PAGES.SIGNUP)}
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              회원가입
            </button>
          </p>
        </Card>
      </div>
    </PageContainer>
  );
}

export default LoginPage;
