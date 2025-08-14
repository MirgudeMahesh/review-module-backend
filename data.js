const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const cors = require('cors');
app.use(cors());

app.use(express.json());

const pool = mysql.createPool({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "root",
  database: "pulse_new"
});

// Helper to compute average recursively
function computeAverages(node) {
  const childrenKeys = Object.keys(node.children);
  if (childrenKeys.length === 0) {
    return node.amount;
  }

  let sum = 0;
  let count = 0;

  for (const childName of childrenKeys) {
    const child = node.children[childName];
    const val = computeAverages(child);
    sum += val;
    count++;
  }

  node.amount = count > 0 ? Math.round(sum / count) : 0;
  return node.amount;
}

// GET /hierarchy/:emp
app.get('/hierarchy/:emp', async (req, res) => {
  const emp = req.params.emp;

  const query = `
    WITH RECURSIVE downline AS (
      SELECT Emp_Code, Emp_Name, Role, Reporting_Manager, Territory
      FROM Employee_Details
      WHERE Emp_Name = ?

      UNION ALL

      SELECT e.Emp_Code, e.Emp_Name, e.Role, e.Reporting_Manager, e.Territory
      FROM Employee_Details e
      JOIN downline d ON e.Reporting_Manager_Code = d.Emp_Code
    )
    SELECT d.Emp_Name, d.Reporting_Manager, d.Role, d.Territory,
           IFNULL(c.Coverage, 0) AS amount
    FROM downline d
    LEFT JOIN Coverage_Details c ON d.Emp_Code = c.Emp_Code;
  `;

  try {
    const [rows] = await pool.query(query, [emp]);

    const map = {}, root = {};

    rows.forEach(r => {
      const amount = r.Role === 'BE' ? r.amount : 0;
      map[r.Emp_Name] = {
        amount,
        territory: r.Territory || null,
        role: r.Role || null,
        children: {}
      };
    });

    rows.forEach(r => {
      if (r.Emp_Name === emp) {
        root[r.Emp_Name] = map[r.Emp_Name];
      } else if (map[r.Reporting_Manager]) {
        map[r.Reporting_Manager].children[r.Emp_Name] = map[r.Emp_Name];
      }
    });

    // Recursively compute average amounts
    for (const top in root) {
      computeAverages(root[top]);
    }

    res.json(root);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});


app.get('/employees', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT Emp_Name AS name, Role, Emp_Code, Territory 
      FROM Employee_Details 
     
      ORDER BY Emp_Name
    `);
    res.json(rows);
    
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});
/*adding commitments*/
app.post('/putData', async (req, res) => {
  try {
    const dataToInsert = req.body;
    const dataArray = Array.isArray(dataToInsert) ? dataToInsert : [dataToInsert];

    if (dataArray.length === 0) {
      return res.status(400).send('No data received');
    }

    const values = dataArray.map(row => [
      row.metric,
      row.sender,
      row.sender_code,
      row.sender_territory,
      row.receiver,
      row.receiver_code,
      row.receiver_territory,
      row.goal,
      row.received_date,
      row.goal_date,
      row.receiver_commit_date || null,
      row.commitment
    ]);

    const query = `
      INSERT INTO commitments (
        metric,
        sender,
        sender_code,
        sender_territory,
        receiver,
        receiver_code,
        receiver_territory,
        goal,
        received_date,
        goal_date,
        receiver_commit_date,
        commitment
      ) VALUES ?`;

    // ✅ Use await instead of callback
    const [result] = await pool.query(query, [values]);

    console.log('hello'); // ✅ Now this will print
    return res.status(201).send('success');
    
  } catch (err) {
    console.log('hello1'); // ✅ Now this will print if error
    return res.status(500).send('Internal Server Error');
  }
});
app.post('/putEscalations', async (req, res) => {
  try {
    const dataToInsert = req.body;
    const dataArray = Array.isArray(dataToInsert) ? dataToInsert : [dataToInsert];

    if (dataArray.length === 0) {
      return res.status(400).send('No data received');
    }

    // Map incoming JSON to match table columns
    const values = dataArray.map(row => [
      row.metric,
      row.message,
      row.role,
      row.employee_name,
      row.territory_code,
      row.employee_code,
      row.entry_date
    ]);

    const query = `
      INSERT INTO escalations (
        metric,
        message,
        role,
        employee_name,
        territory_code,
        employee_code,
        entry_date
      ) VALUES ?`;

    const [result] = await pool.query(query, [values]);

    console.log('✅ Escalations inserted successfully');
    return res.status(201).send('success');

  } catch (err) {
    console.error('❌ Error inserting escalations:', err);
    return res.status(500).send('Internal Server Error');
  }
});

app.get('/getData/:receiver_territory', async (req, res) => {
  try {
    const { receiver_territory } = req.params;

    if (!receiver_territory) {
      return res.status(400).send('receiver_territory is required');
    }

    const query = `
      SELECT 
        metric,
        sender,
        sender_code,
        sender_territory,
        receiver,
        receiver_code,
        receiver_territory,
        goal,
        received_date,
        goal_date,
        receiver_commit_date,
        commitment
      FROM commitments
      WHERE receiver_territory = ?
    `;

    const [rows] = await pool.query(query, [receiver_territory]);

    if (rows.length === 0) {
      return res.status(404).send('No data found for this territory');
    }

    return res.status(200).json(rows);

  } catch (err) {
    console.error('Error fetching data:', err);
    return res.status(500).send('Internal Server Error');
  }
});



// Update receiver_commit_date
app.put('/updateReceiverCommitDate', async (req, res) => {
  try {
    const {
      metric,
      sender_code,
      receiver_code,
      receiver_commit_date
    } = req.body;

    if (!metric || !sender_code || !receiver_code || !receiver_commit_date) {
      return res.status(400).send('metric, sender_code, receiver_code, and receiver_commit_date are required');
    }

    const query = `
      UPDATE commitments
      SET receiver_commit_date = ?
      WHERE metric = ? AND sender_code = ? AND receiver_code = ?
    `;

    const [result] = await pool.query(query, [
      receiver_commit_date,
      metric,
      sender_code,
      receiver_code
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).send('No matching commitment found');
    }

    res.status(200).send('Date updated successfully');
  } catch (err) {
    console.error('Error updating date:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post("/addEscalation", async (req, res) => {
  try {
    const {
      metric,
      sender,
      sender_code,
      sender_territory,
      from,
      to,
      received_date,
      goal_date,
      message
    } = req.body;

    // Validate required fields
    if (
      !metric ||
      !sender ||
      !sender_code ||
      !sender_territory ||
      from === undefined ||
      to === undefined ||
      !received_date ||
      !goal_date
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Insert into DB
    const query = `
      INSERT INTO disclosures
      (metric, sender, sender_code, sender_territory, \`from\`, \`to\`, received_date, goal_date, message) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      metric,
      sender,
      sender_code,
      sender_territory,
      from,
      to,
      received_date,
      goal_date,
      message || null
    ];

    await pool.query(query, values);

    res.status(201).json({ message: "Commitment added successfully" });
  } catch (error) {
    console.error("Error inserting data:", error);
    res.status(500).json({ error: "Database error" });
  }
});

app.post('/putInfo', async (req, res) => {
  try {
    const dataToInsert = req.body;

    // Ensure data is always an array
    const dataArray = Array.isArray(dataToInsert) ? dataToInsert : [dataToInsert];

    // Validate empty input
    if (dataArray.length === 0) {
      return res.status(400).send('No data received');
    }

    // Map request data to match table columns
    const values = dataArray.map(row => [
      row.sender,
      row.sender_code,
      row.sender_territory,
      row.receiver,
      row.receiver_code,
      row.receiver_territory,
      row.received_date,
      row.message
    ]);

    const query = `
      INSERT INTO information (
        sender,
        sender_code,
        sender_territory,
        receiver,
        receiver_code,
        receiver_territory,
        received_date,
        message
      ) VALUES ?`;

    // Execute query
    const [result] = await pool.query(query, [values]);

    console.log('✅ Data inserted into information table');
    return res.status(201).send('success');
    
  } catch (err) {
    console.error('❌ Error inserting into information table:', err);
    return res.status(500).send('Internal Server Error');
  }
});


app.listen(8000, () => console.log("Server running on port 8000"));
