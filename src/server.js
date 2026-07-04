require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const filesRoutes = require('./routes/files.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

const app = express();

const configuredOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
];

const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

function isAllowedOrigin(origin) {
    if (!origin) {
        return true;
    }

    if (allowedOrigins.has(origin)) {
        return true;
    }

    return /https:\/\/.*\.vercel\.(app|dev)$/i.test(origin);
}

app.use(
    cors({
        origin(origin, callback) {
            if (isAllowedOrigin(origin)) {
                return callback(null, true);
            }

            return callback(null, false);
        },
        credentials: true,
    })
);
app.use(express.json());

let dbConnectionPromise;

async function ensureDatabaseConnection() {
    if (!dbConnectionPromise) {
        dbConnectionPromise = connectDB().catch((error) => {
            dbConnectionPromise = null;
            throw error;
        });
    }

    return dbConnectionPromise;
}

app.get('/', (_req, res) => res.json({ ok: true, service: 'crm-backend' }));

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        dbConfigured: Boolean(process.env.MONGODB_URI),
        dbConnected: require('mongoose').connection.readyState === 1,
    });
});

app.use('/api', async(req, res, next) => {
    try {
        await ensureDatabaseConnection();
        next();
    } catch (error) {
        if (error.code === 'MISSING_ENV') {
            return res.status(503).json({ error: 'Database is not configured', message: error.message });
        }

        next(error);
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((err, _req, res, _next) => {
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'Not allowed by CORS' });
    }
    if (err.code === 'MISSING_ENV') {
        return res.status(500).json({ error: err.message });
    }
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0] || 'value';
        return res.status(409).json({ error: `A record with this ${field} already exists` });
    }
    if (err.name === 'CastError') {
        return res.status(404).json({ error: 'Not found' });
    }
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
    const port = Number(process.env.PORT || 5000);

    function startServer(currentPort) {
        const server = app.listen(currentPort, () => {
            console.log(`Server listening on port ${currentPort}`);
        });

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                const nextPort = currentPort + 1;
                console.warn(`Port ${currentPort} is busy. Trying ${nextPort} instead.`);
                server.close(() => startServer(nextPort));
                return;
            }

            console.error('Failed to start server:', error.message);
            process.exit(1);
        });
    }

    ensureDatabaseConnection()
        .then(() => {
            startServer(port);
        })
        .catch((err) => {
            console.error('Failed to connect to MongoDB:', err.message);
            process.exit(1);
        });
}

module.exports = app;