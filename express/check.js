const express = require('express');
const { SerialPort, ReadlineParser } = require('serialport');

const app = express();
const port = 3000;

const serialPort = new SerialPort({
  path: 'COM3', // Replace with your actual COM port
  baudRate: 9600,
  autoOpen: false // Do not open immediately
});

// Check if COM3 is available and not in use
serialPort.open((err) => {
  if (err) {
    if (err.message.includes('Access denied')) {
      console.error('COM3 is in use by another application.');
    } else {
      console.error('Error opening port: ', err.message);
    }
    return;
  }
  console.log('Serial Port Opened');

  const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

  parser.on('data', data => {
    console.log('Received data:', data);
  });

  app.get('/', (req, res) => {
    res.send('Serial Port Communication with Express');
  });

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });

  serialPort.on('error', (err) => {
    console.error('Error: ', err.message);
  });
});
