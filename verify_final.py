import cv2
import os

output_dir = "/Users/aisoft/Documents/TUG/final_verification"
os.makedirs(output_dir, exist_ok=True)

# 최종 결과 정보
videos = [
    {"file": "/Users/aisoft/Documents/TUG/final_output/marked_KakaoTalk_Video_2026-01-20-15-58-45.mp4",
     "start": 50, "finish": 326},
]

for v in videos:
    cap = cv2.VideoCapture(v['file'])
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    base = os.path.basename(v['file']).replace('.mp4', '')

    # START 전, START, START 후, 중간, FINISH 전, FINISH, FINISH 후
    frames = [
        v['start'] - 10,
        v['start'],
        v['start'] + 30,
        (v['start'] + v['finish']) // 2,
        v['finish'] - 10,
        v['finish'],
        min(v['finish'] + 30, total - 1)
    ]

    for f in frames:
        if f < 0:
            f = 0
        cap.set(cv2.CAP_PROP_POS_FRAMES, f)
        ret, frame = cap.read()
        if ret:
            path = os.path.join(output_dir, f"{base}_f{f:04d}.jpg")
            cv2.imwrite(path, frame)
            print(f"저장: {path}")

    cap.release()

print("\n완료!")
