import mongoose from 'mongoose';

export default async function connectDB() {
  const dbURI = process.env.MONGODB_URI;
  if (!dbURI) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }
  await mongoose.connect(dbURI);
}
