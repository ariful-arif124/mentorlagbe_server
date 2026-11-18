
require("dotenv").config();

const { connectDB, getDB, closeDB } = require("./src/config/db");

const tuitions = [
  {
    _id: "demo-tuition-001",
    title: "HSC Mathematics Private Tuition",
    subject: "Mathematics",
    classLevel: "Class 11-12",
    mode: "Offline",
    location: "Dhanmondi, Dhaka",
    monthlyFee: 4000,
    daysPerWeek: 4,
    bannerImage: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80",
    description: "Experienced mathematics tutor offering personalized HSC mathematics preparation with regular assessments and problem-solving sessions.",
    tutorName: "Abdullah Al Mamun",
    tutorEmail: "mamun@example.com",
    approvalStatus: "approved",
    isActive: true,
    createdAt: "2026-11-18T10:00:00.000Z",
  },
  {
    _id: "demo-tuition-002",
    title: "Physics Coaching for HSC Students",
    subject: "Physics",
    classLevel: "Class 11-12",
    mode: "Online",
    location: "Online",
    monthlyFee: 3000,
    daysPerWeek: 3,
    bannerImage: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?auto=format&fit=crop&w=900&q=80",
    description: "Understand physics concepts through interactive online classes, numerical problem-solving and exam preparation.",
    tutorName: "Sadia Rahman",
    tutorEmail: "sadia@example.com",
    approvalStatus: "approved",
    isActive: true,
    createdAt: "2026-11-17T10:00:00.000Z",
  },
  {
    _id: "demo-tuition-003",
    title: "IELTS Preparation and Speaking Course",
    subject: "IELTS",
    classLevel: "IELTS Preparation",
    mode: "Online",
    location: "Online",
    monthlyFee: 5000,
    daysPerWeek: 4,
    bannerImage: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=900&q=80",
    description: "Complete IELTS preparation covering listening, reading, writing and speaking with individual feedback and mock tests.",
    tutorName: "Nusrat Jahan",
    tutorEmail: "nusrat@example.com",
    approvalStatus: "approved",
    isActive: true,
    createdAt: "2026-11-16T10:00:00.000Z",
  },
  {
    _id: "demo-tuition-004",
    title: "Chemistry Private Tuition",
    subject: "Chemistry",
    classLevel: "Class 9-10",
    mode: "Offline",
    location: "Uttara, Dhaka",
    monthlyFee: 3500,
    daysPerWeek: 3,
    bannerImage: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=900&q=80",
    description: "Build a strong chemistry foundation with practical examples, chapter-wise explanations and board examination preparation.",
    tutorName: "Mahmudul Hasan",
    tutorEmail: "mahmud@example.com",
    approvalStatus: "approved",
    isActive: true,
    createdAt: "2026-11-15T10:00:00.000Z",
  },
  {
    _id: "demo-tuition-005",
    title: "Full Stack Web Development Mentorship",
    subject: "Programming",
    classLevel: "Beginner to Intermediate",
    mode: "Online",
    location: "Online",
    monthlyFee: 6000,
    daysPerWeek: 3,
    bannerImage: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
    description: "Learn HTML, CSS, JavaScript, React and Node.js through practical projects and personalized mentorship.",
    tutorName: "Tanvir Ahmed",
    tutorEmail: "tanvir@example.com",
    approvalStatus: "approved",
    isActive: true,
    createdAt: "2026-11-14T10:00:00.000Z",
  },
  {
    _id: "demo-tuition-006",
    title: "English Grammar and Spoken English",
    subject: "English",
    classLevel: "Class 6-10",
    mode: "Offline",
    location: "Chattogram",
    monthlyFee: 2500,
    daysPerWeek: 3,
    bannerImage: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80",
    description: "Improve English grammar, vocabulary, writing and everyday communication skills through interactive lessons.",
    tutorName: "Farhana Akter",
    tutorEmail: "farhana@example.com",
    approvalStatus: "approved",
    isActive: true,
    createdAt: "2026-11-13T10:00:00.000Z",
  },
];

const seedTuitions = async () => {
  try {
    await connectDB();

    const collection = getDB().collection("tuitions");

    const operations = tuitions.map((tuition) => ({
      updateOne: {
        filter: { _id: tuition._id },
        update: { $set: tuition },
        upsert: true,
      },
    }));

    const result = await collection.bulkWrite(operations);

    console.log("Tuition seeding completed!");
    console.log("Inserted:", result.upsertedCount);
    console.log("Updated:", result.modifiedCount);
    console.log("Total records:", await collection.countDocuments());
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
};

seedTuitions();
