/**
 * 태양 위치 계산 (NOAA Solar Calculator 근사).
 *
 * "여름에 그늘인 길"을 만들려면 먼저 해가 어디에 떠 있는지 알아야 한다.
 * 외부 API 없이 계산 가능하고, 오차는 ±1분/±0.5도 수준이라 그늘 판정에는 충분하다.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface SolarPosition {
  /** 지평선 위 고도 (도). 음수면 해가 진 상태. */
  altitudeDeg: number;
  /** 방위각 (도, 북=0, 동=90, 남=180, 서=270) */
  azimuthDeg: number;
}

function dayOfYearUTC(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((current - start) / 86400000) + 1;
}

/** 방위각을 0~360으로 정규화. */
export function normalizeAzimuth(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 두 방위각 사이의 부호 있는 차이를 -180~180으로. */
export function signedAngleDiff(aDeg: number, bDeg: number): number {
  return ((((aDeg - bDeg) % 360) + 540) % 360) - 180;
}

/**
 * 주어진 시각과 좌표에서의 태양 고도·방위각.
 * @param date UTC 기준으로 해석된다 (Date 객체가 이미 절대 시각이므로 타임존 인자 불필요).
 */
export function solarPosition(date: Date, lat: number, lng: number): SolarPosition {
  const doy = dayOfYearUTC(date);
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  // fractional year (radian)
  const gamma = ((2 * Math.PI) / 365) * (doy - 1 + (utcHours - 12) / 24);

  // 균시차 (분)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // 적위 (radian)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // 진태양시 (분). UTC 기준이라 타임존 보정항이 없다.
  const timeOffset = eqTime + 4 * lng;
  const trueSolarTime = (utcHours * 60 + timeOffset + 1440) % 1440;

  // 시간각 (도)
  const hourAngle = trueSolarTime / 4 - 180;

  const ha = hourAngle * DEG;
  const phi = lat * DEG;

  const cosZenith =
    Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const altitudeDeg = 90 - zenith * RAD;

  // 남쪽 기준 서쪽 양의 방위각 → 북쪽 기준으로 변환
  const azFromSouth = Math.atan2(
    Math.sin(ha),
    Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)
  );
  const azimuthDeg = normalizeAzimuth(azFromSouth * RAD + 180);

  return { altitudeDeg, azimuthDeg };
}
