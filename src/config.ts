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
   * 공공데이터포털. 인증키 하나로 두 서비스를 쓴다.
   * 둘 다 `apis.data.go.kr`에 있다 — `api.data.go.kr`(s 없음)이나
   * `api.odcloud.kr`은 이 API들을 서빙하지 않는다(실측 확인).
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
    baseUrl: 'https://apis.data.go.kr',
    parkPath: '/openapi/tn_pubr_public_cty_park_info_api',
    ledgerPath: '/1613000/BldRgstHubService/getBrTitleInfo',
  },
  vworld: {
    baseUrl: 'https://api.vworld.kr/req/data',
    key: null,
    buildingLayer: 'LT_C_SPBD',
    floorField: 'gro_flo_co',
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

/** 실제 도보 경로를 부를 준비가 됐는가. 안 됐으면 mock으로 떨어진다. */
export function isTmapConfigured(): boolean {
  return config.tmap.appKey != null || config.tmap.baseUrl !== 'https://apis.openapi.sk.com';
}
