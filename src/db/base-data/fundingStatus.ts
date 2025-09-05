import { FundingStatusSchemaType } from '../schema';
import { ObjectId } from 'mongodb';
type SeedFundingStatus = FundingStatusSchemaType & { _id: ObjectId };

export const fundingStatusData: SeedFundingStatus[] = [
  {
    _id: new ObjectId('000000000000000000010000'),
    title: 'bootstrapped',
  },
  {
    _id: new ObjectId('000000000000000000020000'),
    title: 'pre-seed',
  },
  {
    _id: new ObjectId('000000000000000000030000'),
    title: 'seed',
  },
  {
    _id: new ObjectId('000000000000000000040000'),
    title: 'seriesA',
  },
  {
    _id: new ObjectId('000000000000000000050000'),
    title: 'seriesB',
  },
  {
    _id: new ObjectId('000000000000000000060000'),
    title: 'seriesC',
  },
  {
    _id: new ObjectId('000000000000000000070000'),
    title: 'seriesD',
  },
  {
    _id: new ObjectId('000000000000000000080000'),
    title: 'seriesE',
  },
  {
    _id: new ObjectId('000000000000000000090000'),
    title: 'bridge',
  },
  {
    _id: new ObjectId('0000000000000000000a0000'),
    title: 'mezzanine',
  },
  {
    _id: new ObjectId('0000000000000000000b0000'),
    title: 'acquired',
  },
  {
    _id: new ObjectId('0000000000000000000c0000'),
    title: 'public',
  },
  {
    _id: new ObjectId('0000000000000000000d0000'),
    title: 'closed',
  },
];
