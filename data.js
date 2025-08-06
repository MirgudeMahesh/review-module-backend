const express = require('express');
const mysql   = require('mysql2/promise');
const app     = express();
const cors    = require('cors');
app.use(cors());  
const pool = mysql.createPool({
  host: "192.168.0.243",
  user: "repforce1",
  password: "Nhu@45TreQ",
  database: "pulse_new"
});

// GET /hierarchy/BM3
app.get('/hierarchy/:emp', async (req,res)=>{
  const emp = req.params.emp;

  const query = `
    WITH RECURSIVE downline AS (
      SELECT Emp_Name, Reporting_Manager
      FROM Employee_Details
      WHERE Emp_Name = ?

      UNION ALL

      SELECT e.Emp_Name, e.Reporting_Manager
      FROM Employee_Details e
      JOIN downline d ON e.Reporting_Manager = d.Emp_Name
    )
    SELECT * FROM downline;
  `;

  try{
    const [rows] = await pool.query(query,[emp]);

    // build nested object
    const map={}, root={};
    rows.forEach(r=>{
      map[r.Emp_Name] = { amount: Math.floor(Math.random()*100), children:{} };
    });
    rows.forEach(r=>{
      if(r.Emp_Name===emp){
        root[r.Emp_Name] = map[r.Emp_Name];
      }
      else if(map[r.Reporting_Manager]){
        map[r.Reporting_Manager].children[r.Emp_Name] = map[r.Emp_Name];
      }
    });

    res.json(root);
  }catch(err){
    console.error(err);
    res.status(500).send("Error");
  }
});

app.get('/employees', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT Emp_Name AS name
      FROM Employee_Details
      WHERE Role <> 'BE'
      order BY Emp_Name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

app.listen(8000,()=>console.log("Server running on port 8000"));
