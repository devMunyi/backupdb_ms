const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

console.log(`Number of CPUs: ${numCPUs}`)

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  const express = require('express');
  const { google } = require('googleapis');
  const mysql = require('mysql2/promise');
  const moment = require('moment');
  const morgan = require('morgan');
  const cors = require('cors');
  const {
    createBackup,
    zipBackup,
    authenticateGoogle,
    uploadToGoogleDrive,
    deleteGoogleDriveOldFiles,
    deleteLocalFile,
  } = require('./oldHelpers');

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  app.get('/backup', async (req, res) => {
    const {
      serverAddress,
      dbName,
      dbUsername,
      dbPassword,
      googleDriveFolderId,
      numOfFilesToLeave,
    } = req.query;

    if (
      serverAddress &&
      dbName &&
      dbUsername &&
      googleDriveFolderId &&
      numOfFilesToLeave
    ) {
    } else {
      return res.status(400).send('Bad request');
    }

    const mysqlConfig = {
      host: serverAddress,
      user: dbUsername,
      password: dbPassword,
      database: dbName,
    };

    try {

      const timestamp = moment().format('YYYY-MM-DD-T-HH:mm:ss');
      const backupFileName = `${dbName}_${timestamp}.sql`;
      const zipFileName = `${backupFileName}.zip`;

      const connection = await mysql.createConnection(mysqlConfig);
      await createBackup(mysqlConfig, backupFileName);
      await zipBackup(backupFileName, zipFileName);

      const auth = await authenticateGoogle();
      const response = await uploadToGoogleDrive(
        zipFileName,
        auth,
        googleDriveFolderId
      );

      if (response.status === 200) {
        const driveService = google.drive({ version: 'v3', auth });

        await deleteGoogleDriveOldFiles(
          driveService,
          googleDriveFolderId,
          numOfFilesToLeave
        );
        await deleteLocalFile(zipFileName);
        await deleteLocalFile(backupFileName);

        res.status(200).send('Backup created successfully');
      }

      connection.end();
    } catch (err) {
      console.error(`Error during backup process: ${err}`);
      res.status(500).send(`Backup failed. Error: ${err.message}`);
    }
  });

  const port = 8000 || process.env.PORT;
  app.listen(port, () => console.log(`Worker ${cluster.worker.id} up and running on port ${port}`));
}
