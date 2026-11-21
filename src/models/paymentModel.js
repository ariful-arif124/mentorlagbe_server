
const { getDB } = require("../config/db");

const getPaymentsCollection = () =>
  getDB().collection("payments");

const ensurePaymentIndexes = async () => {
  const collection = getPaymentsCollection();

  await collection.createIndex(
    { checkoutSessionId: 1 },
    { unique: true, sparse: true }
  );

  await collection.createIndex(
    { paymentIntentId: 1 },
    { unique: true, sparse: true }
  );

  await collection.createIndex({
    userId: 1,
    createdAt: -1,
  });

  await collection.createIndex(
    { userId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        status: "pending",
      },
    }
  );
};

module.exports = {
  getPaymentsCollection,
  ensurePaymentIndexes,
};
