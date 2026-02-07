// Berg Balance Scale (BBS) 검사 항목 - 상세 버전
export const BBS_ITEMS = [
  {
    id: 1,
    name: '앉은 자세에서 일어서기',
    shortName: '앉아서 일어서기',
    desc: '손을 사용하지 않고 일어서기',
    instruction: '의자에 앉은 상태에서 팔짱을 끼고 일어서세요. 손으로 의자나 다른 곳을 짚지 마세요.',
    duration: 0, // 시간 제한 없음
    detection: {
      type: 'sit_to_stand',
      startPose: 'sitting',
      endPose: 'standing',
      criteria: {
        noHandSupport: true, // 손 지지 없이
        timeLimit: null
      }
    },
    scoring: [
      { score: 4, desc: '손을 사용하지 않고 안전하게 일어설 수 있다' },
      { score: 3, desc: '손을 사용하여 독립적으로 일어설 수 있다' },
      { score: 2, desc: '여러 번 시도 후 손을 사용하여 일어설 수 있다' },
      { score: 1, desc: '일어서는데 최소한의 도움이 필요하다' },
      { score: 0, desc: '일어서는데 중등도 또는 최대의 도움이 필요하다' }
    ]
  },
  {
    id: 2,
    name: '지지 없이 서 있기',
    shortName: '서 있기',
    desc: '2분간 지지 없이 서 있기',
    instruction: '아무것도 잡지 않고 2분간 서 계세요. 균형을 잃으면 검사가 중단됩니다.',
    duration: 120, // 120초 = 2분
    detection: {
      type: 'standing_duration',
      pose: 'standing',
      criteria: {
        minDuration: 120, // 2분
        noSupport: true,
        stable: true // 안정적으로
      }
    },
    scoring: [
      { score: 4, desc: '2분간 안전하게 서 있을 수 있다' },
      { score: 3, desc: '감독하에 2분간 서 있을 수 있다' },
      { score: 2, desc: '지지 없이 30초간 서 있을 수 있다' },
      { score: 1, desc: '여러 번 시도하여 지지 없이 30초간 서 있을 수 있다' },
      { score: 0, desc: '도움 없이 30초간 서 있을 수 없다' }
    ]
  },
  {
    id: 3,
    name: '지지 없이 앉아 있기',
    shortName: '앉아 있기',
    desc: '등받이 없이 발이 바닥에 닿은 상태로 2분간 앉아 있기',
    instruction: '등받이 없는 의자에 2분간 앉아 계세요.',
    duration: 120,
    detection: {
      type: 'sitting_duration',
      pose: 'sitting',
      criteria: {
        minDuration: 120,
        noBackSupport: true,
        feetOnFloor: true
      }
    },
    scoring: [
      { score: 4, desc: '안전하게 2분간 앉아 있을 수 있다' },
      { score: 3, desc: '감독하에 2분간 앉아 있을 수 있다' },
      { score: 2, desc: '30초간 앉아 있을 수 있다' },
      { score: 1, desc: '10초간 앉아 있을 수 있다' },
      { score: 0, desc: '도움 없이 10초간 앉아 있을 수 없다' }
    ]
  },
  {
    id: 4,
    name: '선 자세에서 앉기',
    shortName: '서서 앉기',
    desc: '손을 사용하지 않고 앉기',
    instruction: '서 있는 상태에서 팔짱을 끼고 천천히 의자에 앉으세요.',
    duration: 0,
    detection: {
      type: 'stand_to_sit',
      startPose: 'standing',
      endPose: 'sitting',
      criteria: {
        noHandSupport: true,
        controlled: true // 조절된 동작으로
      }
    },
    scoring: [
      { score: 4, desc: '손을 최소로 사용하여 안전하게 앉는다' },
      { score: 3, desc: '손을 사용하여 내려앉는 것을 조절한다' },
      { score: 2, desc: '다리 뒤쪽을 의자에 대고 내려앉는 것을 조절한다' },
      { score: 1, desc: '독립적으로 앉지만 조절되지 않고 내려앉는다' },
      { score: 0, desc: '앉는데 도움이 필요하다' }
    ]
  },
  {
    id: 5,
    name: '이동하기',
    shortName: '의자 이동',
    desc: '팔걸이가 있는 의자에서 없는 의자로 이동',
    instruction: '팔걸이가 있는 의자에서 일어나 옆에 있는 팔걸이가 없는 의자로 이동하여 앉으세요.',
    duration: 0,
    detection: {
      type: 'transfer',
      sequence: ['sitting', 'standing', 'moving', 'sitting'],
      criteria: {
        completeTransfer: true
      }
    },
    scoring: [
      { score: 4, desc: '손을 약간 사용하여 안전하게 이동할 수 있다' },
      { score: 3, desc: '손을 확실히 사용하여 안전하게 이동할 수 있다' },
      { score: 2, desc: '말로 지시하거나 감독이 필요하다' },
      { score: 1, desc: '도움을 주는 사람 1명이 필요하다' },
      { score: 0, desc: '안전을 위해 2명의 도움이나 감독이 필요하다' }
    ]
  },
  {
    id: 6,
    name: '눈 감고 서 있기',
    shortName: '눈 감고 서기',
    desc: '10초간 눈을 감고 서 있기',
    instruction: '눈을 감고 10초간 서 계세요. 균형을 잃으면 눈을 뜨셔도 됩니다.',
    duration: 10,
    detection: {
      type: 'standing_duration',
      pose: 'standing',
      criteria: {
        minDuration: 10,
        eyesClosed: true, // 눈 감음 (감지 불가, 자가 보고)
        stable: true
      }
    },
    scoring: [
      { score: 4, desc: '10초간 안전하게 서 있을 수 있다' },
      { score: 3, desc: '감독하에 10초간 서 있을 수 있다' },
      { score: 2, desc: '3초간 서 있을 수 있다' },
      { score: 1, desc: '눈을 감고 3초간 있을 수 없지만 안정적으로 서 있다' },
      { score: 0, desc: '넘어지지 않기 위해 도움이 필요하다' }
    ]
  },
  {
    id: 7,
    name: '두 발 모아 서 있기',
    shortName: '발 모아 서기',
    desc: '두 발을 모으고 1분간 서 있기',
    instruction: '두 발을 나란히 붙이고 1분간 서 계세요.',
    duration: 60,
    detection: {
      type: 'standing_feet_together',
      pose: 'standing',
      criteria: {
        minDuration: 60,
        feetTogether: true, // 발목 간격 체크
        ankleDistance: 0.1 // 발목 간 최대 거리 (정규화)
      }
    },
    scoring: [
      { score: 4, desc: '독립적으로 두 발을 모으고 1분간 서 있을 수 있다' },
      { score: 3, desc: '감독하에 독립적으로 두 발을 모으고 1분간 서 있을 수 있다' },
      { score: 2, desc: '독립적으로 두 발을 모으고 30초간 서 있을 수 있다' },
      { score: 1, desc: '도움이 필요하지만 두 발을 모으고 15초간 서 있을 수 있다' },
      { score: 0, desc: '도움이 필요하고 15초간 서 있을 수 없다' }
    ]
  },
  {
    id: 8,
    name: '팔 뻗어 앞으로 내밀기',
    shortName: '팔 뻗기',
    desc: '선 자세에서 팔을 90도로 뻗어 앞으로 최대한 내밀기',
    instruction: '팔을 앞으로 90도 뻗은 상태에서 손가락 끝을 최대한 앞으로 내미세요. 발은 제자리에 두세요.',
    duration: 0,
    detection: {
      type: 'arm_reach',
      pose: 'standing',
      criteria: {
        armExtended: true,
        measureReach: true, // 뻗은 거리 측정
        feetStationary: true // 발 고정
      }
    },
    scoring: [
      { score: 4, desc: '25cm 이상 자신 있게 뻗을 수 있다' },
      { score: 3, desc: '12.5cm 이상 안전하게 뻗을 수 있다' },
      { score: 2, desc: '5cm 이상 안전하게 뻗을 수 있다' },
      { score: 1, desc: '앞으로 뻗지만 감독이 필요하다' },
      { score: 0, desc: '균형을 잃어 외부 지지가 필요하다' }
    ]
  },
  {
    id: 9,
    name: '바닥의 물건 집기',
    shortName: '물건 집기',
    desc: '선 자세에서 바닥에 있는 물건(신발 등) 집기',
    instruction: '서 있는 상태에서 앞에 있는 바닥의 물건을 집어 올리세요.',
    duration: 0,
    detection: {
      type: 'pick_up_object',
      sequence: ['standing', 'bending', 'standing'],
      criteria: {
        bendDown: true,
        returnToStand: true,
        safe: true
      }
    },
    scoring: [
      { score: 4, desc: '쉽고 안전하게 물건을 집을 수 있다' },
      { score: 3, desc: '감독하에 물건을 집을 수 있다' },
      { score: 2, desc: '물건을 집을 수 없지만 2.5-5cm까지 도달하고 독립적으로 균형을 유지한다' },
      { score: 1, desc: '물건을 집을 수 없고 시도하는 동안 감독이 필요하다' },
      { score: 0, desc: '시도할 수 없거나 균형을 잃지 않도록 도움이 필요하다' }
    ]
  },
  {
    id: 10,
    name: '뒤돌아보기',
    shortName: '뒤돌아보기',
    desc: '왼쪽과 오른쪽으로 어깨 너머 뒤돌아보기',
    instruction: '제자리에서 왼쪽으로 어깨 너머를 돌아보세요. 그 다음 오른쪽으로 돌아보세요.',
    duration: 0,
    detection: {
      type: 'look_behind',
      pose: 'standing',
      criteria: {
        turnLeft: true,
        turnRight: true,
        shoulderRotation: 0.3, // 어깨 회전 정도
        feetStationary: true
      }
    },
    scoring: [
      { score: 4, desc: '양쪽으로 뒤를 보며 체중 이동이 좋다' },
      { score: 3, desc: '한쪽으로만 뒤를 잘 볼 수 있고, 다른 쪽은 체중 이동이 적다' },
      { score: 2, desc: '옆으로만 돌아볼 수 있지만 균형을 유지한다' },
      { score: 1, desc: '돌아볼 때 감독이 필요하다' },
      { score: 0, desc: '균형을 잃지 않도록 도움이 필요하다' }
    ]
  },
  {
    id: 11,
    name: '360도 회전',
    shortName: '360도 회전',
    desc: '제자리에서 한 바퀴(360도) 회전하기',
    instruction: '제자리에서 한 바퀴 완전히 돌아서세요. 멈춘 후 반대 방향으로 한 바퀴 돌아서세요.',
    duration: 0,
    detection: {
      type: 'turn_360',
      criteria: {
        fullRotation: true, // 360도 회전
        bothDirections: true, // 양방향
        measureTime: true // 시간 측정
      }
    },
    scoring: [
      { score: 4, desc: '4초 이내에 양방향으로 안전하게 360도 회전할 수 있다' },
      { score: 3, desc: '4초 이내에 한쪽 방향으로만 안전하게 360도 회전할 수 있다' },
      { score: 2, desc: '안전하게 360도 회전할 수 있지만 느리다' },
      { score: 1, desc: '가까운 감독이나 말로 지시가 필요하다' },
      { score: 0, desc: '회전하는 동안 도움이 필요하다' }
    ]
  },
  {
    id: 12,
    name: '발판에 발 교대로 올리기',
    shortName: '발 올리기',
    desc: '지지 없이 발판에 발을 번갈아 4회 올리기',
    instruction: '앞에 있는 발판(계단)에 번갈아가며 발을 올리세요. 총 4회(양발 각 2회) 실시합니다.',
    duration: 20, // 20초 이내
    detection: {
      type: 'step_alternating',
      criteria: {
        stepCount: 4, // 4회
        alternating: true, // 번갈아
        timeLimit: 20, // 20초
        noSupport: true
      }
    },
    scoring: [
      { score: 4, desc: '독립적으로 안전하게 서서 20초 이내에 8회 완수' },
      { score: 3, desc: '독립적으로 서서 20초 이상 걸려 8회 완수' },
      { score: 2, desc: '감독하에 도움 없이 4회 완수' },
      { score: 1, desc: '최소한의 도움으로 2회 이상 완수' },
      { score: 0, desc: '넘어지지 않도록 도움이 필요하거나 시도할 수 없다' }
    ]
  },
  {
    id: 13,
    name: '일렬로 서기 (탄뎀 서기)',
    shortName: '일렬 서기',
    desc: '한 발을 다른 발 바로 앞에 놓고 30초간 서 있기',
    instruction: '한 발을 다른 발 바로 앞에 일자로 놓고 서세요. 못하시면 앞발을 충분히 앞으로 내밀어 서세요.',
    duration: 30,
    detection: {
      type: 'tandem_stance',
      pose: 'standing',
      criteria: {
        tandemPosition: true, // 일렬 자세
        minDuration: 30,
        heelToToe: true // 뒤꿈치-발끝 정렬
      }
    },
    scoring: [
      { score: 4, desc: '독립적으로 발을 일렬로 놓고 30초간 유지' },
      { score: 3, desc: '독립적으로 발을 앞에 놓고 30초간 유지' },
      { score: 2, desc: '독립적으로 작은 보폭을 취하고 30초간 유지' },
      { score: 1, desc: '발을 내딛는데 도움이 필요하지만 15초간 유지' },
      { score: 0, desc: '발을 내딛거나 서 있을 때 균형을 잃는다' }
    ]
  },
  {
    id: 14,
    name: '한 발로 서기',
    shortName: '한 발 서기',
    desc: '지지 없이 한 발로 서 있기',
    instruction: '아무것도 잡지 않고 한 발로 최대한 오래 서 계세요.',
    duration: 10, // 최대 10초
    detection: {
      type: 'single_leg_stance',
      pose: 'standing',
      criteria: {
        singleLeg: true, // 한 발
        measureDuration: true, // 시간 측정
        maxDuration: 10,
        noSupport: true
      }
    },
    scoring: [
      { score: 4, desc: '독립적으로 한 발을 들고 10초 이상 유지' },
      { score: 3, desc: '독립적으로 한 발을 들고 5-10초 유지' },
      { score: 2, desc: '독립적으로 한 발을 들고 3-5초 유지' },
      { score: 1, desc: '한 발을 들려고 시도하고 3초간 유지할 수 없지만 독립적으로 서 있다' },
      { score: 0, desc: '시도할 수 없거나 균형을 잃지 않도록 도움이 필요하다' }
    ]
  }
];

// BBS 점수 옵션 (공통)
export const BBS_SCORE_OPTIONS = [
  { score: 0, desc: '수행 불가' },
  { score: 1, desc: '최대 도움 필요' },
  { score: 2, desc: '중등도 도움 필요' },
  { score: 3, desc: '최소 도움 필요' },
  { score: 4, desc: '독립적 수행' }
];

// BBS 총점
export const BBS_MAX_SCORE = 56;
export const BBS_TOTAL_ITEMS = 14;
