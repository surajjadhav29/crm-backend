const mongoose = require('mongoose');

async function connectDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        const error = new Error('MONGODB_URI is not set');
        error.code = 'MISSING_ENV';
        throw error;
    }

    await mongoose.connect(uri);
    console.log('MongoDB connected');
}

module.exports = connectDB;