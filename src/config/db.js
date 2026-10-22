import mongoose from 'mongoose';

export default async function connectDatabase() {
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI || MONGODB_URI.startsWith('replace_with_')) {
    throw new Error('Set MONGODB_URI to your MongoDB Atlas connection string');
  }

  await mongoose.connect(MONGODB_URI);
  console.info('Connected to MongoDB');
}
