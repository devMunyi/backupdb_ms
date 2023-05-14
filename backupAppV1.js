// requiring/importing dependencies 
const express = require("express");
const moment = require("moment");
const morgan = require("morgan");
const cors = require("cors");
const { backupDBV1 } = require("./helpers.js");


// initializations
const app = express();

// middlewares
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));


// route(s)
app.get("/backup", async (req, res) => {
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
    numOfFilesToLeave && 
    dbPassword
  ) {
  } else {
    return res.status(400).send("Bad request");
  }

  const mysqlConfig = {
    host: serverAddress,
    user: dbUsername,
    password: dbPassword,
    database: dbName,
  };

  try {
    const timestamp = moment().format("YYYY-MM-DD-T-HH:mm:ss");
    const backupFileName = `${dbName}_${timestamp}.sql`
    const zipFileName = `${backupFileName}.zip`;

    const response = await backupDBV1(
      mysqlConfig,
      backupFileName,
      zipFileName,
      googleDriveFolderId,
      numOfFilesToLeave
    );

    if (response?.status === "ok") {
      res.status(200).send("Backup created successfully");
    } else {
      res.status(500).send("Something went wrong during backup process!");
    }
  } catch (err) {
    console.error(`Error during backup process: ${err}`);
    res.status(500).send(`Backup failed. Error: ${err.message}`);
  }
});

const port = 8000 || process.env.PORT;
app.listen(port, () =>
  console.log(`DB Backup server up and running on port ${port}`)
);
