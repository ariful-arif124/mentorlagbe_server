
const { ObjectId } = require("mongodb");
const { getTuitionCollection } = require("../models/tuition.model");

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const formatTuition = (tuition) => ({
  ...tuition,
  _id: tuition._id.toString(),
});

const getAllTuitions = async (req, res) => {
  try {
    const collection = getTuitionCollection();

    const { search, subject, classLevel, mode, location } = req.query;

    const filter = {
      approvalStatus: "approved",
      isActive: true,
    };

    if (subject && subject !== "All Subjects") {
      filter.subject = new RegExp(`^${escapeRegex(subject)}$`, "i");
    }

    if (classLevel) {
      filter.classLevel = new RegExp(`^${escapeRegex(classLevel)}$`, "i");
    }

    if (mode && mode !== "All Modes") {
      filter.mode = new RegExp(`^${escapeRegex(mode)}$`, "i");
    }

    if (location && location !== "All Locations") {
      filter.location = new RegExp(escapeRegex(location), "i");
    }

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");

      filter.$or = [
        { title: searchRegex },
        { tutorName: searchRegex },
        { description: searchRegex },
      ];
    }

    const tuitions = await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: tuitions.length,
      data: tuitions.map(formatTuition),
    });
  } catch (error) {
    console.error("Get tuitions error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tuitions",
    });
  }
};

const getFeaturedTuitions = async (req, res) => {
  try {
    const collection = getTuitionCollection();

    const tuitions = await collection
      .find({
        approvalStatus: "approved",
        isActive: true,
      })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({
      success: true,
      count: tuitions.length,
      data: tuitions.map(formatTuition),
    });
  } catch (error) {
    console.error("Featured tuitions error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch featured tuitions",
    });
  }
};

const getTuitionById = async (req, res) => {
  try {
    const { id } = req.params;

    const collection = getTuitionCollection();

    const tuitionId = ObjectId.isValid(id)
      ? new ObjectId(id)
      : id;

    const tuition = await collection.findOne({
      _id: tuitionId,
      approvalStatus: "approved",
      isActive: true,
    });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
    }

    res.status(200).json({
      success: true,
      data: formatTuition(tuition),
    });
  } catch (error) {
    console.error("Tuition details error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tuition details",
    });
  }
};

module.exports = {
  getAllTuitions,
  getFeaturedTuitions,
  getTuitionById,
};
