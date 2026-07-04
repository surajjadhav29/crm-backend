const mongoose = require('mongoose');

async function connectDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        const error = new Error('MONGODB_URI is not set');
        error.code = 'MISSING_ENV';
        throw error;
    }

    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (mongoose.connection.readyState === 2) {
        await new Promise((resolve, reject) => {
            mongoose.connection.once('connected', resolve);
            mongoose.connection.once('error', reject);
        });
        return mongoose.connection;
    }

    await mongoose.connect(uri);
    console.log('MongoDB connected');
    return mongoose.connection;
}

module.exports = connectDB;