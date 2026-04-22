import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import { ChatScreen } from './components/ChatScreen.js';
import { LoginScreen } from './components/LoginScreen.js';
import { detectAuth, type AuthStatus } from './auth/status.js';
import type { Settings } from './config/settings.js';

type Props = {
  settings: Settings;
  modelOverride?: string;
  oneShot?: string;
  onRequestOAuth: () => void;
};

type View = 'loading' | 'login' | 'chat';

export function App({ settings, modelOverride, oneShot, onRequestOAuth }: Props) {
  const { exit } = useApp();
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [view, setView] = useState<View>('loading');
  const model = modelOverride ?? settings.defaultModel;

  async function refreshAuth() {
    const a = await detectAuth();
    setAuth(a);
    setView(a.kind === 'none' ? 'login' : 'chat');
  }

  useEffect(() => {
    void refreshAuth();
  }, []);

  if (view === 'loading' || !auth) {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text dimColor> detecting auth...</Text>
      </Box>
    );
  }

  if (view === 'login') {
    return <LoginScreen onLoggedIn={refreshAuth} onRequestOAuth={onRequestOAuth} />;
  }

  return (
    <ChatScreen
      model={model}
      effort={settings.effort}
      auth={auth}
      cwd={process.cwd()}
      oneShot={oneShot}
      settings={settings}
      onExit={() => exit()}
    />
  );
}
