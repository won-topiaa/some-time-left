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
  /** 네이버 지오코딩 (주소 → 좌표). 도보 경로는 네이버가 제공하지 않는다. */
  naver: {
    baseUrl: string;
    keyId: string | null;
    key: string | null;
  };
  /** 서울 열린데이터광장 — 실시간 인구데이터(혼잡도) */
  seoul: {
    baseUrl: string;
    key: string | null;
  };
/**
   * 공공데이터포털. 인증키는 하나지만 **호스트가 둘로 갈린다** —
   * 표준데이터는 odcloud, 부처 제공 서비스(건축물대장)는 apis.data.go.kr이다.
   */
  publicData: {
    serviceKey: string | null;
    /** 전국도시공원표준데이터. 경로 미검증 — 키 발급 후 실측 필요. */
    standardDataBaseUrl: string;
    parkPath: string;
    /**
     * 국토교통부 건축물대장.
     * 실측 확인: `BldRgstService_v2`는 폐기됐고(NO_OPENAPI_SERVICE_ERROR)
     * `BldRgstHubService`가 살아 있다(SERVICE_KEY_IS_NOT_REGISTERED_ERROR).
     */
    ledgerBaseUrl: string;
    ledgerPath: string;
  };
  /** 브이월드 — 건물 공간 질의 (건축물대장은 좌표로 못 찾는다) */
  vworld: {
    baseUrl: string;
    key: string | null;
    /**
     * 건물 레이어 아이디. **미검증** — 브이월드 2D 데이터 레이어 목록에서 확인할 것.
     * (유효한 키 없이는 응답을 받을 수 없어 여기서 확인하지 못했다)
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
  naver: {
    baseUrl: 'https://maps.apigw.ntruss.com',
    keyId: null,
    key: null,
  },
  seoul: {
    baseUrl: 'http://openapi.seoul.go.kr:8088',
    key: null,
  },
  publicData: {
    serviceKey: null,
    standardDataBaseUrl: 'https://api.odcloud.kr/api',
    parkPath: '/openapi/tn_pubr_public_cty_park_info_api',
    ledgerBaseUrl: 'https://apis.data.go.kr/1613000',
    ledgerPath: '/BldRgstHubService/getBrTitleInfo',
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
}

export function getApiConfig(): Readonly<ApiConfig> {
  return config;
}

/** 실제 도보 경로를 부를 준비가 됐는가. 안 됐으면 mock으로 떨어진다. */
export function isTmapConfigured(): boolean {
  return config.tmap.appKey != null || config.tmap.baseUrl !== 'https://apis.openapi.sk.com';
}
