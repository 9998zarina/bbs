function BackButton({
  onClick,
  label = '돌아가기',
  className = ''
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 text-slate-400 hover:text-white transition-colors
        ${className}
      `}
    >
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export default BackButton;
