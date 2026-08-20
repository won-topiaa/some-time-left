/**
 * TTL 캐시.
 *
 * 서울 실시간 인구데이터는 5분 단위로 갱신된다. 그보다 자주 물어봐야 소용이 없고,
 * 인증키에는 일 호출 한도가 있다. 같은 장소를 5분 안에 다시 물으면 캐시로 답한다.
 *
 * 순수 로직이라 네트워크 없이 테스트된다.
 */

export interface CacheEntry<T> {
  value: T;
  /** 이 시각이 지나면 만료 (epoch ms) */
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  /** 이 개수를 넘으면 오래된 것부터 버린다. 메모리가 무한정 늘지 않도록. */
  private readonly maxEntries: number;

  /*
   * 생성자 매개변수 프로퍼티(`constructor(private readonly ttlMs: number)`)를 쓰지 않는다.
   * 그 문법은 타입만 지우는 걸로는 못 없애고 런타임 코드를 만들어 내야 해서,
   * `node --experimental-strip-types`가 통째로 거부한다 — 이 프록시의 `npm run dev`가
   * 바로 그 방식으로 도는데, 그때 서버가 아예 안 떴다.
   */
  constructor(ttlMs: number, maxEntries = 500) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string, nowMs: number): T | null {
    const entry = this.entries.get(key);
    if (entry == null) {
      return null;
    }
    if (entry.expiresAt <= nowMs) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, nowMs: number): void {
    // Map은 삽입 순서를 지키므로 가장 앞이 가장 오래된 것이다.
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, { value, expiresAt: nowMs + this.ttlMs });
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
