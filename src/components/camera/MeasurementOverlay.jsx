// 타이머 표시 컴포넌트
function TimerDisplay({ time, className = '' }) {
  const formattedTime = typeof time === 'number' ? time.toFixed(1) : time;

  return (
    <div className={`bg-slate-900/80 px-4 py-2 rounded-full ${className}`}>
      <span className="text-white font-mono text-2xl">{formattedTime}초</span>
    </div>
  );
}

// 상태 인디케이터 (측정 중 표시)
function RecordingIndicator({ label = '측정 중', className = '' }) {
  return (
    <div className={`flex items-center gap-2 bg-red-500/20 px-3 py-1 rounded-full ${className}`}>
      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      <span className="text-red-400 text-sm">{label}</span>
    </div>
  );
}

// 현재 단계 표시
function PhaseIndicator({
  phase,
  color = 'emerald',
  className = ''
}) {
  const colors = {
    emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400'
  };

  return (
    <div className={`${colors[color]} border px-4 py-2 rounded-full ${className}`}>
      <span className="font-medium">{phase}</span>
    </div>
  );
}

// 안내 메시지 오버레이
function GuideMessage({ message, className = '' }) {
  return (
    <div className={`bg-slate-900/80 px-4 py-2 rounded-full ${className}`}>
      <p className="text-emerald-400 text-sm">{message}</p>
    </div>
  );
}

// 카운트다운 오버레이
function CountdownOverlay({ count, className = '' }) {
  return (
    <div className={`absolute inset-0 flex items-center justify-center bg-slate-900/80 z-50 ${className}`}>
      <div className="text-center">
        <span className="text-8xl font-bold text-white animate-pulse">{count}</span>
      </div>
    </div>
  );
}

export {
  TimerDisplay,
  RecordingIndicator,
  PhaseIndicator,
  GuideMessage,
  CountdownOverlay
};
