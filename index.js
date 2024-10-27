const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// MongoDB connection with improved error handling
mongoose.connect(process.env.MONGODB_URI, {
   
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB!');
});

// Define schemas and models
const messageSchema = new mongoose.Schema({
    user: String,
    text: String,
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    profile: { type: String, required: true },
    about: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    problem: { type: String, required: true },
    description: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    uname: { type: String, required: true }
});
const Product = mongoose.model('Product', productSchema);

// Middleware setup
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-fallback-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true
    }
}));
const path = require('path');

// Set views directory
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.username) {
        return res.redirect("/login");
    }
    next();
};

// Define routes
const routes = [
    { path: "/", view: "index" },
    { path: "/login", view: "login" },
    { path: "/signup", view: "signup" },
    { path: "/about", view: "about" },
    { path: "/service", view: "service" },
    { path: "/collab", view: "collab" },
    { path: "/abhay", view: "abhay" }
];

routes.forEach((route) => {
    app.get(route.path, (req, res) => {
        res.render(route.view);
    });
});

// User home route
app.get("/home", requireAuth, (req, res) => {
    res.render("home", { username: req.session.username });
});

// User profile route
app.get("/user", requireAuth, async (req, res) => {
    try {
        const products = await Product.find();
        res.render("user", {
            username: req.session.username,
            profile: req.session.profile,
            about: req.session.about,
            products: products || []
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred. Please try again.");
    }
});

// Signup route
app.post("/signup", async (req, res) => {
    try {
        const { username, profile, about, Email: email, password } = req.body;

        const existingUser = await User.findOne({ $or: [{ name: username }, { email }] });
        if (existingUser) {
            return res.status(400).send(
                existingUser.name === username ? 'Username already exists' : 'Email already exists'
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            name: username,
            profile,
            about,
            email,
            password: hashedPassword
        });

        res.render("login");
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred during signup.");
    }
});

// Login route
app.post("/login", async (req, res) => {
    try {
        const user = await User.findOne({ name: req.body.username });
        if (!user) {
            return res.status(400).send("User not found.");
        }

        const isPasswordMatch = await bcrypt.compare(req.body.password, user.password);
        if (!isPasswordMatch) {
            return res.status(400).send("Invalid password.");
        }

        req.session.userId = user._id.toString();
        req.session.username = user.name;
        req.session.profile = user.profile;
        req.session.about = user.about;

        res.render("home", {
            username: user.name,
            profile: user.profile,
            about: user.about
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred during login.");
    }
});

// Logout route
app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send("Could not log out. Please try again.");
        }
        res.redirect("/login");
    });
});

// Messages API
app.get('/api/messages/:productId', async (req, res) => {
    try {
        const messages = await Message.find({ productId: req.params.productId })
            .sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { user, text, productId } = req.body;
        const newMessage = new Message({ user, text, productId });
        await newMessage.save();
        res.status(201).send();
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Product submission route
app.post("/user", requireAuth, async (req, res) => {
    try {
        const { productName, problem, productDescription, uname } = req.body;
        const newProduct = new Product({
            name: productName,
            problem,
            description: productDescription,
            uname
        });
        await newProduct.save();

        switch(problem.toLowerCase()) {
            case "frontend": return res .redirect("/products1");
            case "backend": return res.redirect("/products2");
            case "cpp": return res.redirect("/products3");
            case "python": return res.redirect("/products4");
            case "java": return res.redirect("/products5");
            default: return res.redirect("/products");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred. Please try again.");
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});