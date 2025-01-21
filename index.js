const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");


require("dotenv").config();

const app = express();
const PORT = process.env.PORT;

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
                FullName VARCHAR(24) NOT NULL,
                WorkEmail VARCHAR(32) UNIQUE NOT NULL,
                Company VARCHAR NOT NULL,
                Gender VARCHAR NOT NULL,
                DateOfBirth DATE ,
                Country TEXT NOT NULL,
                About_Yourself TEXT NOT NULL,
                Password UNIQUE NOT NULL
            )

        `);
        db.run(`CREATE TABLE IF NOT EXISTS AttendanceLog (
            AttendanceLogID INTEGER PRIMARY KEY AUTOINCREMENT,
            WorkEmail VARCHAR(32) NOT NULL,
            Logdate DATE NOT NULL,
            LogTime TIME NOT NULL,
            EffectiveHours TEXT NOT NULL,
            GrossHours TEXT NOT NULL,
            ArrivalStatus TEXT NOT NULL,
            LeaveStatus TEXT NOT NULL,
            Logstatus TEXT NOT NUll,
            FOREIGN KEY (WorkEmail) REFERENCES Employee(WorkEmail)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS Events(
            EventsID INTEGER PRIMARY KEY AUTOINCREMENT,
            WorkEmail VARCHAR(32) NOT NULL,
            title VARCHAR(32) NOT NULL,
            Date DATE NOT NULL,
            StartTime TIME NOT NULL,
            EndTime TIME NOT NULL,
            eventType TEXT NOT NULL,
            FOREIGN KEY (WorkEmail) REFERENCES Employee(WorkEmail)
            )`)

        
    }
    
});
db.run('PRAGMA foreign_keys = ON',) // forgin key ON

//mail transport and service,user and passkey used from env file
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// random password genterator
const generateRandomPassword = () => {
    return Math.random().toString(36).slice(-8); 
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

//signup API
app.post("/signup", async (req, res) => {
    const { fullname, email, company,gender,dateofbirth, country, Aboutyourself } = req.body;

    if (!fullname || !email || !company || !gender || !dateofbirth || !country || !Aboutyourself) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const randomPassword = generateRandomPassword();

    try {
        const hashedPassword = await bcrypt.hash(randomPassword, 8);

        const insertQuery = `INSERT INTO Employee (FullName, WorkEmail, Company,Gender, DateOfBirth, Country, About_Yourself, Password) VALUES (?, ?, ?,?,?, ?, ?, ?)`;

        db.run(insertQuery, [fullname, email, company,gender, dateofbirth, country, Aboutyourself, hashedPassword], async function (err) {
            if (err) {
                console.error("Database insertion error:", err);
                return res.status(500).json({ message: "Error during signup" });
            }

            // Send Email
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Welcome to HRM platform",
                //message 
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

// login API
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


            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Login Successful to HRM Platform",
                text: `Dear Empolyee,
            
We are pleased to inform you that your login to the HRM Platform was successful.
            
If this login was not performed by you, please reset your password immediately or contact support .
            
Best regards,  
The HRM Platform `,
            };
            
            try {
                const info = await transporter.sendMail(mailOptions);
            
                const currentTimeandDate = new Date();
                const currentDate = currentTimeandDate.toLocaleDateString();
                
                const currentHours = currentTimeandDate.getHours();
                const currentMinutes = currentTimeandDate.getMinutes();
                
                const onTimeStartHours = 9;  // inital time with minutes
                const onTimeStartMinutes = 0;
                
                const lateCutoffHours = 9;  // late time cutoff begin from 9:1am to 9:30am
                const lateCutoffMinutes =30;
                
                const endOfDayHours = 18; // endday by 6:pm 
                const endOfDayMinutes = 0;
                
                let EffectiveHours = "";
                let GrossHours = "";
                let ArrivalStatus = "";
                let LeaveStatus = "";
                let Log = "";
                
                if (currentHours === onTimeStartHours && currentMinutes === onTimeStartMinutes) {
                    ArrivalStatus = "On Time";
                    LeaveStatus = "No";
                    EffectiveHours = "9:00 Hrs";
                    GrossHours = "9:00 Hrs";  // condition for ontime
                    Log = 'Yes';
                } 
                else if (
                    (currentHours < onTimeStartHours) || 
                    (currentHours === endOfDayHours && currentMinutes >= endOfDayMinutes) || 
                    currentHours > endOfDayHours
                ) {  
                    ArrivalStatus = "-";
                    LeaveStatus = "Yes";
                    EffectiveHours = "0:00 Hrs";
                    GrossHours = "0:00 Hrs";  //condition for Earlyhrs
                    Log = 'EL';
                } 
                else if (
                    (currentHours > onTimeStartHours || 
                    (currentHours === onTimeStartHours && currentMinutes > onTimeStartMinutes)) &&
                    (currentHours < lateCutoffHours || 
                    (currentHours === lateCutoffHours && currentMinutes <= lateCutoffMinutes))
                ) {
                    const minutesLate = (currentHours - onTimeStartHours) * 60 + (currentMinutes - onTimeStartMinutes);
                    ArrivalStatus = `${minutesLate} minute late`;
                    LeaveStatus = "No";
                    EffectiveHours = "9:00 Hrs";
                    GrossHours = "9:00 Hrs";  // condition for late
                    Log = 'No';
                } 
                else {
                    ArrivalStatus = "-"; 
                    LeaveStatus = 'No';
                    EffectiveHours = "0:00 Hrs"; 
                    GrossHours = "0:00 Hrs";  // condtion for Working hours
                    Log = "WH";
                }
                

                const insertQuery = `INSERT INTO AttendanceLog(WorkEmail,LogDate,LogTime,EffectiveHours,GrossHours,ArrivalStatus,LeaveStatus,Logstatus) VALUES (?,?,?,?,?,?,?,?)`;

                db.run(insertQuery,[email,currentDate,currentTimeandDate.toLocaleTimeString(),EffectiveHours,GrossHours,ArrivalStatus,LeaveStatus,Log])
            
                const token = jwt.sign(
                    {
                        id: user.EmployeeID,
                        email: user.WorkEmail,
                        issuedAt: {logDate:currentDate,logTime:currentTimeandDate.getTime()},
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: "1h" }
                );

                //Just for attendance status while login to send response
                let attendanceStatus = ""
                if(ArrivalStatus === '-' && LeaveStatus === 'No'){
                    attendanceStatus = "WH"
                }else if (ArrivalStatus === "-" && LeaveStatus === 'Yes'){
                    attendanceStatus = "EL"
                }else if(ArrivalStatus === 'On Time' && LeaveStatus === 'No' ){
                    attendanceStatus = "Ontime"
                }else{
                    attendanceStatus = `Late by mintue ${ArrivalStatus}`
                }
            
                return res.status(200).json({
                    message: "Login successful",
                    token: token,
                    loginDateTime: {logDate:currentDate,logTime:currentTimeandDate.toLocaleTimeString()},
                    attendanceStatus,
                    user: {
                        fullname: user.FullName,
                        email: user.WorkEmail,
                        company: user.Company
                    }
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

//attendance log fetch

app.get('/attendancelog',authenticatetoken,(req,res) =>{
    const usermail = req.user.email;
    const query = `SELECT * FROM AttendanceLog WHERE WorkEmail = ? ORDER BY AttendanceLogID DESC `;

    db.all(query,[usermail],(err,row) =>{
        if(err){
            return res.status(500).json({ message: "Error fetching attendance data" });
        }
        res.status(200).json({ attendanceLogStatus: row });

    })

})

//Fetch employee using middleware auth
app.get("/employee", authenticatetoken, (req, res) => {
    const usermail = req.user.email; 
    const query = `SELECT * FROM Employee WHERE WorkEmail = ?`;

    db.get(query, [usermail], (err, row) => {
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


app.post("/events", authenticatetoken, (req, res) => {
    const { title, date, startTime, endTime, type } = req.body;
    const usermail = req.user.email
    if (!usermail ||!title || !date || !startTime || !endTime || !type) {
        return res.status(400).json({ error: "All fields are required" });
    }

    const query = `INSERT INTO Events(WorkEmail,title, Date, startTime, EndTime, eventType) VALUES (?, ?, ?, ?, ?,?)`;
    db.run(query, [usermail,title, date, startTime, endTime, type], function (err) {
        if (err) {
            console.error("Database insertion error:", err.message);
            return res.status(500).json({ error: "Error while inserting event" });
        }

        return res.status(201).json({ message: "Event successfully inserted",});
    });
});

app.get('/events',authenticatetoken,(req,res) =>{
    const usermail = req.user.email 
    console.log(usermail)
    const query = `SELECT * FROM Events WHERE WorkEmail = ?`

    db.all(query,[usermail],(err,rows) =>{
        if(err){
            return res.status(500).json({error:"Error While Fetch event"})
        }
        return res.status(200).json({events:rows})
    })

})



app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
