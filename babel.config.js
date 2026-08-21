/**
 * granite의 바벨 프리셋.
 *
 * `npm create granite-app`이 만드는 템플릿에는 이 파일이 있는데 우리 프로젝트에는
 * 없었다(ait migrate도 "No babel.config.js found"라고 알려 줬다).
 * 없으면 Metro가 제 기본 변환으로 떨어져서, 빌드는 통과하지만 기기에서만
 * 다르게 도는 종류의 차이가 생긴다.
 */
module.exports = {
  presets: ['babel-preset-granite'],
};
