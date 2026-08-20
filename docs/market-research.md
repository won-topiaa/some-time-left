# 썸 타임 레프트 — 시장 조사 및 컨셉 진단

> 조사일: 2026-08-17
> 대상 컨셉: 목적지와 희망 도착 시각을 입력하면, **최단 경로가 아니라 "3분 전에 도착하는" 도보 경로**를 추천하는 지도 앱. 경로 구성 조건(경사·경치·혼잡도 등) 선택 가능.

---

## 0. 한 줄 결론

**똑같은 앱은 아직 없다.** 다만 이 컨셉을 이루는 세 조각(① 도착 시각 역산 ② 시간 기반 경로 생성 ③ 취향 기반 라우팅)은 각각 이미 상용화되어 있다. 빈틈은 그 **교집합**에 있고, 그 교집합이 비어 있는 데에는 기술적·사업적 이유가 둘 다 있다. 감성 컨셉으로서의 씨앗은 훌륭하지만, 현재 기획서 상태로는 **감정을 지속시킬 장치가 없고 사용 빈도가 너무 낮다.** 이 두 가지가 핵심 과제다.

---

## 1. 경쟁 지형 — 네 개의 층위

### A층. "언제 나가야 하나" — 출발 시각 계산형

| 서비스 | 하는 일 | 한계 |
|---|---|---|
| **Timely Go** (iOS, 2025) | 목적지 + 도착 시각 → 출발 시각 즉시 계산. 0~120분 커스텀 버퍼, 도보 포함 다중 교통수단 | 경로는 최단 그대로. 시간이 **남는** 반대 상황은 안 풂 |
| **Apple 지도** | 도보 포함 "출발 시각/도착 시각" 지정 지원 | 출발 시각만 역산. 경로 길이는 고정 |
| **Google 지도** | "도착 시각(arrive by)"은 **운전·대중교통 전용, 도보는 미지원** | 도보 사용자에겐 기능 자체가 없음 |
| **Citymapper** | 최적 출발 시각 제안, 대기 시간 최소화 | 대중교통 환승 최적화 관점 |
| **RouteMyPlan** | 지각·노쇼 방지용 스케줄링 | B2B 일정 관리 성격 |

**공통점: 전부 "늦지 않게"에만 답한다.** 남는 시간을 다루는 제품은 이 층에 없다.

### B층. "N분짜리 걷기" — 시간 기반 경로 생성형 ← **가장 가까운 경쟁자**

| 서비스 | 하는 일 | 한계 |
|---|---|---|
| **Mr. Walkway** (iOS) | 원하는 **걷기 시간 + 속도** 입력 → 5개 경로 추천. **왕복 루프 코스와 목적지 코스 둘 다** 제공 | 기준이 "지속 시간(duration)"이지 **"약속 시각(clock time)"이 아님**. 취향 조건 없음 |
| **DailyWander** (iOS) | 20/30/45/60분 루프 자동 생성, 걷기 기록 저장 | 현재 위치 기준 **루프 전용**. 목적지 개념 없음 |
| **Scenic Way** (UK/EU) | "5km 루프" 요청하면 즉석 생성, CarPlay 지원 | 목적지·시각 앵커링 없음 |
| **Footpath / Komoot / Strava** | 정교한 경로 플래너, 라운드트립 플래너 | 아웃도어·운동 맥락. 도심 약속 맥락 아님 |

**여기가 진짜 경쟁 지대다.** 특히 Mr. Walkway는 "목적지 코스 + 시간 지정"까지 가지고 있어 기능적으로 상당히 겹친다. **차이는 단 하나: "30분 걷기"가 아니라 "2시 57분 도착"이라는 것.** 이 한 끗이 제품 전체의 맥락(약속·불안·타인)을 바꾸므로 충분히 유의미하지만, "우리만 있는 기능"이라고 말하기엔 근거가 얇다는 점은 인정해야 한다.

### C층. 취향 기반 라우팅 (경사·경치·조용함) — **이미 검증된 영역, 차별점 아님**

