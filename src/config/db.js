// src/config/db.js
const mongoose = require('mongoose');
let isConnected = false; // Cache connection status

const connectDB = async () => {
    // If already connected, don't re-establish connection
    if (isConnected) {
        console.log('Using existing MongoDB connection.');
        return;
    }

    try {
        // Pass options as an object (second argument)
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        isConnected = true;
        console.log('✅ New MongoDB connection established.');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        // Throw error instead of exiting process, as serverless envs handle this
        throw new Error('Database connection failed'); 
    }
};

module.exports = connectDB;