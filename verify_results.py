import cv2
import os
import glob

# 처리된 영상에서 주요 프레임 추출
output_dir = "/Users/aisoft/Documents/TUG/verification"
os.makedirs(output_dir, exist_ok=True)

processed_files = sorted(glob.glob("/Users/aisoft/Documents/TUG/processed_v3/marked_*.mp4"))

# 각 영상의 START/FINISH 정보
video_info = {
    "marked_KakaoTalk_Video_2026-01-20-15-58-45.mp4": {"start": 30, "finish": 160},
    "marked_KakaoTalk_Video_2026-01-20-15-58-54.mp4": {"start": 30, "finish": 698},
    "marked_KakaoTalk_Video_2026-01-20-15-59-03.mp4": {"start": 44, "finish": 197},
    "marked_KakaoTalk_Video_2026-01-20-15-59-10.mp4": {"start": 849, "finish": 1147},
}

for video_path in processed_files:
    filename = os.path.basename(video_path)
    base_name = filename.replace(".mp4", "")

    if filename not in video_info:
        continue

    info = video_info[filename]

    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # 추출할 프레임: START 직전, START, START 직후, FINISH 직전, FINISH, FINISH 직후
    frames_to_extract = [
        max(0, info['start'] - 5),
        info['start'],
        info['start'] + 10,
        max(0, info['finish'] - 5),
        info['finish'],
        min(info['finish'] + 10, total_frames - 1)
    ]

    for frame_idx in frames_to_extract:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if ret:
            output_path = os.path.join(output_dir, f"{base_name}_frame_{frame_idx:04d}.jpg")
            cv2.imwrite(output_path, frame)
            print(f"저장: {output_path}")

    cap.release()

print(f"\n검증 이미지 저장 완료: {output_dir}")
