const { promisify } = require('util');
const moment = require('moment');
const mysql = require('mysql');
const archiver = require('archiver');
const { google } = require('googleapis');
const { authenticateGoogle, uploadToGoogleDrive, deleteGoogleDriveOldFiles } = require('./googleDriveUtils');
const { deleteLocalFile } = require('./fileUtils');

const createBackup = async (mysqlConfig, backupFileName) => {
    const backupCommand = `mysqldump -h ${mysqlConfig.host} -u ${mysqlConfig.user} -p${mysqlConfig.password} ${mysqlConfig.database} > ${backupFileName}`;
    const exec = promisify(require('child_process').exec);
    await exec(backupCommand);
};

const createZipFile = async (backupFileName, zipFileName) => {
    const output = require('fs').createWriteStream(zipFileName);
    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    archive.pipe(output);
    archive.append(require('fs').createReadStream(backupFileName), { name: backupFileName });
    await archive.finalize();
};

const validateParameters = (params) => {
    const requiredParams = ['serverAddress', 'dbName', 'dbUsername', 'dbPassword', 'googleDriveFolderId', 'numOfFilesToLeave'];
    const missingParams = requiredParams.filter(param => !params[param]);

    if (missingParams.length > 0) {
        throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
    }
};

app.get('/ms/backup', async (req, res) => {
    try {
        validateParameters(req.query);

        const {
            serverAddress,
            dbName,
            dbUsername,
            dbPassword,
            googleDriveFolderId,
            numOfFilesToLeave,
        } = req.query;

        const mysqlConfig = {
            host: serverAddress,
            user: dbUsername,
            password: dbPassword,
            database: dbName,
        };

        const timestamp = moment().format('YYYY-MM-DD-T-HH:mm:ss');
        const backupFileName = `${dbName}_${timestamp}.sql`;
        const zipFileName = `${backupFileName}.zip`;

        const connection = mysql.createConnection(mysqlConfig);
        await promisify(connection.connect.bind(connection))();

        await createBackup(mysqlConfig, backupFileName);
        await createZipFile(backupFileName, zipFileName);

        const auth = await authenticateGoogle();
        const response = await uploadToGoogleDrive(zipFileName, auth, googleDriveFolderId
        );

        if (response.status === 200) {
            const driveService = google.drive({ version: 'v3', auth });

            await deleteGoogleDriveOldFiles(driveService, googleDriveFolderId, numOfFilesToLeave);
            await deleteLocalFile(zipFileName);
            await deleteLocalFile(backupFileName);

            res.status(200).send('Backup created successfully');
        }

        await promisify(connection.end.bind(connection))();
    } catch (err) {
        console.error(`Error during backup process: ${err}`);
        res.status(500).send(`Backup failed. Error: ${err.message}`);
    }
});        