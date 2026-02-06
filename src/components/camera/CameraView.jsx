import { forwardRef } from 'react';
import { LoadingOverlay } from '../ui/Spinner';

// 카메라 뷰 컴포넌트
const CameraView = forwardRef(({
  videoRef,
  canvasRef,
  isLoading = false,
  loadingMessage = '카메라 로딩 중...',
  loadingColor = 'emerald',
  overlay,
  bottomOverlay,
  topLeftOverlay,
  topRightOverlay,
  aspectRatio = 'video',
  className = ''
}, ref) => {
  const aspectClasses = {
    video: 'aspect-video',
    square: 'aspect-square',
    '4/3': 'aspect-[4/3]'
  };

  return (
    <div
      ref={ref}
      className={`
        ${aspectClasses[aspectRatio]}
        bg-slate-800 rounded-2xl overflow-hidden relative
        ${className}
      `}
    >
      {/* 비디오 (숨김) */}
      <video ref={videoRef} className="hidden" playsInline />

      {/* 캔버스 (포즈 오버레이 포함) */}
      <canvas ref={canvasRef} className="w-full h-full object-cover" />

      {/* 로딩 오버레이 */}
      {isLoading && (
        <LoadingOverlay message={loadingMessage} color={loadingColor} />
      )}

      {/* 커스텀 오버레이 */}
      {overlay}

      {/* 상단 좌측 오버레이 */}
      {topLeftOverlay && (
        <div className="absolute top-4 left-4">
          {topLeftOverlay}
        </div>
      )}

      {/* 상단 우측 오버레이 */}
      {topRightOverlay && (
        <div className="absolute top-4 right-4">
          {topRightOverlay}
        </div>
      )}

      {/* 하단 중앙 오버레이 */}
      {bottomOverlay && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          {bottomOverlay}
        </div>
      )}
    </div>
  );
});

CameraView.displayName = 'CameraView';

export default CameraView;
