/**
 * Run ONCE to create the admin account:
 *   node createAdmin.js
 *
 * Then use these credentials to login:
 *   Email:    admin@peerhelp.com
 *   Password: admin123
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

mongoose.connect('mongodb://localhost:27017/peerhelp').then(async () => {
    const existing = await User.findOne({ email: 'admin@peerhelp.com' });
    if (existing) {
        console.log('⚠️  Admin already exists. Email: admin@peerhelp.com');
        process.exit(0);
    }
    const hashed = await bcrypt.hash('admin123', 10);
    await User.create({
        name: 'Admin',
        email: 'admin@peerhelp.com',
        password: hashed,
        role: 'admin',
        status: 'approved',
        branch: ''
    });
    console.log('✅ Admin created!');
    console.log('   Email:    admin@peerhelp.com');
    console.log('   Password: admin123');
    console.log('   ⚠️  Change the password after first login!');
    process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });