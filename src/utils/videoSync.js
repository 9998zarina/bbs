/**
 * 영상 싱크 유틸리티
 * Python backend의 video_sync_module을 호출하여 측면/정면 영상 싱크 맞춤
 */

const API_BASE = 'http://localhost:5000';

/**
 * 두 영상의 싱크를 자동으로 맞춤
 *
 * @param {File} sideVideo - 측면 영상 파일
 * @param {File} frontVideo - 정면 영상 파일
 * @param {number|null} manualOffset - 수동 오프셋 (초), null이면 자동 감지
 * @returns {Promise<Object>} 싱크 결과
 */
export async function syncVideos(sideVideo, frontVideo, manualOffset = null) {
  const formData = new FormData();
  formData.append('side_video', sideVideo);
  formData.append('front_video', frontVideo);

  if (manualOffset !== null) {
    formData.append('offset', manualOffset.toString());
  }

  const response = await fetch(`${API_BASE}/api/video-sync`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '싱크 처리 실패');
  }

  const result = await response.json();

  // URL을 전체 경로로 변환
  return {
    ...result,
    sideVideoUrl: `${API_BASE}${result.side_video}`,
    frontVideoUrl: `${API_BASE}${result.front_video}`,
    htmlUrl: result.html ? `${API_BASE}${result.html}` : null,
  };
}

/**
 * 오프셋만 감지 (영상 생성 없이) - 동작 기반
 *
 * @param {File} sideVideo - 측면 영상 파일
 * @param {File} frontVideo - 정면 영상 파일
 * @returns {Promise<Object>} 오프셋 정보
 */
export async function detectOffset(sideVideo, frontVideo) {
  const formData = new FormData();
  formData.append('side_video', sideVideo);
  formData.append('front_video', frontVideo);

  const response = await fetch(`${API_BASE}/api/video-sync/detect-offset`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '오프셋 감지 실패');
  }

  return response.json();
}

/**
 * 오디오 기반 오프셋 감지 (FFT Cross-Correlation)
 * 동작 감지보다 정확하며 밀리초 단위의 정밀도 제공
 *
 * @param {File} sideVideo - 측면 영상 파일
 * @param {File} frontVideo - 정면 영상 파일
 * @param {number} sampleRate - 분석 샘플레이트 (기본 16000)
 * @param {number} maxOffset - 최대 오프셋 범위 초 (기본 10)
 * @returns {Promise<Object>} { offset_ms, offset_sec, confidence }
 */
export async function detectOffsetAudio(sideVideo, frontVideo, sampleRate = 16000, maxOffset = 10) {
  const formData = new FormData();
  formData.append('side_video', sideVideo);
  formData.append('front_video', frontVideo);
  formData.append('sample_rate', sampleRate.toString());
  formData.append('max_offset', maxOffset.toString());

  const response = await fetch(`${API_BASE}/api/video-sync/audio`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '오디오 싱크 감지 실패');
  }

  return response.json();
}

/**
 * 자동 싱크 감지 - 오디오 우선, 실패시 동작 감지
 *
 * @param {File} sideVideo - 측면 영상 파일
 * @param {File} frontVideo - 정면 영상 파일
 * @param {boolean} preferAudio - 오디오 방식 우선 (기본 true)
 * @returns {Promise<Object>} { offset_ms, offset_sec, method, confidence }
 */
export async function detectOffsetAuto(sideVideo, frontVideo, preferAudio = true) {
  const formData = new FormData();
  formData.append('side_video', sideVideo);
  formData.append('front_video', frontVideo);
  formData.append('prefer_audio', preferAudio.toString());

  const response = await fetch(`${API_BASE}/api/video-sync/auto`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '자동 싱크 감지 실패');
  }

  return response.json();
}

/**
 * 프론트엔드에서 간단한 오프셋 계산 (서버 없이)
 * Canvas를 사용하여 프레임 차이 분석
 *
 * @param {string} videoUrl - 비디오 URL
 * @param {number} threshold - 동작 감지 임계값
 * @returns {Promise<number>} 동작 시작 시간 (초)
 */