- **Komoot**: 조용한 길 / 경치 좋은 길 / 최단 경로를 선택 가능. 노면·난이도·고도 프로파일 제공. 무료로 경로 계획 가능(Strava는 유료).
- **학술 — "The Shortest Path to Happiness"** (Quercia, Schifanella, Aiello / 2014): 거리뷰 이미지 쌍을 3,300여 명에게 투표시켜 **아름다움·조용함·행복감** 점수를 만들고 그 기준으로 경로 추천. 결과 경로는 최단 대비 **평균 12%만 더 길었고**, 현지인 30명 검증에서 "더 아름답다"는 평가를 받음. 런던·베를린·보스턴·토리노에 적용.
- **HappyRouting** (2024~): 감정 인지 기반 라우팅 학습 모델.
- **2TD-AOP 연구**: 경치 점수와 통행 시간이 **시간대에 따라 변하는** 경로 최적화(미미틱 알고리즘).

→ **시사점: "다양한 조건으로 경로를 고른다"는 아이디어는 학술적으로 검증됐고 상용에도 이미 있다. 이것을 차별점으로 내세우면 안 된다.** 최단 대비 12% 정도의 우회로도 체감 만족이 크게 오른다는 근거는 오히려 우리 편이다 — 20분 경로를 27분으로 늘리는 건 이 연구 범위(12%)보다 훨씬 큰 우회이므로, **경로 품질 설계가 그만큼 더 중요하다**는 뜻이기도 하다.

### D층. 배회·우연성 (레퍼런스이자 경고)

- **Randonautica** (2020): 랜덤 좌표(attractor/void/anomaly)로 목적 없는 이동 유도. 틱톡에서 바이럴. → 감성/우연성만으로 폭발적 확산은 가능함을 증명.
- **Dérive 앱**: "빨간 차를 따라가세요" 같은 지시로 상황주의 드리프트 구현.
- **Detour** (그루폰 창업자 Andrew Mason, 2014): 오디오 워킹 투어. **Bose에 인수된 뒤 서비스 종료.** → **"감성 도보" 카테고리는 수익화에 실패한 전례가 있다.** 반드시 참고할 것.
- **Drives & Detours / STQRY**: 위치 기반 오디오 투어.

### 한국 시장

- **네이버지도 / 카카오맵**: 최단·최속 중심. 네이버는 도보 상세 경로가 강하고 경유지 최대 5개 지정 가능 — **이 경유지 기능이 사실상 "수동 우회"의 유일한 대안**이다. 도착 시각 역산 도보 라우팅은 없음.
- **산책·기록 앱** (발자국, 더트레일, 램블러, 멍콕, MapWalker): 트래킹·기록·반려견 산책 중심. **"약속"이라는 맥락이 전혀 없다.**
- → **국내에는 A층·B층 제품이 사실상 없다.** 글로벌보다 국내 화이트스페이스가 더 넓다.

---

## 2. 화이트스페이스와 그 이유

**비어 있는 지점: `도착 시각 앵커링(A) × 시간 채우기 경로 생성(B) × 취향 조건(C)`의 교집합.**
"목적지가 정해져 있고, 도착해야 할 시각이 정해져 있고, 그 사이 여유를 걷기로 채운다" — 이 조합을 하는 제품은 조사 범위에서 발견되지 않았다.

### 왜 아무도 안 했나 (정직하게)

1. **알고리즘 난이도.** "정확히 T분이 걸리면서 점수(경치·경사·한적함)가 최대인 경로"는 **Arc Orienteering Problem(AOP)** 계열이고 **NP-hard**다. 대규모 인스턴스는 정확해법으로 실용 시간 내 못 풀어 휴리스틱·메타휴리스틱이 필요하다. 기존 지도 대기업의 인프라는 전부 "최단·최속"에 최적화되어 있어 재활용이 어렵다. → **진입 장벽이자 동시에 방어막이다.**
2. **사용 빈도가 치명적으로 낮다.** "20분 걸린다는데 30분이 남았다"는 상황은 사람마다 주 1~2회다. 리텐션 설계 없이는 설치 후 잊히는 앱이 된다. **이것이 이 기획의 최대 리스크다.**
3. **도보 ETA 오차.** 3분 정밀도를 약속하는데 신호등 대기·보행 속도 편차로 ±3분은 쉽게 발생한다. **약속을 지켜준다고 해놓고 어기는 앱은 신뢰가 즉사한다.**
4. **수익화 전례가 나쁘다.** Detour의 종료가 보여주듯 감성 도보 카테고리는 광고·구독 모두 붙이기 어렵다.
5. **가장 무서운 경쟁자는 앱이 아니라 카페다.** 시간이 남으면 사람들은 대개 카페·편의점에 들어간다. 이미 존재하는 "기본 해법"을 이겨야 한다.

