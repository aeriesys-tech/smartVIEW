const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./database');
const XLSX = require('xlsx');
const { exec } = require('child_process');
const { SerialPort, ReadlineParser } = require('serialport');

const app = express();
const port = 3000;
const imagesDir = path.join(__dirname, '../../stitched_images');
const uploadsDir = path.join(__dirname, '../../qc_images');
const distDir = path.join(__dirname, '../vue', 'dist');
const calWidthDir = path.join("C:/Users/Admin/Desktop/AKXA_width_calculate.bat.lnk");

app.use(cors());
app.use(bodyParser.json());
app.use('/images', express.static(imagesDir));
app.use(express.static(distDir));

// API endpoint to get the next image
app.get('/api/next-image', (req, res) => {
  fs.readdir(imagesDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read images directory' });
    }
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif)$/.test(file) && file.includes('DEFECT'));
    if (imageFiles.length === 0) {
      return res.json(null);
    }
    res.json(imageFiles[0]); // Return the first image containing 'DEFECT' in its name
  });
});

// API endpoint to tag and move the image
app.post('/api/tag-image', (req, res) => {
  const { image, dateTime, batchNo, feedback, severity, remark, type } = req.body;

  // Extract file name and extension
  const ext = path.extname(image);
  const baseName = path.basename(image, ext);

  // Create new file name with QC-Checked appended
  const newFileName = `${baseName}-QC-Checked${ext}`;
  const oldPath = path.join(imagesDir, image);
  const newPath = path.join(uploadsDir, newFileName);

  console.log(`Moving file from ${oldPath} to ${newPath}`);

  fs.rename(oldPath, newPath, (err) => {
    if (err) {
      console.error('Failed to move image:', err);
      return res.status(500).json({ error: 'Failed to move image' });
    }

    // Insert the image info into the database
    db.run(`INSERT INTO images (original_name, tagged_name, date_time, batch_no, feedback, severity, remark, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
      [image, newFileName, dateTime, batchNo, feedback, severity, remark, type], (err) => {
      if (err) {
        console.error('Failed to insert image info into database:', err);
        return res.status(500).json({ error: 'Failed to insert image info into database' });
      }
      res.json({ success: true });
    });
  });
});

// API endpoint to download database as Excel file
app.get('/api/download-excel', (req, res) => {
  db.all("SELECT * FROM images", (err, rows) => {
    if (err) {
      console.error('Failed to retrieve data from database:', err);
      return res.status(500).json({ error: 'Failed to retrieve data from database' });
    }

    // Create a new workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Append worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Images');

    // Write workbook to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Generate file name with current time
    const now = new Date();
    const fileName = `images_${now.toISOString().replace(/[:.]/g, '-')}.xlsx`;

    // Send buffer as file
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  });
});

app.post('/api/calculateWidth', (req, res) => {
  let filePath = "C:/Users/Admin/Desktop/satwik/Width_calculation_by_SEG/thickness.txt";
  fs.writeFile(filePath, req.body.thickness, 'utf8', (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to write to file', details: err.message });
    }
  });
  exec(calWidthDir, (error, stdout, stderr) => {
      if (error) {
          console.error(`Error executing bat file: ${error}`);
          return res.status(500).send(`Error: ${error.message}`);
      }
      if (stderr) {
          console.error(`Standard error: ${stderr}`);
          return res.status(500).send(`Stderr: ${stderr}`);
      }
      console.log(`Standard output: ${stdout}`);
      res.send(`Standard output: ${stdout}`);
  });
});

let serialPort;
let parser;
let latestData = '';

const openSerialPort = (callback) => {
  if (!serialPort || !serialPort.isOpen) {
    serialPort = new SerialPort({
      path: 'COM3', // Replace with your actual COM port
      baudRate: 9600,
      autoOpen: false // Do not open immediately
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    serialPort.open((err) => {
      if (err) {
        console.error('Error opening port: ', err.message);
        latestData = `Error opening port: ${err.message}`;
        callback && callback(err.message);
        return;
      }
      console.log('Serial Port Opened');
      latestData = 'Serial Port Opened';
      callback && callback(null, 'Serial Port Opened');
    });

    parser.on('data', data => {
      console.log('Received data:', data);
      latestData = data;
    });

    serialPort.on('error', (err) => {
      console.error('Error: ', err.message);
      latestData = `Error: ${err.message}`;
    });
  } else {
    console.log('Serial Port is already open');
    latestData = 'Serial Port is already open';
    callback && callback(null, 'Serial Port is already open');
  }
};

const closeSerialPort = (callback) => {
  if (serialPort && serialPort.isOpen) {
    serialPort.close((err) => {
      if (err) {
        console.error('Error closing port: ', err.message);
        latestData = `Error closing port: ${err.message}`;
        callback && callback(err.message);
        return;
      }
      console.log('Serial Port Closed');
      latestData = 'Serial Port Closed';
      callback && callback(null, 'Serial Port Closed');
    });
  } else {
    console.log('Serial Port is already closed');
    latestData = 'Serial Port is already closed';
    callback && callback(null, 'Serial Port is already closed');
  }
};

// app.get('/api/calculateLength', (req, res) => {
//   if (latestData === '') {
//     res.json({ data: 'Data not found' });
//   } else {
//     res.json({ data: latestData });
//   }
// });

// app.get('/api/calculateLength', (req, res) => {
//   const command = "python3 C:/Users/Admin/Desktop/satwik/Width_calculation_by_SEG/length_check.py";
//   //const command = "conda activate seg_3 && python C:/Users/Admin/Desktop/satwik/Width_calculation_by_SEG/length_check.py"
//   exec(command, (error, stdout, stderr) => {
//     if (error) {
//       return res.status(500).json({ error: 'Failed to execute Python script', details: stderr });
//     }
//     res.status(200).json({ data: stdout.trim() });
//   });
// });

app.post('/api/calculateLength', (req, res) => {
  let filePath = "C:/Users/Admin/Desktop/satwik/Width_calculation_by_SEG/thickness.txt";
  fs.writeFile(filePath, req.body.thickness, 'utf8', (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to write to file', details: err.message });
    }
  });

  const command = "python3 C:/Users/Admin/Desktop/satwik/Width_calculation_by_SEG/length_check.py";
  //const command = "conda activate seg_3 && python C:/Users/Admin/Desktop/satwik/Width_calculation_by_SEG/length_check.py"
  exec(command, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: 'Failed to execute Python script', details: stderr });
    }
    res.status(200).json({ data: stdout.trim() });
  });
});


app.get('/api/toggleConnection', (req, res) => {
  if (serialPort && serialPort.isOpen) {
    closeSerialPort((err, message) => {
      res.json({ data: message || latestData });
    });
  } else {
    openSerialPort((err, message) => {
      res.json({ data: message || latestData });
    });
  }
});

// Serve the Vue app
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
