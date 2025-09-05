import { PositionSchemaType } from '../schema';
import { ObjectId } from 'mongodb';

type SeedPosition = PositionSchemaType & { _id: ObjectId };

export const positionsData: SeedPosition[] = [
  {
    _id: new ObjectId('000000000000000000000011'),
    title: 'Software Engineer',
  },
  {
    _id: new ObjectId('000000000000000000000012'),
    title: 'Product Manager',
  },
  {
    _id: new ObjectId('000000000000000000000013'),
    title: 'Data Analyst',
  },
  {
    _id: new ObjectId('000000000000000000000014'),
    title: 'Graphic Designer',
  },
  {
    _id: new ObjectId('000000000000000000000015'),
    title: 'UX Researcher',
  },
  {
    _id: new ObjectId('000000000000010000000000'),
    title: 'Frontend Developer',
  },
  {
    _id: new ObjectId('000000000000020000000000'),
    title: 'Backend Developer',
  },
  {
    _id: new ObjectId('000000000000030000000000'),
    title: 'Full Stack Developer',
  },
  {
    _id: new ObjectId('000000000000040000000000'),
    title: 'DevOps Engineer',
  },
  {
    _id: new ObjectId('000000000000050000000000'),
    title: 'QA Engineer',
  },
  {
    _id: new ObjectId('000000000000060000000000'),
    title: 'Systems Analyst',
  },
  {
    _id: new ObjectId('000000000000070000000000'),
    title: 'IT Support Specialist',
  },
  {
    _id: new ObjectId('000000000000080000000000'),
    title: 'Solutions Architect',
  },
  {
    _id: new ObjectId('000000000000090000000000'),
    title: 'Technical Writer',
  },
  {
    _id: new ObjectId('0000000000000a0000000000'),
    title: 'Business Analyst',
  },
  {
    _id: new ObjectId('0000000000000b0000000000'),
    title: 'Scrum Master',
  },
  {
    _id: new ObjectId('0000000000000c0000000000'),
    title: 'Agile Coach',
  },
  {
    _id: new ObjectId('0000000000000d0000000000'),
    title: 'UI Designer',
  },
  {
    _id: new ObjectId('0000000000000e0000000000'),
    title: 'Content Strategist',
  },
  {
    _id: new ObjectId('0000000000000f0000000000'),
    title: 'Marketing Manager',
  },
  {
    _id: new ObjectId('000000000000100000000000'),
    title: 'Digital Marketing Specialist',
  },
  {
    _id: new ObjectId('000000000000110000000000'),
    title: 'Sales Manager',
  },
  {
    _id: new ObjectId('000000000000120000000000'),
    title: 'Customer Success Manager',
  },
  {
    _id: new ObjectId('000000000000130000000000'),
    title: 'HR Manager',
  },
  {
    _id: new ObjectId('000000000000140000000000'),
    title: 'Recruiter',
  },
  {
    _id: new ObjectId('000000000000150000000000'),
    title: 'Financial Analyst',
  },
  {
    _id: new ObjectId('000000000000160000000000'),
    title: 'Accountant',
  },
  {
    _id: new ObjectId('000000000000170000000000'),
    title: 'Operations Manager',
  },
  {
    _id: new ObjectId('000000000000180000000000'),
    title: 'Project Coordinator',
  },
  {
    _id: new ObjectId('000000000000190000000000'),
    title: 'Legal Counsel',
  },
];
