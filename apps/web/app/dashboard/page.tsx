'use client';

import { useEffect, useState, useRef } from 'react';
import { socket } from '@/lib/socket';
import { EVENTS } from '@hub-spoke/shared';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ChatInput } from '@/components/ui/chat-input';
import { MessageContent } from '@/components/ui/message-content';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const router = useRouter();
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

    // Scroll Refs
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState({ role: 'Loading...', id: 'Loading...' });

    // Icons
    const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clock text-muted-foreground"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    const AlertIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle-alert"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>;
    const CheckIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12" /></svg>;
    const TrashIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>;
    const PlusIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14" /><path d="M12 5v14" /></svg>;
    const XIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;

    const scrollToBottom = () => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        socket.disconnect();
        router.push('/');
    };

    const sendMessage = (content: string, retryId?: string) => {
        if (!selectedUser || !content) return;

        const myId = JSON.parse(atob(localStorage.getItem('token')!.split('.')[1])).sub;
        const tempId = retryId || 'temp-' + Date.now();
        const tempMsg = {
            id: tempId,
            content: content,
            senderId: myId,
            createdAt: new Date().toISOString(),
            status: 'sending',
            conversationId: 'temp', // Not used for display
        };

        if (!retryId) {
            setInput('');
            setMessages(prev => [...prev, tempMsg]);
        } else {
            // If retrying, set status back to sending
            setMessages(prev => prev.map(m => m.id === retryId ? { ...m, status: 'sending' } : m));
        }

        // Timeout Logic
        const timeout = setTimeout(() => {
            setMessages(prev => prev.map(m => m.id === tempId && m.status === 'sending' ? { ...m, status: 'failed' } : m));
        }, 5000);

        // Emission with Ack
        socket.emit(EVENTS.CLIENT.SEND_MESSAGE, { content: content, targetUserId: selectedUser }, (response: any) => {
            clearTimeout(timeout);
            if (response && response.id) {
                setMessages(prev => prev.map(m => m.id === tempId ? { ...response, status: 'sent' } : m));
            }
        });
    };

    const handleRetry = (msg: any) => {
        sendMessage(msg.content, msg.id);
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const val = e.target.value;
        setInput(val);

        if (!selectedUser) return;

        socket.emit(EVENTS.CLIENT.TYPING, { isTyping: true, targetUserId: selectedUser });

        if ((window as any).dashboardTypingTimeout) clearTimeout((window as any).dashboardTypingTimeout);

        (window as any).dashboardTypingTimeout = setTimeout(() => {
            socket.emit(EVENTS.CLIENT.TYPING, { isTyping: false, targetUserId: selectedUser });
        }, 1000);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const atBottom = scrollHeight - scrollTop - clientHeight < 50;
        setIsAtBottom(atBottom);
        if (atBottom) setShowScrollButton(false);
    };

    const [isConnected, setIsConnected] = useState(socket.connected);

    // Tab State
    const [activeTab, setActiveTab] = useState<'chat' | 'users'>('chat');

    // User Management State
    const [isCreatingUser, setIsCreatingUser] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:4000/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ email: newUserEmail, password: newUserPassword, role: 'USER' })
            });

            if (!res.ok) throw new Error(await res.text());

            const newUser = await res.json();
            setUsers(prev => [...prev, { ...newUser, status: 'offline' }]);
            setIsCreatingUser(false);
            setNewUserEmail('');
            setNewUserPassword('');
        } catch (err: any) {
            alert('Failed to create user: ' + err.message);
        }
    };

    const handleDeleteUser = async (e: React.MouseEvent, userId: string) => {
        e.stopPropagation(); // Prevent row selection
        if (!confirm('Are you sure you want to delete this user?')) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`http://localhost:4000/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error(await res.text());

            setUsers(prev => prev.filter(u => u.id !== userId));
            if (selectedUser === userId) setSelectedUser(null);
        } catch (err: any) {
            alert('Failed to delete user: ' + err.message);
        }
    };

    // 2. Fetch History when selectedUser changes
    useEffect(() => {
        if (!selectedUser) {
            setMessages([]);
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) return;

        console.log(`[Dashboard] Fetching history for user: ${selectedUser}`);
        fetch(`http://localhost:4000/chat/messages?userId=${selectedUser}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Inject conversationUserId for UI filtering consistency
                    setMessages(data.map(m => ({
                        ...m,
                        status: 'read',
                        conversationUserId: selectedUser
                    })));
                }
            })
            .catch(err => console.error('[Dashboard] Fetch history failed:', err));
    }, [selectedUser]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/');
            return;
        }

        // Safe client-side access for debug info
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            setDebugInfo({ role: payload.role, id: payload.sub });
        } catch (e) {
            console.error('Failed to parse token for debug info', e);
        }

        function onConnect() {
            setIsConnected(true);
            console.log('Admin Socket connected');
        }

        function onDisconnect() {
            setIsConnected(false);
            console.log('Admin Socket disconnected');
        }

        if (!socket.connected) {
            socket.auth = { token };
            socket.connect();
        } else {
            // Check for stale connection (Token/Identity mismatch)
            const socketToken = (socket.auth as any)?.token;
            if (socketToken !== token) {
                console.log('[Dashboard] Token mismatch, reconnecting socket...');
                socket.disconnect();
                socket.auth = { token };
                socket.connect();
            } else {
                setIsConnected(true);
            }
        }

        // 1. Fetch user list logic...
        const fetchUsers = () => {
            fetch('http://localhost:4000/users', {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => {
                    if (!res.ok) throw new Error(`Status: ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    if (Array.isArray(data)) {
                        setUsers(data.map((u: any) => ({
                            ...u,
                            status: 'offline',
                            unreadCount: u.unreadCount || 0
                        })));
                        setError(null);
                    }
                })
                .catch(err => {
                    console.error('Fetch users failed:', err);
                    setError(`Failed to load users: ${err.message}`);
                });
        };

        fetchUsers();

        // Listen for initial online users list (custom event)
        socket.on('initial_online_users', (onlineUsers: { userId: string; status: string }[]) => {
            setUsers((prev) => {
                const newUsers = [...prev];
                onlineUsers.forEach(online => {
                    const idx = newUsers.findIndex(u => u.id === online.userId);
                    if (idx !== -1) {
                        newUsers[idx] = { ...newUsers[idx], status: 'online' };
                    }
                });
                return newUsers;
            });
        });

        socket.on(EVENTS.SERVER.USER_STATUS, (data) => {
            setUsers((prev) => {
                const existing = prev.find((u) => u.id === data.userId);
                if (existing) {
                    return prev.map((u) => (u.id === data.userId ? { ...u, status: data.status } : u));
                }
                // If new user joins who wasn't in the initial list (e.g. just registered), add them
                return [...prev, { id: data.userId, status: data.status, email: `User ${data.userId.substring(0, 6)}` }];
            });
        });

        socket.on(EVENTS.SERVER.MESSAGE_RECEIVED, (msg: any) => {
            const token = localStorage.getItem('token');
            if (!token) return;
            const currentUserId = JSON.parse(atob(token.split('.')[1])).sub;
            const isOwn = msg.senderId === currentUserId;

            // 1. Update User List (Unread Counts & Sorting)
            setUsers((prevUsers) => {
                const targetUserId = msg.conversationUserId;
                const userIdx = prevUsers.findIndex(u => u.id === targetUserId);

                if (userIdx === -1) return prevUsers; // User not in list

                const updatedUsers = [...prevUsers];
                const user = { ...updatedUsers[userIdx] };

                // Increment count if message is FROM user AND not currently selected
                // Use a ref-like check for selectedUser if possible, but here we can check selectedUser inside the setter if needed
                // Wait, setUsers doesn't have access to selectedUser unless we pass it or use a ref.
                // Actually, we are in a closure. selectedUser might be stale.
                // Better approach: use a functional update that captures the LATEST selectedUser if possible?
                // No, standard state isn't available in setter like that easily without being a dependency.

                // We'll use a trick: check if the user is selected inside the setter might not work if selectedUser is a local var.
                // Let's use the `selectedUser` from the outer scope, which means this useEffect MUST depend on [selectedUser].
                // BUT if it depends on [selectedUser], it re-subscribes every time we change user. This is actually standard in these apps.

                if (msg.senderRole === 'USER' && targetUserId !== selectedUser) {
                    user.unreadCount = (user.unreadCount || 0) + 1;
                }

                updatedUsers.splice(userIdx, 1); // Remove from current position
                return [user, ...updatedUsers]; // Move to top
            });

            // 2. Update Messages state if relevant
            if (msg.conversationUserId === selectedUser) {
                setMessages((prev) => {
                    if (isOwn) {
                        const pendingIdx = prev.findIndex(m => m.status === 'sending' && m.content === msg.content);
                        if (pendingIdx !== -1) {
                            const newMsgs = [...prev];
                            newMsgs[pendingIdx] = msg;
                            return newMsgs;
                        }
                    }
                    if (prev.some(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });

                // Since we are looking at this chat, mark it as read immediately
                if (msg.senderRole === 'USER') {
                    socket.emit(EVENTS.CLIENT.MARK_AS_READ, { targetUserId: selectedUser });
                }
            }
        });

        socket.on(EVENTS.SERVER.TYPING_STATUS, (data) => {
            // User typing status
            if (data.role === 'USER') {
                setTypingUsers(prev => {
                    const next = new Set(prev);
                    if (data.isTyping) next.add(data.userId);
                    else next.delete(data.userId);
                    return next;
                });
            }
        });

        socket.on(EVENTS.SERVER.MESSAGE_READ, (data) => {
            // If I am Admin, and User read my meesages
            // Updating all messages in that conversation to READ
            if (data.conversationId) {
                setMessages(prev => prev.map(m => (m.conversationId === data.conversationId || !m.conversationId /* temp check */) && m.status !== 'read' ? { ...m, status: 'read' } : m));
            }
        });

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('initial_online_users');
            socket.off(EVENTS.SERVER.USER_STATUS);
            socket.off(EVENTS.SERVER.MESSAGE_RECEIVED);
            socket.off(EVENTS.SERVER.TYPING_STATUS);
            socket.off(EVENTS.SERVER.MESSAGE_READ);
        };
    }, [router, selectedUser]); // Dependent on selectedUser for real-time logic to work correctly

    // 3. Auto-scroll to bottom when messages update
    useEffect(() => {
        if (isAtBottom) {
            scrollToBottom();
        } else {
            // Check if the LAST message is from ME (Admin)
            // If I just sent a message, I probably want to see it regardless of where I am
            const lastMsg = messages[messages.length - 1];
            const myId = debugInfo.id;
            if (lastMsg && lastMsg.senderId === myId) {
                scrollToBottom();
            } else {
                setShowScrollButton(true);
            }
        }
    }, [messages, typingUsers]);

    // ...

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            {/* Sidebar */}
            <div className="w-80 border-r bg-muted/10 flex flex-col h-full border-r">
                <div className="flex border-b">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 p-3 text-sm font-medium transition-colors ${activeTab === 'chat' ? 'bg-background border-b-2 border-primary text-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
                    >
                        Messages
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex-1 p-3 text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-background border-b-2 border-primary text-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
                    >
                        Users
                    </button>
                </div>

                {/* Chat Sidebar Content */}
                {activeTab === 'chat' && (
                    <>
                        <div className="p-4 font-semibold text-lg border-b flex flex-col">
                            <div className="flex justify-between items-center w-full">
                                <span>Hub Admin</span>
                                <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
                            </div>
                            {!isConnected && <span className="text-xs text-red-500 font-medium animate-pulse mt-1">● Disconnected</span>}
                            {isConnected && <span className="text-xs text-green-500 font-medium mt-1">● Connected</span>}
                            {error && (
                                <div className="mt-2 text-xs bg-red-100 text-red-600 p-2 rounded">
                                    {error}
                                </div>
                            )}
                            <div className="mt-4 p-2 bg-slate-100 rounded text-[10px] text-slate-500 font-mono">
                                <p>Debug Info:</p>
                                <p>Role: {debugInfo.role}</p>
                                <p>ID: {debugInfo.id.substring(0, 8)}...</p>
                            </div>
                        </div>
                        <ScrollArea className="flex-1 min-h-0">
                            <div className="p-2 space-y-2">
                                {users.map((u) => (
                                    <div
                                        key={u.id}
                                        onClick={() => {
                                            setSelectedUser(u.id);
                                            // Mark messages as read...
                                            socket.emit(EVENTS.CLIENT.MARK_AS_READ, { targetUserId: u.id });
                                            // Reset local unreadCount
                                            setUsers(prev => prev.map(user => user.id === u.id ? { ...user, unreadCount: 0 } : user));
                                        }}
                                        className={`p-3 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${selectedUser === u.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <Avatar className="h-10 w-10">
                                                    <AvatarFallback className="text-foreground">{u.email?.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${u.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                                                    }`} />
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="font-medium text-sm truncate max-w-[120px]">{u.email}</span>
                                                <span className="text-xs opacity-70 truncate">{u.status}</span>
                                            </div>
                                        </div>
                                        {(u.unreadCount > 0) && (
                                            <Badge variant="destructive" className="h-5 w-5 flex items-center justify-center p-0 text-[10px]">
                                                {u.unreadCount}
                                            </Badge>
                                        )}
                                    </div>
                                ))}
                                {users.length === 0 && (
                                    <div className="text-center text-sm text-muted-foreground p-4">
                                        No users found
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </>
                )}

                {/* Users Tab Sidebar Content (Just simple list or info?) */}
                {activeTab === 'users' && (
                    <div className="p-4 flex flex-col gap-4">
                        <h2 className="font-semibold">User Management</h2>
                        <div className="text-xs text-muted-foreground">
                            Manage your application users here. You can create new accounts or remove existing ones.
                        </div>
                        <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
                    </div>
                )}

            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                {activeTab === 'chat' ? (
                    selectedUser ? (
                        <>
                            <div className="p-4 border-b flex items-center justify-between shrink-0">
                                {(() => {
                                    const u = users.find(u => u.id === selectedUser);
                                    return (
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback>{u?.email?.substring(0, 2).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <h2 className="font-semibold text-sm">{u?.email}</h2>
                                                <span className={`text-[10px] ${u?.status === 'online' ? 'text-green-500' : 'text-muted-foreground'}`}>
                                                    {u?.status === 'online' ? 'Online' : 'Offline'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <ScrollArea className="flex-1 min-h-0 p-4" onScrollCapture={handleScroll}>
                                <div className="space-y-4">
                                    {messages.filter(m => m.conversationUserId === selectedUser).map((m, i) => (
                                        <div key={i} className={`flex flex-col ${m.senderId !== selectedUser ? 'items-end' : 'items-start'}`}>
                                            <div className={`flex ${m.senderId !== selectedUser ? 'justify-end' : 'justify-start'} items-end gap-2 max-w-[85%]`}>
                                                <div className={`p-3 rounded-2xl shadow-sm text-sm break-words ${m.senderId !== selectedUser
                                                    ? 'bg-primary text-primary-foreground rounded-br-none'
                                                    : 'bg-muted rounded-bl-none'}`}>
                                                    <MessageContent
                                                        content={m.content}
                                                        isOwnMessage={m.senderId !== selectedUser}
                                                    />
                                                </div>
                                            </div>
                                            {/* Status for Admin (Me) */}
                                            {m.senderId !== selectedUser && (
                                                <div className="text-[10px] text-muted-foreground mt-1 mr-1 flex items-center gap-1">
                                                    {m.status === 'sending' && <ClockIcon />}
                                                    {m.status === 'sent' && <CheckIcon className="text-gray-400" />}
                                                    {(m.status === 'delivered' || m.status === 'DELIVERED') && (
                                                        <div className="flex -space-x-1"><CheckIcon className="text-gray-400" /><CheckIcon className="text-gray-400" /></div>
                                                    )}
                                                    {(m.status === 'read' || m.status === 'READ') && (
                                                        <div className="flex -space-x-1"><CheckIcon className="text-blue-500" /><CheckIcon className="text-blue-500" /></div>
                                                    )}
                                                    {m.status === 'failed' && (
                                                        <div className="flex items-center gap-2">
                                                            <AlertIcon /> <span className="text-red-500">Failed</span>
                                                            <button onClick={() => handleRetry(m)} className="text-blue-500 hover:underline font-bold">Retry</button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <div ref={scrollRef} />
                                </div>
                            </ScrollArea>
                            <div className="p-4 border-t bg-background shrink-0">
                                <ChatInput
                                    value={input}
                                    onChange={handleInput}
                                    onSend={sendMessage}
                                    placeholder="Type a message... (Shift+Enter for new line)"
                                />
                                <div className="text-xs text-muted-foreground mt-1 h-4">
                                    {typingUsers.has(selectedUser) ? 'User is typing...' : ''}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            Select a user to start chatting
                        </div>
                    )
                ) : (
                    // User Management View
                    <div className="flex-1 flex flex-col p-6 overflow-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
                            <Button onClick={() => setIsCreatingUser(true)}>
                                <PlusIcon className="mr-2 h-4 w-4" /> Add User
                            </Button>
                        </div>

                        {/* Create User Form (Inline Card) */}
                        {isCreatingUser && (
                            <div className="mb-6 p-4 border rounded-lg bg-card shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-medium">Create New User</h3>
                                    <Button variant="ghost" size="sm" onClick={() => setIsCreatingUser(false)}><XIcon className="h-4 w-4" /></Button>
                                </div>
                                <form onSubmit={handleCreateUser} className="grid gap-4 md:grid-cols-3 items-end">
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">Email</label>
                                        <Input
                                            placeholder="user@example.com"
                                            value={newUserEmail}
                                            onChange={e => setNewUserEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">Password</label>
                                        <Input
                                            type="password"
                                            placeholder="Secure password"
                                            value={newUserPassword}
                                            onChange={e => setNewUserPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <Button type="submit">Create User</Button>
                                </form>
                            </div>
                        )}

                        <div className="border rounded-md">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-3">User ID</th>
                                        <th className="px-6 py-3">Email</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id} className="border-b hover:bg-muted/50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-xs">{u.id}</td>
                                            <td className="px-6 py-4 font-medium">{u.email}</td>
                                            <td className="px-6 py-4">
                                                <Badge variant={u.status === 'online' ? 'default' : 'secondary'} className={u.status === 'online' ? 'bg-green-500 hover:bg-green-600' : ''}>
                                                    {u.status}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={(e) => handleDeleteUser(e, u.id)}
                                                >
                                                    <TrashIcon className="h-4 w-4 mr-2" /> Delete
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                    {users.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                                                No users found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
