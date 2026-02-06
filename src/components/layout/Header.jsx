import BackButton from './BackButton';

function Header({
  title,
  showBack = true,
  onBack,
  rightElement,
  sticky = true,
  className = ''
}) {
  return (
    <header
      className={`
        bg-slate-900/50 backdrop-blur-xl border-b border-slate-800/50
        ${sticky ? 'sticky top-0 z-50' : ''}
        ${className}
      `}
    >
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        {showBack ? (
          <BackButton onClick={onBack} />
        ) : (
          <div className="w-20" />
        )}

        <h1 className="text-white font-semibold">{title}</h1>

        {rightElement || <div className="w-20" />}
      </div>
    </header>
  );
}

// 홈 페이지용 헤더 (로고 + 사용자 정보)
function HomeHeader({
  userName,
  onLogout,
  className = ''
}) {
  return (
    <header
      className={`
        bg-slate-900/50 backdrop-blur-xl border-b border-slate-800/50
        sticky top-0 z-50
        ${className}
      `}
    >
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* 로고 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">PT Assessment</h1>
              <p className="text-slate-500 text-xs">물리치료 평가 시스템</p>
            </div>
          </div>

          {/* 사용자 정보 */}
          <div className="flex items-center gap-4">
            <span className="text-slate-400 text-sm hidden sm:block">
              {userName}님
            </span>
            <button
              onClick={onLogout}
              className="text-slate-400 hover:text-white transition-colors text-sm"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export { Header as default, HomeHeader };
