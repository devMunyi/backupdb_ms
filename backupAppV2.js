require("dotenv").config();
const schedule = require("node-schedule");
const moment = require("moment");
const { backupDBV1 } = require("./helpers");

// Define the MySQL connection details
const DB_HOST = process.env.DB_HOST;
const DB_NAME = process.env.DB_NAME;
const DB_USERNAME = process.env.DB_USERNAME;
const DB_PASSWORD = process.env.DB_PASSWORD;

const mysqlConfig = {
  host: DB_HOST,
  user: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_NAME,
};

async function main() {
  try {
    const timestamp = moment().format("YYYY-MM-DD-T-HH:mm:ss");
    const backupFileName = `${DB_NAME}_${timestamp}.sql`;
    const zipFileName = `${backupFileName}.zip`;
    const googleDriveFolderId = "1eLF7EUbz5jvuz34jlszDkTXa0zsWhici";
    const numOfFilesToLeave = 3;

    const response = await backupDBV1(
      mysqlConfig,
      backupFileName,
      zipFileName,
      googleDriveFolderId,
      numOfFilesToLeave
    );

    if (response?.status === "ok") {
      console.log("Backup created successfully");
    } else {
      console.log("Something went wrong during backup process!");
    }
  } catch (err) {
    console.error(`Error during backup process: ${err}`);
    console.log(`Backup failed. Error: ${err.message}`);
  }
}

let runRule = "31 17 * * *";

// Run at midnight
schedule.scheduleJob(runRule, async () => {
  console.log(`----- Running ${runRule} Backup -----`);
  await main();
});

runRule = "16 22 * * *"

// Run at 3:00 AM
schedule.scheduleJob(runRule, async () => {
  console.log(`----- Running ${runRule} Backup -----`);
  await main();
});
