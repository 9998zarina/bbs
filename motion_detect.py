import cv2
import numpy as np
import os
import glob

def detect_motion_frames(video_path):
    """모션 감지로 사람이 나타나는 시작/끝 프레임 찾기"""
    cap = cv2.VideoCapture(video_path)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"  분석 중: {total_frames} 프레임, {fps} FPS")

    # 배경 제거기 설정
    back_sub = cv2.createBackgroundSubtractorMOG2(history=100, varThreshold=50, detectShadows=False)

    motion_data = []

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # 배경 제거로 전경(움직이는 물체) 추출
        fg_mask = back_sub.apply(frame)

        # 노이즈 제거
        kernel = np.ones((5, 5), np.uint8)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)

        # 움직임이 있는 영역 찾기
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # 큰 움직임만 필터링 (사람 크기)
        significant_motion = False
        motion_x = None
        max_area = 0

        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 3000:  # 최소 면적 (사람 크기)
                significant_motion = True
                if area > max_area:
                    max_area = area
                    x, y, w, h = cv2.boundingRect(contour)
                    motion_x = x + w // 2  # 중심 x 좌표

        motion_data.append({
            'frame': frame_idx,
            'has_motion': significant_motion,
            'motion_x': motion_x,
            'area': max_area
        })

        frame_idx += 1
        if frame_idx % 50 == 0:
            print(f"    분석: {frame_idx}/{total_frames}")

    cap.release()

    # 시작 프레임 찾기 (처음으로 움직임 감지)
    start_frame = None
    start_x = None
    for data in motion_data:
        if data['has_motion']:
            start_frame = data['frame']
            start_x = data['motion_x']
            break

    # 끝 프레임 찾기 (마지막으로 움직임 감지)
    finish_frame = None
    finish_x = None
    for data in reversed(motion_data):
        if data['has_motion']:
            finish_frame = data['frame']
            finish_x = data['motion_x']
            break

    print(f"  감지 결과: START={start_frame} (x={start_x}), FINISH={finish_frame} (x={finish_x})")

    return {
        'start_frame': start_frame,
        'start_x': start_x,
        'finish_frame': finish_frame,
        'finish_x': finish_x,
        'width': width,
        'height': height,
        'fps': fps
    }

def process_video(input_path, output_path, settings):
    """동영상에 START/FINISH 선 추가"""
    cap = cv2.VideoCapture(input_path)

    fps = settings['fps']
    width = settings['width']
    height = settings['height']
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    start_frame = settings['start_frame']
    start_x = settings['start_x']
    finish_frame = settings['finish_frame']
    finish_x = settings['finish_x']

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # START 프레임부터 빨간 선 표시
        if start_frame and frame_idx >= start_frame and start_x:
            cv2.line(frame, (start_x, height - 150), (start_x, height), (0, 0, 255), 4)
            cv2.putText(frame, "START", (start_x - 40, height - 160),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        # FINISH 프레임부터 파란 선 표시
        if finish_frame and frame_idx >= finish_frame and finish_x:
            cv2.line(frame, (finish_x, height - 150), (finish_x, height), (255, 0, 0), 4)
            cv2.putText(frame, "FINISH", (finish_x - 45, height - 160),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 0, 0), 2)

        out.write(frame)
        frame_idx += 1

        if frame_idx % 100 == 0:
            print(f"    처리: {frame_idx}/{total_frames}")

    cap.release()
    out.release()

def main():
    # 동영상 파일 찾기
    video_files = sorted(glob.glob("/Users/aisoft/Documents/TUG/KakaoTalk_Video_*.mp4"))

    if not video_files:
        print("동영상 파일을 찾을 수 없습니다.")
        return

    print(f"\n총 {len(video_files)}개의 동영상 파일을 처리합니다.\n")

    # 출력 폴더 생성
    output_dir = "/Users/aisoft/Documents/TUG/motion_detected"
    os.makedirs(output_dir, exist_ok=True)

    for i, video_path in enumerate(video_files):
        filename = os.path.basename(video_path)
        print(f"\n[{i+1}/{len(video_files)}] {filename}")

        # 모션 감지로 시작/끝 프레임 찾기
        settings = detect_motion_frames(video_path)

        if settings['start_frame'] is None or settings['finish_frame'] is None:
            print(f"  모션을 감지할 수 없습니다. 건너뜁니다.")
            continue

        # 동영상 처리
        output_path = os.path.join(output_dir, f"marked_{filename}")
        print(f"  동영상 생성 중...")
        process_video(video_path, output_path, settings)
        print(f"  완료: {output_path}")

    print(f"\n\n모든 처리 완료!")
    print(f"결과 위치: {output_dir}")

if __name__ == "__main__":
    main()
