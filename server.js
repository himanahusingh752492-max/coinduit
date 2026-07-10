const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 4000 ;

const app = express();
const axios = require("axios");

const otpStore = {};
// const nodemailer = require("nodemailer");
const nodemailer = require("nodemailer");

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: false,          // 587 ke liye false
  requireTLS: true,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

const sendOTPEmail = async (email, otp) => {
  try {
    console.log("SMTP HOST:", process.env.SMTP_HOST);
    console.log("SMTP PORT:", process.env.SMTP_PORT);
    console.log("SMTP USER:", process.env.SMTP_USER);
    console.log("SMTP FROM:", process.env.SMTP_FROM);

    // SMTP connection verify
    await transporter.verify();
    console.log("SMTP Connected Successfully");

    const info = await transporter.sendMail({
      from: `"CoinDuit" <${process.env.SMTP_FROM}>`,
      to: email,
      subject: "CoinDuit OTP Verification",
      text: `Your OTP is ${otp}. It is valid for 5 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px">
          <h2>CoinDuit OTP Verification</h2>
          <p>Your verification code is:</p>
          <h1 style="color:#22C55E;letter-spacing:5px">${otp}</h1>
          <p>This OTP is valid for <b>5 minutes</b>.</p>
        </div>
      `,
    });

    console.log("Email Sent:", info.messageId);
    return true;

  } catch (err) {
    console.error("SMTP ERROR:", err);
    throw err;
  }
};
app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

const UserSchema = new mongoose.Schema(
  {
    username: String,
    email: { type: String, unique: true },
    password: String,

    coins: { type: Number, default: 0 },

    referralCode: { type: String, unique: true },
    referredBy: { type: String, default: null },

    dailyBonusDate: String,

    withdraws: [
      {
        amount: Number,
        coins: Number,
        method: String,
        upi: String,
        paypalEmail: String,
        status: {
          type: String,
          default: "Pending",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);

const makeReferralCode = (email) => {
  return "CD" + email.slice(-5) + Math.floor(100 + Math.random() * 900);
};

/* Signup */
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const exist = await User.findOne({ email });

    if (exist) {
      return res.status(400).json({
        message: "email already registered",
      });
    }

    const user = await User.create({
      username,
   email,
      password,
      coins: 0,
      referralCode: makeReferralCode(email),
    });

    res.json({
      message: "Signup successful",
      user,
    });
  } catch (error) {
    console.log(error),
    res.status(500).json({
      
      message: "Signup error",
      error,
      
    });
  }
});
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

/* Login */
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
console.log("LOGIN HIT:", email);
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    if (user.password !== password) {
      return res.status(400).json({
        message: "Wrong password",
      });
    }

    res.json({
      message: "Login successful",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Login error",
      error,
    });
  }
});

