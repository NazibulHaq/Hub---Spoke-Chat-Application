'use client';

import { useEffect, useState, useRef } from 'react';
import { socket } from '@/lib/socket';
import { EVENTS } from '@hub-spoke/shared';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatInput } from '@/components/ui/chat-input';
import { MessageContent } from '@/components/ui/message-content';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [myName, setMyName] = useState<string | null>(null);
    const router = useRouter();
    const [isTyping, setIsTyping] = useState(false);
    const [isSupportTyping, setIsSupportTyping] = useState(false);
    const [isConnected, setIsConnected] = useState(socket.connected);

    const scrollRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);

    // Icons
    const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clock text-muted-foreground"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    const AlertIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle-alert"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>;
    const CheckIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12" /></svg>;

    const scrollToBottom = () => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleLogout = async () => {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                await fetch('http://localhost:4000/auth/logout', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
        } catch (error) {
            console.error('[Chat] Logout error:', error);
        } finally {
            localStorage.removeItem('token');
            socket.disconnect();
            router.push('/');
        }
    };

    const sendMessage = async (content: string, retryId?: string) => {
        if (!content) return;

        // Check connection
        if (!socket.connected) {
            console.warn('Socket disconnected, attempting to reconnect...');
            socket.connect();
            // We can still try to emit (it buffers), but user should know
        }

        const tempId = retryId || 'temp-' + Date.now();
        const tempMsg = {
            id: tempId,
            content: content,
            senderId: userId || 'me',
            createdAt: new Date().toISOString(),
            status: 'sending'
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
        socket.emit(EVENTS.CLIENT.SEND_MESSAGE, { content: content }, (response: any) => {
            clearTimeout(timeout);
            if (response && response.id) {
                setMessages(prev => prev.map(m => m.id === tempId ? { ...response, status: 'sent' } : m));
            } else {
                console.error('Ack failed or invalid response', response);
            }
        });
    };

    const handleRetry = (msg: any) => {
        sendMessage(msg.content, msg.id);
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const val = e.target.value;
        setInput(val);

        if (!isTyping) {
            setIsTyping(true);
            socket.emit(EVENTS.CLIENT.TYPING, { isTyping: true });
        }

        // Simple debounce for typing stop
        if ((window as any).typingTimeout) clearTimeout((window as any).typingTimeout);
        (window as any).typingTimeout = setTimeout(() => {
            setIsTyping(false);
            socket.emit(EVENTS.CLIENT.TYPING, { isTyping: false });
        }, 1000);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const atBottom = scrollHeight - scrollTop - clientHeight < 50;
        setIsAtBottom(atBottom);
        if (atBottom) setShowScrollButton(false);
    };

    useEffect(() => {
        const preventAction = (e: Event) => e.preventDefault();
        window.addEventListener('contextmenu', preventAction);
        window.addEventListener('copy', preventAction);
        window.addEventListener('cut', preventAction);

        return () => {
            window.removeEventListener('contextmenu', preventAction);
            window.removeEventListener('copy', preventAction);
            window.removeEventListener('cut', preventAction);
        };
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/');
            return;
        }

        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.role === 'ADMIN') {
                router.push('/dashboard');
                return;
            }
            setUserId(payload.sub);
            setMyName(payload.displayName || payload.email);
        }

        function onConnect() {
            setIsConnected(true);
            console.log('Socket connected');
        }

        function onDisconnect() {
            setIsConnected(false);
            console.log('Socket disconnected');
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        if (!socket.connected) {
            socket.auth = { token };
            socket.connect();
        } else {
            // Check for stale connection (Token/Identity mismatch)
            const socketToken = (socket.auth as any)?.token;
            if (socketToken !== token) {
                console.log('[Chat] Token mismatch, reconnecting socket...');
                socket.disconnect();
                socket.auth = { token };
                socket.connect();
            } else {
                setIsConnected(true);
            }
        }

        // Fetch history
        fetch('http://localhost:4000/chat/messages', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setMessages(data.map(m => ({
                        ...m,
                        status: 'sent',
                        conversationUserId: userId // Inject for strict filtering to pass
                    })));

                    const currentUserId = JSON.parse(atob(token.split('.')[1])).sub;
                    const hasUnreadFromSupport = data.some(m => m.senderId !== currentUserId && m.status !== 'read');
                    if (hasUnreadFromSupport) {
                        socket.emit(EVENTS.CLIENT.MARK_AS_READ, {});
                    }
                }
            })
            .catch(console.error);

        socket.on(EVENTS.SERVER.MESSAGE_RECEIVED, (msg: any) => {
            // STRICT FILTERING: Only process if this message belongs to my conversation
            if (msg.conversationUserId !== userId) {
                console.warn('[Chat] Received message for different user, ignoring.', msg.conversationUserId);
                return;
            }

            setMessages((prev) => {
                const isOwn = msg.senderId === userId;
                if (isOwn) {
                    const pendingIdx = prev.findIndex(m => m.status === 'sending' && m.content === msg.content);
                    if (pendingIdx !== -1) {
                        const newMsgs = [...prev];
                        newMsgs[pendingIdx] = { ...msg, status: 'sent' };
                        return newMsgs;
                    }
                } else {
                    socket.emit(EVENTS.CLIENT.MARK_AS_READ, {});
                }
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, { ...msg, status: 'sent' }];
            });

            if (msg.senderId !== userId) {
                setIsSupportTyping(false);
            }
        });

        socket.on(EVENTS.SERVER.TYPING_STATUS, (data) => {
            if (data.role === 'ADMIN') {
                setIsSupportTyping(data.isTyping);
            }
        });

        socket.on(EVENTS.SERVER.MESSAGE_READ, () => {
            // Mark all my messages as read
            setMessages(prev => prev.map(m => m.senderId === userId && m.status !== 'read' ? { ...m, status: 'read' } : m));
        });

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off(EVENTS.SERVER.MESSAGE_RECEIVED);
            socket.off(EVENTS.SERVER.TYPING_STATUS);
            socket.off(EVENTS.SERVER.MESSAGE_READ);
        };
    }, [router, userId]);

    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        const isOwn = lastMsg && lastMsg.senderId === userId;

        if (isAtBottom || isOwn) {
            scrollToBottom();
        } else {
            setShowScrollButton(true);
        }
    }, [messages, isSupportTyping]);

    return (
        <div className="flex flex-col h-screen bg-slate-50 select-none overflow-hidden">
            <header className="bg-white border-b p-4 flex items-center justify-between sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-primary text-primary-foreground h-8 w-8 rounded flex items-center justify-center font-bold">
                        S
                    </div>
                    <div>
                        <h1 className="font-semibold text-lg">Support Channel</h1>
                        {!isConnected && <span className="text-xs text-red-500 font-medium animate-pulse">● Disconnected</span>}
                        {isConnected && <span className="text-xs text-green-500 font-medium">● Connected</span>}
                    </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
            </header>

            <ScrollArea className="flex-1 min-h-0 p-4" onScrollCapture={handleScroll}>
                <div className="space-y-4 max-w-2xl mx-auto min-h-[calc(100vh-140px)]">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                            <div className="bg-blue-100 p-4 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-messages-square text-blue-600"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2z" /><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" /></svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Welcome back!</h2>
                                <p className="text-muted-foreground mt-1 max-w-[280px] mx-auto text-sm leading-relaxed">
                                    Your previous session has been closed for your privacy. How can we help you today?
                                </p>
                            </div>
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`flex flex-col ${m.senderId === userId ? 'items-end' : 'items-start'}`}>
                            {/* Name above bubble */}
                            <span className="text-[10px] text-muted-foreground mb-1 px-1 font-medium uppercase tracking-wider">
                                {m.senderId === userId ? myName : 'Support Agent'}
                            </span>
                            <div className={`flex ${m.senderId === userId ? 'justify-end' : 'justify-start'} items-end gap-2 max-w-[85%]`}>
                                {m.senderId !== userId && (
                                    <Avatar className="h-6 w-6 mr-1 mb-0.5">
                                        <AvatarFallback>A</AvatarFallback>
                                    </Avatar>
                                )}
                                <div className={`p-3 rounded-2xl shadow-sm text-sm break-words ${m.senderId === userId
                                    ? 'bg-blue-600 text-white rounded-br-none'
                                    : 'bg-white border rounded-bl-none'
                                    }`}>
                                    <MessageContent
                                        content={m.content}
                                        isOwnMessage={m.senderId === userId}
                                    />
                                </div>
                            </div>

                            {/* Status Indicator for Own Messages */}
                            {m.senderId === userId && (
                                <div className="text-[10px] text-muted-foreground mt-1 mr-1 flex items-center gap-1">
                                    {m.status === 'sending' && <ClockIcon />}

                                    {/* SENT: 1 Grey Check */}
                                    {m.status === 'sent' && (
                                        <CheckIcon className="text-gray-400" />
                                    )}

                                    {/* DELIVERED: 2 Grey Checks */}
                                    {(m.status === 'delivered' || m.status === 'DELIVERED') && (
                                        <div className="flex -space-x-1">
                                            <CheckIcon className="text-gray-400" />
                                            <CheckIcon className="text-gray-400" />
                                        </div>
                                    )}

                                    {/* READ: 2 Blue Checks */}
                                    {(m.status === 'read' || m.status === 'READ') && (
                                        <div className="flex -space-x-1">
                                            <CheckIcon className="text-blue-500" />
                                            <CheckIcon className="text-blue-500" />
                                        </div>
                                    )}

                                    {m.status === 'failed' && (
                                        <div className="flex items-center gap-2">
                                            <AlertIcon /> <span className="text-red-500">Failed</span>
                                            <button
                                                onClick={() => handleRetry(m)}
                                                className="text-blue-500 hover:underline font-bold"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                    {isSupportTyping && (
                        <div className="flex justify-start">
                            <div className="bg-gray-200 text-gray-500 text-xs px-3 py-2 rounded-full rounded-tl-none animate-pulse">
                                Support is typing...
                            </div>
                        </div>
                    )}

                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            {/* Floating Badge */}
            {showScrollButton && (
                <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-20">
                    <Button
                        size="sm"
                        className="rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 animate-bounce"
                        onClick={() => { scrollToBottom(); setIsAtBottom(true); setShowScrollButton(false); }}
                    >
                        New Message ⬇
                    </Button>
                </div>
            )}

            <div className="p-4 bg-white border-t shrink-0">
                <div className="max-w-2xl mx-auto">
                    <ChatInput
                        value={input}
                        onChange={handleInput}
                        onSend={(val) => sendMessage(val)}
                        placeholder="Type your message... (Shift+Enter for new line)"
                    />
                </div>
            </div>
        </div>
    );
}