---

## 3. 감성 진단 — 충분한가?

### 결론: 씨앗은 훌륭하다. 하지만 지금은 씨앗뿐이다.

현재 기획에서 감성은 **이름("썸 타임 레프트")과 숫자("3분")** 두 군데에만 있고, 나머지는 기능 명세다. 감정을 **시작**시키는 장치는 있는데 **지속**시키는 장치가 없다.

### 강한 점 — 지켜야 할 것

- **"3분 전"이라는 구체적 숫자.** 5분도 10분도 아닌 3분. 이 임의적이고 구체적인 숫자가 브랜드의 전부다. 절대 "N분 설정 가능"으로 희석하지 말 것(설정은 숨겨두고 기본값 3분을 정체성으로).
- **문제 정의의 보편성.** "이미 밖에 나와 있는데 시간이 남는 애매함" — 카페 들어가긴 애매하고, 서 있긴 뻘쭘하고, 천천히 걸으면 어색한 그 상태. 설명 없이 공감된다.
- **심리학적 기반이 실재한다.** 연구에 따르면 **성실성은 일반적 정시성을 예측하지만, 일찍 도착하는 성향은 신경증(불안) 성향과 상관**이 있다. 심리학자 Linda Sapadin은 "일찍 도착하는 버퍼가 신경계를 진정시킨다"고 설명한다. 즉 **이 앱은 길찾기 앱이 아니라 불안 관리 앱으로 포지셔닝할 수 있다.** 남는 시간을 *견디는 것*에서 *쓰는 것*으로 바꿔주는 제품. ← **여기가 감성의 진짜 광맥이다.**
- **시대 배경이 받쳐준다.** 2026년 피트니스 트렌드는 "보여주기 운동"에서 "삶을 위한 운동"으로 이동 중이고, 일본식 인터벌 워킹은 관심도 **2,986% 급증**, Hot Girl Walk처럼 걷기를 정신 건강 리셋으로 쓰는 흐름이 자리잡았다. 걷기에 의미를 붙이는 제품에 유리한 시기다.

### 약한 점 — 지금 없는 것

1. **감정의 대상이 없다.** "약속"이 컨셉의 출발점인데 정작 **상대방이 제품 안에 없다.** 지금은 혼자 걷는 앱이다.
2. **선택 조건이 감성이 아니라 스펙이다.** 경사·경치·혼잡도는 이성적 필터다. 사용자가 실제로 고르고 싶은 건 지형이 아니라 **기분**이다.
3. **끝나고 남는 게 없다.** 도착하면 앱은 닫히고, 다시 열 이유가 없다. 축적되는 자산이 없다.
4. **"3분 전 도착" 이후가 비어 있다.** 앱 이름이 *Some Time Left*인데 정작 그 남은 시간을 어떻게 쓰는지에 대한 제안이 없다.

---

## 4. 제안 — 감성 강화 + 생존을 위한 7가지

### ① 조건을 "지형"이 아니라 "기분"의 언어로 바꿔라 (비용 0, 효과 최대)

| 지금 (스펙) | 바꿀 것 (감정) | 실제 백엔드 신호 |
|---|---|---|
| 경사 낮음 | **생각 정리하기 좋은 길** | 고도 변화 + 직선 구간 비율 |
| 경치 좋음 | **해 지는 게 보이는 길** | 태양 방위각 + 개활지 레이어 |
| 혼잡도 낮음 | **아무도 안 마주치는 길** | 유동 인구 데이터 |
| — | **노래 두 곡 딱 맞는 길** | 소요 시간 ÷ 평균 곡 길이 |
| — | **비 와도 덜 젖는 길** | 지하도·아케이드·처마 레이어 |
| — | **여름에 그늘인 길** | 건물 높이 + 태양 고도/방위각 ← **한국 여름 킬러 기능** |

