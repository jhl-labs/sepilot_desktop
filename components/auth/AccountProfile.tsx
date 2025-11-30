'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, LogOut, Upload, Download, CheckCircle, AlertCircle, Github } from 'lucide-react';
import { githubOAuth } from '@/lib/auth/github-oauth';

interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name?: string;
  email?: string;
  bio?: string;
}

export function AccountProfile() {
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadUserInfo();

    const handleAuthSuccess = () => {
      loadUserInfo();
      setMessage({ type: 'success', text: '로그인되었습니다!' });
    };

    const handleOAuthCallback = async (url: string) => {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        if (code) {
          setIsLoading(true);
          await githubOAuth.handleCallback(code);
          // The auth-success event will trigger user info reload
        }
      } catch (error: any) {
        console.error('OAuth callback handling failed:', error);
        setMessage({ type: 'error', text: 'OAuth 로그인 처리에 실패했습니다.' });
        setIsLoading(false);
      }
    };

    const authSuccessHandler = window.electronAPI.auth.onAuthSuccess(handleAuthSuccess);
    const oauthCallbackHandler = window.electronAPI.auth.onOAuthCallback(handleOAuthCallback);

    return () => {
      window.electronAPI.auth.removeAuthSuccessListener(authSuccessHandler);
      window.electronAPI.auth.removeOAuthCallbackListener(oauthCallbackHandler);
    };
  }, []);

  const loadUserInfo = async () => {
    setIsLoading(true);
    try {
      const tokenResult = await window.electronAPI.auth.getToken();
      if (tokenResult.success && tokenResult.data) {
        const userResult = await githubOAuth.getUserInfo(tokenResult.data);
        setUser(userResult);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to load user info:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      await window.electronAPI.auth.initiateLogin();
    } catch (error: any) {
      console.error('Login failed:', error);
      setMessage({ type: 'error', text: error.message || '로그인에 실패했습니다.' });
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      await githubOAuth.logout();
      setUser(null);
      setMasterPassword('');
      setMessage({ type: 'success', text: '로그아웃되었습니다.' });
    } catch (error: any) {
      console.error('Logout failed:', error);
      setMessage({ type: 'error', text: error.message || '로그아웃에 실패했습니다.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncFromGitHub = async () => {
    if (!user) {
      setMessage({ type: 'error', text: '먼저 로그인해주세요.' });
      return;
    }

    if (!masterPassword.trim()) {
      setMessage({ type: 'error', text: 'Master Password를 입력해주세요.' });
      return;
    }

    setIsSyncing(true);
    setMessage(null);

    try {
      const tokenResult = await window.electronAPI.auth.getToken();

      if (!tokenResult.success || !tokenResult.data) {
        throw new Error('토큰을 가져올 수 없습니다.');
      }

      const result = await window.electronAPI.auth.syncFromGitHub(tokenResult.data, masterPassword);

      if (!result.success) {
        throw new Error(result.error || 'Failed to sync from GitHub');
      }

      if (result.data) {
        // Save synced config
        const saveResult = await window.electronAPI.config.save(result.data);
        if (!saveResult.success) {
          throw new Error('설정을 저장하는데 실패했습니다.');
        }
      }

      setMessage({ type: 'success', text: 'GitHub에서 설정을 가져왔습니다!' });

      // Reload the page to apply new config
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      console.error('Sync from GitHub failed:', error);
      setMessage({ type: 'error', text: error.message || 'GitHub에서 가져오기에 실패했습니다.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncToGitHub = async () => {
    if (!user) {
      setMessage({ type: 'error', text: '먼저 로그인해주세요.' });
      return;
    }

    if (!masterPassword.trim()) {
      setMessage({ type: 'error', text: 'Master Password를 입력해주세요.' });
      return;
    }

    setIsSyncing(true);
    setMessage(null);

    try {
      const tokenResult = await window.electronAPI.auth.getToken();

      if (!tokenResult.success || !tokenResult.data) {
        throw new Error('토큰을 가져올 수 없습니다.');
      }

      // Load current config
      const configResult = await window.electronAPI.config.load();

      if (!configResult.success || !configResult.data) {
        throw new Error('현재 설정을 불러올 수 없습니다.');
      }

      const result = await window.electronAPI.auth.syncToGitHub(
        tokenResult.data,
        configResult.data,
        masterPassword
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to sync to GitHub');
      }

      setMessage({ type: 'success', text: 'GitHub에 설정을 저장했습니다!' });
    } catch (error: any) {
      console.error('Sync to GitHub failed:', error);
      setMessage({ type: 'error', text: error.message || 'GitHub에 저장하기에 실패했습니다.' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {!user ? (
        <Card>
          <CardHeader>
            <CardTitle>GitHub 로그인</CardTitle>
            <CardDescription>GitHub 계정으로 로그인하여 설정을 동기화하세요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleLogin} disabled={isLoading} className="w-full">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Github className="mr-2 h-4 w-4" />
              )}
              GitHub으로 로그인
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>프로필</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={user.avatar_url} alt={user.login} />
                  <AvatarFallback>{user.login[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold">{user.name || user.login}</h3>
                  <p className="text-sm text-muted-foreground">@{user.login}</p>
                  {user.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
                  {user.bio && <p className="text-sm mt-2">{user.bio}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout} disabled={isLoading}>
                  <LogOut className="mr-2 h-4 w-4" />
                  로그아웃
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>설정 동기화</CardTitle>
              <CardDescription>
                GitHub private repository를 사용하여 설정을 안전하게 동기화합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="masterPassword">Master Password</Label>
                <Input
                  id="masterPassword"
                  type="password"
                  placeholder="설정 암호화에 사용될 비밀번호"
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  disabled={isSyncing}
                />
                <p className="text-sm text-muted-foreground">
                  설정은 AES-256-GCM으로 암호화되어 저장됩니다. 이 비밀번호를 잊어버리면 복구할 수
                  없습니다.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSyncFromGitHub}
                  disabled={isSyncing || !masterPassword.trim()}
                  className="flex-1"
                >
                  {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Download className="mr-2 h-4 w-4" />
                  GitHub에서 가져오기
                </Button>
                <Button
                  onClick={handleSyncToGitHub}
                  disabled={isSyncing || !masterPassword.trim()}
                  className="flex-1"
                >
                  {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Upload className="mr-2 h-4 w-4" />
                  GitHub에 저장
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
