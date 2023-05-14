const { exec } = require('child_process');
const fs = require('fs');
const zip = require('bestzip')
const { google } = require('googleapis');
const mysql = require('mysql2/promise');

async function createBackup(config, backupFileName) {
  const my_command = `mysqldump --user=${config.user} --password=${config.password} ${config.database}`;
  const dbSizeBytes = parseInt(await getDbSizeInBytes(config), 10)
  const options = {
    maxBuffer: dbSizeBytes // Dynamically determine the maxBuffer size
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
}

// async function getMaxBuffer(config) {
//   const ONE_MB = 1024 * 1024;
//   const dbSize = await getDbSize(config);
//   const maxBuffer = Math.ceil(dbSize / ONE_MB) * ONE_MB; // Round up to nearest MB
//   console.log(`ZIDI DB current size is ${maxBuffer}`);
//   return maxBuffer;
// }

async function getDbSizeInBytes(config) {
  const connection = await mysql.createConnection(config);

  const [rows] = await connection.execute(
    `SELECT sum( data_length + index_length ) "size"
     FROM information_schema.TABLES
     WHERE table_schema = '${config.database}';`
  );

  const dbSizeBytes = rows[0].size;

  await connection.end();

  return dbSizeBytes;
}




async function zipBackup(backupFileName, zipFileName) {
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
}

async function authenticateGoogle() {
  const auth = new google.auth.GoogleAuth({
    keyFile: `${__dirname}/service-account-key-file.json`,
    scopes: "https://www.googleapis.com/auth/drive",
  });
  return auth;
}

async function uploadToGoogleDrive(file, auth, googleDriveFolderId) {
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
}


async function deleteGoogleDriveOldFiles(driveService, googleDriveFolderId, numOfFilesToLeave) {
  // Get the list of all files in the Google Drive folder
  const files = await driveService.files.list({
    q: `parents in '${googleDriveFolderId}'`,
    fields: 'nextPageToken, files(id, name, modifiedTime)',
  });

  // If there are more than 2/3 backup files, delete the oldest files
  if (files.data.files.length > numOfFilesToLeave) {
    // Sort the files by modifiedTime in ascending order
    const sortedFiles = files.data.files.sort((a, b) =>
      a.modifiedTime.localeCompare(b.modifiedTime)
    );

    // Delete the oldest files
    for (let i = 0; i < sortedFiles.length - numOfFilesToLeave; i++) {
      await driveService.files.delete({ fileId: sortedFiles[i].id });
      console.log(`${sortedFiles[i].name} deleted from google drive to free up space`)
    }
  }
}


async function deleteLocalFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
    console.log(`${filePath} deleted from local computer to free up space`);
  } catch (err) {
    // Only log an error message if an error occurs during the deletion process
    console.log(`Error deleting ${filePath}: ${err.message}`);
  }
}


module.exports = {
  createBackup,
  zipBackup,
  authenticateGoogle,
  uploadToGoogleDrive,
  deleteGoogleDriveOldFiles,
  deleteLocalFile,
  getDbSizeInBytes
};
