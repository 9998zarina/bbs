import cv2
import os
import glob

# 동영상 파일 목록
video_files = sorted(glob.glob("/Users/aisoft/Documents/TUG/KakaoTalk_Video_*.mp4"))

def select_frames(video_path):
    """동영상에서 START와 FINISH 프레임 선택"""
    cap = cv2.VideoCapture(video_path)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    current_frame = 0
    start_frame = None
    finish_frame = None
    start_x = None
    finish_x = None

    # 선 위치 (클릭으로 설정)
    click_x = None

    def mouse_callback(event, x, y, flags, param):
        nonlocal click_x
        if event == cv2.EVENT_LBUTTONDOWN:
            click_x = x

    window_name = f"Frame Selector - {os.path.basename(video_path)}"
    cv2.namedWindow(window_name)
    cv2.setMouseCallback(window_name, mouse_callback)

    print(f"\n{'='*60}")
    print(f"파일: {os.path.basename(video_path)}")
    print(f"총 프레임: {total_frames}, FPS: {fps}")
    print(f"{'='*60}")
    print("조작법:")
    print("  ← → : 1프레임 이동")
    print("  A/D : 10프레임 이동")
    print("  W/S : 30프레임 이동")
    print("  1   : 현재 프레임을 START로 설정 (마우스로 선 위치 클릭 후)")
    print("  2   : 현재 프레임을 FINISH로 설정 (마우스로 선 위치 클릭 후)")
    print("  R   : 리셋")
    print("  ENTER : 완료 (START와 FINISH 모두 설정 후)")
    print("  ESC : 이 동영상 건너뛰기")
    print(f"{'='*60}\n")

    while True:
        cap.set(cv2.CAP_PROP_POS_FRAMES, current_frame)
        ret, frame = cap.read()

        if not ret:
            break

        display = frame.copy()

        # 현재 프레임 정보 표시
        info_text = f"Frame: {current_frame}/{total_frames-1} | Time: {current_frame/fps:.2f}s"
        cv2.putText(display, info_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(display, info_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 1)

        # START 프레임 표시
        if start_frame is not None:
            start_text = f"START: Frame {start_frame} (x={start_x})"
            cv2.putText(display, start_text, (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

            # 현재 프레임이 START 프레임 이후면 빨간 선 표시
            if current_frame >= start_frame and start_x is not None:
                cv2.line(display, (start_x, height - 120), (start_x, height), (0, 0, 255), 5)
                cv2.putText(display, "START", (start_x - 35, height - 130),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        # FINISH 프레임 표시
        if finish_frame is not None:
            finish_text = f"FINISH: Frame {finish_frame} (x={finish_x})"
            cv2.putText(display, finish_text, (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

            # 현재 프레임이 FINISH 프레임 이후면 파란 선 표시
            if current_frame >= finish_frame and finish_x is not None:
                cv2.line(display, (finish_x, height - 120), (finish_x, height), (255, 0, 0), 5)
                cv2.putText(display, "FINISH", (finish_x - 40, height - 130),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

        # 안내 메시지
        if start_frame is None:
            cv2.putText(display, "Click position & press '1' for START", (10, height - 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        elif finish_frame is None:
            cv2.putText(display, "Click position & press '2' for FINISH", (10, height - 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        else:
            cv2.putText(display, "Press ENTER to confirm or R to reset", (10, height - 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        cv2.imshow(window_name, display)

        key = cv2.waitKey(30) & 0xFF

        # 프레임 이동
        if key == 83 or key == ord('d'):  # 오른쪽 화살표 or D
            current_frame = min(current_frame + 1, total_frames - 1)
        elif key == 81 or key == ord('a'):  # 왼쪽 화살표 or A
            current_frame = max(current_frame - 1, 0)
        elif key == ord('d') or key == 3:  # D or 오른쪽
            current_frame = min(current_frame + 10, total_frames - 1)
        elif key == ord('a') or key == 2:  # A or 왼쪽
            current_frame = max(current_frame - 10, 0)
        elif key == ord('w'):  # W - 30프레임 앞으로
            current_frame = min(current_frame + 30, total_frames - 1)
        elif key == ord('s'):  # S - 30프레임 뒤로
            current_frame = max(current_frame - 30, 0)

        # START 설정
        elif key == ord('1'):
            if click_x is not None:
                start_frame = current_frame
                start_x = click_x
                print(f"  START 설정: Frame {start_frame}, X={start_x}")
                click_x = None
            else:
                print("  먼저 화면에서 선 위치를 클릭하세요!")

        # FINISH 설정
        elif key == ord('2'):
            if click_x is not None:
                finish_frame = current_frame
                finish_x = click_x
                print(f"  FINISH 설정: Frame {finish_frame}, X={finish_x}")
                click_x = None
            else:
                print("  먼저 화면에서 선 위치를 클릭하세요!")

        # 리셋
        elif key == ord('r'):
            start_frame = None
            finish_frame = None
            start_x = None
            finish_x = None
            click_x = None
            print("  리셋됨")

        # 완료
        elif key == 13:  # Enter
            if start_frame is not None and finish_frame is not None:
                break
            else:
                print("  START와 FINISH 모두 설정해주세요!")

        # 건너뛰기
        elif key == 27:  # ESC
            cap.release()
            cv2.destroyAllWindows()
            return None

    cap.release()
    cv2.destroyAllWindows()

    return {
        'start_frame': start_frame,
        'start_x': start_x,
        'finish_frame': finish_frame,
        'finish_x': finish_x
    }

def process_video(input_path, output_path, settings):
    """동영상에 선 추가"""
    cap = cv2.VideoCapture(input_path)

    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
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

        # START 프레임 이후부터 빨간 선 표시
        if frame_idx >= start_frame:
            cv2.line(frame, (start_x, height - 120), (start_x, height), (0, 0, 255), 5)
            cv2.putText(frame, "START", (start_x - 35, height - 130),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        # FINISH 프레임 이후부터 파란 선 표시
        if frame_idx >= finish_frame:
            cv2.line(frame, (finish_x, height - 120), (finish_x, height), (255, 0, 0), 5)
            cv2.putText(frame, "FINISH", (finish_x - 40, height - 130),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

        out.write(frame)
        frame_idx += 1

        if frame_idx % 100 == 0:
            print(f"    처리 중: {frame_idx}/{total_frames}")

    cap.release()
    out.release()

def main():
    print(f"\n총 {len(video_files)}개의 동영상 파일을 처리합니다.\n")

    # 출력 폴더 생성
    output_dir = "/Users/aisoft/Documents/TUG/processed_v2"
    os.makedirs(output_dir, exist_ok=True)

    for i, video_path in enumerate(video_files):
        filename = os.path.basename(video_path)
        print(f"\n[{i+1}/{len(video_files)}] {filename}")

        # 프레임 선택
        settings = select_frames(video_path)

        if settings is None:
            print(f"  건너뜀")
            continue

        # 동영상 처리
        output_path = os.path.join(output_dir, f"marked_{filename}")
        print(f"  처리 중...")
        process_video(video_path, output_path, settings)
        print(f"  완료: {output_path}")

    print(f"\n모든 처리 완료! 결과는 {output_dir} 폴더에 저장되었습니다.")

if __name__ == "__main__":
    main()
