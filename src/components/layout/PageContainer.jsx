// 페이지 컨테이너 컴포넌트
function PageContainer({
  children,
  gradient = 'default',
  className = ''
}) {
  const gradients = {
    default: 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950',
    emerald: 'bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950',
    blue: 'bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950',
    purple: 'bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950'
  };

  return (
    <div className={`min-h-screen ${gradients[gradient]} ${className}`}>
      {children}
    </div>
  );
}

// 데코레이션 배경 (로그인 페이지 등에서 사용)
function DecorativeBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
      <div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: '1s' }}
      />
    </div>
  );
}

export { PageContainer as default, DecorativeBackground };
