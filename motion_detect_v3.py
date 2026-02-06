import cv2
import numpy as np
import os
import glob

def detect_person_timeline(video_path):
    """사람 감지 타임라인 생성 - 더 정확한 감지"""
    cap = cv2.VideoCapture(video_path)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    filename = os.path.basename(video_path)
    print(f"\n{'='*60}")
    print(f"파일: {filename}")
    print(f"총 프레임: {total_frames}, FPS: {fps}")
    print(f"{'='*60}")

    # 배경 모델 생성을 위해 먼저 전체 영상 스캔
    back_sub = cv2.createBackgroundSubtractorMOG2(
        history=200,
        varThreshold=25,
        detectShadows=False
    )

    person_timeline = []

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # 배경 제거
        fg_mask = back_sub.apply(frame)

        # 노이즈 제거
        kernel = np.ones((7, 7), np.uint8)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)
        fg_mask = cv2.dilate(fg_mask, kernel, iterations=2)

        # 컨투어 찾기
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # 가장 큰 움직임 영역 (사람)
        person_found = False
        person_x = None
        person_area = 0

        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 3000:  # 최소 크기
                x, y, w, h = cv2.boundingRect(contour)
                # 사람 비율 체크 (너무 넓거나 낮은 것 제외)
                aspect_ratio = h / w if w > 0 else 0
                if aspect_ratio > 0.5:  # 사람은 대체로 세로가 더 김
                    if area > person_area:
                        person_area = area
                        person_x = x + w // 2
                        person_found = True

        person_timeline.append({
            'frame': frame_idx,
            'detected': person_found,
            'x': person_x,
            'area': person_area
        })

        frame_idx += 1
        if frame_idx % 50 == 0:
            print(f"  1차 분석: {frame_idx}/{total_frames}")

    cap.release()

    # 움직임이 있는 프레임들 찾기 (배경 학습 후)
    motion_frames = [d for d in person_timeline[50:] if d['detected'] and d['area'] > 5000]

    if not motion_frames:
        print("  사람을 감지하지 못했습니다.")
        return None

    # 시작점: 첫 번째로 사람이 확실히 감지된 프레임
    start_frame = motion_frames[0]['frame']
    start_x = motion_frames[0]['x']

    # 끝점: 마지막으로 사람이 확실히 감지된 프레임
    finish_frame = motion_frames[-1]['frame']
    finish_x = motion_frames[-1]['x']

    print(f"\n  감지된 움직임 프레임 수: {len(motion_frames)}")
    print(f"  START: 프레임 {start_frame}, X={start_x}")
    print(f"  FINISH: 프레임 {finish_frame}, X={finish_x}")

    return {
        'start_frame': start_frame,
        'start_x': start_x,
        'finish_frame': finish_frame,
        'finish_x': finish_x,
        'width': width,
        'height': height,
        'fps': fps,
        'total_frames': total_frames
    }

def process_video(input_path, output_path, settings):
    """동영상에 START/FINISH 선 추가"""
    cap = cv2.VideoCapture(input_path)

    fps = settings['fps']
    width = settings['width']
    height = settings['height']
    total_frames = settings['total_frames']

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    start_frame = settings['start_frame']
    start_x = settings['start_x']
    finish_frame = settings['finish_frame']
    finish_x = settings['finish_x']

    # 선 그리기 영역 (화면 하단 25%)
    line_top = int(height * 0.75)
    line_bottom = height

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # START 프레임부터 빨간 선 (고정 위치)
        if frame_idx >= start_frame and start_x:
            cv2.line(frame, (start_x, line_top), (start_x, line_bottom), (0, 0, 255), 5)
            cv2.putText(frame, "START", (start_x - 45, line_top - 15),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)

        # FINISH 프레임부터 파란 선 (고정 위치)
        if frame_idx >= finish_frame and finish_x:
            cv2.line(frame, (finish_x, line_top), (finish_x, line_bottom), (255, 0, 0), 5)
            cv2.putText(frame, "FINISH", (finish_x - 50, line_top - 15),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 0, 0), 2)

        out.write(frame)
        frame_idx += 1

        if frame_idx % 100 == 0:
            print(f"    렌더링: {frame_idx}/{total_frames}")

    cap.release()
    out.release()

def main():
    video_files = sorted(glob.glob("/Users/aisoft/Documents/TUG/KakaoTalk_Video_*.mp4"))

    if not video_files:
        print("동영상 파일을 찾을 수 없습니다.")
        return

    print(f"\n총 {len(video_files)}개 동영상 처리")

    output_dir = "/Users/aisoft/Documents/TUG/final_output"
    os.makedirs(output_dir, exist_ok=True)

    results = []

    for i, video_path in enumerate(video_files):
        filename = os.path.basename(video_path)
        print(f"\n[{i+1}/{len(video_files)}] {filename}")

        settings = detect_person_timeline(video_path)

        if settings is None:
            print(f"  건너뜀")
            continue

        results.append({
            'file': filename,
            **settings
        })

        output_path = os.path.join(output_dir, f"marked_{filename}")
        print(f"  영상 생성 중...")
        process_video(video_path, output_path, settings)
        print(f"  완료!")

    # 결과 요약
    print(f"\n{'='*60}")
    print("최종 결과")
    print(f"{'='*60}")

    for r in results:
        start_time = r['start_frame'] / r['fps']
        finish_time = r['finish_frame'] / r['fps']
        duration = finish_time - start_time

        print(f"\n{r['file']}:")
        print(f"  START : 프레임 {r['start_frame']} ({start_time:.2f}초), X={r['start_x']}")
        print(f"  FINISH: 프레임 {r['finish_frame']} ({finish_time:.2f}초), X={r['finish_x']}")
        print(f"  소요 시간: {duration:.2f}초")

    print(f"\n결과 저장 위치: {output_dir}")

if __name__ == "__main__":
    main()
