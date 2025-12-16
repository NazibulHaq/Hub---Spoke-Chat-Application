export enum Role {
    ADMIN = 'ADMIN',
    USER = 'USER',
}

export interface User {
    id: string;
    email: string;
    role: Role;
    createdAt: string; // ISO Date
    lastLogin?: string; // ISO Date
}

export interface Message {
    id: string;
    content: string;
    senderId: string;
    conversationId: string;
    createdAt: Date;
    status: 'sent' | 'delivered' | 'read';
}

export interface Conversation {
    id: string;
    userId: string;
    messages?: Message[];
    updatedAt: string; // ISO Date
}

// WebSocket Events
export const EVENTS = {
    CLIENT: {
        JOIN: 'join',
        SEND_MESSAGE: 'send_message',
        TYPING: 'typing',
        MARK_AS_READ: 'mark_as_read',
    },
    SERVER: {
        MESSAGE_RECEIVED: 'message_received',
        USER_STATUS: 'user_status',
        TYPING_STATUS: 'typing_status',
        ERROR: 'error',
        MESSAGE_READ: 'message_read',
    },
};
