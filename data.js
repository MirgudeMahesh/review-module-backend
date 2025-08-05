const express = require('express');
const app = express();
const cors=require('cors');
app.use(express.json());
app.use(cors())
const employees = require("./employees.json");

app.get('/', (req, res) => {
  res.send('Hello World!!!');
});
app.get("/employees", (req, res) => {
  res.json(employees);
});

const port = 8000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`); 
});