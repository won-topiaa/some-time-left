import type { PropsWithChildren } from 'react';
import { AppsInToss } from '@apps-in-toss/framework';
import type { InitialProps } from '@granite-js/react-native';
import { SafeAreaProvider } from '@granite-js/native/react-native-safe-area-context';
import { context } from './require.context';
import { TripProvider } from './state/TripContext';

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return (
    <SafeAreaProvider>
      <TripProvider>{children}</TripProvider>
    </SafeAreaProvider>
  );
}

export default AppsInToss.registerApp(AppContainer, { context });
