import { useState } from 'react';
import { PageContainer, BackButton } from '../../components/layout';
import { Button, Input, Alert, Card } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useNavigation, PAGES } from '../../context/NavigationContext';

function SignupPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    hospital: '',
    role: 'therapist'
  });

  const { signup, isLoading, error, clearError } = useAuth();
  const { navigateTo } = useNavigation();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    const result = await signup(formData);
    if (result.success) {
      alert('회원가입이 완료되었습니다!');
      navigateTo(PAGES.LOGIN);
    }
  };

  // 비밀번호 강도 계산
  const getPasswordStrength = () => {
    const { password } = formData;
    if (!password) return null;

    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (strength <= 1) return { label: '약함', color: 'bg-red-500', width: '25%' };
    if (strength === 2) return { label: '보통', color: 'bg-yellow-500', width: '50%' };
    if (strength === 3) return { label: '강함', color: 'bg-emerald-500', width: '75%' };
    return { label: '매우 강함', color: 'bg-emerald-400', width: '100%' };
  };

  const passwordStrength = getPasswordStrength();

  return (
    <PageContainer gradient="emerald" className="flex items-center justify-center p-4">
      <div className="relative w-full max-w-md z-10">
        <BackButton
          onClick={() => navigateTo(PAGES.LOGIN)}
          className="mb-6"
        />

        <Card padding="lg" rounded="3xl" className="shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">회원가입</h2>

          {error && (
            <Alert
              type="error"
              message={error}
              dismissible
              onDismiss={clearError}
              className="mb-4"
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="이름"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="홍길동"
              required
              accentColor="emerald"
            />

            <Input
              label="이메일"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="example@hospital.com"
              required
              accentColor="emerald"
            />

            <Input
              label="소속 병원"
              type="text"
              name="hospital"
              value={formData.hospital}
              onChange={handleChange}
              placeholder="OO 병원"
              accentColor="emerald"
            />

            <div>
              <label className="block text-slate-400 text-sm mb-2">직책</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-emerald-500/50 transition-all"
              >
                <option value="therapist">물리치료사</option>
                <option value="doctor">의사</option>
                <option value="nurse">간호사</option>
              </select>
            </div>

            <div>
              <Input
                label="비밀번호"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="********"
                required
                accentColor="emerald"
              />
              {/* 비밀번호 강도 표시 */}
              {passwordStrength && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">비밀번호 강도</span>
                    <span className={`${passwordStrength.color.replace('bg-', 'text-')}`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1">
                    <div
                      className={`${passwordStrength.color} h-1 rounded-full transition-all`}
                      style={{ width: passwordStrength.width }}
                    />
                  </div>
                </div>
              )}
            </div>

            <Input
              label="비밀번호 확인"
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="********"
              required
              accentColor="emerald"
              error={
                formData.confirmPassword && formData.password !== formData.confirmPassword
                  ? '비밀번호가 일치하지 않습니다'
                  : undefined
              }
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isLoading}
              className="mt-6"
            >
              회원가입
            </Button>
          </form>
        </Card>
      </div>
    </PageContainer>
  );
}

export default SignupPage;
