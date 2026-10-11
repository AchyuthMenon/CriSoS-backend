const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserModel = require("../models/userModel");
const env = require("../config/env");

/**
 * Generate standard cookie options
 */
function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

/**
 * POST /api/auth/signup
 * Register a new user with hashed password
 */
async function signup(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({ success: false, error: "Username must be at least 3 characters long" });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters long" });
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = await UserModel.findByUsername(cleanUsername);
    if (existing) {
      return res.status(409).json({ success: false, error: "Username is already taken" });
    }

    // Store password as secure bcrypt hash
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await UserModel.create({
      username: cleanUsername,
      passwordHash,
      createdAt: Date.now(),
    });

    // Create JWT token
    const token = jwt.sign(
      { id: result.insertedId.toString(), username: cleanUsername },
      env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Set secure cookie
    res.cookie("token", token, getAuthCookieOptions());

    return res.status(201).json({
      success: true,
      message: "Account registered successfully",
      token,
      user: { username: cleanUsername },
    });
  } catch (error) {
    console.error("[Auth] Signup error:", error.message);
    return res.status(500).json({ success: false, error: "Signup error: " + error.message });
  }
}

/**
 * POST /api/auth/login
 * Authenticate user with hashed password verification & set JWT cookie
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = await UserModel.findByUsername(cleanUsername);
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid username or password" });
    }

    const token = jwt.sign(
      { id: user._id.toString(), username: cleanUsername },
      env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, getAuthCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Logged in successfully",
      token,
      user: { username: cleanUsername },
    });
  } catch (error) {
    console.error("[Auth] Login error:", error.message);
    return res.status(500).json({ success: false, error: "Login error: " + error.message });
  }
}

/**
 * POST /api/auth/logout
 * Clear JWT authentication cookie
 */
function logout(req, res) {
  res.clearCookie("token", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  });
  return res.status(200).json({ success: true, message: "Logged out successfully" });
}

/**
 * GET /api/auth/me
 * Check currently authenticated user session from cookie or Bearer token
 */
function getMe(req, res) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
  if (!token) {
    return res.status(200).json({ success: true, user: null });
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    return res.status(200).json({ success: true, user: { username: decoded.username } });
  } catch {
    return res.status(200).json({ success: true, user: null });
  }
}

module.exports = {
  signup,
  login,
  logout,
  getMe,
};
