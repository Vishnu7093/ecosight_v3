require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const { initDb, User, Prediction } = require('./database');

const app = express();
const PORT = 3000;
const SECRET_KEY = "waste_detection_secret"; // Move to .env for prod

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // Serve Frontend
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve Images

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Ensure uploads dir exists
const fs = require('fs');
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// --- AUTH ROUTES ---

// Signup
app.post('/api/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if this is the first user
        const userCount = await User.count();
        const isAdmin = userCount === 0;

        const user = await User.create({ username, email, password: hashedPassword, isAdmin });
        res.json({ message: "User created successfully", isAdmin });
    } catch (error) {
        res.status(400).json({ error: "Username or Email already exists" });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user.id, isAdmin: user.isAdmin }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token, isAdmin: user.isAdmin, username: user.username });
    } catch (error) {
        res.status(500).json({ error: "Login failed" });
    }
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- PREDICTION ROUTES ---

app.post('/api/predict', authenticateToken, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const imagePath = path.resolve(req.file.path);
    const modelPath = path.resolve('../../notebooks/runs/best.pt');
    const yolov5Source = path.resolve('../../notebooks/yolov5');

    // Use 'python' command (requires Python to be in system PATH)
    // On some Mac/Linux systems it might be 'python3'
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

    const pythonProcess = spawn(pythonCommand, [
        'inference.py',
        '--image', imagePath,
        '--model', modelPath,
        '--source', yolov5Source
    ]);

    let dataString = '';

    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
    });

    pythonProcess.on('close', async (code) => {
        try {
            // Robust JSON extraction: Find the last valid JSON object in stdout
            // YOLOv5 often prints logs to stdout, so we must isolate the JSON { ... }
            const jsonStart = dataString.indexOf('{');
            const jsonEnd = dataString.lastIndexOf('}');

            if (jsonStart === -1 || jsonEnd === -1) {
                throw new Error("No JSON found in Python output: " + dataString);
            }

            const cleanJson = dataString.substring(jsonStart, jsonEnd + 1);
            const result = JSON.parse(cleanJson);

            // Debug Logging
            console.log("Total Items from Python:", result.total_items);

            if (result.error) {
                return res.status(500).json({ error: result.error });
            }

            // Severity Logic Helper
            function calculateSeverity(total) {
                if (total === 0) return "No Waste";
                if (total <= 3) return "Low";
                if (total <= 10) return "Medium";
                return "High";
            }

            // Calculate Severity
            // Python sends 'total_items', we use 'totalItems'
            const totalItems = result.total_items ?? 0;
            const severityLevel = calculateSeverity(totalItems);

            // Save to DB
            const originalImagePath = `/uploads/${req.file.filename}`;
            const taggedImagePath = `/uploads/${result.tagged_image}`;

            await Prediction.create({
                UserId: req.user.id,
                originalImagePath: originalImagePath,
                taggedImagePath: taggedImagePath,
                label: result.label || 'Unknown', // Fallback
                confidence: result.confidence,
                totalItems: totalItems,
                severity: severityLevel
            });

            // Respond with full result including new image path
            res.json({
                ...result,
                tagged_image_url: taggedImagePath,
                severity: severityLevel,
                totalItems: totalItems
            });
        } catch (e) {
            console.error("Inference Error:", e);
            console.error("Raw Output:", dataString);
            res.status(500).json({ error: "Failed to parse inference result. Check server logs." });
        }
    });
});

// --- DASHBOARD ROUTES ---

// User History
app.get('/api/history', authenticateToken, async (req, res) => {
    const predictions = await Prediction.findAll({
        where: { UserId: req.user.id },
        order: [['createdAt', 'DESC']]
    });
    res.json(predictions);
});

// User Profile Stats (New)
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['username', 'email', 'createdAt']
        });

        const predictionCount = await Prediction.count({ where: { UserId: req.user.id } });

        const predictions = await Prediction.findAll({
            where: { UserId: req.user.id },
            order: [['createdAt', 'DESC']]
        });

        const categories = {};
        const severityStats = { Low: 0, Medium: 0, High: 0 };

        predictions.forEach(p => {
            const label = p.label || 'Unknown';
            categories[label] = (categories[label] || 0) + 1;

            const sev = p.severity || 'Low';
            if (severityStats[sev] !== undefined) {
                severityStats[sev]++;
            } else {
                severityStats['Low']++; // Fallback
            }
        });

        res.json({
            user,
            totalUploads: predictionCount,
            categories,
            severityStats,
            recentActivity: predictions
        });
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

// Admin: Analytics & Insights
app.get('/api/admin/activity', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);

    try {
        const { sequelize } = require('./database'); // Lazy import to avoid top-level issues if needed, or better yet, assume it's available.
        // Actually, importing it here is safe.

        // 1. Daily Activity (Last 30 Days)
        const dailyQuery = `
            SELECT DATE(createdAt) as date, COUNT(*) as count 
            FROM Predictions 
            GROUP BY DATE(createdAt) 
            ORDER BY date DESC 
            LIMIT 30`;

        // 2. Weekly Activity (Last 12 Weeks) - SQLite uses strftime
        const weeklyQuery = `
            SELECT strftime('%Y-W%W', createdAt) as week, COUNT(*) as count 
            FROM Predictions 
            GROUP BY week 
            ORDER BY week DESC 
            LIMIT 12`;

        // 3. Monthly Activity (Last 12 Months)
        const monthlyQuery = `
            SELECT strftime('%Y-%m', createdAt) as month, COUNT(*) as count 
            FROM Predictions 
            GROUP BY month 
            ORDER BY month DESC 
            LIMIT 12`;

        const [daily] = await sequelize.query(dailyQuery);
        const [weekly] = await sequelize.query(weeklyQuery);
        const [monthly] = await sequelize.query(monthlyQuery);

        res.json({ daily, weekly, monthly });
    } catch (err) {
        console.error("Analytics Error:", err);
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
});

// Admin Stats (Enhanced with Severity)
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.sendStatus(403);

    const totalUploads = await Prediction.count();
    const activeUsers = await User.count();
    const predictions = await Prediction.findAll({
        include: User,
        order: [['createdAt', 'DESC']],
        limit: 50 // Limit strictly to prevent overload
    });

    // Category Distribution & Severity Stats
    const categories = {};
    predictions.forEach(p => {
        // Categories
        categories[p.label] = (categories[p.label] || 0) + 1;
    });

    res.json({
        totalUploads,
        activeUsers,
        categories,
        recentActivity: predictions
    });
});

// Reset Database (Admin Only)
app.post('/api/admin/reset', authenticateToken, async (req, res) => {
    try {
        if (!req.user.isAdmin) return res.sendStatus(403); // Check admin status from authenticated user

        // Force sync to wipe all data
        const { sequelize } = require('./database'); // Import sequelize here
        await sequelize.sync({ force: true });

        res.json({ message: 'Database reset successfully. Please sign up again.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reset database' });
    }
});


// Start Server
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});
