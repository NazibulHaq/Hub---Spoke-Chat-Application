import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const password = await bcrypt.hash('password', 10);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: { role: Role.ADMIN, displayName: 'System Admin' },
        create: {
            email: 'admin@example.com',
            displayName: 'System Admin',
            passwordHash: password,
            role: Role.ADMIN,
        },
    });

    const user = await prisma.user.upsert({
        where: { email: 'user@example.com' },
        update: { displayName: 'John Doe' },
        create: {
            email: 'user@example.com',
            displayName: 'John Doe',
            passwordHash: password,
            role: Role.USER,
        },
    });

    console.log({ admin, user });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
