
const { getDB } = require("../config/db");

const getTuitionCollection = () => {
  return getDB().collection("tuitions");
};

module.exports = {
  getTuitionCollection,
};
