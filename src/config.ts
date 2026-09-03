/**
 * 외부 API 설정.
 *
 * 두 가지 원칙으로 만들어져 있다.
 *
 * 1. **키는 런타임에 주입한다.** 클라이언트 번들에 박힌 키는 그대로 노출된다.
 *    실서비스에서는 `baseUrl`을 자체 서버 프록시로 돌리고 키는 서버에만 둔다.
 * 2. **엔드포인트 경로도 설정값이다.** 공공데이터 포털 API는 경로가 자주 바뀌고
 *    문서마다 표기가 다르다. 코드를 고치지 않고 여기만 바꿔 맞출 수 있어야 한다.
 *    아래 기본값은 문서 표기를 따른 것이며, 키를 받은 뒤 한 번 실측해야 한다.
 */

/**
 * 밖에 나가는 요청이 자신을 밝히는 이름. 한 곳에만 둔다 —
 * OSRM과 Photon이 같은 값을 쓰는데 문자열을 두 벌 두면 반드시 어긋난다.
 * (웹뷰의 fetch는 User-Agent를 조용히 떨어뜨리지만, 네이티브 fetch는 싣는다.)
 */
export const APP_USER_AGENT = 'some-time-left/1.0 (apps-in-toss mini app)';

export interface ApiConfig {
  /** TMAP 보행자 경로안내 / POI 검색 */
  tmap: {
    baseUrl: string;
    appKey: string | null;
  };
  /**
   * 혼잡도 프록시 (`proxy/` 디렉터리).
   *
   * 서울 실시간 인구데이터는 **평문 HTTP 전용이라** iOS의 App Transport Security가
   * 차단한다. 그래서 앱은 서울을 직접 부르지 않고 우리 프록시를 부른다.
   *
   * 인증키는 프록시에만 있다 — 앱 번들에는 키가 들어가지 않는다.
   * `baseUrl`이 없으면 혼잡도 조회를 건너뛰고 `quiet`은 중립값이 된다.
   */
  congestionProxy: {
    baseUrl: string | null;
    /** 프록시에 PROXY_TOKEN을 걸었다면 같은 값을 넣는다. */
    token: string | null;
  };
/**
   * 공공데이터포털. 인증키 하나로 서비스를 쓴다.
   * 표준데이터(전국도시공원)의 정식 End Point는 `api.data.go.kr`(s 없음)이다 —
   * data.go.kr 활용신청 상세의 End Point 표기로 실측 확인. `apis.data.go.kr`(s 있음)로
   * 부르면 같은 키라도 SERVICE_KEY_IS_NOT_REGISTERED가 난다(게이트웨이가 다르다).
   */
  publicData: {
    serviceKey: string | null;
    baseUrl: string;
    /** 전국도시공원표준데이터. 실측 확인 — 서비스 존재, 키만 필요. */
    parkPath: string;
    /**
     * 국토교통부 건축물대장.
     * 실측 확인: `BldRgstService_v2`는 폐기됐고(NO_OPENAPI_SERVICE_ERROR)
     * `BldRgstHubService`가 살아 있다(SERVICE_KEY_IS_NOT_REGISTERED_ERROR).
     */
    ledgerPath: string;
  };
  /**
   * 날씨 — Open-Meteo. **키가 없다.**
   *
   * 기상청은 서비스마다 활용신청을 따로 받아서, 첫 화면 한 줄을 위해 발급·신청·승인을
   * 다시 밟아야 했다. 여기는 좌표만 주면 되고 격자 변환도 필요 없다.
   * 무료는 비상업적 사용 기준 하루 1만 요청까지다 — 지금 쓰임(사람당 하루 몇 번)과는
   * 자릿수가 다르지만, 상업적으로 쓰게 되면 유료 플랜을 봐야 한다.
   */
  weather: {
    baseUrl: string;
  };
  /**
   * 키 없는 **실제 도로망** 보행 경로 — FOSSGIS가 운영하는 OSRM 보행 프로파일.
   *
   * 여기 있는 이유는 사고 하나다. 예전엔 TMAP 키가 없으면 좌표를 **지어내는**
   * 공급자로 떨어졌고, 그 번들이 산자락을 가로지르는 삼각형을 "3분 전에는 닿는
   * 길이에요"와 함께 내놓았다. 걸을 수 없는 길이었다.
   *
   * 그래서 지어내는 쪽을 지우고 그 자리에 이것을 놓았다. 키도 등록도 없이 실제
   * OSM 도로망 위의 보행 경로를 준다(실측: 중앙대→흑석역 859m에 정점 43개,
   * 최장 직선 56m). 경유지도 받아서 길을 늘릴 수 있고, 도로망에 안 붙는 경유지는
   * `NoSegment`로 **거절**한다 — 지어내던 쪽이 하던 일의 정확한 반대다.
   *
   * 운영 정책이 있다: 초당 1회, 유효한 User-Agent, 출처 표기, 과용 금지.
   * 그래서 이건 **TMAP이 없거나 실패했을 때의 뒷배**이지 주력이 아니다.
   */
  osrmRoute: {
    baseUrl: string;
    /**
     * FOSSGIS는 User-Agent가 없으면 403으로 거절한다(실측). 브라우저 흉내가 아니라
     * 누가 부르는지 밝히라는 뜻이므로, 앱 이름을 정직하게 적는다.
     */
    userAgent: string;
  };
  /**
   * 키 없는 보조 장소 검색 — Photon (OSM 지오코더). **키가 없다.**
   *
   * TMAP 키가 없는 번들(심사용)에서도 중앙대학교·흑석역 같은 진짜 장소가
   * 검색돼야 한다. 서울 핫스팟 121곳만으로는 "검색이 안 돼요"가 되고, 실제로
   * 그랬다. Photon은 OSM 데이터라 역·대학·도로명 주소에 밝고 타이핑 중 검색을
   * 허용한다. TMAP이 빈손일 때의 뒷배로도 쓴다.
   */
  osmSearch: {
    baseUrl: string;
    /** Photon에 밝히는 이름. 공개 OSM 서비스들의 공통 요구다. */
    userAgent: string;
  };
  /**
   * 지도 타일 — CARTO Positron.
   *
   * 지금은 **키 없이** 받아진다(실측). 다만 CARTO 문서는 무료 basemap에 대해
   * "월 500만 타일까지 무료, API 키만 있으면 된다"고 말한다. 키는 계정 없이 즉시
   * 받을 수 있고, 상업적 사용은 별도 라이선스를 봐야 한다.
   *
   * 그래서 주소를 **설정으로 뺐다.** 나중에 키를 붙이거나 다른 제공자로 갈아탈 때
   * 화면 코드를 건드리지 않게 하려는 것이다 — 무료 타일 서비스는 전부 SLA가 없고,
   * 어느 날 막히면 그때가 앱을 다시 배포할 때가 되면 곤란하다.
   *
   * `{z}` `{x}` `{y}`를 좌표로 바꿔 부른다. 키가 필요해지면 주소 뒤에 붙이면 된다.
   */
  mapTiles: {
    /**
     * 어느 방식으로 그릴 것인가.
     *
     * `raster` — 타일 이미지를 직접 깐다(`RouteMapRaster`). 가볍고 빠르다.
     *            지금 쓰는 CARTO는 키 없이 받아지지만 **문서상으로는 키를 요구하고
     *            상업적 사용에 별도 라이선스를 둔다.**
     * `vector` — 웹뷰 안에서 MapLibre가 그린다(`RouteMapVector`). OpenFreeMap은
     *            키도 등록도 요청 한도도 상업적 제한도 없다. 대신 웹뷰가 하나 뜨고
     *            번들에 1MB가 붙는다.
     *
     * 둘 다 두는 이유: 조건은 벡터가 낫고 무게는 래스터가 낫다. 실기기에서
     * 나란히 보고 정할 수 있어야 하고, 한쪽이 막히는 날 한 줄로 옮길 수 있어야 한다.
     */
    kind: 'raster' | 'vector';
    /** 래스터용. `{z}` `{x}` `{y}`를 좌표로 바꿔 부른다. */
    urlTemplate: string;
    /** 어두운 화면에서 쓸 래스터 주소. 같은 규칙으로 좌표를 바꿔 부른다. */
    darkUrlTemplate: string;
    /** 벡터용. MapLibre 스타일 문서 주소. */
    vectorStyleUrl: string;
    /**
     * 래스터판이 화면에 적는 출처. 제공자를 바꾸면 이것도 같이 바꾼다.
     * 벡터판은 스타일 문서가 출처를 들고 있어서 MapLibre가 알아서 적는다.
     */
    attribution: string;
  };
  /** 브이월드 — 건물 공간 질의 (건축물대장은 좌표로 못 찾는다) */
  vworld: {
    baseUrl: string;
    key: string | null;
    /**
     * 건물 레이어 아이디. **미검증** — 브이월드 2D 데이터 레이어 목록에서 확인할 것.
     * (api.vworld.kr이 이 환경의 게이트웨이를 통과하지 못해 실측하지 못했다.
     *  값이 틀리면 건물 목록이 비고 그늘 계산이 기본 높이로 떨어질 뿐, 앱은 계속 돈다)
     */
    buildingLayer: string;
    /** 층수 속성 이름. 레이어에 따라 다르다. 함께 확인할 것. */
    floorField: string;
    /**
     * 등록 도메인. 브이월드 2.0은 요청에 이 값을 실어 보내야 인증을 통과한다.
     * 모바일 앱은 Referer가 없어 브라우저 방식이 안 되므로 `domain` 파라미터가 필수다.
     * 비밀값이 아니라 발급 시 등록한 도메인 문자열과 같아야 하는 공개 식별자다.
     */
    domain: string;
  };
  /** 네트워크 타임아웃 (ms). 길 찾는 화면에서 오래 기다리게 두지 않는다. */
  timeoutMs: number;
}

