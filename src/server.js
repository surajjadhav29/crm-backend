require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const filesRoutes = require('./routes/files.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
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

const port = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(port, () => console.log(`Server listening on port ${port}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
