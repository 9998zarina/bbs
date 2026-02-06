import cv2
import os
import glob

# 동영상 파일 목록
video_files = sorted(glob.glob("/Users/aisoft/Documents/TUG/KakaoTalk_Video_*.mp4"))

# 선 위치 저장 변수
start_line_x = None
end_line_x = None
click_count = 0

def mouse_callback(event, x, y, flags, param):
    global start_line_x, end_line_x, click_count
    if event == cv2.EVENT_LBUTTONDOWN:
        if click_count == 0:
            start_line_x = x
            print(f"시작선 위치 설정: x = {x}")
            click_count = 1
        elif click_count == 1:
            end_line_x = x
            print(f"끝선 위치 설정: x = {x}")
            click_count = 2

def select_line_positions(video_path):
    """첫 번째 동영상에서 선 위치 선택"""
    global start_line_x, end_line_x, click_count

    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        print("동영상을 읽을 수 없습니다.")
        return None, None

    # 창 생성 및 마우스 콜백 설정
    cv2.namedWindow("Select Lines - Click START then END position")
    cv2.setMouseCallback("Select Lines - Click START then END position", mouse_callback)

    print("\n=== 선 위치 설정 ===")
    print("1. 먼저 시작선(빨간색) 위치를 클릭하세요")
    print("2. 다음 끝선(파란색) 위치를 클릭하세요")
    print("3. 설정 완료 후 아무 키나 누르세요")
    print("====================\n")

    while True:
        display_frame = frame.copy()
        h = frame.shape[0]

        # 이미 선택된 선 표시
        if start_line_x is not None:
            cv2.line(display_frame, (start_line_x, h - 100), (start_line_x, h), (0, 0, 255), 5)
            cv2.putText(display_frame, "START", (start_line_x - 30, h - 110),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        if end_line_x is not None:
            cv2.line(display_frame, (end_line_x, h - 100), (end_line_x, h), (255, 0, 0), 5)
            cv2.putText(display_frame, "END", (end_line_x - 20, h - 110),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

        cv2.imshow("Select Lines - Click START then END position", display_frame)

        key = cv2.waitKey(1) & 0xFF
        if key != 255 and click_count >= 2:
            break

    cv2.destroyAllWindows()
    return start_line_x, end_line_x

def process_video(input_path, output_path, start_x, end_x):
    """동영상에 선 추가"""
    cap = cv2.VideoCapture(input_path)

    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # 시작선 (빨간색) - 하단에 세로선
        cv2.line(frame, (start_x, height - 100), (start_x, height), (0, 0, 255), 5)

        # 끝선 (파란색) - 하단에 세로선
        cv2.line(frame, (end_x, height - 100), (end_x, height), (255, 0, 0), 5)

        out.write(frame)
        frame_count += 1

        if frame_count % 30 == 0:
            print(f"  처리 중: {frame_count}/{total_frames} 프레임")

    cap.release()
    out.release()
    print(f"  완료: {output_path}")

def main():
    print(f"\n총 {len(video_files)}개의 동영상 파일을 찾았습니다.\n")

    # 첫 번째 동영상에서 선 위치 선택
    start_x, end_x = select_line_positions(video_files[0])

    if start_x is None or end_x is None:
        print("선 위치가 설정되지 않았습니다.")
        return

    print(f"\n시작선: x={start_x}, 끝선: x={end_x}")
    print("\n모든 동영상 처리 시작...\n")

    # 출력 폴더 생성
    output_dir = "/Users/aisoft/Documents/TUG/processed"
    os.makedirs(output_dir, exist_ok=True)

    # 모든 동영상 처리
    for i, video_path in enumerate(video_files):
        filename = os.path.basename(video_path)
        output_path = os.path.join(output_dir, f"marked_{filename}")
        print(f"[{i+1}/{len(video_files)}] 처리 중: {filename}")
        process_video(video_path, output_path, start_x, end_x)

    print(f"\n모든 처리 완료! 결과는 {output_dir} 폴더에 저장되었습니다.")

if __name__ == "__main__":
    main()
