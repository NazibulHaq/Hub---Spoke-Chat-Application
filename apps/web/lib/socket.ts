import { io } from 'socket.io-client';

// Socket connects to origin but with path prefix if needed
// For rewrites, we might need to adjust path
export const socket = io({
    autoConnect: false,
    withCredentials: false,
    path: '/api/socket.io',
});