const config: ApiConfig = {
  tmap: {
    baseUrl: 'https://apis.openapi.sk.com',
    appKey: null,
  },
  congestionProxy: {
    // 공개 엔드포인트라 여기 둔다. 서울 인증키는 이 뒤(프록시 서버)에만 있다.
    baseUrl: 'https://some-time-left-proxy.yangjuwon240.workers.dev',
    token: null,
  },
  publicData: {
    serviceKey: null,
    // 표준데이터 End Point는 api.data.go.kr (s 없음). apis(s 있음)면 키 미등록으로 뜬다.
    baseUrl: 'https://api.data.go.kr',
    parkPath: '/openapi/tn_pubr_public_cty_park_info_api',
    // 건축물대장(미사용)은 apis.data.go.kr의 다른 게이트웨이라, 되살릴 땐 호스트를 따로 둘 것.
    ledgerPath: '/1613000/BldRgstHubService/getBrTitleInfo',
  },
  weather: {
    baseUrl: 'https://api.open-meteo.com',
  },
  osrmRoute: {
    // routed-foot = 보행 프로파일. routed-car로 바꾸면 사람이 못 걷는 길이 나온다.
    baseUrl: 'https://routing.openstreetmap.de/routed-foot',
    userAgent: APP_USER_AGENT,
  },
  osmSearch: {
    baseUrl: 'https://photon.komoot.io',
    userAgent: APP_USER_AGENT,
  },
  mapTiles: {
    /*
     * 벡터가 기본이 됐다.
     *
     * 래스터(CARTO)가 실기기에서 "API KEY REQUIRED" 워터마크가 구워진 타일을
     * 내려주기 시작했다(샌드박스 스크린샷 실측). 문서가 예고하던 키 요구가 켜진
     * 것이다. OpenFreeMap 벡터는 키·등록·한도·상업 제한이 전부 없어 그 문이 없다.
     * 래스터 판은 키를 붙이는 날 되살릴 수 있게 남겨 둔다.
     */
    kind: 'vector',
    // `@2x`는 고해상도 타일(512px). 논리 크기보다 크게 받아 두면 확대해도 안 뭉개진다.
    urlTemplate: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
    // 같은 CARTO의 어두운 짝. 밝은 쪽을 그대로 쓰면 밤에 지도만 혼자 하얗게 뜬다.
    darkUrlTemplate: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
    // OpenFreeMap Positron. 키도, 등록도, 요청 한도도, 상업적 제한도 없다.
    vectorStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
    // CARTO는 자사 표기를 요구하고, 데이터 출처인 OSM은 ODbL이 요구한다. 지우지 않는다.
    attribution: '© CARTO © OpenStreetMap',
  },
  vworld: {
    baseUrl: 'https://api.vworld.kr/req/data',
    key: null,
    buildingLayer: 'LT_C_SPBD',
    floorField: 'gro_flo_co',
    // 브이월드 인증키 발급 시 이 도메인을 등록한다(프록시 주소로 통일).
    domain: 'some-time-left-proxy.yangjuwon240.workers.dev',
  },
  timeoutMs: 7000,
};

