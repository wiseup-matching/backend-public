/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI must be defined');
}
const MONGO_URI = process.env.MONGODB_URI;

// ---------- MODELS ----------
import { Retiree, Startup, JobPosting } from './schema';

// ---------- TYPED SEED DATA ----------
import { retireesData } from './seed-data/retirees';
import { startupsData } from './seed-data/startups';
import { jobPostingsData } from './seed-data/jobPostings';

// ---------- HELPER FUNCTION ----------
async function seedCollection(
  model: mongoose.Model<any>,
  data: any[],
  modelName: string,
): Promise<void> {
  try {
    await model.deleteMany({});
    const inserted = await model.insertMany(data);
    console.log('Seeded ' + String(inserted.length) + ' ' + modelName);
  } catch (error) {
    console.error(`Error seeding ${modelName}:`, error);
  }
}

// ---------- MAIN SEED FUNCTION ----------
async function runSeed() {
  try {
    console.log('Running database seeding...');
    console.info('NOTE: For development purposes only!');
    // 1) Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // 2) Seed all collections (typed modules)
    await seedCollection(Retiree, retireesData, 'Retirees');
    await seedCollection(Startup, startupsData, 'Startups');
    await seedCollection(JobPosting, jobPostingsData, 'Job Postings');

    // 3) Close connection
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}
void runSeed();
