const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = "mongodb+srv://tiwariaayush004_db_user:Tiwari2026@failure-prediction-clus.ck1yan4.mongodb.net/suraksha-digi?retryWrites=true&w=majority";
    console.log('Connecting to MongoDB...');
    const conn = await mongoose.connect(uri);
    console.log('MongoDB Connected: ' + conn.connection.host);
  } catch (error) {
    console.log('Database connection failed: ' + error.message);
    process.exit(1);
  }
};

module.exports = connectDB;