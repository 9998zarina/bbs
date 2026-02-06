import cv2
import os
import glob
import numpy as np

def analyze_video(video_path):
    """동영상을 분석하고 주요 프레임을 추출"""
    cap = cv2.VideoCapture(video_path)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    filename = os.path.basename(video_path)
    print(f"\n{'='*60}")
    print(f"파일: {filename}")
    print(f"총 프레임: {total_frames}, FPS: {fps}, 해상도: {width}x{height}")
    print(f"{'='*60}")

    # 출력 폴더
    output_dir = "/Users/aisoft/Documents/TUG/analysis"
    os.makedirs(output_dir, exist_ok=True)

    # 주요 프레임 추출 (시작, 25%, 50%, 75%, 끝)
    key_frames = [0, int(total_frames*0.1), int(total_frames*0.25),
                  int(total_frames*0.5), int(total_frames*0.75), total_frames-1]

    base_name = os.path.splitext(filename)[0]

    for frame_idx in key_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if ret:
            output_path = os.path.join(output_dir, f"{base_name}_frame_{frame_idx:04d}.jpg")
            cv2.imwrite(output_path, frame)
            print(f"  프레임 {frame_idx} 저장: {output_path}")

    cap.release()
    return key_frames

def detailed_motion_analysis(video_path):
    """상세 모션 분석"""
    cap = cv2.VideoCapture(video_path)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # 배경 학습을 위해 처음 30프레임 건너뛰기
    back_sub = cv2.createBackgroundSubtractorMOG2(history=50, varThreshold=30, detectShadows=False)

    motion_timeline = []

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        fg_mask = back_sub.apply(frame)

        # 노이즈 제거
        kernel = np.ones((7, 7), np.uint8)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)

        # 움직임 영역
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        total_area = 0
        center_x = None

        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 2000:
                total_area += area
                x, y, w, h = cv2.boundingRect(contour)
                center_x = x + w // 2

        motion_timeline.append({
            'frame': frame_idx,
            'area': total_area,
            'center_x': center_x
        })

        frame_idx += 1

    cap.release()

    # 분석 결과
    print(f"\n모션 분석 결과:")

    # 실제 사람이 나타나는 시점 찾기 (면적이 일정 수준 이상)
    # 처음 30프레임은 배경 학습 기간으로 건너뛰기
    threshold_area = 5000

    start_frame = None
    for data in motion_timeline[30:]:  # 30프레임 이후부터
        if data['area'] > threshold_area:
            start_frame = data['frame']
            start_x = data['center_x']
            break

    # 끝나는 시점 (마지막으로 큰 움직임이 있는 프레임)
    finish_frame = None
    for data in reversed(motion_timeline):
        if data['area'] > threshold_area:
            finish_frame = data['frame']
            finish_x = data['center_x']
            break

    print(f"  배경 학습 후 첫 모션 감지: 프레임 {start_frame} (x={start_x})")
    print(f"  마지막 모션 감지: 프레임 {finish_frame} (x={finish_x})")

    # 문제점 분석
    issues = []

    if start_frame and start_frame < 30:
        issues.append("START가 너무 빠름 - 배경 학습이 충분하지 않음")

    if start_frame == 0:
        issues.append("START가 프레임 0 - 사람이 처음부터 화면에 있거나 감지 오류")

    return {
        'start_frame': start_frame,
        'start_x': start_x if start_frame else None,
        'finish_frame': finish_frame,
        'finish_x': finish_x if finish_frame else None,
        'issues': issues,
        'motion_timeline': motion_timeline
    }

# 원본 동영상 분석
video_files = sorted(glob.glob("/Users/aisoft/Documents/TUG/KakaoTalk_Video_*.mp4"))

print("="*60)
print("원본 동영상 분석")
print("="*60)

results = {}
for video_path in video_files:
    # 프레임 추출
    analyze_video(video_path)

    # 상세 모션 분석
    result = detailed_motion_analysis(video_path)
    results[video_path] = result

    if result['issues']:
        print(f"\n발견된 문제점:")
        for issue in result['issues']:
            print(f"  - {issue}")

print("\n" + "="*60)
print("분석 완료! /Users/aisoft/Documents/TUG/analysis 폴더에서 프레임 이미지 확인 가능")
print("="*60)
