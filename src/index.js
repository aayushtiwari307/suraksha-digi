const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const elderRoutes = require('./routes/elderRoutes');
const familyRoutes = require('./routes/familyRoutes');
const alertRoutes = require('./routes/alertRoutes');
const aiRoutes = require('./routes/aiRoutes');

dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/elders', elderRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/ai', aiRoutes);

// Test route
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