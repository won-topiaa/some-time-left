/**
 * 진입 파일.
 *
 * 여기서는 **오류를 잡는 일만** 한다. 앱의 실제 껍데기는 `boot.tsx`에 있고
 * 아래에서 지연 로딩한다.
 *
 * 왜 이렇게까지 하나: 시작하다 무엇이든 터지면 토스는 흰 화면에
 * "잠시 문제가 생겼어요"만 띄운다. 무엇이 터졌는지는 어디에도 안 남는다.
 * 기기에서만 재현되는 오류를 그 상태로 고치는 건 불가능에 가까워서,
 * 오류를 **화면에 글자로** 띄우는 길을 열어 둔다.
 *
 * 두 군데를 막는다. 흰 화면을 만드는 건 거의 이 둘 중 하나다.
 * 1. 시작 모듈이 import 중에 터지는 것 — 지연 require + try/catch
 * 2. 화면이 그리다 터지는 것 — ErrorBoundary
 *
 * 앱이 뜬 뒤의 비동기 오류는 여기서 안 잡는다. 그건 흰 화면이 아니라
 * 기능 하나가 조용히 안 되는 모습으로 나타나고, 각 자리에서 이미 다루고 있다.
 */

import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { AppsInToss } from '@apps-in-toss/framework';
import type { InitialProps } from '@granite-js/react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { context } from './require.context';

type Boot = (props: PropsWithChildren<InitialProps>) => ReactNode;

let bootError: unknown = null;
let Boot: Boot | null = null;

try {
  // import 문이 아니라 require여야 한다. import는 끌어올려져서 try/catch 밖에서 실행된다.
  Boot = (require('./boot') as { Boot: Boot }).Boot;
} catch (error) {
  bootError = error;
}

/** 오류를 사람이 읽을 수 있는 여러 줄로. 메시지만으로는 어디서 났는지 모른다. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, '', error.stack ?? '(스택 없음)'].join('\n');
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function Crashed({ error }: { error: unknown }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>시작하지 못했어요</Text>
      <Text style={styles.hint}>아래 내용을 그대로 보여주시면 고칠 수 있어요.</Text>
      <ScrollView style={styles.box}>
        <Text style={styles.trace} selectable>
          {describe(error)}
        </Text>
      </ScrollView>
    </View>
  );
}

class ErrorBoundary extends Component<PropsWithChildren, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 컴포넌트 트리의 어디였는지가 스택보다 도움이 될 때가 많다.
    this.setState({ error: new Error(`${error.message}\n${info.componentStack ?? ''}`) });
  }

  render() {
    return this.state.error != null ? <Crashed error={this.state.error} /> : this.props.children;
  }
}

function AppContainer(props: PropsWithChildren<InitialProps>) {
  if (bootError != null) {
    return <Crashed error={bootError} />;
  }
  const Shell = Boot;
  if (Shell == null) {
    return <Crashed error={new Error('boot 모듈을 불러오지 못했어요 (오류는 없었습니다)')} />;
  }
  return (
    <ErrorBoundary>
      <Shell {...props} />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  // 이 화면은 우리 톤을 따르지 않는다. 개발자가 읽는 화면이고, 읽히는 게 전부다.
  screen: { flex: 1, backgroundColor: '#FFFFFF', padding: 20, paddingTop: 120 },
  title: { fontSize: 20, fontWeight: '600', color: '#17181B' },
  hint: { fontSize: 13, color: '#5A5F66', marginTop: 6, marginBottom: 14 },
  box: { flex: 1, backgroundColor: '#F4F4F5', borderRadius: 10, padding: 12 },
  trace: { fontSize: 12, lineHeight: 18, color: '#17181B' },
});

export default AppsInToss.registerApp(AppContainer, { context });
