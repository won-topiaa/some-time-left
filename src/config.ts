/**
 * 외부 API 설정.
 *
 * 주의: TMAP appKey와 네이버 클라이언트 키는 클라이언트 번들에 넣으면 그대로 노출된다.
 * 실서비스에서는 `baseUrl`을 자체 서버 프록시로 돌리고 키는 서버에만 두어야 한다.
 * 개발 중에는 TMAP에 직접 붙는 편이 빠르므로 기본값은 직접 호출로 둔다.
 */

export interface ApiConfig {
  /** TMAP 보행자 경로안내 / POI 검색 */
  tmap: {
    baseUrl: string;
    /** 자체 프록시를 쓰면 비워둔다 (서버가 붙인다) */
    appKey: string | null;
  };
  /** 네이버 지오코딩 (주소 → 좌표). 도보 경로는 네이버가 제공하지 않는다. */
  naver: {
    baseUrl: string;
    keyId: string | null;
    key: string | null;
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
  timeoutMs: 7000,
};

/**
 * 앱 시작 시 한 번 호출한다.
 * granite/metro의 환경변수 인라인 규약에 의존하지 않도록 런타임 주입 방식으로 둔다.
 */
export function configureApi(patch: {
  tmap?: Partial<ApiConfig['tmap']>;
  naver?: Partial<ApiConfig['naver']>;
  timeoutMs?: number;
}): void {
  if (patch.tmap != null) {
    Object.assign(config.tmap, patch.tmap);
  }
  if (patch.naver != null) {
    Object.assign(config.naver, patch.naver);
  }
  if (patch.timeoutMs != null) {
    config.timeoutMs = patch.timeoutMs;
  }
}

export function getApiConfig(): Readonly<ApiConfig> {
  return config;
}

/** 실제 도보 경로를 부를 준비가 됐는가. 안 됐으면 mock으로 떨어진다. */
export function isTmapConfigured(): boolean {
  return config.tmap.appKey != null || config.tmap.baseUrl !== 'https://apis.openapi.sk.com';
}
