// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db'); // Main router
const allRoutes = require('./src/routes');

// --- DO NOT CONNECT HERE for serverless ---
// connectDB(); // <-- Remove this top-level call

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// --- FIXED Connection Middleware ---
// This runs on every request, but connectDB will only run if not connected
app.use(async (req, res, next) => {
    try {
        await connectDB(); // Ensures DB is connected
        next(); // <-- CRITICAL: Call next() to proceed to routes
    } catch (error) {
        console.error('Failed to connect to database in middleware:', error);
        res.status(500).json({ message: 'Internal Server Error: Database connection failed' });
    }
});

// Mount all application routes
app.use('/', allRoutes);

// Start Server (Uncomment for local development)
/*
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
}
*/

// Export app for serverless deployment
module.exports = app;