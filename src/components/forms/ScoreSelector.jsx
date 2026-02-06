// BBS 점수 선택 컴포넌트
function ScoreSelector({
  options,
  onSelect,
  selectedScore = null,
  columns = 5,
  className = ''
}) {
  const gridCols = {
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5'
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-2 ${className}`}>
      {options.map((option) => (
        <button
          key={option.score}
          onClick={() => onSelect(option.score)}
          className={`
            p-4 border rounded-xl transition-all text-center
            ${selectedScore === option.score
              ? 'bg-blue-500/20 border-blue-500/50'
              : 'bg-slate-800/50 border-slate-700/50 hover:bg-blue-500/20 hover:border-blue-500/50'
            }
          `}
        >
          <p className="text-2xl font-bold text-white">{option.score}</p>
          <p className="text-slate-400 text-xs mt-1">{option.desc}</p>
        </button>
      ))}
    </div>
  );
}

// 대형 점수 버튼 (터치 친화적)
function LargeScoreButton({
  score,
  description,
  isSelected = false,
  onClick,
  className = ''
}) {
  return (
    <button
      onClick={onClick}
      className={`
        p-6 border rounded-2xl transition-all text-center
        ${isSelected
          ? 'bg-blue-500/20 border-blue-500/50 scale-105'
          : 'bg-slate-800/50 border-slate-700/50 hover:bg-blue-500/20 hover:border-blue-500/50'
        }
        ${className}
      `}
    >
      <p className="text-4xl font-bold text-white mb-2">{score}</p>
      <p className="text-slate-400 text-sm">{description}</p>
    </button>
  );
}

export { ScoreSelector as default, LargeScoreButton };
