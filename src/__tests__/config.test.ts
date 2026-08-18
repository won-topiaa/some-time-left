import { describe, expect, it } from 'vitest';
import { configureApi, getApiConfig, normalizeServiceKey } from '../config';

describe('normalizeServiceKey', () => {
  it('Encoding 키(%가 섞인)를 디코딩한다', () => {
    const encoded = 'abc%2F8%2FI3d%2BkzR3%3D%3D';
    expect(normalizeServiceKey(encoded)).toBe('abc/8/I3d+kzR3==');
  });

  it('이미 디코딩된 키는 그대로 둔다', () => {
    const decoded = 'abc/8/I3d+kzR3==';
    expect(normalizeServiceKey(decoded)).toBe(decoded);
  });

  it('null은 null로', () => {
    expect(normalizeServiceKey(null)).toBeNull();
  });

  it('깨진 퍼센트 시퀀스는 원본을 유지한다', () => {
    const broken = 'abc%zz';
    expect(normalizeServiceKey(broken)).toBe(broken);
  });
});

describe('configureApi', () => {
  it('주입 시 공공데이터 인증키를 디코딩된 형태로 저장한다', () => {
    configureApi({ publicData: { serviceKey: 'k%2Fq%3D%3D' } });
    expect(getApiConfig().publicData.serviceKey).toBe('k/q==');
  });
});
