// 검사 카드 그라데이션 설정
const gradients = {
  TUG: 'from-emerald-500 to-teal-600',
  BBS: 'from-blue-500 to-indigo-600',
  '10M': 'from-purple-500 to-pink-600'
};

const shadows = {
  TUG: 'shadow-emerald-500/25',
  BBS: 'shadow-blue-500/25',
  '10M': 'shadow-purple-500/25'
};

// 검사별 아이콘
const icons = {
  TUG: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 15.5V21m0-5.5L15.5 21m0 0h-1M3 11.5l4.5 4.5L12 11.5" />
    </svg>
  ),
  BBS: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  ),
  '10M': (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
};

function TestCard({
  type,
  title,
  description,
  lastTestDate,
  onClick
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full p-6 rounded-2xl text-left transition-all duration-200
        bg-gradient-to-br ${gradients[type]}
        shadow-lg ${shadows[type]}
        hover:scale-[1.02] hover:shadow-xl
        group
      `}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center text-white group-hover:scale-110 transition-transform">
          {icons[type]}
        </div>
        <svg
          className="w-6 h-6 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>

      <h3 className="text-white font-bold text-lg mb-1">{title}</h3>
      <p className="text-white/70 text-sm mb-3">{description}</p>

      {lastTestDate && (
        <div className="flex items-center gap-1.5 text-white/50 text-xs">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>마지막 검사: {lastTestDate}</span>
        </div>
      )}
    </button>
  );
}

export default TestCard;
