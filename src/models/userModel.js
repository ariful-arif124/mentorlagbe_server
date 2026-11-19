
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");

const getUsersCollection = () => getDB().collection("users");

async function ensureUserIndexes() {
  await getUsersCollection().createIndex(
    { email: 1 },
    { unique: true }
  );
}

async function createUser(userData) {
  const user = {
    name: userData.name.trim(),
    email: userData.email.trim().toLowerCase(),
    passwordHash: userData.passwordHash,
    role: userData.role,
    plan: userData.plan || "free",

    // New accounts are active by default
    isActive: true,

    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return await getUsersCollection().insertOne(user);
}

async function findUserByEmail(email) {
  return await getUsersCollection().findOne({
    email: email.trim().toLowerCase(),
  });
}

async function findUserById(id) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return await getUsersCollection().findOne({
    _id: new ObjectId(id),
  });
}

module.exports = {
  ensureUserIndexes,
  createUser,
  findUserByEmail,
  findUserById,
};
