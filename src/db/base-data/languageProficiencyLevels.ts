import { LanguageProficiencyLevelSchemaType } from '../schema';
import { ObjectId } from 'mongodb';

type InitLanguageProficiency = LanguageProficiencyLevelSchemaType & { _id: ObjectId };

export const supportedLanguageProficiencyLevels: InitLanguageProficiency[] = [
  {
    _id: new ObjectId('000000000000000001000000'),
    level: 'A1',
  },
  {
    _id: new ObjectId('000000000000000002000000'),
    level: 'A2',
  },
  {
    _id: new ObjectId('000000000000000003000000'),
    level: 'B1',
  },
  {
    _id: new ObjectId('000000000000000004000000'),
    level: 'B2',
  },
  {
    _id: new ObjectId('000000000000000005000000'),
    level: 'C1',
  },
  {
    _id: new ObjectId('000000000000000006000000'),
    level: 'C2',
  },
];
