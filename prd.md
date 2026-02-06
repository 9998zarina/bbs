# 보행 분석 시스템 - Product Requirements Document (PRD)

**버전**: 3.0
**작성일**: 2026-01-27
**상태**: Production Ready

---

## 1. 제품 개요

### 1.1 제품명
**보행 분석 시스템** (Gait Analysis System)

### 1.2 포함 프로젝트

| 프로젝트 | 파일 | 설명 |
|----------|------|------|
| **TUG Test System** | `app.py` | Flask 웹 기반 TUG 테스트 |
| **10MWT System** | `ten_meter_walk_test.py` | OpenCV 기반 10m 보행검사 |

### 1.3 제품 설명
AI 영상 분석 기술을 활용한 보행 능력 평가 시스템입니다. YOLOv8-pose 기반 인체 추적과 원근 보정(Perspective Correction)을 통해 정확한 보행 시간 및 속도를 자동 측정합니다.

### 1.4 주요 검사 종류

| 검사 | 거리 | 목적 | 대상 |
|------|------|------|------|
| **TUG Test** | 3-10m | 낙상 위험도 평가 | 노인, 재활 환자 |
| **10MWT** | 10m | 보행 속도 측정 | 신경계 질환, 재활 |

### 1.5 TUG 위험도 분류 기준

| 위험도 | 시간 | 색상 | 설명 |
|--------|------|------|------|
| **LOW** | < 10초 | 녹색 | 정상, 낙상 위험 낮음 |
| **MODERATE** | 10-19초 | 노란색 | 주의 필요, 중간 위험 |
| **HIGH** | >= 20초 | 빨간색 | 위험, 낙상 위험 높음 |

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

```
+===========================================================================+
|                        보행 분석 시스템 v3.0                               |
+===========================================================================+
|                                                                           |
|  +---------------------------+     +---------------------------+          |
|  |    TUG Test System        |     |     10MWT System          |          |
|  |    (Flask Web App)        |     |   (Standalone OpenCV)     |          |
|  |    app.py                 |     |  ten_meter_walk_test.py   |          |
|  +------------+--------------+     +-------------+-------------+          |
|               |                                  |                        |
|               +----------------+-----------------+                        |
|                                |                                          |
|                    +-----------v-----------+                              |
|                    |     YOLOv8-pose       |                              |
|                    |   (17 Keypoints)      |                              |
|                    +-----------+-----------+                              |
|                                |                                          |
|          +---------------------+---------------------+                    |
|          |                     |                     |                    |
|  +-------v-------+    +--------v--------+   +--------v--------+          |
|  |  4점 원근보정  |    |   발목 좌표     |   |   라인 크로싱   |          |
|  | Homography    |    |   추적/변환     |   |   감지          |          |
|  +---------------+    +-----------------+   +-----------------+          |
|                                |                                          |
|                    +-----------v-----------+                              |
|                    |    결과 계산/저장     |                              |
|                    |  - 총 소요시간        |                              |
|                    |  - 보행 속도          |                              |
|                    |  - 위험도 분류        |                              |
|                    +-----------------------+                              |
|                                                                           |
+===========================================================================+
```

### 2.2 데이터 흐름

```
영상 입력
    |
    v
+-------------------+
| YOLOv8-pose 추론  |  --> 17개 키포인트 감지
+-------------------+
    |
    v
+-------------------+
| 발목 좌표 추출    |  --> LEFT_ANKLE(15), RIGHT_ANKLE(16)
+-------------------+
    |
    v
+-------------------+
| 원근 변환         |  --> cv2.perspectiveTransform(point, M)
| (4점 호모그래피)  |
+-------------------+
    |
    v
+-------------------+
| 거리 계산         |  --> distance = actual_distance * (1 - y_ratio)
+-------------------+
    |
    v
+-------------------+
| 라인 크로싱 감지  |  --> 서브픽셀 정확도 선형 보간
| (시작선/종료선)   |
+-------------------+
    |
    v
+-------------------+
| 결과 출력         |  --> 시간, 속도, 위험도
+-------------------+
```

---

## 3. 프로젝트 1: TUG Test System

### 3.1 개요
Flask 웹 애플리케이션 기반의 TUG(Timed Up and Go) 테스트 시스템

