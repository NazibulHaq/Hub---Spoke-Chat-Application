'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { socket } from '@/lib/socket';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label'; // Label wasn't installed, will use standard label or install it. Assuming standard for now.

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = isLogin ? 'login' : 'register';
    setIsLoading(true);

    try {
      const res = await fetch(`http://localhost:4000/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'USER', displayName }), // Send displayName
      });
      const data = await res.json();

      if (isLogin) {
        if (data.access_token) {
          localStorage.setItem('token', data.access_token);
          const payload = JSON.parse(atob(data.access_token.split('.')[1]));

          socket.auth = { token: data.access_token };
          socket.connect();

          if (payload.role === 'ADMIN') {
            router.push('/dashboard');
          } else {
            router.push('/chat');
          }
        } else {
          alert('Login failed: ' + (data.error || 'Unknown error'));
        }
      } else {
        // Registration successful
        if (data.id) {
          alert('Registration successful! Please login.');
          setIsLogin(true);
        } else {
          alert('Registration failed: ' + (data.message || 'Unknown error'));
        }
      }
    } catch (err) {
      console.error(err);
      alert('Authentication error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-900">
      <Card className="w-[350px] shadow-lg text-slate-900 dark:text-slate-100">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            {isLogin ? 'System Login' : 'Create Account'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Full Name</label>
                <Input
                  type="text"
                  placeholder="John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required={!isLogin}
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Email</label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Password</label>
              <Input
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {isLogin ? (
              <p>Don't have an account? <span className="text-blue-500 cursor-pointer hover:underline" onClick={() => setIsLogin(false)}>Sign Up</span></p>
            ) : (
              <p>Already have an account? <span className="text-blue-500 cursor-pointer hover:underline" onClick={() => setIsLogin(true)}>Login</span></p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-center text-xs text-muted-foreground">
          Hub & Spoke Chat Platform
        </CardFooter>
      </Card>
    </div>
  );
}
