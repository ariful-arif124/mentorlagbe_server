
const path = require("path");
require("dotenv").config({
    path: path.resolve(__dirname, "../.env"),
});

const { MongoClient } = require("mongodb");

const seedTuitions = [
    {
        title: "Mathematics Tutor Needed for SSC Student",
        subject: "Mathematics",
        classLevel: "Class 9-10",
        monthlyFee: 5000,
        daysPerWeek: 4,
        mode: "Offline",
        location: "Dhanmondi, Dhaka",
        description: "An experienced mathematics tutor is needed to provide regular lessons covering algebra, geometry, trigonometry and examination preparation for an SSC student.",
        bannerImage: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "HSC Physics Private Tutor",
        subject: "Physics",
        classLevel: "HSC",
        monthlyFee: 6500,
        daysPerWeek: 4,
        mode: "Offline",
        location: "Mirpur, Dhaka",
        description: "Looking for a dedicated physics tutor to explain HSC physics concepts, numerical problems, practical topics and board examination preparation.",
        bannerImage: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "Chemistry Tutor for HSC Science",
        subject: "Chemistry",
        classLevel: "HSC",
        monthlyFee: 6000,
        daysPerWeek: 3,
        mode: "Offline",
        location: "Uttara, Dhaka",
        description: "HSC chemistry student requires structured guidance in organic chemistry, inorganic chemistry, chemical calculations and creative question solving.",
        bannerImage: "https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "English Tutor for O Level Student",
        subject: "English",
        classLevel: "O Level",
        monthlyFee: 7500,
        daysPerWeek: 4,
        mode: "Online",
        location: "Online",
        description: "An experienced English tutor is required for O Level English language and literature preparation, writing skills, comprehension and examination practice.",
        bannerImage: "https://www.tutorchase.com/_next/image?q=75&url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fuxeri8el%2Fproduction%2Fca44fd999b7222f990c342bb3e392c061287fe4e-1024x1024.webp%3Frect%3D0%2C171%2C1024%2C683%26w%3D600%26h%3D400%26fm%3Dwebp&w=828",
    },
    {
        title: "Biology Tutor for Medical Admission Preparation",
        subject: "Biology",
        classLevel: "HSC / Admission",
        monthlyFee: 8500,
        daysPerWeek: 5,
        mode: "Hybrid",
        location: "Mohammadpur, Dhaka",
        description: "A biology tutor is needed to cover human physiology, genetics, botany, zoology and medical admission preparation through regular assessments.",
        bannerImage: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "ICT Tutor for HSC Student",
        subject: "ICT",
        classLevel: "HSC",
        monthlyFee: 4000,
        daysPerWeek: 3,
        mode: "Online",
        location: "Online",
        description: "Seeking an ICT tutor to teach programming fundamentals, number systems, database concepts, networking and HSC ICT examination preparation.",
        bannerImage: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "Accounting Tutor for Business Studies",
        subject: "Accounting",
        classLevel: "Class 11-12",
        monthlyFee: 5500,
        daysPerWeek: 4,
        mode: "Offline",
        location: "Badda, Dhaka",
        description: "A qualified accounting tutor is required to teach financial accounting, journal entries, ledger preparation, financial statements and practical problem solving.",
        bannerImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "General Science Tutor for Class 7",
        subject: "General Science",
        classLevel: "Class 7",
        monthlyFee: 3500,
        daysPerWeek: 3,
        mode: "Offline",
        location: "Khilgaon, Dhaka",
        description: "Looking for a patient science tutor to help a class seven student understand fundamental science concepts, complete assignments and prepare for school examinations.",
        bannerImage: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "Higher Mathematics Tutor for SSC",
        subject: "Higher Mathematics",
        classLevel: "Class 9-10",
        monthlyFee: 6000,
        daysPerWeek: 4,
        mode: "Offline",
        location: "Banani, Dhaka",
        description: "An experienced higher mathematics tutor is needed for calculus, coordinate geometry, algebra, trigonometry and SSC examination preparation.",
        bannerImage: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "Economics Tutor for University Student",
        subject: "Economics",
        classLevel: "University",
        monthlyFee: 8000,
        daysPerWeek: 3,
        mode: "Online",
        location: "Online",
        description: "University student requires guidance in microeconomics, macroeconomics, economic theory, quantitative analysis and academic problem solving.",
        bannerImage: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "Bangla Tutor for Class 8 Student",
        subject: "Bangla",
        classLevel: "Class 8",
        monthlyFee: 3000,
        daysPerWeek: 3,
        mode: "Offline",
        location: "Bashundhara, Dhaka",
        description: "A Bangla tutor is required to support grammar, literature, creative writing, reading comprehension and regular school examination preparation.",
        bannerImage: "https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=1200&q=85",
    },
    {
        title: "Statistics Tutor for University Level",
        subject: "Statistics",
        classLevel: "University",
        monthlyFee: 9000,
        daysPerWeek: 4,
        mode: "Online",
        location: "Online",
        description: "An experienced statistics tutor is required to teach probability, statistical inference, regression, hypothesis testing and quantitative research methods.",
        bannerImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=85",
    },
];

async function main() {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.DB_NAME || "mentorlagbe";

    if (!uri) {
        throw new Error("MONGODB_URI is missing from the server .env file.");
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();

        const db = client.db(dbName);
        const usersCollection = db.collection("users");
        const tuitionsCollection = db.collection("tuitions");

        const tutors = await usersCollection
            .find({
                role: /^tutor$/i,
                email: { $type: "string" },
            })
            .sort({ createdAt: 1 })
            .toArray();

        if (tutors.length === 0) {
            throw new Error("No registered tutor account was found.");
        }

        let inserted = 0;
        let imagesUpdated = 0;
        let existing = 0;

        for (let i = 0; i < seedTuitions.length; i++) {
            const tuition = seedTuitions[i];
            const tutor = tutors[i % tutors.length];
            const tutorEmail = tutor.email.trim().toLowerCase();
            const now = new Date();

            const seedKey = `mentorlagbe-demo-${String(i + 1).padStart(3, "0")}`;

            const document = {
                seedKey,
                ...tuition,
                tutorName: tutor.name || tutor.fullName || "MentorLagbe Tutor",
                tutorEmail,
                approvalStatus: "approved",
                isActive: true,
                createdAt: new Date(now.getTime() - i * 86400000),
                updatedAt: now,
            };

            const existingRecord = await tuitionsCollection.findOne({ seedKey });

            if (existingRecord) {
                await tuitionsCollection.updateOne(
                    { _id: existingRecord._id },
                    {
                        $set: {
                            bannerImage: tuition.bannerImage,
                            updatedAt: now,
                        },
                    }
                );

                imagesUpdated++;
                existing++;
            } else {
                await tuitionsCollection.insertOne(document);
                inserted++;
            }
        }

        const approvedCount = await tuitionsCollection.countDocuments({
            seedKey: { $exists: true },
            approvalStatus: "approved",
            isActive: true,
        });

        console.log("MentorLagbe tuition seeding completed.");
        console.log(`New records inserted: ${inserted}`);
        console.log(`Existing records retained: ${existing}`);
        console.log(`Images updated: ${imagesUpdated}`);
        console.log(`Approved active seed records: ${approvedCount}`);
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error("Tuition seeding failed:", error.message);
    process.exitCode = 1;
});