계산은 같고 라벨만 바꾸는 것인데, 이것만으로 "경로 계산기"가 "기분 고르는 앱"이 된다.

### ② "3분"을 브랜드 의식(ritual)으로 만들어라

도착 3분 전 알림이 아니라, **도착해서 남은 3분에 무엇을 할지** 제안하는 것이 시그니처 순간이 되어야 한다.
> "3분 남았어요. 숨 고르고, 거울 한 번 보고, 첫 마디를 생각하기."

이 3분 화면이 스크린샷으로 공유되는 순간이다. 앱 이름이 약속하는 것을 실제로 채워주는 유일한 장면.

### ③ 약속 상대를 제품에 넣어라 — 감성과 리텐션을 동시에 푸는 유일한 축

- 누구를 만나러 가는지 태깅 → **"오랜만에 만나는 사람"이면 생각 정리 경로를 더 길게, "편한 사람"이면 짧고 편한 길로.**
- 만남 후 한 줄 기록 → 다음에 같은 사람을 만나러 갈 때 *"지난번엔 이 길로 갔어요"*.
- 관계별로 쌓이는 경로 아카이브. **경로가 관계의 기록이 된다.**

### ④ 걸은 길이 남게 하라

약속 때문에 어쩔 수 없이 나온 걸음이 쌓여 내 동네 지도가 색으로 채워지는 구조. 국내 산책 앱들이 "기록"은 하지만 **의미를 붙이지 못한** 지점이다. 여기에 ③의 관계 축을 얹으면 다른 앱이 복제하기 어려운 자산이 된다.

### ⑤ 반대 상황까지 흡수해서 사용 빈도를 올려라 — **사업적으로 가장 중요**

주 1회 앱을 주 4회 앱으로 만드는 유일한 방법:

- **시간이 남을 때** (원래 기획): 3분 전 도착 경로
- **시간이 부족할 때**: 3분 전 도착이 불가능하면 정직하게 — *"지금 뛰면 정시, 택시 타면 3분 전"* + 상대에게 "5분 늦어요" 자동 메시지
- **딱 맞을 때**: *"지금 속도 그대로면 정확해요"* — 아무것도 안 해도 되는 확인의 안도감
- **목적지가 없는 날**: *"40분 있어요"* → 루프 산책 생성 (DailyWander·Mr. Walkway 영역까지 흡수)

"3분 전 도착"은 **진입점**이고, 제품은 **"약속 시간과 나 사이의 거리를 관리해주는 앱"**이어야 한다.

### ⑥ 신뢰를 기능으로 설계하라

3분을 약속하는 앱에서는 **정확도가 곧 감성**이다.
- 걷는 중 실시간 재계산 + 페이스 코칭: *"조금 천천히 걸어도 돼요"*, *"지금 속도면 2분 일찍 도착해요"* ← 이게 실제로는 최고의 감성 UX다. 경로를 늘리는 대신 **속도로 미세 조정**하는 것이 훨씬 자연스럽고 계산도 쉽다.
- 신호등 대기·횡단보도 수를 ETA에 반영.
- 못 지킬 상황은 **미리 자백**한다.

### ⑦ 이름과 톤

- "썸 타임 레프트"는 '썸'의 중의성이 재밌지만 검색·구전이 애매하다. 한글 서브카피 병기 권장: **"3분 먼저 도착하는 길"**.
  → **해소됨(2026-08-20).** 한국어 이름을 **자투리 시간**으로, 부제를 **"약속 3분 전에 도착하는 길"**로 확정. `concept-decisions.md` 4번 참고.
- 알림 문구가 곧 제품이다. 정보 전달체가 아니라 **옆에서 같이 걷는 사람의 말투**로 쓸 것.

---

## 5. 다음 단계 — 검증 순서

