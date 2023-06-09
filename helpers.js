const { exec } = require("child_process");
const fs = require("fs");
const { google } = require("googleapis");
const { createReadStream } = require("fs");
const archiver = require('archiver');
const util = require('util');

async function createBackup(config, backupFileName) {
  const { host, user, password, database } = config;
  const my_command = `mysqldump --host=${host} --port=3306 --user=${user} --password='${password ?? 'Dev_Sam_2023'}' ${database} > ${backupFileName}`;

  const execPromise = util.promisify(exec);

  try {
    const { stdout } = await execPromise(my_command, { maxBuffer: Infinity });

    console.log(`DUMPING FILE REPONSE => ${stdout}`);
    return stdout;
  } catch (error) {
    throw error;
  }
}

async function zipBackup(backupFileName, zipFileName) {
  try {
    const output = fs.createWriteStream(zipFileName);
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Adjust the compression level as needed (0-9, 0 being no compression, 9 being maximum compression)
    });

    output.on('close', () => {
      console.log(`Backup file ${backupFileName} successfully compressed to ${zipFileName}`);
    });

    archive.pipe(output);
    archive.file(backupFileName, { name: 'backup.sql' }); // Add the SQL file to the archive with a desired name

    await archive.finalize();
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

async function uploadToGoogleDrive(zipFileName, auth, googleDriveFolderId) {
  const driveService = google.drive({ version: "v3", auth });
  const fileMetadata = {
    name: zipFileName,
    parents: [googleDriveFolderId],
  };
  const media = {
    mimeType: "application/zip",
    body: createReadStream(zipFileName),
    chunkSize: 50 * 1024 * 1024, // Set chunk size to 10MB
    supportsAllDrives: true,
  };

  const response = await driveService.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id",
  });

  return response;
}

async function deleteGoogleDriveOldFiles(
  driveService,
  googleDriveFolderId,
  numOfFilesToLeave
) {
  // Get the list of all files in the Google Drive folder
  const files = await driveService.files.list({
    q: `parents in '${googleDriveFolderId}'`,
    fields: "nextPageToken, files(id, name, modifiedTime)",
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
      console.log(
        `${sortedFiles[i].name} deleted from google drive to free up space`
      );
    }
  }
}

async function deleteLocalFiles(filePaths) {
  try {
    const deletionPromises = filePaths.map(async (filePath) => {
      await fs.promises.unlink(filePath);
      console.log(`${filePath} deleted from local computer to free up space`);
    });
    await Promise.all(deletionPromises);
  } catch (err) {
    console.log(`Error deleting files: ${err.message}`);
  }
}

async function backupDBV1(
  config,
  backupFileName,
  zipFileName,
  googleDriveFolderId,
  numOfFilesToLeave
) {
  try {
    await createBackup(config, backupFileName);
    console.log(`Database backup created: ${backupFileName}`);

    await zipBackup(backupFileName, zipFileName);
    console.log(`Backup file zipped: ${zipFileName}`);

    const auth = await authenticateGoogle();
    const driveService = google.drive({ version: "v3", auth });
    await uploadToGoogleDrive(backupFileName, auth, googleDriveFolderId);
    console.log(`Backup file uploaded to Google Drive`);

    await deleteGoogleDriveOldFiles(
      driveService,
      googleDriveFolderId,
      numOfFilesToLeave
    );
    console.log(`Old backup files deleted from Google Drive`);

    const filesToDeleteLocally = [backupFileName, zipFileName];
    await deleteLocalFiles(filesToDeleteLocally);

    console.log(`Backup process completed successfully`);
    return { status: "ok", code: 200 };
  } catch (error) {
    console.error(`Error during backup and upload process: ${error}`);
    return { status: "Failed", code: 500 };
  }
}

async function backupDBV2(
  backupFileName,
  zipFileName,
  googleDriveFolderId,
  numOfFilesToLeave
) {
  try {
    await zipBackup(backupFileName, zipFileName);
    console.log(`Backup file zipped: ${zipFileName}`);

    const auth = await authenticateGoogle();
    const driveService = google.drive({ version: "v3", auth });
    await uploadToGoogleDrive(backupFileName, auth, googleDriveFolderId);
    console.log(`Backup file uploaded to Google Drive`);

    await deleteGoogleDriveOldFiles(
      driveService,
      googleDriveFolderId,
      numOfFilesToLeave
    );
    console.log(`Old backup files deleted from Google Drive`);

    const filesToDeleteLocally = [backupFileName, zipFileName];
    await deleteLocalFiles(filesToDeleteLocally);

    console.log(`Backup process completed successfully`);
    return { status: "ok", code: 200 };
  } catch (error) {
    console.error(`Error during backup and upload process: ${error}`);
    return { status: "Failed", code: 500 };
  }
}

module.exports = {
  backupDBV1
};
