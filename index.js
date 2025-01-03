const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");


require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database("HRMdb.db", (err) => {
    if (err) {
        console.error("Failed to connect to the database");
    } else {
        console.log("Connected to HRMdb successfully");

        db.run(`
            CREATE TABLE IF NOT EXISTS Employee (
                EmpolyeeID INTEGER PRIMARY KEY AUTOINCREMENT,
                FullName TEXT NOT NULL,
                WorkEmail TEXT NOT NULL,
                Company TEXT NOT NULL,
                DateOfBirth DATE,
                Country TEXT NOT NULL,
                About_Yourself TEXT NOT NULL,
                Password TEXT NOT NULL
            )
        `);
    }
});

// Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Generate a random password
const generateRandomPassword = () => {
    return Math.random().toString(36).slice(-8); // 8-character random password
};

//middleware 
const authenticatetoken = (req, res, next) => {
    const autheader = req.headers['authorization'];
    const token = autheader && autheader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token.' });
        }
        req.user = user;
        next();
    });
};

//End API Signup



app.post("/signup", async (req, res) => {
    const { fullname, email, company, dateofbirth, country, Aboutyourself } = req.body;

    if (!fullname || !email || !company || !dateofbirth || !country || !Aboutyourself) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const randomPassword = generateRandomPassword();

    try {
        const hashedPassword = await bcrypt.hash(randomPassword, 8);

        const insertQuery = `INSERT INTO Employee (FullName, WorkEmail, Company, DateOfBirth, Country, About_Yourself, Password) VALUES (?, ?, ?, ?, ?, ?, ?)`;

        db.run(insertQuery, [fullname, email, company, dateofbirth, country, Aboutyourself, hashedPassword], async function (err) {
            if (err) {
                console.error("Database insertion error:", err);
                return res.status(500).json({ message: "Error during signup" });
            }

            // Send Email
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Welcome to HRM platform",
                //message to be send
                text: `Dear ${fullname},

Welcome to the HRM Platform! We are excited to have you on board.

Here are your login details:
Username: ${email}
System Generated Password: ${randomPassword}
Please log in and change your password as soon as possible.

Best regards,  
The HRM Platform `,
            };

            try {
                const info = await transporter.sendMail(mailOptions);
                console.log("Email sent successfully:", info.response);
                res.status(201).json({ message: "Signup successful, email sent!" });
            } catch (emailError) {
                console.error("Error sending email:", emailError);
                res.status(500).json({ message: "Signup successful, but email sending failed" });
            }
        });
    } catch (hashError) {
        console.error("Error hashing password:", hashError);
        res.status(500).json({ message: "Error during signup" });
    }
});


app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    try {
        const query = `SELECT * FROM Employee WHERE WorkEmail = ?`;
        db.get(query, [email], async (err, user) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ message: "Internal server error" });
            }

            if (!user) {
                return res.status(401).json({ message: "Invalid email or password" });
            }

            const isPasswordValid = await bcrypt.compare(password, user.Password);
            if (!isPasswordValid) {
                return res.status(401).json({ message: "Invalid email or password" });
            }

            //Login Successfull mesage

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Login Successful to HRM Platform",
                // Message to be sent
                text: `Dear Empolyee,
            
We are pleased to inform you that your login to the HRM Platform was successful.
            
If this login was not performed by you, please reset your password immediately or contact support .
            
Best regards,  
The HRM Platform `,
            };
            
            try {
                const info = await transporter.sendMail(mailOptions);
                console.log("Email sent successfully:", info.response);
                const token = jwt.sign(
                    { id: user.EmployeeID, email: user.WorkEmail },
                    process.env.JWT_SECRET,
                    { expiresIn: "1h" }
                );
            
                return res.status(200).json({
                    message: "Login successful",
                    token: token,
                    user: {id: user.EmployeeID,fullname: user.FullName,email: user.WorkEmail,company: user.Company,
                    },
                });
            } catch (emailError) {
                console.error("Error sending email:", emailError);
                res.status(500).json({ message: "Login successful, but email sending failed." });
            }
            
        });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/employee", authenticatetoken, (req, res) => {
    const userId = req.user.email; 
    console.log(userId) 

    const query = `SELECT * FROM Employee WHERE WorkEmail = ?`;

    db.get(query, [userId  ], (err, row) => {
        if (err) {
            console.error("Database retrieval error:", err);
            return res.status(500).json({ message: "Error fetching employee data" });
        }

        if (!row) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.status(200).json({ employee: row });
    });
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