1. **가장 싼 검증 (인터뷰).** "최근에 약속 장소 근처에 일찍 도착해서 애매했던 경험"과 **그때 실제로 무엇을 했는지**를 묻는다. 대부분 "카페 갔다"고 답하면, 이 시장은 카페가 이미 점유하고 있다는 뜻이다. **이 질문 하나가 기획의 생사를 가른다.**
2. **정확도 프로토타입.** 네이버/카카오 도보 API + 서울 열린데이터(경사·유동인구)로 최소 버전: `목적지 + 도착 시각 → 최단 경로 + 우회 후보 3개`. 경로 품질보다 **ETA 정확도를 먼저 측정**한다. ±3분을 못 맞추면 컨셉 전체가 성립하지 않는다.
3. **알고리즘.** 정식 AOP 최적화는 나중이다. 초기엔 "최단 경로 + 경유지 1~2개 삽입 후 소요 시간 재계산"이라는 단순 휴리스틱으로 충분하다 (네이버 지도 경유지 5개 지원 활용 가능).
4. **감성 검증.** ①의 "기분 라벨"만 목업으로 만들어 반응을 본다. 사람들이 어떤 라벨을 고르는지가 곧 제품 방향이다.

---

## 참고 자료

- [The Shortest Path to Happiness: Recommending Beautiful, Quiet, and Happy Routes in the City (arXiv:1407.1031)](https://arxiv.org/abs/1407.1031) · [PDF](https://researchswinger.org/publications/quercia14_shortest.pdf)
- [Forget the Shortest Route Across a City; New Algorithm Finds the Most Beautiful — MIT Technology Review](https://www.technologyreview.com/2014/07/08/12999/forget-the-shortest-route-across-a-city-new-algorithm-finds-the-most-beautiful/)
- [The shortest paths to happiness. Literally — ideas.ted.com](https://ideas.ted.com/the-shortest-paths-to-happiness-literally/)
- [HappyRouting: Learning Emotion-Aware Route Trajectories (arXiv:2401.15695)](https://arxiv.org/html/2401.15695v2)
- [Enjoy the most beautiful scene now: a memetic algorithm for the two-fold time-dependent arc orienteering problem](https://link.springer.com/content/pdf/10.1007/s11704-019-8364-1.pdf)
- [Approximation algorithms for the arc orienteering problem](https://www.researchgate.net/publication/276883133_Approximation_algorithms_for_the_arc_orienteering_problem)
- [Timely Go — App Store](https://apps.apple.com/hn/app/timely-go/id6753982213)
- [Mr. Walkway — App Store](https://apps.apple.com/us/app/mr-walkway/id1639848550)
- [DailyWander — Walking Route Planner by Time](https://www.dailywander.app/walking-route-planner-by-time/)
- [Scenic Way](https://scenicway.co.uk/)
- [Komoot Route Planner](https://www.komoot.com/plan)
- [Footpath Route Planner — Google Play](https://play.google.com/store/apps/details?id=com.halfmilelabs.footpath&hl=en_GB)
- [Plan your commute or trip — Google Maps Help](https://support.google.com/maps/answer/7565193)
- [How to Set 'Leave at' and 'Arrive by' Times in Apple Maps](https://nerdschalk.com/ios-15-how-to-set-up-leave-at-and-arrive-by-times-when-driving/)
- [Pick the best time to leave — Citymapper](https://www1.citymapper.com/i/2571/pick-the-best-time-to-leave-and-spend-less-time-waiting)
- [Hacking the Map Apps for Active Transportation — America Walks](https://americawalks.org/hacking-the-map-apps-for-active-transportation-less-walking-vs-more-walking-as-a-means-of-optimized-movement-and-mobility/)
- [Randonautica — Wikipedia](https://en.wikipedia.org/wiki/Randonautica)
- [Psychogeography apps — Babak Fakhamzadeh](https://babakfakhamzadeh.com/psychogeography-apps/)
- [Andrew Mason's Audio Tour App Detour — TechCrunch](https://techcrunch.com/2014/07/30/detour)
- [Are you always early for everything? The psychology behind punctuality — Psychologies](https://www.psychologies.co.uk/are-you-always-early-for-everything-the-psychology-behind-punctuality-and-why-it-could-be-fuelling-your-anxiety/)
- [6 Fitness Trends You're About to See Everywhere in 2026 — PureWow](https://www.purewow.com/wellness/fitness-trends-2026)
- [Hot Girl Walk — Wikipedia](https://en.wikipedia.org/wiki/Hot_Girl_Walk)
- [네이버지도 — App Store](https://apps.apple.com/kr/app/id311867728) · [카카오맵 — App Store](https://apps.apple.com/KR/app/id304608425)
