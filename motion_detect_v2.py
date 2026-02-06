import cv2
import numpy as np
import os
import glob

def detect_person_positions(video_path):
    """사람 감지 및 위치 추적"""
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

    # HOG 사람 감지기
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    # 배경 제거기 (움직임 감지용)
    back_sub = cv2.createBackgroundSubtractorMOG2(history=100, varThreshold=40, detectShadows=False)

    person_data = []

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # 배경 제거로 움직임 감지
        fg_mask = back_sub.apply(frame)
        kernel = np.ones((5, 5), np.uint8)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # 가장 큰 움직임 영역 찾기 (사람)
        person_detected = False
        person_x = None
        person_bottom = None
        max_area = 0

        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 5000:  # 사람 크기 이상
                x, y, w, h = cv2.boundingRect(contour)
                # 사람 비율 확인 (높이가 너비보다 커야 함)
                if h > w * 0.8:
                    if area > max_area:
                        max_area = area
                        person_detected = True
                        person_x = x + w // 2  # 사람 중심 x
                        person_bottom = y + h  # 발 위치 (하단)

        person_data.append({
            'frame': frame_idx,
            'detected': person_detected,
            'x': person_x,
            'bottom': person_bottom,
            'area': max_area
        })

        frame_idx += 1
        if frame_idx % 50 == 0:
            print(f"  분석: {frame_idx}/{total_frames}")

    cap.release()

    # 시작점 찾기: 처음으로 사람이 감지되고 움직이기 시작하는 순간
    # 배경 학습 기간(30프레임) 이후부터 탐색
    start_frame = None
    start_x = None

    # 연속으로 감지되는 구간 찾기
    consecutive_count = 0
    for i, data in enumerate(person_data[30:], start=30):
        if data['detected']:
            consecutive_count += 1
            if consecutive_count >= 5:  # 5프레임 연속 감지되면 시작점으로
                start_frame = i - 4  # 연속 감지 시작 프레임
                start_x = person_data[start_frame]['x']
                break
        else:
            consecutive_count = 0

    # 끝점 찾기: 마지막으로 사람이 감지된 후 멈추거나 사라지는 순간
    finish_frame = None
    finish_x = None

    # 뒤에서부터 탐색하여 마지막 감지 구간 찾기
    consecutive_count = 0
    for i in range(len(person_data) - 1, -1, -1):
        data = person_data[i]
        if data['detected']:
            consecutive_count += 1
            if consecutive_count >= 3:
                finish_frame = i + 2  # 연속 감지 끝 프레임
                finish_x = person_data[min(finish_frame, len(person_data)-1)]['x']
                if finish_x is None:
                    finish_x = data['x']
                break
        else:
            consecutive_count = 0

    print(f"\n감지 결과:")
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
    """동영상에 고정된 START/FINISH 선 추가"""
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

    # 선 높이 (화면 하단 20% 영역)
    line_top = int(height * 0.75)
    line_bottom = height

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # START 프레임부터 빨간 선 표시 (고정 위치)
        if start_frame and frame_idx >= start_frame and start_x:
            # 빨간 세로선 (START 위치에 고정)
            cv2.line(frame, (start_x, line_top), (start_x, line_bottom), (0, 0, 255), 4)
            cv2.putText(frame, "START", (start_x - 40, line_top - 15),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        # FINISH 프레임부터 파란 선 표시 (고정 위치)
        if finish_frame and frame_idx >= finish_frame and finish_x:
            # 파란 세로선 (FINISH 위치에 고정)
            cv2.line(frame, (finish_x, line_top), (finish_x, line_bottom), (255, 0, 0), 4)
            cv2.putText(frame, "FINISH", (finish_x - 45, line_top - 15),
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

    print(f"\n총 {len(video_files)}개의 동영상 파일을 처리합니다.")

    # 출력 폴더 생성
    output_dir = "/Users/aisoft/Documents/TUG/processed_v3"
    os.makedirs(output_dir, exist_ok=True)

    results = []

    for i, video_path in enumerate(video_files):
        filename = os.path.basename(video_path)
        print(f"\n[{i+1}/{len(video_files)}] {filename}")

        # 사람 감지 및 위치 추적
        settings = detect_person_positions(video_path)

        if settings['start_frame'] is None or settings['finish_frame'] is None:
            print(f"  사람을 감지할 수 없습니다. 건너뜁니다.")
            continue

        results.append({
            'file': filename,
            'start_frame': settings['start_frame'],
            'start_x': settings['start_x'],
            'finish_frame': settings['finish_frame'],
            'finish_x': settings['finish_x']
        })

        # 동영상 처리
        output_path = os.path.join(output_dir, f"marked_{filename}")
        print(f"  동영상 생성 중...")
        process_video(video_path, output_path, settings)
        print(f"  완료!")

    # 결과 요약
    print(f"\n{'='*60}")
    print("처리 결과 요약")
    print(f"{'='*60}")
    for r in results:
        print(f"\n{r['file']}:")
        print(f"  START: 프레임 {r['start_frame']}, X={r['start_x']}")
        print(f"  FINISH: 프레임 {r['finish_frame']}, X={r['finish_x']}")

    print(f"\n결과 위치: {output_dir}")

if __name__ == "__main__":
    main()
