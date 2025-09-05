import { DegreeSchemaType } from '../schema';
import { ObjectId } from 'mongodb';
type SeedDegree = DegreeSchemaType & { _id: ObjectId };

export const degreesData: SeedDegree[] = [
  {
    _id: new ObjectId('000000000000000000000001'),
    title: 'High School Diploma',
  },
  {
    _id: new ObjectId('000000000000000000000002'),
    title: 'University Entrance Qualification',
  },
  {
    _id: new ObjectId('000000000000000000000003'),
    title: 'Vocational Training Certificate',
  },
  {
    _id: new ObjectId('000000000000000000000004'),
    title: "Bachelor's Degree",
  },
  {
    _id: new ObjectId('000000000000000000000005'),
    title: 'Diploma',
  },
  {
    _id: new ObjectId('000000000000000000000006'),
    title: "Master's Degree",
  },
  {
    _id: new ObjectId('000000000000000000000007'),
    title: 'State Examination',
  },
  {
    _id: new ObjectId('000000000000000000000008'),
    title: 'Doctorate / PhD',
  },
];
