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
import {
  Language,
  Degree,
  Position,
  Skill,
  ExpertiseArea,
  LanguageProficiencyLevel,
  FundingStatus,
  ZipCoords,
  ZipCoordsSchemaType,
} from './schema';

// ---------- TYPED SEED DATA ----------
import { supportedLanguages } from './base-data/languages';
import { degreesData } from './base-data/degrees';
import { positionsData } from './base-data/positions';
import { skillsData } from './base-data/skills';
import { expertiseAreasData } from './base-data/expertiseAreas';
import { supportedLanguageProficiencyLevels } from './base-data/languageProficiencyLevels';
import { fundingStatusData } from './base-data/fundingStatus';
import { germanZipCodes } from '../constants/german_zip_codes';

// ---------- HELPER FUNCTION ----------
async function initCollection(
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
async function runInit() {
  try {
    // 1) Connect to MongoDB
    console.log('Running database initialization...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // 2) Seed all collections (typed modules)
    await initCollection(Language, supportedLanguages, 'Languages');
    await initCollection(Degree, degreesData, 'Degrees');
    await initCollection(Position, positionsData, 'Positions');
    await initCollection(Skill, skillsData, 'Skills');
    await initCollection(ExpertiseArea, expertiseAreasData, 'Expertise Areas');
    await initCollection(
      LanguageProficiencyLevel,
      supportedLanguageProficiencyLevels,
      'Language Levels',
    );
    await initCollection(FundingStatus, fundingStatusData, 'Funding Statuses');
    await initCollection(
      ZipCoords,
      germanZipCodes.map(
        (zip) =>
          ({
            ...zip,
            country: 'Germany',
          }) as ZipCoordsSchemaType,
      ),
      'Zip Coordinates',
    );

    // 3) Close connection
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

void runInit();
