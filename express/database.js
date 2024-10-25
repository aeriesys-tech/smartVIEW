const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'images.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT,
    tagged_name TEXT,
    date_time TEXT,
    batch_no TEXT,
    feedback TEXT,
    severity TEXT,
    type TEXT,
    remark TEXT
  )`);
});

module.exports = db;