export async function detectMotionStartClient(videoUrl, threshold = 15) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.crossOrigin = 'anonymous';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let prevFrame = null;
    let frameCount = 0;
    let motionStartTime = null;
    let consecutiveMotion = 0;
    const minConsecutive = 3;

    video.addEventListener('loadedmetadata', () => {
      canvas.width = 160; // 작은 크기로 분석 (성능)
      canvas.height = 90;
      video.play();
    });

    video.addEventListener('timeupdate', () => {
      if (motionStartTime !== null) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (prevFrame) {
        // 프레임 차이 계산
        let diff = 0;
        for (let i = 0; i < currentFrame.data.length; i += 4) {
          diff += Math.abs(currentFrame.data[i] - prevFrame.data[i]); // R
          diff += Math.abs(currentFrame.data[i + 1] - prevFrame.data[i + 1]); // G
          diff += Math.abs(currentFrame.data[i + 2] - prevFrame.data[i + 2]); // B
        }
        const avgDiff = diff / (canvas.width * canvas.height * 3);

        if (avgDiff > threshold) {
          consecutiveMotion++;
          if (consecutiveMotion >= minConsecutive) {
            motionStartTime = Math.max(0, video.currentTime - (minConsecutive / 30));
            video.pause();
            resolve(motionStartTime);
          }
        } else {
          consecutiveMotion = 0;
        }
      }

      prevFrame = currentFrame;
      frameCount++;

      // 최대 10초까지만 분석
      if (video.currentTime > 10 && motionStartTime === null) {
        video.pause();
        resolve(0);
      }
    });

    video.addEventListener('ended', () => {
      resolve(motionStartTime || 0);
    });

    video.addEventListener('error', (e) => {
      reject(new Error('비디오 로드 실패'));
    });
  });
}

/**
 * 두 영상의 오프셋을 클라이언트에서 계산
 *
 * @param {string} sideVideoUrl - 측면 영상 URL
 * @param {string} frontVideoUrl - 정면 영상 URL
 * @returns {Promise<Object>} 오프셋 정보
 */
export async function detectOffsetClient(sideVideoUrl, frontVideoUrl) {
  const [sideStart, frontStart] = await Promise.all([
    detectMotionStartClient(sideVideoUrl),
    detectMotionStartClient(frontVideoUrl),
  ]);

  const offset = frontStart - sideStart;

  return {
    offset,
    sideStart,
    frontStart,
    // 양수: 정면이 늦게 시작 (정면 앞부분 건너뛰기)
    // 음수: 측면이 늦게 시작 (측면 앞부분 건너뛰기)
    skipSide: Math.max(0, -offset),
    skipFront: Math.max(0, offset),
  };
}

/**
 * 비디오 재생 시 오프셋 적용
 *
 * @param {HTMLVideoElement} sideVideo - 측면 비디오 엘리먼트
 * @param {HTMLVideoElement} frontVideo - 정면 비디오 엘리먼트
 * @param {number} offset - 오프셋 (초)
 */
export function applyOffsetToVideos(sideVideo, frontVideo, offset) {
  if (offset > 0) {
    // 정면이 늦게 시작 → 정면 시작 시간을 offset만큼 앞으로
    frontVideo.currentTime = offset;
    sideVideo.currentTime = 0;
  } else if (offset < 0) {
    // 측면이 늦게 시작 → 측면 시작 시간을 |offset|만큼 앞으로
    sideVideo.currentTime = Math.abs(offset);
    frontVideo.currentTime = 0;
  }
}

/**
 * 두 비디오를 동기화하여 재생
 *
 * @param {HTMLVideoElement} sideVideo - 측면 비디오 엘리먼트
 * @param {HTMLVideoElement} frontVideo - 정면 비디오 엘리먼트
 */
export function playSynced(sideVideo, frontVideo) {
  sideVideo.play();
  frontVideo.play();
}

/**
 * 두 비디오를 동기화하여 일시정지
 */
export function pauseSynced(sideVideo, frontVideo) {
  sideVideo.pause();
  frontVideo.pause();
}

/**
 * 두 비디오를 동기화하여 특정 시간으로 이동
 */
export function seekSynced(sideVideo, frontVideo, time, offset = 0) {
  if (offset > 0) {
    sideVideo.currentTime = time;
    frontVideo.currentTime = time + offset;
  } else {
    sideVideo.currentTime = time + Math.abs(offset);
    frontVideo.currentTime = time;
  }
}

export default {
  syncVideos,
  detectOffset,
  detectOffsetAudio,
  detectOffsetAuto,
  detectMotionStartClient,
  detectOffsetClient,
  applyOffsetToVideos,
  playSynced,
  pauseSynced,
  seekSynced,
};