### 3.2 파일 정보
- **메인 파일**: `python_tracker/app.py`
- **프론트엔드**: `templates/index.html`, `static/js/main.js`, `static/css/style.css`

### 3.3 실행 방법
```bash
cd python_tracker
python app.py
# 브라우저에서 http://localhost:5000 접속
```

### 3.4 주요 기능

| 기능 | 설명 |
|------|------|
| 웹 기반 UI | 브라우저에서 영상 업로드 및 분석 |
| 환자 관리 | 환자 등록, 조회, 히스토리 |
| 4점 원근 보정 | 마우스 클릭으로 보행 구간 설정 |
| 실시간 스트리밍 | SSE로 분석 영상 실시간 표시 |
| 세션 저장 | 측정 결과 JSON/CSV 저장 |
| 비교 분석 | 최근 vs 이전 결과 비교 |
| 통계 | 평균, 최고, 최저, 위험도 분포 |
| PDF 보고서 | 분석 결과 보고서 생성 |

### 3.5 API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/status` | 시스템 상태 |
| GET | `/api/patients` | 환자 목록 |
| POST | `/api/patients` | 환자 등록 |
| GET | `/api/patients/<id>/history` | 측정 히스토리 + 통계 |
| POST | `/api/upload` | 영상 업로드 |
| GET | `/api/video/<session>/first-frame` | 첫 프레임 (4점 설정용) |
| POST | `/api/analyze` | 분석 시작 |
| GET | `/api/analyze/<session>/stream` | SSE 스트리밍 |
| POST | `/api/save` | 결과 저장 |
| GET | `/api/patients/<id>/sessions/<sid>/csv` | CSV 다운로드 |

### 3.6 핵심 코드

#### 거리 계산 (카메라 방향으로 걸어올 때)
```python
def calculate_distance_from_y(transformed_y, transformed_height, actual_distance):
    """
    변환된 Y 좌표에서 실제 거리 계산
    - Y=0 (화면 위쪽, 멀리) = actual_distance (10m)
    - Y=height (화면 아래쪽, 가까이) = 0m
    """
    ratio = transformed_y / transformed_height
    distance = actual_distance * (1 - ratio)
    return max(0, min(actual_distance, distance))
```

#### 서브픽셀 정확도 시간 계산
```python
def calculate_subpixel_crossing_time(prev_dist, curr_dist, prev_time, curr_time, threshold):
    """선형 보간법으로 정확한 크로싱 시간 계산"""
    ratio = (threshold - prev_dist) / (curr_dist - prev_dist)
    return prev_time + ratio * (curr_time - prev_time)
```

### 3.7 데이터 저장 구조
```
patient_data/
├── P0001/
│   ├── patient_info.json
│   ├── measurements/
│   │   ├── 20260127_143052.json
│   │   └── 20260127_150230.json
│   └── ankle_data/
│       ├── ankle_data_20260127_143052.csv
│       └── ankle_data_20260127_150230.csv
└── P0002/
    └── ...
```

---

## 4. 프로젝트 2: 10-Meter Walk Test (10MWT)

### 4.1 개요
OpenCV + YOLOv8s-pose 기반 독립 실행형 10미터 보행검사 프로그램

### 4.2 파일 정보
- **메인 파일**: `python_tracker/ten_meter_walk_test.py`
- **모델**: `yolov8s-pose.pt` (자동 다운로드)

### 4.3 실행 방법
```bash
cd python_tracker

# 기본 실행
python ten_meter_walk_test.py --video <영상파일>

# 옵션 지정
python ten_meter_walk_test.py -v walking.mp4 -d 10 -m yolov8s-pose.pt
```

### 4.4 명령줄 옵션

| 옵션 | 단축 | 기본값 | 설명 |
|------|------|--------|------|
| `--video` | `-v` | (필수) | 분석할 영상 파일 |
| `--distance` | `-d` | 10.0 | 실제 보행 거리 (미터) |
| `--model` | `-m` | yolov8s-pose.pt | YOLO 모델 파일 |

### 4.5 조작법

