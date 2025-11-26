
const express = require('express');
const app = express();
app.get('/', (req,res)=>res.send("Pillbox EHR Render Template"));
app.listen(10000, ()=>console.log("Server running"));