/* Get User */
app.get("/user/:email", async (req, res) => {
  try {
    const user = await User.findOne({
      email: req.params.email,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json(error);
  }
});

/* Watch Ad Reward */
app.post("/reward/ad", async (req, res) => {
  try {
    const { email } = req.body;

    const coins = 3;

    const user = await User.findOneAndUpdate(
      { email },
      { $inc: { coins } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      message: "Ad reward added",
      coinsAdded: coins,
      totalCoins: user.coins,
    });
  } catch (error) {
    res.status(500).json({
      message: "Ad reward error",
      error,
    });
  }
});

/* Daily Bonus */
app.post("/reward/daily", async (req, res) => {
  try {
    const { email } = req.body;

    const today = new Date().toDateString();

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.dailyBonusDate === today) {
      return res.status(400).json({
        message: "Daily bonus already claimed",
      });
    }

    user.coins += 10;
    user.dailyBonusDate = today;

    await user.save();

    res.json({
      message: "Daily bonus claimed",
      coinsAdded: 10,
      totalCoins: user.coins,
    });
  } catch (error) {
    res.status(500).json({
      message: "Daily bonus error",
      error,
    });
  }
});

 app.post("/signup/verify-otp", async (req, res) => {
  try {
    const { email, otp, username, password } = req.body;

    const record = otpStore[email];

    if (!record) {
      return res.status(400).json({ message: "OTP not found" });
    }

    if (Date.now() > record.expires) {
      return res.status(400).json({ message: "OTP expired" });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP verified → create user
    const user = await User.create({
      username,
      email,
      password,
      coins: 0,
      referralCode: "CD" + Math.floor(100000 + Math.random() * 900000),
    });

    delete otpStore[email];

    res.json({
      message: "Signup successful",
      user,
    });

  } catch (error) {
    res.status(500).json({ message: "Signup error" });
    console.log(error)
  }
});

app.post("/forgot/send-otp", async (req, res) => {
  console.log("SMTP:", process.env.SMTP_HOST, process.env.SMTP_PORT, process.env.SMTP_USER);
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    otpStore[email] = {
      otp,
      expires: Date.now() + 5 * 60 * 1000,
    };
console.log("Sending OTP to:", email);
    await sendOTPEmail(email, otp);

    res.json({ message: "OTP sent to email" });

  } catch (error) {
    res.status(500).json({ message: "OTP send failed" });
  }
});
app.post("/forgot/verify-reset", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const record = otpStore[email];

    if (!record) {
      return res.status(400).json({ message: "OTP not found" });
    }

    if (Date.now() > record.expires) {
      return res.status(400).json({ message: "OTP expired" });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = newPassword;
    await user.save();

    delete otpStore[email];

    res.json({ message: "Password updated successfully" });

  } catch (error) {
    res.status(500).json({ message: "Reset failed" });
  }
});
/* Spin Reward */
app.post("/reward/spin", async (req, res) => {
  try {
    const { email } = req.body;

    const rewards = [2, 1, 2, 1, 1, 1, 2, 1, 5];
    const coins = rewards[Math.floor(Math.random() * rewards.length)];

    const user = await User.findOneAndUpdate(
      { email },
      { $inc: { coins } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      message: "Spin reward added",
      coinsAdded: coins,
      totalCoins: user.coins,
    });
  } catch (error) {
    res.status(500).json({
      message: "Spin reward error",
      error,
    });
  }
});
// const axios = require("axios");
app.post("/signup/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    const exist = await User.findOne({ email });

    if (exist) {
      return res.status(400).json({
        message: "Email already registered",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    otpStore[email] = {
      otp,
      expires: Date.now() + 5 * 60 * 1000,
    };

    await sendOTPEmail(email, otp);

    return res.json({
      success: true,
      message: "OTP sent successfully",
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
});
app.post("/referral/apply", async (req, res) => {
  try {
    const { email, referralCode } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.referredBy) {
      return res.status(400).json({
        message: "Referral already used",
      });
    }

    const refUser = await User.findOne({ referralCode });

    if (!refUser) {
      return res.status(400).json({
        message: "Invalid referral code",
      });
    }

    if (refUser.email === email) {
      return res.status(400).json({
        message: "You cannot use your own code",
      });
    }

    user.coins += 30;
    refUser.coins += 30;

    user.referredBy = referralCode;

    await user.save();
    await refUser.save();

    res.json({
      message: "Referral applied successfully. +30 Coins",
      userCoins: user.coins,
    });
  } catch (error) {
    res.status(500).json({
      message: "Referral error",
      error,
    });
  }
});

/* Withdraw */
app.post("/withdraw", async (req, res) => {
  try {
    const {
      email,
      method,
      upi,
      paypalEmail,
      coins,
    } = req.body;

    const coinValue = Number(coins);

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!coinValue || coinValue <= 0) {
      return res.status(400).json({
        message: "Enter valid coins",
      });
    }

    if (user.coins < coinValue) {
      return res.status(400).json({
        message: "Not enough coins",
      });
    }
    // Minimum withdraw limits

if (method === "upi" && coinValue < 500) {
  return res.status(400).json({
    message: "Minimum 500 coins required for UPI withdrawal",
  });
}

if (method === "paypal" && coinValue < 1000) {
  return res.status(400).json({
    message: "Minimum 1000 coins required for PayPal withdrawal",
  });
}

    if (method === "upi" && !upi) {
      return res.status(400).json({
        message: "UPI ID required",
      });
    }

    if (method === "paypal" && !paypalEmail) {
      return res.status(400).json({
        message: "PayPal Email required",
      });
    }

   const amount = coinValue / 10;

    user.coins -= coinValue;

    user.withdraws.push({
      amount,
      coins: coinValue,
      method,
      upi: method === "upi" ? upi : "",
      paypalEmail: method === "paypal" ? paypalEmail : "",
      status: "Pending",
    });

    await user.save();

    res.json({
      message: "Withdraw request submitted",
      amount,
      remainingCoins: user.coins,
    });
  } catch (error) {
    res.status(500).json({
      message: "Withdraw error",
      error,
    });
  }
});
app.get("/withdraw-history/:email", async (req, res) => {
  try {
    const user = await User.findOne({
      email: req.params.email,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json([...user.withdraws].reverse());
  } catch (error) {
    res.status(500).json({
      message: "Withdraw history error",
      error,
    });
  }
});



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});