type ConfigPatch = {
  [K in keyof ApiConfig]?: ApiConfig[K] extends object ? Partial<ApiConfig[K]> : ApiConfig[K];
};

/**
 * 공공데이터포털 인증키 정규화.
 *
 * data.go.kr은 키를 하나만 준다. "Encoding 키"와 "Decoding 키"는 별개의 키가
 * 아니라 **같은 키의 다른 표기**다 — Encoding은 URL 인코딩한 것, Decoding은 그걸
 * 디코딩한 것. 우리 코드는 `URLSearchParams`로 키를 다시 인코딩하므로 저장은
 * **디코딩된 형태**여야 한다. 사용자가 어느 쪽을 붙여넣든 동작하도록, `%`가 섞인
 * (= Encoding 표기) 키는 여기서 한 번 디코딩해 둔다.
 * base64 키 자체에는 `%`가 없으므로 이 판별은 안전하다.
 */
export function normalizeServiceKey(key: string | null): string | null {
  if (key == null || !key.includes('%')) {
    return key;
  }
  try {
    return decodeURIComponent(key);
  } catch {
    // 깨진 퍼센트 시퀀스면 손대지 않고 원본을 둔다.
    return key;
  }
}

/** 앱 시작 시 한 번 호출한다. */
export function configureApi(patch: ConfigPatch): void {
  for (const key of Object.keys(patch) as (keyof ApiConfig)[]) {
    const value = patch[key];
    if (value == null) {
      continue;
    }
    if (typeof value === 'object') {
      Object.assign(config[key] as object, value);
    } else if (key === 'timeoutMs' && typeof value === 'number') {
      config.timeoutMs = value;
    }
  }
  // 어떤 표기의 인증키가 들어와도 디코딩된 형태로 맞춰 둔다.
  config.publicData.serviceKey = normalizeServiceKey(config.publicData.serviceKey);
}

export function getApiConfig(): Readonly<ApiConfig> {
  return config;
}

/**
 * TMAP을 부를 준비가 됐는가.
 *
 * 안 됐어도 좌표를 지어내지는 않는다 — 키 없는 실제 도로망(OSRM)으로 넘어간다.
 * `providerChain()`이 그 순서를 정한다.
 */
export function isTmapConfigured(): boolean {
  return config.tmap.appKey != null || config.tmap.baseUrl !== 'https://apis.openapi.sk.com';
}
