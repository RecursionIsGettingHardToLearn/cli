import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { ApolloProvider } from '@apollo/client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { apolloClient } from './src/config/apollo';
import { AuthProvider } from './src/auth/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { assertEnvReady } from './src/config/env';

export default function App() {
  useEffect(() => { assertEnvReady(); }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ApolloProvider client={apolloClient}>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </ApolloProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
