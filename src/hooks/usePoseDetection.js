import { useState, useRef, useEffect } from 'react';
import { drawConnections, drawLandmarks } from '../utils/poseDrawing';

// MediaPipe 포즈 추정을 위한 커스텀 훅
export function usePoseDetection(videoRef, canvasRef, isActive) {
  const [pose, setPose] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const poseRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!isActive || !videoRef.current || !canvasRef.current) return;

    let mounted = true;

    const initPose = async () => {
      try {
        const { Pose } = await import('@mediapipe/pose');
        const { Camera } = await import('@mediapipe/camera_utils');

        const pose = new Pose({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
          }
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults((results) => {
          if (!mounted) return;

          const canvas = canvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext('2d');
          canvas.width = videoRef.current.videoWidth || 640;
          canvas.height = videoRef.current.videoHeight || 480;

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

          if (results.poseLandmarks) {
            drawConnections(ctx, results.poseLandmarks, canvas.width, canvas.height);
            drawLandmarks(ctx, results.poseLandmarks, canvas.width, canvas.height);
            setPose(results.poseLandmarks);
          }

          ctx.restore();
        });

        poseRef.current = pose;

        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (poseRef.current && videoRef.current) {
              await poseRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480
        });

        cameraRef.current = camera;
        await camera.start();

        if (mounted) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Pose detection init error:', err);
        if (mounted) {
          setError(err.message || 'Failed to initialize pose detection');
          setIsLoading(false);
        }
      }
    };

    initPose();

    return () => {
      mounted = false;
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, [isActive, videoRef, canvasRef]);

  const stopCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.stop();
    }
  };

  return { pose, isLoading, error, stopCamera };
}

export default usePoseDetection;
