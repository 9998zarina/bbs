import { createContext, useContext, useState, useCallback } from 'react';

// Auth Context 생성
const AuthContext = createContext(null);

// Auth Provider 컴포넌트
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // 로그인
  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    setError(null);

    try {
      // 실제 앱에서는 API 호출
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (email && password) {
        const userData = {
          email,
          name: email.split('@')[0],
          id: Date.now().toString()
        };
        setUser(userData);
        return { success: true, user: userData };
      } else {
        throw new Error('이메일과 비밀번호를 입력해주세요.');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 로그아웃
  const logout = useCallback(() => {
    setUser(null);
    setError(null);
  }, []);

  // 회원가입
  const signup = useCallback(async (formData) => {
    setIsLoading(true);
    setError(null);

    try {
      // 실제 앱에서는 API 호출
      await new Promise(resolve => setTimeout(resolve, 1500));

      if (!formData.name || !formData.email || !formData.password) {
        throw new Error('모든 필수 항목을 입력해주세요.');
      }

      if (formData.password !== formData.confirmPassword) {
        throw new Error('비밀번호가 일치하지 않습니다.');
      }

      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 에러 초기화
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    signup,
    clearError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Auth 훅
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
