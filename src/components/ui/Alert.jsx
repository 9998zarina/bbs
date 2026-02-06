// 알림 타입별 스타일
const typeStyles = {
  error: {
    container: 'bg-red-500/10 border-red-500/20',
    text: 'text-red-400',
    icon: (
      <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  success: {
    container: 'bg-emerald-500/10 border-emerald-500/20',
    text: 'text-emerald-400',
    icon: (
      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  warning: {
    container: 'bg-yellow-500/10 border-yellow-500/20',
    text: 'text-yellow-400',
    icon: (
      <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    )
  },
  info: {
    container: 'bg-blue-500/10 border-blue-500/20',
    text: 'text-blue-400',
    icon: (
      <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
};

function Alert({
  type = 'info',
  message,
  dismissible = false,
  onDismiss,
  className = '',
  children
}) {
  const style = typeStyles[type];

  return (
    <div
      className={`
        p-3 rounded-xl border flex items-start gap-3
        ${style.container}
        ${className}
      `}
    >
      <div className="flex-shrink-0 mt-0.5">
        {style.icon}
      </div>
      <div className={`flex-1 text-sm ${style.text}`}>
        {message || children}
      </div>
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className={`flex-shrink-0 ${style.text} hover:opacity-70 transition-opacity`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default Alert;