#### 캘리브레이션 단계
| 키 | 기능 |
|---|------|
| 마우스 클릭 | 4개 모서리 점 설정 |
| R | 점 초기화 |
| Enter | 캘리브레이션 확정, 분석 시작 |
| ESC | 취소 |

#### 분석 단계
| 키 | 기능 |
|---|------|
| Space | 일시정지 / 재생 |
| R | 처음부터 다시 시작 |
| Q | 종료 |

### 4.6 4점 설정 가이드

```
카메라 방향
    |
    v
+----------------------------------+
|                                  |
|  1* ----------------------- *2   |  <-- 시작선 (10m, 멀리)
|   \                         /    |      녹색으로 표시
|    \                       /     |
|     \                     /      |
|      \       CENTER      /       |
|       \        |        /        |
|        \       |       /         |
|         \      |      /          |
|  4* ----------------------- *3   |  <-- 종료선 (0m, 가까이)
|                                  |      빨간색으로 표시
+----------------------------------+

클릭 순서: 1 -> 2 -> 3 -> 4
자동으로 등변사다리꼴로 보정됨
```

### 4.7 등변사다리꼴 자동 보정

```python
def make_isosceles_trapezoid(self) -> List[Point]:
    """4점을 등변사다리꼴로 보정"""
    p0, p1, p2, p3 = self.points

    # 상단/하단 중심 계산
    top_center_x = (p0.x + p1.x) / 2
    bottom_center_x = (p2.x + p3.x) / 2

    # 전체 중심 X
    center_x = (top_center_x + bottom_center_x) / 2

    # 좌우 대칭으로 재배치
    adjusted = [
        Point(center_x - top_width / 2, top_y),      # 좌상단
        Point(center_x + top_width / 2, top_y),      # 우상단
        Point(center_x + bottom_width / 2, bottom_y), # 우하단
        Point(center_x - bottom_width / 2, bottom_y), # 좌하단
    ]
    return adjusted
```

### 4.8 주요 클래스

#### PerspectiveCalibration
```python
class PerspectiveCalibration:
    """원근 보정 캘리브레이션"""

    def add_point(x, y)           # 점 추가
    def reset()                   # 초기화
    def make_isosceles_trapezoid() # 등변사다리꼴 보정
    def calculate_transform()      # 변환 행렬 계산
    def transform_point(point)     # 좌표 변환
    def get_distance_from_y(y)     # 거리 계산
```

#### AnkleTracker
```python
class AnkleTracker:
    """YOLOv8s-pose 발목 추적"""

    LEFT_ANKLE = 15
    RIGHT_ANKLE = 16

    def detect(frame)           # 발목 좌표 감지
    def draw_skeleton(frame)    # 스켈레톤 그리기
```

#### TenMeterWalkTest
```python
class TenMeterWalkTest:
    """10미터 보행검사 메인"""

    def calibrate()              # 4점 캘리브레이션
    def check_line_crossing()    # 라인 통과 감지
    def draw_minimap()           # Bird's Eye View 미니맵
    def draw_overlay()           # 정보 오버레이
    def run()                    # 메인 실행
```

### 4.9 출력 결과 예시

```
=======================================================
          10미터 보행검사 (10MWT) 결과
=======================================================
  측정 거리      : 10 m
  시작 프레임    : 45
  종료 프레임    : 312
  시작 시간      : 1.500 초
  종료 시간      : 10.400 초
-------------------------------------------------------
  총 소요시간    : 8.900 초
  보행 속도      : 1.124 m/s
=======================================================
```

### 4.10 화면 구성

```
+--------------------------------------------------+
| 상태: 보행중                    +---------------+ |
| L: 5.23m   R: 5.45m            | Bird's Eye    | |
| 경과 시간: 4.52초               | View          | |
| Frame: 156/450                 |   10m         | |
|                                |    *L         | |
|                                |     *R        | |
|                                |               | |
|   1*=================*2        |    5m         | |
|    \      [스켈레톤]  /         |               | |
|     \               /          |               | |
|      \    (L)(R)   /           |    0m         | |
|   4*=================*3        +---------------+ |
+--------------------------------------------------+
```

---

## 5. 공통 기술 스택

### 5.1 AI / Computer Vision

