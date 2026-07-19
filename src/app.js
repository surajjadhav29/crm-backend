const express = require('express');
const cors = require('cors');

const env = require('./config/env');
const { corsOptions } = require('./config/cors');
const { isConnected } = require('./config/db');
const ensureDb = require('./middleware/db.middleware');
const errorHandler = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const filesRoutes = require('./routes/files.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const workTypesRoutes = require('./routes/workTypes.routes');
const rtosRoutes = require('./routes/rtos.routes');

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

// Health checks (must not require a DB connection).
app.get('/', (_req, res) => res.json({ ok: true, service: 'crm-backend' }));
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dbConfigured: Boolean(env.MONGODB_URI),
    dbConnected: isConnected(),
  });
});

// Everything under /api needs the database.
app.use('/api', ensureDb);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/work-types', workTypesRoutes);
app.use('/api/rtos', rtosRoutes);

app.use(errorHandler);

module.exports = app;
