import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const { MONGODB_URI } = process.env;

const dbName_to_use = 'seba';

async function wipe() {
  try {
    await mongoose.connect(MONGODB_URI ?? '', {
      dbName: dbName_to_use,
      authSource: 'admin',
    });
    console.log('Connected to MongoDB (db: seba)');

    await mongoose.connection.dropDatabase();
    console.log(`Dropped database “${dbName_to_use}” successfully.`);
  } catch (err) {
    console.error('Failed to drop DB:', err);
  } finally {
    await mongoose.disconnect();
  }
}

wipe();
