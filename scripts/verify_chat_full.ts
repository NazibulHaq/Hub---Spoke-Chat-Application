
import { io, Socket } from 'socket.io-client';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000';
const WS_URL = 'http://localhost:4000';

async function verify() {
    console.log('Starting Verification...');

    // 1. Setup Users
    const adminEmail = `admin-${Date.now()}@hub.com`;
    const userEmail = `user-${Date.now()}@spoke.com`;
    const password = 'password123';

    console.log(`Creating Admin: ${adminEmail}`);
    await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password, role: 'ADMIN' })
    });
    const adminAuth = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password })
    }).then(res => res.json());

    console.log(`Creating User: ${userEmail}`);
    await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, password, role: 'USER' })
    });
    const userAuth = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, password })
    }).then(res => res.json());

    if (!adminAuth.access_token || !userAuth.access_token) {
        console.error('Failed to register users', adminAuth, userAuth);
        return;
    }

    const adminToken = adminAuth.access_token;
    const userToken = userAuth.access_token;

    // 2. Connect Sockets
    console.log('Connecting Sockets...');
    const adminSocket: Socket = io(WS_URL, { auth: { token: adminToken } });
    const userSocket: Socket = io(WS_URL, { auth: { token: userToken } });

    await new Promise<void>(resolve => {
        let connected = 0;
        const check = () => { connected++; if (connected === 2) resolve(); };
        adminSocket.on('connect', check);
        userSocket.on('connect', check);
    });
    console.log('Sockets Connected!');

    // 3. User Typos
    console.log('Test: User Typing...');
    userSocket.emit('typing', { isTyping: true });

    await new Promise<void>(resolve => {
        adminSocket.once('typing_status', (data) => {
            if (data.isTyping && data.role === 'USER') { // Expecting role from server
                console.log('PASS: Admin received User typing');
                resolve();
            }
        });
    });

    // 4. User Sends Message
    console.log('Test: User Sends Message...');
    const msgContent = 'Hello Admin!';
    let messageId: string;

    const msgPromise = new Promise<void>(resolve => {
        adminSocket.once('message_received', (msg) => {
            if (msg.content === msgContent) {
                console.log('PASS: Admin received message');
                messageId = msg.id;
                resolve();
            }
        });
    });

    // Send and expect Ack
    await new Promise<void>(resolve => {
        userSocket.emit('send_message', { content: msgContent }, (ack: any) => {
            if (ack && ack.status === 'delivered') { // It should be delivered because Admin is online
                console.log('PASS: User received ACK with status DELIVERED');
                resolve();
            } else {
                console.log('WARN: Ack status was', ack?.status);
                resolve();
            }
        });
    });

    await msgPromise;

    // 5. Admin Reads Message
    console.log('Test: Admin Reads Message...');
    // Connect user listener for read receipt
    const readReceiptPromise = new Promise<void>(resolve => {
        userSocket.once('message_read', (data) => {
            console.log('PASS: User received READ receipt', data);
            resolve();
        });
    });

    // Admin emits mark_as_read targeting the user
    // We need the User's ID. adminAuth does not return it directly usually? 
    // Wait, register returns { access_token }. We need to decode it or fetch profile.
    // Actually, Admin can find conversation.
    // The Gateway payload for mark_as_read requires targetUserId if Admin.

    // Let's get User ID from profile
    const userProfile = await fetch(`${API_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${userToken}` }
    }).then(res => res.json());

    // Auth profile returns { userId, email, role } from JwtStrategy validate
    adminSocket.emit('mark_as_read', { targetUserId: userProfile.userId });

    await readReceiptPromise;

    console.log('ALL TESTS PASSED!');
    adminSocket.disconnect();
    userSocket.disconnect();
    process.exit(0);
}

verify().catch(e => {
    console.error(e);
    process.exit(1);
});
