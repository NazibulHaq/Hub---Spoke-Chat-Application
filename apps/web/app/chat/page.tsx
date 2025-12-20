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

    const handleLogout = () => {
        localStorage.removeItem('token');
        socket.disconnect();
        router.push('/');
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
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/');
            return;
        }

        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            setUserId(payload.sub);
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
                    setMessages(data.map(m => ({ ...m, status: 'sent' })));

                    const currentUserId = JSON.parse(atob(token.split('.')[1])).sub;
                    const hasUnreadFromSupport = data.some(m => m.senderId !== currentUserId && m.status !== 'read');
                    if (hasUnreadFromSupport) {
                        socket.emit(EVENTS.CLIENT.MARK_AS_READ, {});
                    }
                }
            })
            .catch(console.error);

        socket.on(EVENTS.SERVER.MESSAGE_RECEIVED, (msg) => {
            setMessages((prev) => {
                const currentUserId = JSON.parse(atob(localStorage.getItem('token')!.split('.')[1])).sub;
                const isOwn = msg.senderId === currentUserId;
                if (isOwn) {
                    const pendingIdx = prev.findIndex(m => m.status === 'sending' && m.content === msg.content);
                    if (pendingIdx !== -1) {
                        const newMsgs = [...prev];
                        // Preserve ID if replaced by server ID, but here we likely get same ID if ACK didn't handle it yet? 
                        // Actually msg from server has DB ID. Temp msg has temp ID.
                        // Ideally we replace based on tempID matching if we knew it, but here we match content/status.
                        // The Ack callback usually handles the ID update. 
                        // If this event comes BEFORE Ack, it might duplicate if we don't match well.
                        // Relying on Ack for own messages is safer. 
                        // But if we receive our own message via broadcast (which we do in Gateway), we should match it.
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
        if (isAtBottom) {
            scrollToBottom();
        } else {
            setShowScrollButton(true);
        }
    }, [messages, isSupportTyping]);

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            <header className="bg-white border-b p-4 flex items-center justify-between sticky top-0 z-10">
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

            <ScrollArea className="flex-1 p-4" onScrollCapture={handleScroll}>
                <div className="space-y-4 max-w-2xl mx-auto min-h-[calc(100vh-140px)]">
                    {messages.length === 0 && (
                        <div className="text-center text-muted-foreground py-10">
                            Welcome! How can we help you today?
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`flex flex-col ${m.senderId === userId ? 'items-end' : 'items-start'}`}>
                            <div className={`flex ${m.senderId === userId ? 'justify-end' : 'justify-start'} items-end gap-2 max-w-[85%]`}>
                                {m.senderId !== userId && (
                                    <Avatar className="h-8 w-8 mr-2 mt-1">
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

            <div className="p-4 bg-white border-t">
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
