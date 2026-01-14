import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
    const email = 'admin@example.com';
    const password = 'admin123'; // Known password
    const displayName = 'Admin User';

    try {
        // Delete existing admin if exists
        const existing = await prisma.user.findUnique({ where: { email } });

        if (existing) {
            console.log('🗑️  Deleting existing admin user...');
            await prisma.user.delete({ where: { email } });
        }

        // Hash the password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create admin user
        const admin = await prisma.user.create({
            data: {
                email,
                passwordHash,
                role: 'ADMIN',
                displayName,
            },
        });

        console.log('\n✅ Admin user created successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email:    ', email);
        console.log('🔑 Password: ', password);
        console.log('👤 Name:     ', displayName);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\nYou can now log in at http://localhost:3001');
    } catch (error) {
        console.error('❌ Error creating admin:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createAdmin();
