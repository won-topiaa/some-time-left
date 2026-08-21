/**
 * react-native 패키지 위치를 명시한다. 공식 템플릿에 있는 파일이다.
 * 모노레포나 중첩 node_modules에서 RN을 못 찾는 경우를 막는다.
 */
module.exports = {
  reactNativePath: require('path').dirname(require.resolve('react-native/package.json')),
};