| 기술 | 버전 | 용도 |
|------|------|------|
| YOLOv8-pose | Ultralytics | 17 키포인트 포즈 추정 |
| OpenCV | 4.x | 영상 처리, 원근 변환 |
| NumPy | 1.x | 수치 연산 |

### 5.2 YOLOv8-pose 키포인트

```
 0: 코 (nose)
 1: 왼쪽 눈        2: 오른쪽 눈
 3: 왼쪽 귀        4: 오른쪽 귀
 5: 왼쪽 어깨      6: 오른쪽 어깨
 7: 왼쪽 팔꿈치    8: 오른쪽 팔꿈치
 9: 왼쪽 손목     10: 오른쪽 손목
11: 왼쪽 골반     12: 오른쪽 골반
13: 왼쪽 무릎     14: 오른쪽 무릎
15: 왼쪽 발목 ★   16: 오른쪽 발목 ★  <-- 보행 분석 핵심
```

### 5.3 원근 변환 (Perspective Transform)

```python
import cv2
import numpy as np

# 4점 호모그래피 변환
src_pts = np.float32([pt0, pt1, pt2, pt3])  # 사다리꼴
dst_pts = np.float32([                       # 직사각형
    [0, 0], [width, 0],
    [width, height], [0, height]
])

M = cv2.getPerspectiveTransform(src_pts, dst_pts)

# 좌표 변환
point = np.array([[[x, y]]], dtype=np.float32)
transformed = cv2.perspectiveTransform(point, M)
```

### 5.4 라인 크로싱 감지

```python
# 시작선 통과: 거리가 threshold 아래로 내려갈 때
if prev_dist > START_THRESHOLD and curr_dist <= START_THRESHOLD:
    start_time = calculate_subpixel_time(...)
    state = WALKING

# 종료선 통과
if prev_dist > END_THRESHOLD and curr_dist <= END_THRESHOLD:
    end_time = calculate_subpixel_time(...)
    total_time = end_time - start_time
    state = FINISHED
```

---

## 6. 설치 및 환경 설정

### 6.1 Python 의존성
```bash
cd python_tracker
pip install -r requirements.txt
```

### 6.2 requirements.txt
```
ultralytics>=8.0.0
opencv-python>=4.5.0
numpy>=1.20.0
flask>=2.0.0
matplotlib>=3.5.0
```

### 6.3 YOLO 모델
```bash
# 자동 다운로드됨 (첫 실행 시)
# 수동 다운로드:
# yolov8s-pose.pt (Small)
# yolov8m-pose.pt (Medium)
# yolov8x-pose.pt (Extra Large)
```

---

## 7. 파일 구조

```
TUG/
├── PRD.md                          # 본 문서
├── prd.md                          # 이전 버전 PRD
│
├── python_tracker/                 # 메인 프로젝트 폴더
│   │
│   │── [TUG Test System]
│   ├── app.py                      # Flask 웹 서버
│   ├── templates/
│   │   └── index.html              # 웹 UI
│   ├── static/
│   │   ├── js/main.js              # 프론트엔드 JS
│   │   └── css/style.css           # 스타일시트
│   │
│   │── [10MWT System]
│   ├── ten_meter_walk_test.py      # 10m 보행검사 (독립 실행)
│   │
│   │── [공통 모듈]
│   ├── distance_calculator.py      # 거리 계산
│   ├── perspective_corrector.py    # 원근 보정
│   ├── patient_manager.py          # 환자 관리
│   ├── report_generator.py         # PDF 보고서
│   ├── supabase_client.py          # 클라우드 DB
│   │
│   │── [모델/설정]
│   ├── yolov8s-pose.pt             # YOLO Small
│   ├── yolov8m-pose.pt             # YOLO Medium
│   ├── yolov8x-pose.pt             # YOLO Extra Large
│   ├── requirements.txt            # 의존성
│   ├── .env                        # 환경 설정
│   │
│   │── [데이터]
│   ├── uploads/                    # 업로드 영상
│   └── patient_data/               # 환자별 데이터
│       ├── P0001/
│       └── P0002/
│
├── src/                            # React 모바일 앱
├── android/                        # Android
├── ios/                            # iOS
└── dist/                           # 빌드 결과
```

---

## 8. 사용 시나리오

