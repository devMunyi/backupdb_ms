require('dotenv').config();
const zip = require('bestzip');
const fs = require('fs');
const schedule = require('node-schedule');
const { google } = require('googleapis');
const mysql = require('mysql2/promise');
const { exec } = require('child_process');
const moment = require('moment')

// Define the MySQL connection details
const mysqlConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.BB_PASSWORD,
  database: process.env.DB_NAME
};

const backupAndSave = async(googleDriveFolderId, filesToLeave) => {
  const timestamp = moment().format('YYYY-MM-DD-T-HH:mm:ss');
  const backupFileName = `${timestamp}.sql`;
  const zipFileName = `${backupFileName}.zip`;

  try {
    const connection = await mysql.createConnection(mysqlConfig);
    await createBackup(mysqlConfig, backupFileName);
    await zipBackup(backupFileName, zipFileName);

    const auth = await authenticateGoogle();
    const response = await uploadToGoogleDrive(zipFileName, auth, googleDriveFolderId);

    if (response.status === 200) {
      console.log('Backup file uploaded successfully');

      const driveService = google.drive({ version: 'v3', auth });
    
      await deleteGoogleDriveOldFiles(driveService, googleDriveFolderId, filesToLeave);
      await deleteLocalFile(zipFileName)
      await deleteLocalFile(backupFileName)
    }

    connection.end();
  } catch (err) {
    console.error(`Error during backup and save process: ${err}`);
  }
}

const createBackup = async (config, backupFileName) => {
  const my_command = `mysqldump --user=${config.user} --password=${config.password} ${config.database}`
  const options = {
    maxBuffer: 10 * 1024 * 1024 // Set the maxBuffer option to 10MB
  };

  return new Promise((resolve, reject) => {
    exec(
      my_command,
      options,
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          const sql = stdout.toString();
          fs.writeFileSync(backupFileName, sql);

          console.log(`Database backup created: ${backupFileName}`);
          resolve([stdout]);
        }
      }
    );
  });
};

const zipBackup = async (backupFileName, zipFileName) => {
  try {
    await zip({
      source: backupFileName,
      destination: zipFileName,
    });
    console.log(`Backup file zipped: ${zipFileName}`);
  } catch (err) {
    console.error(`Error zipping the backup file: ${err}`);
    process.exit(1);
  }
};

const authenticateGoogle = async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: `${__dirname}/service-account-key-file.json`,
    scopes: 'https://www.googleapis.com/auth/drive',
  });
  return auth;
};


const uploadToGoogleDrive = async (file, auth, googleDriveFolderId) => {
  const fileMetadata = {
    name: file,
    parents: [googleDriveFolderId],
  };

  const media = {
    mimeType: file.mimetype,
    body: fs.createReadStream(file),
  };

  const driveService = google.drive({ version: 'v3', auth });

  const response = await driveService.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id',
  });
  return response;
};


const deleteGoogleDriveOldFiles = async(driveService, googleDriveFolderId, filesToLeave) => {
  // Get the list of all files in the Google Drive folder
  const files = await driveService.files.list({
    q: `parents in '${googleDriveFolderId}'`,
    fields: 'nextPageToken, files(id, name, modifiedTime)',
  });

  // If there are more than 2/3 backup files, delete the oldest files
  if (files.data.files.length > filesToLeave) {
    // Sort the files by modifiedTime in ascending order
    const sortedFiles = files.data.files.sort((a, b) =>
      a.modifiedTime.localeCompare(b.modifiedTime)
    );

    // Delete the oldest files
    for (let i = 0; i < sortedFiles.length - filesToLeave; i++) {
      await driveService.files.delete({ fileId: sortedFiles[i].id });
      console.log(`${sortedFiles[i].name} deleted from google drive to free up space`)
    }
  }
}


const deleteLocalFile = async (filePath) => {
  await fs.promises.unlink(filePath);
  console.log(`${filePath} deleted from local computer to free up space`);
};



// Schedule the backup process every hour
// const hourlyJob = schedule.scheduleJob('0 * * * *', async () => {
//   await backupAndSave('1LmF4b9Eeebrg4rH_8t6eDBJ3QYm11-r7', 3);
// });

const minutelyJob = schedule.scheduleJob('1 * * * * *', async () => {
  console.log('----- Running Hourly Backup -----')
  await backupAndSave('1LmF4b9Eeebrg4rH_8t6eDBJ3QYm11-r7', 3);
});


// Schedule the backup process every 24 hours
// const dailyJob = schedule.scheduleJob('0 0 * * *', async () => {
//   await backupAndSave('1tXK1g-CVTH3xlT5Pi5EBtljRw5240zQN', 2);
// });

const twoMinuteJob = schedule.scheduleJob('0 */2 * * * *', async () => {
  console.log('----- Will run daily backup in a minutes time -----')
  await backupAndSave('1eLF7EUbz5jvuz34jlszDkTXa0zsWhici', 2);
});
