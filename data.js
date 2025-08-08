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
      WHERE Role <> 'BE' 
      ORDER BY Emp_Name
    `);
    res.json(rows);
    
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

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





app.listen(8000, () => console.log("Server running on port 8000"));