### 8.1 TUG Test (웹)

```
1. python app.py 실행
2. http://localhost:5000 접속
3. 환자 선택/등록
4. 영상 업로드
5. "4점 설정" → 첫 프레임에서 바닥 4점 클릭
6. 실제 거리 입력 (예: 10m)
7. "분석 시작"
8. 실시간 분석 영상 확인
9. 결과 저장 / CSV 다운로드 / PDF 보고서
```

### 8.2 10MWT (독립 실행)

```
1. python ten_meter_walk_test.py -v video.mp4
2. 캘리브레이션 창에서 4점 클릭
   - 1: 시작선 왼쪽 (10m)
   - 2: 시작선 오른쪽 (10m)
   - 3: 종료선 오른쪽 (0m)
   - 4: 종료선 왼쪽 (0m)
3. Enter로 분석 시작
4. 자동으로 시작/종료 감지
5. 결과 출력:
   - 총 소요시간
   - 보행 속도 (m/s)
```

---

## 9. 버전 히스토리

| 버전 | 날짜 | 변경 사항 |
|------|------|----------|
| 1.0.0 | 2026-01-26 | TUG Test 초기 릴리즈 |
| 2.0.0 | 2026-01-27 | TUG Test 메이저 업데이트 |
| | | - 4점 호모그래피 원근 보정 |
| | | - 서브픽셀 정확도 |
| | | - 거리 계산 방향 수정 (10m→0m) |
| | | - 세션별 저장, CSV 내보내기 |
| | | - 히스토리, 비교 분석, 통계 |
| | | - 시작/종료 라인 시각화 |
| 3.0.0 | 2026-01-27 | 10MWT 시스템 추가 |
| | | - YOLOv8s-pose 기반 독립 실행 프로그램 |
| | | - cv2.setMouseCallback 4점 캘리브레이션 |
| | | - 등변사다리꼴 자동 보정 |
| | | - Bird's Eye View 미니맵 |
| | | - 실시간 오버레이 (거리, 시간, 상태) |

---

## 10. 알려진 이슈 및 제한사항

| 이슈 | 설명 | 해결 방안 |
|------|------|----------|
| 낮은 조명 | YOLO 정확도 저하 | 충분한 조명 확보 |
| 반사면 | 거울/유리 반사 중복 감지 | 반사 필터링 적용 |
| 빠른 동작 | 모션 블러 | 높은 FPS 영상 사용 |
| 복수 인원 | 다중 감지 혼란 | 단일 인원 환경 권장 |
| 발목 가림 | 옷이나 장애물로 발목 가림 | 짧은 바지 권장 |

---

## 11. 향후 개발 계획

| 우선순위 | 기능 | 설명 |
|----------|------|------|
| 높음 | 자동 시작/종료 | 의자 감지 기반 완전 자동화 |
| 높음 | 6MWT 지원 | 6분 보행검사 추가 |
| 중간 | 보행 패턴 분석 | 걸음걸이, 보폭, 대칭성 |
| 중간 | 음성 안내 | 검사 진행 가이드 |
| 중간 | 실시간 카메라 | 녹화 없이 실시간 분석 |
| 낮음 | 클라우드 분석 | GPU 서버 기반 |
| 낮음 | 다국어 지원 | 영어, 일본어 |

---

## 12. 참고 자료

### 12.1 의학적 기준
- [TUG Test Wikipedia](https://en.wikipedia.org/wiki/Timed_Up_and_Go_test)
- [10-Meter Walk Test](https://www.sralab.org/rehabilitation-measures/10-meter-walk-test)

### 12.2 기술 문서
- [YOLOv8 Documentation](https://docs.ultralytics.com/)
- [OpenCV Perspective Transform](https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html)
- [Flask Documentation](https://flask.palletsprojects.com/)

---

## 13. 빠른 시작 가이드

### TUG Test (웹)
```bash
cd python_tracker
python app.py
# 브라우저: http://localhost:5000
```

### 10MWT (독립 실행)
```bash
cd python_tracker
python ten_meter_walk_test.py --video <영상파일>
```

---

*문서 작성일: 2026-01-27*
*문서 버전: 3.0*
*프로젝트: TUG Test System + 10MWT System*
