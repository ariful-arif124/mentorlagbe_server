
const { MongoClient } = require("mongodb");

let client;
let database;

const connectDB = async () => {
  try {
    if (database) return database;

    if (!process.env.MONGODB_URI) {
      throw new Error("MongoDB URI is missing in .env");
    }

    client = new MongoClient(process.env.MONGODB_URI);

    await client.connect();

    database = client.db(process.env.DB_NAME || "mentorlagbe");

    await database.command({ ping: 1 });

    console.log("MongoDB Connected Successfully!");

    return database;
  } catch (error) {
    console.error("MongoDB Connection Failed:", error.message);
    throw error;
  }
};

const getDB = () => {
  if (!database) {
    throw new Error("Database is not connected");
  }

  return database;
};

const closeDB = async () => {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
};

module.exports = {
  connectDB,
  getDB,
  closeDB,
};
