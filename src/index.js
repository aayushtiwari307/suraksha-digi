const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { authLimiter } = require('./middleware/rateLimiter');
const connectDB = require('./config/db');
const elderRoutes = require('./routes/elderRoutes');
const familyRoutes = require('./routes/familyRoutes');
const alertRoutes = require('./routes/alertRoutes');
const aiRoutes = require('./routes/aiRoutes');
const medicationRoutes = require('./routes/medicationRoutes');

connectDB();

const app = express();

// Render sits in front of this app as a single reverse-proxy hop, so
// req.ip would otherwise resolve to Render's internal proxy address
// rather than the real client IP. Trusting exactly one hop (not `true`,
// which would trust the whole chain) is the correct minimal setting —
// required for express-rate-limit below to identify clients correctly.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://suraksha-digi-dashboard.vercel.app'],
  credentials: true
}));
app.use(express.json());

// Rate limiting on authentication-sensitive routes only — not applied
// globally. Configuration lives in ./middleware/rateLimiter.js.
app.use('/api/family/login', authLimiter);
app.use('/api/family/register', authLimiter);
app.use('/api/elders/login', authLimiter);
app.use('/api/elders/register', authLimiter);

app.use('/api/elders', elderRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/medications', medicationRoutes);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'SurakshaDigi Backend is Running!',
    version: '1.0.0'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('SurakshaDigi Server running on port ' + PORT);
});